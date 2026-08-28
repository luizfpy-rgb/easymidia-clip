import type { Job } from 'bullmq';
import type { GenerateAvatarJob } from '@easymidia/shared';
import { env } from '../env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { uploadToR2 } from '../lib/r2.js';
import { notifyFailure } from '../lib/notify.js';

// Foto do usuário → 5 expressões via Gemini image (~US$ 0,04/imagem) e, com
// FAL_KEY configurada, cada expressão vira um LOOP DE VÍDEO de reação via
// image-to-video (~US$ 0,2-0,4/clipe) — o "clone reagindo" no medalhão.
// A mesma foto vai em TODAS as chamadas pra manter a identidade do personagem.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const STYLE_PROMPTS: Record<string, string> = {
  // Visual "streamer de react": sentado na mesa do escritório, enquadramento de
  // webcam — natural, não retrato de estúdio (pedido do usuário em 28/ago)
  realistic:
    'Create an ultra-realistic photograph of the exact same person from this photo, sitting at ' +
    'a desk in a cozy home office, filmed webcam-style like a reaction streamer. Head and ' +
    'shoulders, centered, square 1:1 composition. Natural indoor lighting, softly blurred home ' +
    'office background (desk, shelves, warm lamp glow, a hint of monitor light). Casual relaxed ' +
    'posture. Preserve the exact identity, hairstyle, skin tone and distinctive features. ' +
    'Photorealistic, natural skin texture, webcam framing. No text, no watermark.',
  cartoon:
    'Create a stylized 3D animated-movie style character portrait based on the person in this photo. ' +
    'Head and shoulders only, centered, square 1:1 composition. Deep purple studio background (#1A1327) ' +
    'with a soft violet glow, clean rim lighting. Keep the exact same character identity, hairstyle, ' +
    'skin tone and distinctive features. No text, no watermark.',
};

// Mesmo vocabulário do expression_timeline (analyze-clips).
// 'watching' é o estado-base do template Reação: o dublê olhando PRA CIMA,
// na direção do vídeo que roda acima dele no split.
const EXPRESSIONS: Record<string, string> = {
  watching:
    'The person is attentively watching a screen located above them: chin slightly raised, ' +
    'eyes looking up and a bit off-camera, engaged and curious viewing posture.',
  idle: 'Neutral, friendly and relaxed expression, slight natural smile.',
  curious: 'Curious expression: one raised eyebrow, slight head tilt, intrigued eyes.',
  impressed: 'Impressed expression: wide eyes and open-mouth "wow" reaction.',
  approved: 'Approving expression: confident smile, giving a thumbs up.',
  analytical: 'Analytical expression: thoughtful look, hand on chin, focused eyes.',
  laughing: 'Laughing expression: genuine laugh, eyes squinting with joy, big smile.',
  shocked: 'Shocked expression: jaw dropped, hands near the face, wide unbelieving eyes.',
  agreeing: 'Agreeing expression: warm convinced smile, head slightly tilted forward.',
};

// Movimento do loop de reação (image-to-video). Câmera parada + movimento
// sutil = loop que não cansa repetindo no canto do short.
const MOTION_SUFFIX =
  ' The person is sitting at a desk in a home office, webcam style. Static camera, ' +
  'natural subtle motion, background unchanged, seamless loop, no text.';
const MOTIONS: Record<string, string> = {
  watching:
    'The person keeps watching a screen above them, eyes up, breathing naturally, blinking, small attentive head movements.' + MOTION_SUFFIX,
  idle: 'The person breathes naturally, blinks and makes calm micro-movements, looking at the camera.' + MOTION_SUFFIX,
  curious: 'The person raises an eyebrow and tilts the head slightly with an intrigued look.' + MOTION_SUFFIX,
  impressed: 'The person reacts impressed: eyes widen and mouth opens in a wow reaction.' + MOTION_SUFFIX,
  approved: 'The person nods approvingly, smiles and gives a thumbs up.' + MOTION_SUFFIX,
  analytical: 'The person looks thoughtful, touches the chin and glances up briefly.' + MOTION_SUFFIX,
  laughing: 'The person bursts into a genuine laugh, shoulders shaking slightly, eyes squinting.' + MOTION_SUFFIX,
  shocked: 'The person reacts in disbelief: jaw drops, brings a hand near the face, leans back slightly.' + MOTION_SUFFIX,
  agreeing: 'The person nods along repeatedly in agreement with a convinced smile.' + MOTION_SUFFIX,
};

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
  }[];
  error?: { message?: string };
}

// fal.ai queue API: submete, faz polling e baixa o mp4 do loop
async function animateExpression(imageUrl: string, motionPrompt: string): Promise<Buffer> {
  const headers = { Authorization: `Key ${env.FAL_KEY}`, 'Content-Type': 'application/json' };
  const submitRes = await fetch(`https://queue.fal.run/${env.FAL_I2V_MODEL}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      image_url: imageUrl,
      prompt: motionPrompt,
      // aspect_ratio 'auto' é rejeitado quando o retrato não é exatamente quadrado
      // (validado ao vivo em 28/ago); 480p basta pro medalhão de 260px e custa metade
      aspect_ratio: '1:1',
      resolution: '480p',
    }),
  });
  const submitted = (await submitRes.json().catch(() => ({}))) as {
    status_url?: string;
    response_url?: string;
  };
  if (!submitRes.ok || !submitted.status_url || !submitted.response_url) {
    throw new Error(`fal submit ${submitRes.status}: ${JSON.stringify(submitted).slice(0, 200)}`);
  }

  const deadline = Date.now() + 10 * 60_000;
  let completed = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(submitted.status_url, { headers });
    const status = (await statusRes.json().catch(() => ({}))) as { status?: string };
    if (status.status === 'COMPLETED') {
      completed = true;
      break;
    }
    if (status.status === 'FAILED' || status.status === 'ERROR') {
      throw new Error('fal: geração do loop de vídeo falhou');
    }
  }
  if (!completed) throw new Error('fal: timeout de 10 min na geração do loop');

  const out = (await (await fetch(submitted.response_url, { headers })).json()) as {
    video?: { url?: string };
  };
  // fal pode devolver COMPLETED com erro de validação no corpo — expõe o detalhe
  if (!out.video?.url) {
    throw new Error(`fal: resposta sem vídeo — ${JSON.stringify(out).slice(0, 300)}`);
  }
  const download = await fetch(out.video.url);
  if (!download.ok) throw new Error(`fal: download do vídeo → ${download.status}`);
  return Buffer.from(await download.arrayBuffer());
}

async function generateExpression(
  sourceBase64: string,
  stylePrompt: string,
  expressionPrompt: string
): Promise<Buffer> {
  const res = await fetch(`${GEMINI_URL}/${env.GEMINI_IMAGE_MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': env.GEMINI_API_KEY as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: sourceBase64 } },
            { text: `${stylePrompt}\n\n${expressionPrompt}` },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        // Sem isso o retrato pode sair 816x1120 mesmo pedindo "square 1:1" no prompt
        imageConfig: { aspectRatio: '1:1' },
      },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${body.error?.message ?? 'sem detalhe'}`.slice(0, 300));
  }
  const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error('Gemini não retornou imagem');
  return Buffer.from(part.inlineData.data, 'base64');
}

export async function generateAvatar(job: Job<GenerateAvatarJob>) {
  const { userId, avatarId } = job.data;

  const { data: avatar, error } = await supabaseAdmin
    .from('avatars')
    .select('id, status, expressions')
    .eq('id', avatarId)
    .single();
  if (error || !avatar) throw new Error(`avatar ${avatarId} não encontrado`);
  if (avatar.status === 'ready') return; // job re-entregue após sucesso

  const fail = async (message: string) => {
    await supabaseAdmin
      .from('avatars')
      .update({ status: 'failed', error_message: message.slice(0, 480) })
      .eq('id', avatarId);
    await notifyFailure('geração de avatar falhou', `Avatar ${avatarId}\n${message.slice(0, 600)}`);
  };

  if (!env.GEMINI_API_KEY) {
    await fail('GEMINI_API_KEY não configurada — cole a chave do Google AI Studio no worker');
    return; // sem chave, retry não ajuda
  }

  try {
    const sourceBase64 = job.data.sourceImageBase64.replace(/^data:image\/\w+;base64,/, '');
    const prefix = `users/${userId}/avatars/${avatarId}`;
    const sourceUrl = await uploadToR2(
      `${prefix}/source.jpg`,
      Buffer.from(sourceBase64, 'base64'),
      'image/jpeg'
    );
    await supabaseAdmin
      .from('avatars')
      .update({ source_image_url: sourceUrl, error_message: null })
      .eq('id', avatarId);

    const style = job.data.style ?? 'cartoon';
    const stylePrompt = STYLE_PROMPTS[style] ?? STYLE_PROMPTS.cartoon;
    const animate = Boolean(env.FAL_KEY);

    const expressions: Record<string, string> = {};
    for (const [name, prompt] of Object.entries(EXPRESSIONS)) {
      const image = await generateExpression(sourceBase64, stylePrompt, prompt);
      const stillUrl = await uploadToR2(`${prefix}/${name}.png`, image, 'image/png');
      expressions[name] = stillUrl;
      if (animate) {
        // Clone reagindo: anima o retrato em loop de vídeo (o render detecta .mp4)
        const loop = await animateExpression(stillUrl, MOTIONS[name] ?? MOTIONS.idle);
        expressions[name] = await uploadToR2(`${prefix}/${name}.mp4`, loop, 'video/mp4');
      }
      // Progresso parcial visível na UI (expressões aparecem uma a uma)
      await supabaseAdmin.from('avatars').update({ expressions }).eq('id', avatarId);
    }

    await supabaseAdmin
      .from('avatars')
      .update({ status: 'ready', expressions, error_message: null })
      .eq('id', avatarId);

    await supabaseAdmin.from('usage_events').insert({
      user_id: userId,
      event_type: 'avatar_generation',
      reference_id: avatarId,
      // 8 imagens × ~US$0,04 + (se animado) 8 loops 480p × ~US$0,2
      cost_usd: animate ? 1.9 : 0.32,
      metadata: {
        model: env.GEMINI_IMAGE_MODEL,
        style,
        animated: animate,
        i2v_model: animate ? env.FAL_I2V_MODEL : null,
        expressions: Object.keys(expressions).length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (finalAttempt) await fail(message);
    throw err;
  }
}

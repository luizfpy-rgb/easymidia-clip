import type { Job } from 'bullmq';
import type { GenerateAvatarJob } from '@easymidia/shared';
import { env } from '../env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { uploadToR2 } from '../lib/r2.js';
import { notifyFailure } from '../lib/notify.js';

// Foto do usuário → 1 still base via Gemini (~US$0,04) e, com FAL_KEY, UM vídeo
// com o arco de reação completo via image-to-video (~US$0,2) — assistindo →
// surpreso → assistindo → aprovando, cenário fixo, rodando em loop no short.
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

// "1 card" (pedido do usuário em 28/ago): em vez de várias expressões geradas
// separadas (cada uma sorteava um cenário diferente → cortes estranhos), UM
// único vídeo com arco de reação completo, cenário 100% travado, só o clone
// se movendo. O arco roda em loop no short. As chaves watching/idle apontam
// pro mesmo arquivo — tanto o template clássico quanto o Reação resolvem.
const BASE_POSE =
  'The person is attentively watching a screen: engaged and curious viewing posture, ' +
  'eyes toward the camera, calm neutral expression, hands resting near the desk.';

const ARC_MOTION =
  'The person watches attentively for a moment, then their eyes widen in a surprised ' +
  'open-mouth wow reaction, then they settle back into attentive watching, and at the ' +
  'end they nod approvingly with a satisfied smile. Sitting at a desk in a home office, ' +
  'webcam style. Locked static camera, the background stays completely fixed and ' +
  'unchanged, ONLY the person moves. Natural realistic motion, no text.';

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

    // 1 card: um still base (assistindo, cenário do escritório) + UM vídeo com o
    // arco completo de reação — cenário idêntico do início ao fim por construção.
    const still = await generateExpression(sourceBase64, stylePrompt, BASE_POSE);
    const stillUrl = await uploadToR2(`${prefix}/base.png`, still, 'image/png');
    // Progresso parcial: o still aparece na UI enquanto o vídeo gera
    await supabaseAdmin
      .from('avatars')
      .update({ expressions: { watching: stillUrl, idle: stillUrl } })
      .eq('id', avatarId);

    let mediaUrl = stillUrl;
    if (animate) {
      const arc = await animateExpression(stillUrl, ARC_MOTION);
      mediaUrl = await uploadToR2(`${prefix}/reaction.mp4`, arc, 'video/mp4');
    }
    const expressions: Record<string, string> = { watching: mediaUrl, idle: mediaUrl };

    await supabaseAdmin
      .from('avatars')
      .update({ status: 'ready', expressions, error_message: null })
      .eq('id', avatarId);

    await supabaseAdmin.from('usage_events').insert({
      user_id: userId,
      event_type: 'avatar_generation',
      reference_id: avatarId,
      // 1 imagem ~US$0,04 + (se animado) 1 vídeo 480p ~US$0,2
      cost_usd: animate ? 0.25 : 0.05,
      metadata: {
        model: env.GEMINI_IMAGE_MODEL,
        style,
        animated: animate,
        i2v_model: animate ? env.FAL_I2V_MODEL : null,
        mode: 'single-arc',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (finalAttempt) await fail(message);
    throw err;
  }
}

import type { Job } from 'bullmq';
import type { GenerateAvatarJob } from '@easymidia/shared';
import { env } from '../env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { uploadToR2 } from '../lib/r2.js';
import { notifyFailure } from '../lib/notify.js';

// Foto do usuário → 5 expressões estilizadas via Gemini image (Nano Banana).
// Custo ~US$ 0,04/imagem no gemini-2.5-flash-image = ~US$ 0,20 por avatar.
// A mesma foto vai em TODAS as chamadas pra manter a identidade do personagem.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const STYLE_PROMPT =
  'Create a stylized 3D animated-movie style character portrait based on the person in this photo. ' +
  'Head and shoulders only, centered, square 1:1 composition. Deep purple studio background (#1A1327) ' +
  'with a soft violet glow, clean rim lighting. Keep the exact same character identity, hairstyle, ' +
  'skin tone and distinctive features. No text, no watermark.';

// Mesmas 5 expressões do expression_timeline (analyze-clips)
const EXPRESSIONS: Record<string, string> = {
  idle: 'Neutral, friendly and relaxed expression, slight natural smile.',
  curious: 'Curious expression: one raised eyebrow, slight head tilt, intrigued eyes.',
  impressed: 'Impressed expression: wide eyes and open-mouth "wow" reaction.',
  approved: 'Approving expression: confident smile, giving a thumbs up.',
  analytical: 'Analytical expression: thoughtful look, hand on chin, focused eyes.',
};

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
  }[];
  error?: { message?: string };
}

async function generateExpression(sourceBase64: string, expressionPrompt: string): Promise<Buffer> {
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
            { text: `${STYLE_PROMPT}\n\n${expressionPrompt}` },
          ],
        },
      ],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
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

    const expressions: Record<string, string> = {};
    for (const [name, prompt] of Object.entries(EXPRESSIONS)) {
      const image = await generateExpression(sourceBase64, prompt);
      expressions[name] = await uploadToR2(`${prefix}/${name}.png`, image, 'image/png');
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
      cost_usd: 0.2, // 5 imagens × ~US$0,04 (gemini-2.5-flash-image)
      metadata: { model: env.GEMINI_IMAGE_MODEL, expressions: Object.keys(expressions).length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (finalAttempt) await fail(message);
    throw err;
  }
}

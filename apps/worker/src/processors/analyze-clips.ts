import type { Job } from 'bullmq';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { AnalyzeClipsJob } from '@easymidia/shared';
import { env } from '../env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { anthropic, CLAUDE_MODEL, HAIKU_USD_PER_M_INPUT, HAIKU_USD_PER_M_OUTPUT } from '../lib/claude.js';
import type { TranscriptSegment } from '../lib/srt.js';
import { notifyFailure } from '../lib/notify.js';

// Vocabulário de reação do avatar (espelhado em generate-avatar.ts do worker)
const EXPRESSIONS = [
  'idle', 'curious', 'impressed', 'approved', 'analytical',
  'laughing', 'shocked', 'agreeing',
] as const;

const ClipSchema = z.object({
  start_seconds: z.number(),
  end_seconds: z.number(),
  hook: z.string(),
  score: z.number(),
  reason: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  // 2-3 expressões do avatar alinhadas com o áudio (spec §7.3)
  expression_timeline: z.array(
    z.object({ at_seconds: z.number(), expression: z.enum(EXPRESSIONS) })
  ),
});
const AnalysisSchema = z.object({ clips: z.array(ClipSchema) });

const SYSTEM_PROMPT = `Você é o algoritmo de curadoria da easymidia clip. Sua função é analisar transcrições de vídeos longos do YouTube e identificar os trechos com maior potencial viral pra virar Shorts de 30-60 segundos.

Critérios de score (0-100) por trecho:
- Hook forte nos primeiros 3 segundos (curiosidade, tensão, contradição)
- Payoff claro no fim (revelação, número surpreendente, punchline)
- Standalone (funciona sem contexto do vídeo inteiro)
- Densidade emocional (surpresa, indignação, admiração, humor)
- Actionability (viewer pode fazer algo com a informação)
- Timing: entre 25-55 segundos idealmente

Regras:
- start_seconds e end_seconds devem coincidir com limites de frases da transcrição.
- caption: legenda pronta pra postagem, máximo 200 caracteres, em português.
- hashtags: 3-6, sempre incluindo #Shorts.
- expression_timeline: o avatar é um ESPECTADOR reagindo ao vídeo em tempo real, como
  num canal de react. Gere UMA entrada pra cada frase ou virada relevante do trecho
  (6 a 12 entradas num trecho de 30-60s), com at_seconds relativo ao INÍCIO do trecho,
  alinhado ao começo da frase que provoca a reação. Escolha a expressão pela reação
  natural de quem OUVE aquilo naquele instante: piada → laughing; número/revelação
  absurda → shocked ou impressed; afirmação forte → agreeing ou approved; suspense/
  pergunta → curious; raciocínio/explicação → analytical; transições neutras → idle.
  Varie as expressões — não repita a mesma em sequência.
- reason: 2 linhas explicando por que o trecho tem potencial viral.`;

function transcriptForPrompt(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${s.start.toFixed(1)}s → ${s.end.toFixed(1)}s] ${s.text.trim()}`)
    .join('\n');
}

// O modelo às vezes devolve timestamps no meio de uma frase. Encosta início/fim
// na fronteira de segmento mais próxima (tolerância 4s); fim ganha 0.3s de folga
// pra não decepar a última palavra. Se o snap estourar 15-90s, mantém o original.
const SNAP_TOLERANCE = 4;
function snapToSegments(
  start: number,
  end: number,
  segments: TranscriptSegment[],
  videoDuration: number
): { start: number; end: number } {
  let bestStart = start;
  let d = SNAP_TOLERANCE;
  for (const s of segments) {
    const diff = Math.abs(s.start - start);
    if (diff < d) {
      d = diff;
      bestStart = s.start;
    }
  }
  let bestEnd = end;
  d = SNAP_TOLERANCE;
  for (const s of segments) {
    const diff = Math.abs(s.end - end);
    if (diff < d) {
      d = diff;
      bestEnd = Math.min(s.end + 0.3, videoDuration);
    }
  }
  const len = bestEnd - bestStart;
  if (len >= 15 && len <= 90) return { start: bestStart, end: bestEnd };
  return { start, end };
}

export async function analyzeClips(job: Job<AnalyzeClipsJob>) {
  try {
    await analyzeClipsInner(job);
  } catch (err) {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (finalAttempt) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from('source_videos')
        .update({ status: 'failed', error_message: `análise: ${message.slice(0, 480)}` })
        .eq('id', job.data.sourceVideoId);
      await notifyFailure(
        'análise de trechos falhou de vez',
        `Vídeo ${job.data.sourceVideoId}\n${message.slice(0, 600)}`
      );
    }
    throw err;
  }
}

async function analyzeClipsInner(job: Job<AnalyzeClipsJob>) {
  const { sourceVideoId, userId } = job.data;

  const { data: video, error } = await supabaseAdmin
    .from('source_videos')
    .select('id, youtube_id, title, duration_seconds, status, niche_id')
    .eq('id', sourceVideoId)
    .single();
  if (error || !video) throw new Error(`source_video ${sourceVideoId} não encontrado`);

  if (!env.R2_PUBLIC_URL) throw new Error('R2_PUBLIC_URL não configurada');
  const jsonUrl = `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/users/${userId}/source/${sourceVideoId}/transcript.json`;
  const res = await fetch(jsonUrl);
  if (!res.ok) throw new Error(`transcript.json indisponível (${res.status})`);
  const transcription = (await res.json()) as { segments?: TranscriptSegment[] };
  const segments = transcription.segments ?? [];
  if (segments.length === 0) throw new Error('transcrição sem segmentos');

  let nicheName = 'Geral';
  if (video.niche_id) {
    const { data: niche } = await supabaseAdmin
      .from('niches').select('name').eq('id', video.niche_id).single();
    if (niche) nicheName = niche.name;
  }

  const userPrompt = `Nicho: ${nicheName}
Vídeo: ${video.title}
Duração: ${video.duration_seconds}s

Transcrição completa com timestamps:
${transcriptForPrompt(segments)}

Retorne os 5 melhores trechos.`;

  const response = await anthropic().messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    output_config: { format: zodOutputFormat(AnalysisSchema) },
  });
  const parsed = response.parsed_output;
  if (!parsed || parsed.clips.length === 0) {
    throw new Error('análise não retornou trechos válidos');
  }

  const duration = video.duration_seconds ?? Number.MAX_SAFE_INTEGER;
  const clips = parsed.clips
    .filter((c) => c.end_seconds > c.start_seconds && c.end_seconds <= duration + 2)
    .filter((c) => c.end_seconds - c.start_seconds >= 15 && c.end_seconds - c.start_seconds <= 90)
    .map((c) => ({ ...c, ...snapToSegments(c.start_seconds, c.end_seconds, segments, duration) }))
    .map((c) => ({
      user_id: userId,
      source_video_id: sourceVideoId,
      start_seconds: c.start,
      end_seconds: c.end,
      hook: c.hook,
      score: Math.max(0, Math.min(100, c.score)),
      reason: c.reason,
      caption: c.caption.slice(0, 200),
      hashtags: c.hashtags.slice(0, 6),
      expression_timeline: c.expression_timeline,
      status: 'suggested',
    }));
  if (clips.length === 0) throw new Error('todos os trechos retornados falharam na validação de duração');

  // Idempotência no retry: remove sugestões não tocadas antes de reinserir
  await supabaseAdmin
    .from('suggested_clips')
    .delete()
    .eq('source_video_id', sourceVideoId)
    .eq('status', 'suggested');
  const { error: insertError } = await supabaseAdmin.from('suggested_clips').insert(clips);
  if (insertError) throw new Error(`insert suggested_clips: ${insertError.message}`);

  const inTok = response.usage.input_tokens;
  const outTok = response.usage.output_tokens;
  await supabaseAdmin.from('usage_events').insert({
    user_id: userId,
    event_type: 'analysis',
    reference_id: sourceVideoId,
    cost_usd: Number(
      ((inTok / 1e6) * HAIKU_USD_PER_M_INPUT + (outTok / 1e6) * HAIKU_USD_PER_M_OUTPUT).toFixed(5)
    ),
    metadata: { model: CLAUDE_MODEL, input_tokens: inTok, output_tokens: outTok, clips: clips.length },
  });

  const finalUpdate = await supabaseAdmin
    .from('source_videos')
    .update({ status: 'done' })
    .eq('id', sourceVideoId);
  if (finalUpdate.error) throw new Error(finalUpdate.error.message);
}

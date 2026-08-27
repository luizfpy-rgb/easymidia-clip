import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Job } from 'bullmq';
import type { AnalyzeClipsJob, TranscribeJob, SourceVideoStatus } from '@easymidia/shared';
import { env } from '../env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { run } from '../lib/exec.js';
import { uploadToR2 } from '../lib/r2.js';
import { transcribeAudio, GROQ_WHISPER_USD_PER_HOUR } from '../lib/groq.js';
import { segmentsToSrt } from '../lib/srt.js';
import { analyzeClipsQueue } from '../lib/queues.js';
import { notifyFailure, cookieHint } from '../lib/notify.js';

const MAX_DURATION_SECONDS = 3 * 3600;

async function setStatus(id: string, status: SourceVideoStatus, patch: Record<string, unknown> = {}) {
  const { error } = await supabaseAdmin
    .from('source_videos')
    .update({ status, ...patch })
    .eq('id', id);
  if (error) throw new Error(`update source_videos: ${error.message}`);
}

function ytdlpArgs(extra: string[]): string[] {
  const base = env.YTDLP_COOKIES_FILE ? ['--cookies', env.YTDLP_COOKIES_FILE] : [];
  return [...base, '--no-progress', ...extra];
}

export async function transcribe(job: Job<TranscribeJob>) {
  const { sourceVideoId, userId } = job.data;

  const { data: video, error } = await supabaseAdmin
    .from('source_videos')
    .select('id, youtube_id, status')
    .eq('id', sourceVideoId)
    .single();
  if (error || !video) throw new Error(`source_video ${sourceVideoId} não encontrado`);
  if (video.status === 'done') return; // job re-entregue após sucesso

  const url = `https://www.youtube.com/watch?v=${video.youtube_id}`;
  const workDir = await mkdtemp(join(tmpdir(), 'em-transcribe-'));

  try {
    await setStatus(sourceVideoId, 'downloading', { error_message: null });

    // Metadados sem download (título, canal, duração, views)
    const metaJson = await run('yt-dlp', ytdlpArgs(['-J', '--no-download', url]), {
      timeoutMs: 120_000,
    });
    const meta = JSON.parse(metaJson) as {
      title?: string;
      channel?: string;
      uploader?: string;
      duration?: number;
      view_count?: number;
      upload_date?: string;
    };
    const durationSeconds = meta.duration ?? 0;
    if (durationSeconds > MAX_DURATION_SECONDS) {
      throw new Error(`vídeo com ${Math.round(durationSeconds / 60)} min excede o limite de 180 min`);
    }
    const publishedAt = meta.upload_date
      ? `${meta.upload_date.slice(0, 4)}-${meta.upload_date.slice(4, 6)}-${meta.upload_date.slice(6, 8)}`
      : null;
    await supabaseAdmin
      .from('source_videos')
      .update({
        title: meta.title ?? url,
        channel: meta.channel ?? meta.uploader ?? null,
        duration_seconds: Math.round(durationSeconds),
        views: meta.view_count ?? null,
        published_at: publishedAt,
      })
      .eq('id', sourceVideoId);

    // Só áudio (revisão C4): o trecho em vídeo é baixado depois da aprovação, na Fase 4
    await run(
      'yt-dlp',
      ytdlpArgs(['-f', 'bestaudio/best', '-o', join(workDir, 'raw.%(ext)s'), url]),
      { timeoutMs: 15 * 60_000 }
    );
    const rawFile = (await readdir(workDir)).find((f) => f.startsWith('raw.'));
    if (!rawFile) throw new Error('yt-dlp não produziu arquivo de áudio');

    // Mono 16 kHz 32 kbps: fica abaixo do limite de upload da Groq (revisão I6)
    const compressed = join(workDir, 'audio.m4a');
    await run(
      'ffmpeg',
      ['-y', '-i', join(workDir, rawFile), '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', compressed],
      { timeoutMs: 10 * 60_000 }
    );

    await setStatus(sourceVideoId, 'transcribing');

    const transcription = await transcribeAudio(compressed);
    const segments = transcription.segments ?? [];
    if (segments.length === 0) throw new Error('Groq retornou transcrição vazia');

    const prefix = `users/${userId}/source/${sourceVideoId}`;
    const [audioUrl, srtUrl] = await Promise.all([
      uploadToR2(`${prefix}/audio.m4a`, await readFile(compressed), 'audio/mp4'),
      uploadToR2(`${prefix}/transcript.srt`, segmentsToSrt(segments), 'text/plain; charset=utf-8'),
    ]);
    // JSON bruto com word timestamps: insumo do gerador de ASS na Fase 4
    await uploadToR2(`${prefix}/transcript.json`, JSON.stringify(transcription), 'application/json');

    const hours = durationSeconds / 3600;
    await supabaseAdmin.from('usage_events').insert({
      user_id: userId,
      event_type: 'transcription',
      reference_id: sourceVideoId,
      cost_usd: Number((hours * GROQ_WHISPER_USD_PER_HOUR).toFixed(5)),
      metadata: { seconds: Math.round(durationSeconds), model: 'whisper-large-v3-turbo' },
    });

    await setStatus(sourceVideoId, 'analyzing', { audio_url: audioUrl, transcript_url: srtUrl });
    await analyzeClipsQueue.add('analyze', { userId, sourceVideoId } satisfies AnalyzeClipsJob);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (finalAttempt) {
      await setStatus(sourceVideoId, 'failed', { error_message: message.slice(0, 500) }).catch(() => {});
      await notifyFailure(
        'transcrição falhou de vez',
        `Vídeo ${video.youtube_id} (${sourceVideoId})\n${message.slice(0, 600)}${cookieHint(message)}`
      );
    }
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

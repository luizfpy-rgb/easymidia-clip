import type { Job } from 'bullmq';
import type { TranscribeJob } from '@easymidia/shared';

// Fase 2: yt-dlp só áudio (-f bestaudio) → ffmpeg mono 16kHz 32kbps → Groq Whisper Turbo → SRT no R2.
// Limite de upload da Groq exige o áudio comprimido antes do envio — revisão I6/C4.
export async function transcribe(job: Job<TranscribeJob>) {
  throw new Error(`not implemented (Fase 2) — source_video ${job.data.sourceVideoId}`);
}

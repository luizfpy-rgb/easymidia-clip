import type { Job } from 'bullmq';
import type { RenderJob } from '@easymidia/shared';

// Fase 4: yt-dlp --download-sections do trecho aprovado → SRT→ASS → FFmpeg
// (scale=-2:1344 + crop central + vstack + subtitles=captions.ass) → thumb → R2.
// Comando corrigido na revisão C2.
export async function render(job: Job<RenderJob>) {
  throw new Error(`not implemented (Fase 4) — clip ${job.data.clipId}`);
}

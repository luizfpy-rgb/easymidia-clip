import type { Job } from 'bullmq';
import type { AnalyzeClipsJob } from '@easymidia/shared';

// Fase 3: claude-haiku-4-5 com structured outputs (output_config.format) — revisão I4.
// Saída inclui clips[] com score/hook/caption/hashtags e expression_timeline do avatar.
export async function analyzeClips(job: Job<AnalyzeClipsJob>) {
  throw new Error(`not implemented (Fase 3) — source_video ${job.data.sourceVideoId}`);
}

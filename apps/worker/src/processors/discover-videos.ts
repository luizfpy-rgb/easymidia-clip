import type { Job } from 'bullmq';
import type { DiscoverVideosJob } from '@easymidia/shared';

// Fase 5: search.list (100 units) + videos.list em lote (1 unit) para filtrar por views — revisão M4.
export async function discoverVideos(job: Job<DiscoverVideosJob>) {
  throw new Error(`not implemented (Fase 5) — niche ${job.data.nicheId}`);
}

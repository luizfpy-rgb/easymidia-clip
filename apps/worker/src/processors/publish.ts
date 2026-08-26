import type { Job } from 'bullmq';
import type { PublishJob } from '@easymidia/shared';

// Fase 6: POST https://backend.blotato.com/v2/posts — 1 request por conta/slot.
// Body: { post: { accountId, content: { text, platform, mediaUrls }, target: { targetType } }, scheduledTime }
// scheduledTime na RAIZ (aninhado é ignorado). Mídia via POST /v2/media antes — revisão C1/I3.
export async function publish(job: Job<PublishJob>) {
  throw new Error(`not implemented (Fase 6) — slot ${job.data.scheduleSlotId}`);
}

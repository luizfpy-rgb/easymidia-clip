import type { Job } from 'bullmq';

// Fase 6: job repeatable (3 min) — Blotato não tem webhook (revisão C1).
// Consulta slots em 'publishing' via GET e atualiza schedule_slots.
export async function pollBlotatoStatus(_job: Job) {
  throw new Error('not implemented (Fase 6)');
}

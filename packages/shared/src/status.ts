// Duas máquinas de estado separadas (revisão I5):
// o vídeo fonte tem um ciclo de ingestão; cada clip tem seu próprio ciclo de publicação.

export const SOURCE_VIDEO_STATUSES = [
  'pending',
  'downloading',
  'transcribing',
  'analyzing',
  'done',
  'failed',
] as const;
export type SourceVideoStatus = (typeof SOURCE_VIDEO_STATUSES)[number];

const SOURCE_VIDEO_TRANSITIONS: Record<SourceVideoStatus, SourceVideoStatus[]> = {
  pending: ['downloading', 'failed'],
  downloading: ['transcribing', 'failed'],
  // 'done' direto enquanto a análise (Fase 3) não está ligada no pipeline
  transcribing: ['analyzing', 'done', 'failed'],
  analyzing: ['done', 'failed'],
  done: [],
  failed: ['pending'], // retry manual
};

export const CLIP_STATUSES = [
  'suggested',
  'approved',
  'rejected',
  'rendering',
  'rendered',
  'scheduled',
  'publishing',
  'published',
  'failed',
] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];

const CLIP_TRANSITIONS: Record<ClipStatus, ClipStatus[]> = {
  suggested: ['approved', 'rejected'],
  approved: ['rendering'],
  rejected: [],
  rendering: ['rendered', 'failed'],
  rendered: ['scheduled'],
  scheduled: ['publishing', 'rendered'], // volta se o slot for cancelado
  publishing: ['published', 'failed'],
  published: [],
  failed: ['approved'], // retry re-enfileira o render
};

export function canTransitionSourceVideo(from: SourceVideoStatus, to: SourceVideoStatus): boolean {
  return SOURCE_VIDEO_TRANSITIONS[from].includes(to);
}

export function canTransitionClip(from: ClipStatus, to: ClipStatus): boolean {
  return CLIP_TRANSITIONS[from].includes(to);
}

export const SCHEDULE_SLOT_STATUSES = ['scheduled', 'publishing', 'published', 'failed'] as const;
export type ScheduleSlotStatus = (typeof SCHEDULE_SLOT_STATUSES)[number];

export const QUEUES = {
  discoverVideos: 'discover-videos',
  transcribe: 'transcribe',
  analyzeClips: 'analyze-clips',
  render: 'render',
  publish: 'publish',
  pollBlotatoStatus: 'poll-blotato-status',
  cleanupR2: 'cleanup-r2',
  collectMetrics: 'collect-metrics',
  generateAvatar: 'generate-avatar',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// Padrão de retry da revisão M6: 3 tentativas com backoff exponencial, depois failed + notificação.
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
  removeOnFail: false as const,
};

// Rate limit Blotato: 30 req/min documentado; 25 de folga (revisão C1).
export const PUBLISH_LIMITER = { max: 25, duration: 60_000 };

export interface DiscoverVideosJob {
  userId: string;
  nicheId: string;
}
export interface TranscribeJob {
  userId: string;
  sourceVideoId: string;
}
export interface AnalyzeClipsJob {
  userId: string;
  sourceVideoId: string;
}
export interface RenderJob {
  userId: string;
  clipId: string;
}
export interface PublishJob {
  userId: string;
  scheduleSlotId: string;
}
export interface GenerateAvatarJob {
  userId: string;
  avatarId: string;
  // JPEG reduzido no browser (≤1024px) — evita credencial R2 na API
  sourceImageBase64: string;
  // realistic = clone fotorrealista (anima em vídeo se FAL_KEY existir)
  style?: 'realistic' | 'cartoon';
}

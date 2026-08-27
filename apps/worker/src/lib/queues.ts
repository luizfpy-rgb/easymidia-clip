import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUES, DEFAULT_JOB_OPTIONS } from '@easymidia/shared';
import { env } from '../env.js';

// Conexão separada para enfileirar a próxima etapa do pipeline a partir de um processor.
const enqueueConnection = new Redis(env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

export const analyzeClipsQueue = new Queue(QUEUES.analyzeClips, {
  connection: enqueueConnection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const pollBlotatoQueue = new Queue(QUEUES.pollBlotatoStatus, {
  connection: enqueueConnection,
});

export const cleanupR2Queue = new Queue(QUEUES.cleanupR2, {
  connection: enqueueConnection,
});

export const collectMetricsQueue = new Queue(QUEUES.collectMetrics, {
  connection: enqueueConnection,
});

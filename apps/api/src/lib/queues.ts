import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUES, DEFAULT_JOB_OPTIONS } from '@easymidia/shared';
import { env } from '../env.js';

export const redis = new Redis(env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

function makeQueue(name: string) {
  return new Queue(name, { connection: redis, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}

export const queues = {
  discoverVideos: makeQueue(QUEUES.discoverVideos),
  transcribe: makeQueue(QUEUES.transcribe),
  analyzeClips: makeQueue(QUEUES.analyzeClips),
  render: makeQueue(QUEUES.render),
  publish: makeQueue(QUEUES.publish),
};

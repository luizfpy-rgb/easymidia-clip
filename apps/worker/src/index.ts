import { Worker, type Processor, type WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUES, PUBLISH_LIMITER } from '@easymidia/shared';
import { env } from './env.js';
import { discoverVideos } from './processors/discover-videos.js';
import { transcribe } from './processors/transcribe.js';
import { analyzeClips } from './processors/analyze-clips.js';
import { render } from './processors/render.js';
import { publish } from './processors/publish.js';
import { pollBlotatoStatus } from './processors/poll-blotato-status.js';

const connection = new Redis(env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

function start(name: string, processor: Processor, opts: Partial<Omit<WorkerOptions, 'connection'>> = {}) {
  const worker = new Worker(name, processor, { ...opts, connection });
  worker.on('completed', (job) => console.log(`[${name}] #${job.id} completed`));
  worker.on('failed', (job, err) => console.error(`[${name}] #${job?.id} failed: ${err.message}`));
  return worker;
}

const enabled = new Set(
  (env.WORKER_QUEUES ?? '')
    .split(',')
    .map((q) => q.trim())
    .filter(Boolean)
);
const wants = (name: string) => enabled.size === 0 || enabled.has(name);

const workers = [
  wants(QUEUES.discoverVideos) && start(QUEUES.discoverVideos, discoverVideos),
  wants(QUEUES.transcribe) && start(QUEUES.transcribe, transcribe),
  // Render é CPU-bound: 1 por vez por container (revisão 7.4)
  wants(QUEUES.render) && start(QUEUES.render, render, { concurrency: 1 }),
  wants(QUEUES.analyzeClips) && start(QUEUES.analyzeClips, analyzeClips, { concurrency: 3 }),
  wants(QUEUES.publish) && start(QUEUES.publish, publish, { limiter: PUBLISH_LIMITER }),
  wants(QUEUES.pollBlotatoStatus) && start(QUEUES.pollBlotatoStatus, pollBlotatoStatus),
].filter((w): w is Worker => Boolean(w));

console.log(
  `easymidia worker up — ${workers.length} queues${enabled.size ? ` (${[...enabled].join(', ')})` : ''}`
);

// Polling de status do Blotato a cada 3 min (não existe webhook — revisão C1)
import('./lib/queues.js').then(({ pollBlotatoQueue }) =>
  pollBlotatoQueue
    .add('poll', {}, { repeat: { every: 180_000 }, jobId: 'poll-blotato-status' })
    .catch((err) => console.error('falha ao registrar poll-blotato-status:', err))
);

async function shutdown() {
  console.log('shutting down...');
  await Promise.allSettled(workers.map((w) => w.close()));
  connection.disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

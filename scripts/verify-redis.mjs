// Testa a conexão Redis (filas BullMQ). Lê UPSTASH_REDIS_URL do .env na raiz.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const redis = new Redis(env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: false,
  connectTimeout: 10_000,
});
redis.on('error', () => {});

try {
  const pong = await redis.ping();
  await redis.set('_healthcheck', 'ok', 'EX', 30);
  const val = await redis.get('_healthcheck');
  console.log(`ping: ${pong} · escrita/leitura: ${val === 'ok' ? 'ok' : 'FALHOU'}`);
  process.exit(0);
} catch (err) {
  console.error(`redis FALHOU: ${err.message}`);
  process.exit(1);
} finally {
  redis.disconnect();
}

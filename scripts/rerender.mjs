// Re-renderiza um clip: apaga o short antigo, volta o clip pra approved e re-enfileira.
// Uso: node scripts/rerender.mjs <clip_id>
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const clipId = process.argv[2];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: clip, error } = await db
  .from('suggested_clips')
  .select('id, user_id, status')
  .eq('id', clipId)
  .single();
if (error || !clip) {
  console.error('clip não encontrado');
  process.exit(1);
}
await db.from('rendered_shorts').delete().eq('suggested_clip_id', clipId);
await db.from('suggested_clips').update({ status: 'approved', error_message: null }).eq('id', clipId);

const connection = new Redis(env.UPSTASH_REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
const queue = new Queue('render', { connection });
await queue.add('render', { userId: clip.user_id, clipId });
await queue.close();
connection.disconnect();
console.log('re-render enfileirado:', clipId);

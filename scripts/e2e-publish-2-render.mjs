// Teste de publicação, etapa 2: aprova o clip (RPC atômica) e enfileira o render.
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

const { data: clip } = await db.from('suggested_clips').select('id, user_id').eq('id', clipId).single();
const { data: result, error } = await db.rpc('approve_clip', { p_clip_id: clipId, p_user_id: clip.user_id });
console.log('approve:', result ?? error?.message);
if (result !== 'ok') process.exit(1);

const connection = new Redis(env.UPSTASH_REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
const queue = new Queue('render', { connection });
await queue.add('render', { userId: clip.user_id, clipId });
await queue.close();
connection.disconnect();
console.log('render enfileirado');

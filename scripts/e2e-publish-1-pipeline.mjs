// Teste de publicação, etapa 1: escolhe um vídeo descoberto do usuário real,
// confirma direitos e dispara o pipeline (transcribe → analyze).
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: profile } = await db.from('profiles').select('id').eq('email', 'luizfpy@gmail.com').single();
const { data: candidates } = await db
  .from('source_videos')
  .select('id, youtube_id, title, duration_seconds, status')
  .eq('user_id', profile.id)
  .eq('discovered_by', 'ai_discovery')
  .eq('status', 'pending')
  .order('duration_seconds', { ascending: true })
  .limit(5);
if (!candidates?.length) {
  console.error('nenhum vídeo descoberto pendente');
  process.exit(1);
}
const video = candidates[0];
console.log(`vídeo: ${video.youtube_id} | ${Math.round(video.duration_seconds / 60)}min | ${video.title}`);

await db
  .from('source_videos')
  .update({ rights_confirmed: true, error_message: null })
  .eq('id', video.id);

const connection = new Redis(env.UPSTASH_REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
const queue = new Queue('transcribe', { connection });
await queue.add('transcribe', { userId: profile.id, sourceVideoId: video.id });
await queue.close();
connection.disconnect();
console.log('pipeline disparado:', video.id);

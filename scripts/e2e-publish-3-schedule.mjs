// Teste de publicação, etapa 3: agenda o short numa plataforma específica com
// horário no futuro próximo, aprova o slot e enfileira a publicação.
// Uso: node scripts/e2e-publish-3-schedule.mjs <clip_id> <platform> [minutos_no_futuro]
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const clipId = process.argv[2];
const platform = process.argv[3];
const minutes = Number(process.argv[4] ?? 3);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: short } = await db
  .from('rendered_shorts')
  .select('id, user_id, caption, video_url')
  .eq('suggested_clip_id', clipId)
  .single();
if (!short) {
  console.error('short não encontrado');
  process.exit(1);
}
const { data: account } = await db
  .from('connected_accounts')
  .select('id, platform, handle, blotato_account_id')
  .eq('user_id', short.user_id)
  .eq('platform', platform)
  .eq('active', true)
  .single();
if (!account) {
  console.error(`conta ${platform} não encontrada`);
  process.exit(1);
}
const scheduledAt = new Date(Date.now() + minutes * 60_000).toISOString();
const { data: slot, error } = await db
  .from('schedule_slots')
  .insert({
    user_id: short.user_id,
    rendered_short_id: short.id,
    connected_account_id: account.id,
    scheduled_at: scheduledAt,
    status: 'scheduled',
    approved: true,
  })
  .select()
  .single();
if (error) {
  console.error('slot:', error.message);
  process.exit(1);
}
console.log(`slot criado: ${slot.id} | ${platform} (${account.handle || account.blotato_account_id}) | ${scheduledAt}`);

const connection = new Redis(env.UPSTASH_REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
const queue = new Queue('publish', { connection });
await queue.add('publish', { userId: short.user_id, scheduleSlotId: slot.id });
await queue.close();
connection.disconnect();
console.log('publicação enfileirada (worker Railway → Blotato)');

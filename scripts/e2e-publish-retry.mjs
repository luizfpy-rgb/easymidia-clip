// Reseta um slot que falhou e re-enfileira a publicação com novo horário.
// Uso: node scripts/e2e-publish-retry.mjs <slot_id> [minutos_no_futuro]
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const slotId = process.argv[2];
const minutes = Number(process.argv[3] ?? 2);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const scheduledAt = new Date(Date.now() + minutes * 60_000).toISOString();
const { data: slot, error } = await db
  .from('schedule_slots')
  .update({ status: 'scheduled', error_message: null, blotato_post_id: null, scheduled_at: scheduledAt })
  .eq('id', slotId)
  .select('id, user_id')
  .single();
if (error || !slot) {
  console.error('reset falhou:', error?.message);
  process.exit(1);
}
const connection = new Redis(env.UPSTASH_REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
const queue = new Queue('publish', { connection });
await queue.add('publish', { userId: slot.user_id, scheduleSlotId: slot.id });
await queue.close();
connection.disconnect();
console.log(`re-enfileirado: ${slotId} para ${scheduledAt}`);

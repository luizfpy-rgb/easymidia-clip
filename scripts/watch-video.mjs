// Acompanha um source_video até done/failed, imprimindo cada transição.
// Uso: node scripts/watch-video.mjs <source_video_id> [timeout_min]
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const id = process.argv[2];
const timeoutMin = Number(process.argv[3] ?? 20);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let last = '';
const deadline = Date.now() + timeoutMin * 60_000;
while (Date.now() < deadline) {
  const { data } = await db
    .from('source_videos')
    .select('status, title, error_message')
    .eq('id', id)
    .single();
  if (data && data.status !== last) {
    last = data.status;
    console.log(`status: ${data.status}${data.error_message ? ' — ' + data.error_message : ''}`);
    if (data.status === 'done' || data.status === 'failed') {
      if (data.status === 'done') {
        const { data: clips } = await db
          .from('suggested_clips')
          .select('id, score, hook')
          .eq('source_video_id', id)
          .order('score', { ascending: false });
        for (const c of clips ?? []) {
          console.log(`clip ${Math.round(c.score)}pts ${c.id} — ${c.hook.slice(0, 80)}`);
        }
      }
      process.exit(data.status === 'done' ? 0 : 1);
    }
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
console.log('timeout do watch');
process.exit(2);

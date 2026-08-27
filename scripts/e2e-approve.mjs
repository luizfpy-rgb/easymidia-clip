// Aprova um clip na API alvo com o usuário e2e e acompanha até rendered/failed.
// Uso: node scripts/e2e-approve.mjs <clip_id> [api_base]
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const clipId = process.argv[2];
const API = process.argv[3] ?? 'https://api.easymidia.io';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: session, error } = await anon.auth.signInWithPassword({
  email: 'e2e@easymidia.dev',
  password: 'E2e!easymidia2026',
});
if (error) {
  console.error('login:', error.message);
  process.exit(1);
}
const res = await fetch(`${API}/v1/clips/${clipId}/approve`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${session.session.access_token}` },
});
console.log('approve:', res.status, JSON.stringify(await res.json()));
if (!res.ok) process.exit(1);

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let last = '';
const deadline = Date.now() + 15 * 60_000;
while (Date.now() < deadline) {
  const { data } = await db
    .from('suggested_clips')
    .select('status, error_message')
    .eq('id', clipId)
    .single();
  if (data && data.status !== last) {
    last = data.status;
    console.log(`clip: ${data.status}${data.error_message ? ' — ' + data.error_message : ''}`);
    if (data.status === 'rendered' || data.status === 'failed') {
      if (data.status === 'rendered') {
        const { data: short } = await db
          .from('rendered_shorts')
          .select('video_url, thumbnail_url, duration_seconds, size_bytes')
          .eq('suggested_clip_id', clipId)
          .single();
        console.log('short:', JSON.stringify(short));
      }
      process.exit(data.status === 'rendered' ? 0 : 1);
    }
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
console.log('timeout');
process.exit(2);

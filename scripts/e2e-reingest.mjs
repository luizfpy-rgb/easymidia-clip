// Re-enfileira um vídeo (pending/failed) na API alvo com o usuário e2e.
// Uso: node scripts/e2e-reingest.mjs <source_video_id> [api_base]
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const id = process.argv[2];
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
const res = await fetch(`${API}/v1/source-videos/${id}/ingest`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${session.session.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ rights_confirmed: true }),
});
console.log('reingest:', res.status, JSON.stringify(await res.json()));

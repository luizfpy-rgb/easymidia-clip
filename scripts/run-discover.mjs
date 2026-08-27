// Executa o processor de descoberta localmente (fora da fila) para um nicho.
// Uso: node --env-file=.env scripts/run-discover.mjs <niche_id>
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const nicheId = process.argv[2];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: niche } = await db.from('niches').select('id, user_id').eq('id', nicheId).single();
if (!niche) {
  console.error('nicho não encontrado');
  process.exit(1);
}
const { discoverVideos } = await import('../apps/worker/dist/processors/discover-videos.js');
const result = await discoverVideos({ data: { userId: niche.user_id, nicheId } });
console.log('resultado:', JSON.stringify(result));

// Espera o signup de um e-mail e aplica o plano internal (D6) assim que o profile existir.
// Uso: node scripts/grant-internal.mjs <email> [timeout_min]
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
const timeoutMin = Number(process.argv[3] ?? 120);
if (!email) {
  console.error('uso: node scripts/grant-internal.mjs <email>');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const deadline = Date.now() + timeoutMin * 60_000;
while (Date.now() < deadline) {
  const { data } = await db.from('profiles').select('id, plan').eq('email', email).maybeSingle();
  if (data) {
    if (data.plan === 'internal') {
      console.log(`${email} já é internal`);
      process.exit(0);
    }
    const { error } = await db.from('profiles').update({ plan: 'internal' }).eq('id', data.id);
    if (error) {
      console.error('update falhou:', error.message);
      process.exit(1);
    }
    console.log(`plano internal aplicado para ${email}`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
console.log('timeout: signup não aconteceu');
process.exit(2);

// Cria (se preciso) o usuário de teste E2E com plano internal e imprime um JWT válido.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const EMAIL = 'e2e@easymidia.dev';
const PASSWORD = 'E2e!easymidia2026';

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
if (createError && !/already/i.test(createError.message)) {
  console.error('createUser:', createError.message);
  process.exit(1);
}
console.log(created?.user ? 'usuário criado' : 'usuário já existia');

const { error: planError } = await admin
  .from('profiles')
  .update({ plan: 'internal' })
  .eq('email', EMAIL);
if (planError) {
  console.error('plan update:', planError.message);
  process.exit(1);
}

const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: session, error: loginError } = await anon.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
if (loginError) {
  console.error('login:', loginError.message);
  process.exit(1);
}
console.log('TOKEN=' + session.session.access_token);

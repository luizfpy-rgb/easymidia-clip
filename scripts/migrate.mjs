// Runner de migrações: aplica supabase/migrations/*.sql em ordem, uma vez cada.
// Uso: DATABASE_URL=postgresql://... node scripts/migrate.mjs
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(
  'create table if not exists public._migrations (name text primary key, applied_at timestamptz default now())'
);
// Sem policy nenhuma: só o service_role (que ignora RLS) acessa
await client.query('alter table public._migrations enable row level security');

const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
for (const f of files) {
  const { rows } = await client.query('select 1 from public._migrations where name = $1', [f]);
  if (rows.length) {
    console.log(`= ${f} (já aplicada)`);
    continue;
  }
  const sql = await readFile(join(dir, f), 'utf8');
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into public._migrations (name) values ($1)', [f]);
    await client.query('commit');
    console.log(`+ ${f}`);
  } catch (err) {
    await client.query('rollback');
    console.error(`! ${f}: ${err.message}`);
    process.exit(1);
  }
}
await client.end();
console.log('migrações ok');

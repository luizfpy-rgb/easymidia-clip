import pg from 'pg';

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const t = await c.query(
  "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename"
);
console.log(t.rows.map((r) => `${r.rowsecurity ? 'RLS ' : 'OPEN'} ${r.tablename}`).join('\n'));
const f = await c.query(
  "select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('approve_clip','store_blotato_key','get_blotato_key','handle_new_user') order by proname"
);
console.log('funções:', f.rows.map((r) => r.proname).join(', '));
const s = await c.query(
  'select (select count(*) from templates) as templates, (select count(*) from avatars) as avatars'
);
console.log('seeds:', JSON.stringify(s.rows[0]));
const plan = await c.query(
  "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'profiles_plan_check'"
);
console.log('plan check:', plan.rows[0]?.def ?? 'NÃO ENCONTRADO');
await c.end();

import { Hono } from 'hono';
import { z } from 'zod';
import { PLATFORMS } from '@easymidia/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { listBlotatoAccounts, type BlotatoAccount } from '../lib/blotato.js';

function normalizePlatform(raw: string | undefined): string | null {
  if (!raw) return null;
  const p = raw.toLowerCase().replace(/[^a-z]/g, '');
  const found = PLATFORMS.find((x) => p.includes(x) || x.includes(p));
  if (found) return found;
  if (p.includes('x') && p.length <= 2) return 'twitter';
  return null;
}

async function syncAccounts(userId: string, accounts: BlotatoAccount[]) {
  const rows = accounts
    .map((a) => ({
      user_id: userId,
      platform: normalizePlatform(a.platform),
      handle: (a.username ?? a.name ?? String(a.id)) as string,
      blotato_account_id: String(a.id),
      active: true,
    }))
    .filter((r): r is typeof r & { platform: string } => r.platform !== null);
  if (rows.length === 0) return 0;
  const { error } = await supabaseAdmin
    .from('connected_accounts')
    .upsert(rows, { onConflict: 'user_id,blotato_account_id' });
  if (error) throw new Error(error.message);
  return rows.length;
}

export const accounts = new Hono<{ Variables: AuthVariables }>()
  .post('/blotato/connect', async (c) => {
    const parsed = z
      .object({ api_key: z.string().min(10) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const userId = c.get('userId');

    // Valida a chave contra o Blotato antes de guardar
    let blotatoAccounts;
    try {
      blotatoAccounts = await listBlotatoAccounts(parsed.data.api_key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'blotato_401' || msg === 'blotato_403') {
        return c.json({ error: 'invalid_blotato_key' }, 422);
      }
      return c.json({ error: 'blotato_unreachable' }, 502);
    }

    // Chave vai pro Vault; nunca pra coluna nem pra resposta (revisão I2)
    const { error } = await supabaseAdmin.rpc('store_blotato_key', {
      p_user_id: userId,
      p_key: parsed.data.api_key,
    });
    if (error) return c.json({ error: error.message }, 500);

    const synced = await syncAccounts(userId, blotatoAccounts);
    return c.json({ connected: true, accounts_synced: synced });
  })
  .get('/blotato/status', async (c) => {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('blotato_key_secret_id')
      .eq('id', c.get('userId'))
      .single();
    return c.json({ connected: Boolean(data?.blotato_key_secret_id) });
  })
  .get('/connected', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('connected_accounts')
      .select('id, platform, handle, blotato_account_id, active, created_at')
      .eq('user_id', c.get('userId'))
      .order('created_at');
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ accounts: data });
  })
  .post('/connected/sync', async (c) => {
    const userId = c.get('userId');
    const { data: key, error } = await supabaseAdmin.rpc('get_blotato_key', { p_user_id: userId });
    if (error || !key) return c.json({ error: 'blotato_not_connected' }, 409);
    try {
      const synced = await syncAccounts(userId, await listBlotatoAccounts(key as string));
      return c.json({ accounts_synced: synced });
    } catch {
      return c.json({ error: 'blotato_unreachable' }, 502);
    }
  })
  .delete('/connected/:id', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('connected_accounts')
      .update({ active: false })
      .eq('id', c.req.param('id'))
      .eq('user_id', c.get('userId'))
      .select('id');
    if (error) return c.json({ error: error.message }, 500);
    if (!data || data.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  });

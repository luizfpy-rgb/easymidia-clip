import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

async function countRows(table: string, userId: string, filters: Record<string, string> = {}) {
  let q = supabaseAdmin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}

export const me = new Hono<{ Variables: AuthVariables }>().get('/', async (c) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('email, plan, credits_remaining, blotato_key_secret_id, created_at')
    .eq('id', c.get('userId'))
    .single();
  if (error || !data) return c.json({ error: 'not_found' }, 404);
  return c.json({
    profile: {
      email: data.email,
      plan: data.plan,
      credits_remaining: data.credits_remaining,
      blotato_connected: Boolean(data.blotato_key_secret_id),
      created_at: data.created_at,
    },
  });
});

export const dashboard = new Hono<{ Variables: AuthVariables }>().get('/summary', async (c) => {
  const userId = c.get('userId');
  const [videos, clipsSuggested, rendered, published] = await Promise.all([
    countRows('source_videos', userId),
    countRows('suggested_clips', userId, { status: 'suggested' }),
    countRows('rendered_shorts', userId),
    countRows('schedule_slots', userId, { status: 'published' }),
  ]);
  const { data: upcoming } = await supabaseAdmin
    .from('schedule_slots')
    .select('id, scheduled_at, status')
    .eq('user_id', userId)
    .in('status', ['scheduled', 'publishing'])
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(5);
  return c.json({
    summary: {
      source_videos: videos,
      clips_awaiting_review: clipsSuggested,
      shorts_rendered: rendered,
      posts_published: published,
      next_posts: upcoming ?? [],
    },
  });
});

export const usage = new Hono<{ Variables: AuthVariables }>()
  .get('/current-month', async (c) => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data, error } = await supabaseAdmin
      .from('usage_events')
      .select('cost_usd')
      .eq('user_id', c.get('userId'))
      .gte('created_at', monthStart.toISOString());
    if (error) return c.json({ error: error.message }, 500);
    const total = (data ?? []).reduce((acc, e) => acc + Number(e.cost_usd), 0);
    return c.json({ month_start: monthStart.toISOString(), total_cost_usd: Number(total.toFixed(4)) });
  })
  .get('/breakdown', async (c) => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data, error } = await supabaseAdmin
      .from('usage_events')
      .select('event_type, cost_usd')
      .eq('user_id', c.get('userId'))
      .gte('created_at', monthStart.toISOString());
    if (error) return c.json({ error: error.message }, 500);
    const byType: Record<string, { count: number; cost_usd: number }> = {};
    for (const e of data ?? []) {
      byType[e.event_type] ??= { count: 0, cost_usd: 0 };
      byType[e.event_type].count++;
      byType[e.event_type].cost_usd = Number((byType[e.event_type].cost_usd + Number(e.cost_usd)).toFixed(4));
    }
    return c.json({ month_start: monthStart.toISOString(), breakdown: byType });
  });

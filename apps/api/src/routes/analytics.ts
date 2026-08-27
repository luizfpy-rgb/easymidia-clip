import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { queues } from '../lib/queues.js';

interface PostRow {
  id: string;
  scheduled_at: string;
  published_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  reach: number | null;
  metrics_updated_at: string | null;
  rendered_shorts: { caption: string; thumbnail_url: string } | null;
  connected_accounts: { platform: string; handle: string } | null;
}

interface Totals {
  posts: number;
  views: number;
  likes: number;
  comments: number;
  reach: number;
}

const emptyTotals = (): Totals => ({ posts: 0, views: 0, likes: 0, comments: 0, reach: 0 });

function accumulate(t: Totals, p: PostRow) {
  t.posts++;
  t.views += Number(p.views) || 0;
  t.likes += Number(p.likes) || 0;
  t.comments += Number(p.comments) || 0;
  t.reach += Number(p.reach) || 0;
}

export const analytics = new Hono<{ Variables: AuthVariables }>()
  .get('/', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('schedule_slots')
      .select(
        `id, scheduled_at, published_url, views, likes, comments, reach, metrics_updated_at,
         rendered_shorts ( caption, thumbnail_url ),
         connected_accounts ( platform, handle )`
      )
      .eq('user_id', c.get('userId'))
      .eq('status', 'published')
      .order('scheduled_at', { ascending: false })
      .limit(200);
    if (error) return c.json({ error: error.message }, 500);

    const posts = (data ?? []) as unknown as PostRow[];
    const totals = emptyTotals();
    const byPlatform: Record<string, Totals> = {};
    for (const post of posts) {
      accumulate(totals, post);
      const platform = post.connected_accounts?.platform ?? 'outro';
      byPlatform[platform] ??= emptyTotals();
      accumulate(byPlatform[platform], post);
    }
    return c.json({ posts, totals, by_platform: byPlatform });
  })
  // Enfileira uma coleta imediata (a recorrente roda a cada 6h no worker)
  .post('/refresh', async (c) => {
    await queues.collectMetrics.add('collect', {});
    return c.json({ queued: true });
  });

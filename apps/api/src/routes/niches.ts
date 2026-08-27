import { Hono } from 'hono';
import { z } from 'zod';
import type { DiscoverVideosJob } from '@easymidia/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { queues } from '../lib/queues.js';

const nicheBody = z.object({
  name: z.string().min(2).max(80),
  keywords: z.array(z.string().min(2).max(60)).min(1).max(10),
  language: z.string().default('pt-BR'),
  min_views: z.coerce.number().int().min(1000).default(100000),
  max_age_days: z.coerce.number().int().min(1).max(365).default(30),
});

export const niches = new Hono<{ Variables: AuthVariables }>()
  .get('/', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('niches')
      .select('id, name, keywords, language, min_views, max_age_days, last_discovery_at, created_at')
      .eq('user_id', c.get('userId'))
      .order('created_at');
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ niches: data });
  })
  .post('/', async (c) => {
    const parsed = nicheBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
    const { data, error } = await supabaseAdmin
      .from('niches')
      .insert({ ...parsed.data, user_id: c.get('userId') })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ niche: data }, 201);
  })
  .patch('/:id', async (c) => {
    const parsed = nicheBody.partial().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const { data, error } = await supabaseAdmin
      .from('niches')
      .update(parsed.data)
      .eq('id', c.req.param('id'))
      .eq('user_id', c.get('userId'))
      .select();
    if (error) return c.json({ error: error.message }, 500);
    if (!data || data.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({ niche: data[0] });
  })
  .delete('/:id', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('niches')
      .delete()
      .eq('id', c.req.param('id'))
      .eq('user_id', c.get('userId'))
      .select('id');
    if (error) return c.json({ error: error.message }, 500);
    if (!data || data.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  });

export const discovery = new Hono<{ Variables: AuthVariables }>()
  .post('/search', async (c) => {
    const parsed = z
      .object({ niche_id: z.string().uuid() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const userId = c.get('userId');

    const { data: niche } = await supabaseAdmin
      .from('niches')
      .select('id, last_discovery_at, last_discovery_count')
      .eq('id', parsed.data.niche_id)
      .eq('user_id', userId)
      .single();
    if (!niche) return c.json({ error: 'not_found' }, 404);

    // Cache 24h — protege a quota do YouTube (spec §12). Gravado pelo worker ao
    // COMPLETAR; busca que falhou não trava. Busca vazia libera retry em 1h.
    if (niche.last_discovery_at) {
      const ageMs = Date.now() - new Date(niche.last_discovery_at).getTime();
      const lockMs = (niche.last_discovery_count ?? 0) > 0 ? 24 * 3600_000 : 3600_000;
      if (ageMs < lockMs) {
        return c.json({
          cached: true,
          last_count: niche.last_discovery_count ?? 0,
          next_search_in_hours: Math.max(1, Math.ceil((lockMs - ageMs) / 3600_000)),
        });
      }
    }

    await queues.discoverVideos.add('discover', {
      userId,
      nicheId: niche.id,
    } satisfies DiscoverVideosJob);
    return c.json({ queued: true });
  })
  .get('/results/:nicheId', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('source_videos')
      .select('id, youtube_id, title, channel, duration_seconds, views, published_at, status, rights_confirmed')
      .eq('user_id', c.get('userId'))
      .eq('niche_id', c.req.param('nicheId'))
      .eq('discovered_by', 'ai_discovery')
      .order('views', { ascending: false })
      .limit(50);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ videos: data });
  });

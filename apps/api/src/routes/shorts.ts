import { Hono } from 'hono';
import type { RenderJob } from '@easymidia/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { queues } from '../lib/queues.js';

export const shorts = new Hono<{ Variables: AuthVariables }>()
  .get('/', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('rendered_shorts')
      .select('id, suggested_clip_id, video_url, thumbnail_url, caption, hashtags, duration_seconds, size_bytes, created_at')
      .eq('user_id', c.get('userId'))
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ shorts: data });
  })
  .get('/:id', async (c) => {
    const { data } = await supabaseAdmin
      .from('rendered_shorts')
      .select('*')
      .eq('id', c.req.param('id'))
      .eq('user_id', c.get('userId'))
      .single();
    if (!data) return c.json({ error: 'not_found' }, 404);
    return c.json({ short: data });
  })
  .post('/:id/retry', async (c) => {
    // Re-render de um clip que falhou: o job parte do suggested_clip
    const userId = c.get('userId');
    const { data: clip } = await supabaseAdmin
      .from('suggested_clips')
      .select('id, status')
      .eq('id', c.req.param('id'))
      .eq('user_id', userId)
      .single();
    if (!clip) return c.json({ error: 'not_found' }, 404);
    if (clip.status !== 'failed') return c.json({ error: 'clip_not_failed' }, 409);
    await supabaseAdmin
      .from('suggested_clips')
      .update({ status: 'approved', error_message: null })
      .eq('id', clip.id);
    await queues.render.add('render', { userId, clipId: clip.id } satisfies RenderJob);
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('rendered_shorts')
      .delete()
      .eq('id', c.req.param('id'))
      .eq('user_id', c.get('userId'))
      .select('id');
    if (error) return c.json({ error: error.message }, 500);
    if (!data || data.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  });

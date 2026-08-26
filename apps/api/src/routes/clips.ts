import { Hono } from 'hono';
import type { RenderJob } from '@easymidia/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { queues } from '../lib/queues.js';

export const clips = new Hono<{ Variables: AuthVariables }>()
  .get('/:id/preview', async (c) => {
    const { data: clip } = await supabaseAdmin
      .from('suggested_clips')
      .select('id, start_seconds, end_seconds, source_videos ( youtube_id )')
      .eq('id', c.req.param('id'))
      .eq('user_id', c.get('userId'))
      .single();
    if (!clip) return c.json({ error: 'not_found' }, 404);
    const video = clip.source_videos as unknown as { youtube_id: string };
    const start = Math.floor(Number(clip.start_seconds));
    const end = Math.ceil(Number(clip.end_seconds));
    return c.json({
      embed_url: `https://www.youtube.com/embed/${video.youtube_id}?start=${start}&end=${end}&autoplay=1`,
      start_seconds: start,
      end_seconds: end,
    });
  })
  .post('/:id/approve', async (c) => {
    // Débito de crédito + transição atômicos (migração 0002, revisão M1)
    const { data, error } = await supabaseAdmin.rpc('approve_clip', {
      p_clip_id: c.req.param('id'),
      p_user_id: c.get('userId'),
    });
    if (error) return c.json({ error: error.message }, 500);
    if (data === 'not_found') return c.json({ error: 'not_found' }, 404);
    if (data === 'bad_status') return c.json({ error: 'clip_not_in_suggested_state' }, 409);
    if (data === 'no_credits') return c.json({ error: 'no_credits_remaining' }, 402);
    await queues.render.add('render', {
      userId: c.get('userId'),
      clipId: c.req.param('id'),
    } satisfies RenderJob);
    return c.json({ ok: true });
  })
  .post('/:id/reject', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('suggested_clips')
      .update({ status: 'rejected' })
      .eq('id', c.req.param('id'))
      .eq('user_id', c.get('userId'))
      .eq('status', 'suggested')
      .select('id');
    if (error) return c.json({ error: error.message }, 500);
    if (!data || data.length === 0) return c.json({ error: 'not_found_or_bad_status' }, 409);
    return c.json({ ok: true });
  });

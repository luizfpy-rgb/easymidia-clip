import { Hono } from 'hono';
import { z } from 'zod';
import type { TranscribeJob } from '@easymidia/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { queues } from '../lib/queues.js';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return YOUTUBE_ID.test(id) ? id : null;
    }
    if (u.hostname.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && YOUTUBE_ID.test(v)) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed') && parts[1]) {
        return YOUTUBE_ID.test(parts[1]) ? parts[1] : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

const manualBody = z.object({
  youtube_url: z.string().url(),
  // D1: usuário declara ter direitos/permissão sobre o conteúdo
  rights_confirmed: z.literal(true, {
    errorMap: () => ({ message: 'É preciso confirmar que você tem direitos sobre o vídeo.' }),
  }),
});

export const sourceVideos = new Hono<{ Variables: AuthVariables }>()
  .get('/', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('source_videos')
      .select('id, youtube_id, title, channel, duration_seconds, views, status, error_message, created_at')
      .eq('user_id', c.get('userId'))
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ videos: data });
  })
  .post('/manual', async (c) => {
    const parsed = manualBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
    }
    const youtubeId = extractYoutubeId(parsed.data.youtube_url);
    if (!youtubeId) {
      return c.json({ error: 'invalid_youtube_url' }, 400);
    }
    const userId = c.get('userId');

    const { data, error } = await supabaseAdmin
      .from('source_videos')
      .insert({
        user_id: userId,
        youtube_id: youtubeId,
        title: '(carregando metadados…)',
        discovered_by: 'manual',
        rights_confirmed: true,
        status: 'pending',
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return c.json({ error: 'video_already_added' }, 409);
      return c.json({ error: error.message }, 500);
    }

    await queues.transcribe.add('transcribe', {
      userId,
      sourceVideoId: data.id,
    } satisfies TranscribeJob);

    return c.json({ video: data }, 201);
  })
  .post('/:id/analyze', (c) => c.json({ error: 'not_implemented', phase: 3 }, 501))
  .get('/:id/clips', (c) => c.json({ error: 'not_implemented', phase: 3 }, 501));

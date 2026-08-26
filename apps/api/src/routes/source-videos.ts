import { Hono } from 'hono';
import { z } from 'zod';
import type { AnalyzeClipsJob, TranscribeJob } from '@easymidia/shared';
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
    error: 'É preciso confirmar que você tem direitos sobre o vídeo.',
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
  // Vídeo descoberto pela IA entra no pipeline só após confirmação de direitos (D1)
  .post('/:id/ingest', async (c) => {
    const parsed = manualBody.pick({ rights_confirmed: true }).safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) return c.json({ error: 'rights_confirmation_required' }, 400);
    const userId = c.get('userId');
    const id = c.req.param('id');
    const { data: video } = await supabaseAdmin
      .from('source_videos')
      .select('id, status, transcript_url')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (!video) return c.json({ error: 'not_found' }, 404);
    if (video.transcript_url || !['pending', 'failed'].includes(video.status)) {
      return c.json({ error: 'already_ingested' }, 409);
    }
    await supabaseAdmin
      .from('source_videos')
      .update({ rights_confirmed: true, status: 'pending', error_message: null })
      .eq('id', id);
    await queues.transcribe.add('transcribe', {
      userId,
      sourceVideoId: id,
    } satisfies TranscribeJob);
    return c.json({ ok: true });
  })
  .post('/:id/analyze', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const { data: video } = await supabaseAdmin
      .from('source_videos')
      .select('id, status, transcript_url')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (!video) return c.json({ error: 'not_found' }, 404);
    if (!video.transcript_url || !['done', 'failed'].includes(video.status)) {
      return c.json({ error: 'video_not_ready_for_analysis' }, 409);
    }
    await supabaseAdmin
      .from('source_videos')
      .update({ status: 'analyzing', error_message: null })
      .eq('id', id);
    await queues.analyzeClips.add('analyze', {
      userId,
      sourceVideoId: id,
    } satisfies AnalyzeClipsJob);
    return c.json({ ok: true });
  })
  .get('/:id/clips', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('suggested_clips')
      .select('id, start_seconds, end_seconds, hook, score, reason, caption, hashtags, status, created_at')
      .eq('source_video_id', c.req.param('id'))
      .eq('user_id', c.get('userId'))
      .order('score', { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ clips: data });
  });

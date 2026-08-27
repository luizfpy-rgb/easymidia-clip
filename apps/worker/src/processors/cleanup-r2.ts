import type { Job } from 'bullmq';
import { supabaseAdmin } from '../lib/supabase.js';
import { deleteFromR2, keyFromPublicUrl } from '../lib/r2.js';

// Roda 1x/dia (repeatable registrado no index). Duas frentes:
// 1. Shorts PUBLICADOS há +30 dias: mp4+thumb saem do R2, a linha ganha
//    expired_at (a API filtra expirados da bandeja; o post já vive na plataforma).
// 2. Áudio de transcrição (+30 dias): só serve durante o transcribe — o
//    transcript.json/srt (pequenos) ficam, pois o re-render depende deles.
const RETENTION_DAYS = 30;

export async function cleanupR2(_job: Job) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  let shortsExpired = 0;
  let audiosRemoved = 0;

  const { data: shorts, error } = await supabaseAdmin
    .from('rendered_shorts')
    .select('id, video_url, thumbnail_url, suggested_clips!inner(status)')
    .is('expired_at', null)
    .lt('created_at', cutoff)
    .eq('suggested_clips.status', 'published')
    .limit(100);
  if (error) throw new Error(`listar shorts expiráveis: ${error.message}`);

  for (const short of shorts ?? []) {
    const keys = [keyFromPublicUrl(short.video_url), keyFromPublicUrl(short.thumbnail_url)]
      .filter((k): k is string => Boolean(k));
    await deleteFromR2(keys);
    const { error: updateError } = await supabaseAdmin
      .from('rendered_shorts')
      .update({ expired_at: new Date().toISOString() })
      .eq('id', short.id);
    if (updateError) throw new Error(`marcar expired_at: ${updateError.message}`);
    shortsExpired++;
  }

  const { data: videos, error: vError } = await supabaseAdmin
    .from('source_videos')
    .select('id, audio_url')
    .not('audio_url', 'is', null)
    .lt('created_at', cutoff)
    .in('status', ['done', 'failed'])
    .limit(200);
  if (vError) throw new Error(`listar áudios expiráveis: ${vError.message}`);

  for (const video of videos ?? []) {
    const key = keyFromPublicUrl(video.audio_url as string);
    if (key) await deleteFromR2([key]);
    const { error: updateError } = await supabaseAdmin
      .from('source_videos')
      .update({ audio_url: null })
      .eq('id', video.id);
    if (updateError) throw new Error(`limpar audio_url: ${updateError.message}`);
    audiosRemoved++;
  }

  if (shortsExpired || audiosRemoved) {
    console.log(`[cleanup-r2] shorts expirados: ${shortsExpired}, áudios removidos: ${audiosRemoved}`);
  }
  return { shortsExpired, audiosRemoved };
}

import type { Job } from 'bullmq';
import { supabaseAdmin } from '../lib/supabase.js';
import { getBlotatoKey, getPostStatus } from '../lib/blotato.js';
import { notifyFailure } from '../lib/notify.js';

// Repeatable (3 min) — Blotato não tem webhook (revisão C1).
// Consulta slots em 'publishing' e fecha o ciclo published/failed.
export async function pollBlotatoStatus(_job: Job) {
  const { data: slots, error } = await supabaseAdmin
    .from('schedule_slots')
    .select('id, user_id, blotato_post_id, rendered_shorts ( suggested_clip_id )')
    .eq('status', 'publishing')
    .not('blotato_post_id', 'is', null)
    .limit(50);
  if (error) throw new Error(error.message);
  if (!slots || slots.length === 0) return { checked: 0 };

  const keyCache = new Map<string, string>();
  let updated = 0;

  for (const slot of slots) {
    try {
      let apiKey = keyCache.get(slot.user_id);
      if (!apiKey) {
        apiKey = await getBlotatoKey(slot.user_id);
        keyCache.set(slot.user_id, apiKey);
      }
      const status = await getPostStatus(apiKey, slot.blotato_post_id as string);
      const clipId = (slot.rendered_shorts as unknown as { suggested_clip_id: string } | null)
        ?.suggested_clip_id;

      if (status.status === 'published') {
        await supabaseAdmin
          .from('schedule_slots')
          .update({ status: 'published', published_url: status.publicUrl ?? null })
          .eq('id', slot.id);
        if (clipId) {
          await supabaseAdmin
            .from('suggested_clips')
            .update({ status: 'published' })
            .eq('id', clipId)
            .eq('status', 'publishing');
        }
        updated++;
      } else if (status.status === 'failed') {
        const reason = (status.errorMessage ?? 'falha no Blotato').slice(0, 480);
        await supabaseAdmin
          .from('schedule_slots')
          .update({ status: 'failed', error_message: reason })
          .eq('id', slot.id);
        await notifyFailure('post falhou no Blotato', `Slot ${slot.id}\n${reason}`);
        updated++;
      }
      // in-progress / scheduled: mantém e checa de novo no próximo ciclo
    } catch (err) {
      // Falha em um slot (ex.: chave revogada) não pode travar os demais
      console.error(`[poll-blotato] slot ${slot.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { checked: slots.length, updated };
}

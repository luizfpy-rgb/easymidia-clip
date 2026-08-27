import type { Job } from 'bullmq';
import type { PublishJob } from '@easymidia/shared';
import { supabaseAdmin } from '../lib/supabase.js';
import { getBlotatoKey, uploadMedia, createPost } from '../lib/blotato.js';
import { notifyFailure } from '../lib/notify.js';

// 1 slot = 1 conta = 1 request Blotato (revisão C1). O agendamento em si fica com o
// Blotato (scheduledTime); o poll-blotato-status acompanha até published/failed.
export async function publish(job: Job<PublishJob>) {
  const { scheduleSlotId, userId } = job.data;
  try {
    await publishInner(scheduleSlotId, userId);
  } catch (err) {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (finalAttempt) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from('schedule_slots')
        .update({ status: 'failed', error_message: message.slice(0, 480) })
        .eq('id', scheduleSlotId);
      await notifyFailure(
        'publicação falhou de vez',
        `Slot ${scheduleSlotId}\n${message.slice(0, 600)}`
      );
    }
    throw err;
  }
}

async function publishInner(scheduleSlotId: string, userId: string) {
  const { data: slot, error } = await supabaseAdmin
    .from('schedule_slots')
    .select(
      `id, status, approved, scheduled_at, blotato_post_id,
       rendered_shorts ( id, suggested_clip_id, video_url, caption, hashtags ),
       connected_accounts ( id, platform, blotato_account_id, blotato_page_id, active )`
    )
    .eq('id', scheduleSlotId)
    .eq('user_id', userId)
    .single();
  if (error || !slot) throw new Error(`slot ${scheduleSlotId} não encontrado`);
  if (slot.blotato_post_id) return; // job re-entregue após sucesso
  if (!slot.approved) throw new Error('slot não aprovado na bandeja');
  if (slot.status !== 'scheduled') throw new Error(`slot em status inesperado: ${slot.status}`);

  const short = slot.rendered_shorts as unknown as {
    id: string;
    suggested_clip_id: string;
    video_url: string;
    caption: string;
    hashtags: string[];
  };
  const account = slot.connected_accounts as unknown as {
    platform: string;
    blotato_account_id: string;
    blotato_page_id: string | null;
    active: boolean;
  };
  if (!account.active) throw new Error('conta de publicação desativada');

  const apiKey = await getBlotatoKey(userId);

  // Mídia hospedada no Blotato: a URL do R2 não precisa sobreviver até o horário do post
  const hostedUrl = await uploadMedia(apiKey, short.video_url);

  const text = [short.caption, (short.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n');
  const postId = await createPost(apiKey, {
    accountId: account.blotato_account_id,
    platform: account.platform,
    text,
    mediaUrls: [hostedUrl],
    scheduledTime: new Date(slot.scheduled_at as string).toISOString(),
    pageId: account.blotato_page_id,
  });

  await supabaseAdmin
    .from('schedule_slots')
    .update({ status: 'publishing', blotato_post_id: postId, error_message: null })
    .eq('id', scheduleSlotId);

  await supabaseAdmin
    .from('suggested_clips')
    .update({ status: 'publishing' })
    .eq('id', short.suggested_clip_id)
    .in('status', ['rendered', 'scheduled']);

  await supabaseAdmin.from('usage_events').insert({
    user_id: userId,
    event_type: 'publish',
    reference_id: scheduleSlotId,
    cost_usd: 0, // Blotato é BYO — custo do cliente (spec §8.3)
    metadata: { platform: account.platform, blotato_post_id: postId },
  });
}

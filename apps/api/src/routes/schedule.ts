import { Hono } from 'hono';
import { z } from 'zod';
import { DateTime } from 'luxon';
import type { PublishJob } from '@easymidia/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { queues } from '../lib/queues.js';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const prefsBody = z.object({
  posts_per_day: z.coerce.number().int().min(1).max(10),
  active_days: z.array(z.enum(WEEKDAYS)).min(1),
  time_slots: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(10),
  timezone: z.string().default('America/Sao_Paulo'),
});

const DEFAULT_PREFS = {
  posts_per_day: 1,
  active_days: [...WEEKDAYS],
  time_slots: ['09:00', '18:00'],
  timezone: 'America/Sao_Paulo',
};

export const schedule = new Hono<{ Variables: AuthVariables }>()
  .get('/prefs', async (c) => {
    const { data } = await supabaseAdmin
      .from('user_schedule_prefs')
      .select('posts_per_day, active_days, time_slots, timezone')
      .eq('user_id', c.get('userId'))
      .maybeSingle();
    return c.json({ prefs: data ?? DEFAULT_PREFS });
  })
  .put('/prefs', async (c) => {
    const parsed = prefsBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
    if (!DateTime.local().setZone(parsed.data.timezone).isValid) {
      return c.json({ error: 'invalid_timezone' }, 400);
    }
    const { error } = await supabaseAdmin
      .from('user_schedule_prefs')
      .upsert({ user_id: c.get('userId'), ...parsed.data }, { onConflict: 'user_id' });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ prefs: parsed.data });
  })
  .get('/upcoming', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('schedule_slots')
      .select(
        `id, scheduled_at, status, approved, published_url, error_message,
         rendered_shorts ( id, thumbnail_url, caption ),
         connected_accounts ( platform, handle )`
      )
      .eq('user_id', c.get('userId'))
      .gte('scheduled_at', new Date(Date.now() - 86_400_000).toISOString())
      .order('scheduled_at')
      .limit(120);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ slots: data });
  })
  .post('/auto-fill', async (c) => {
    const parsed = z
      .object({
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const userId = c.get('userId');

    const { data: prefsRow } = await supabaseAdmin
      .from('user_schedule_prefs')
      .select('posts_per_day, active_days, time_slots, timezone')
      .eq('user_id', userId)
      .maybeSingle();
    const prefs = prefsRow ?? DEFAULT_PREFS;

    const { data: accountRows } = await supabaseAdmin
      .from('connected_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('active', true);
    if (!accountRows || accountRows.length === 0) {
      return c.json({ error: 'no_active_accounts' }, 409);
    }

    // Shorts renderizados que ainda não têm slot
    const { data: shorts } = await supabaseAdmin
      .from('rendered_shorts')
      .select('id, suggested_clip_id, schedule_slots ( id )')
      .eq('user_id', userId)
      .order('created_at');
    const unscheduled = (shorts ?? []).filter(
      (s) => !s.schedule_slots || (s.schedule_slots as unknown[]).length === 0
    );
    if (unscheduled.length === 0) return c.json({ scheduled: 0 });

    // Gera os horários no timezone do usuário e grava em UTC (revisão M2)
    const zone = prefs.timezone;
    const start = DateTime.fromISO(parsed.data.start_date, { zone });
    const end = DateTime.fromISO(parsed.data.end_date, { zone });
    if (!start.isValid || !end.isValid || end < start) {
      return c.json({ error: 'invalid_date_range' }, 400);
    }
    const now = DateTime.now();
    const slotTimes: DateTime[] = [];
    for (let day = start; day <= end; day = day.plus({ days: 1 })) {
      const weekday = WEEKDAYS[day.weekday - 1];
      if (!prefs.active_days.includes(weekday)) continue;
      const times = [...prefs.time_slots].sort().slice(0, prefs.posts_per_day);
      for (const t of times) {
        const [h, m] = t.split(':').map(Number);
        const at = day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
        if (at > now.plus({ minutes: 10 })) slotTimes.push(at);
      }
    }

    const rows: object[] = [];
    let slotIdx = 0;
    const scheduledShorts: { shortId: string; clipId: string }[] = [];
    for (const short of unscheduled) {
      if (slotIdx >= slotTimes.length) break;
      const at = slotTimes[slotIdx++].toUTC().toISO();
      for (const account of accountRows) {
        rows.push({
          user_id: userId,
          rendered_short_id: short.id,
          connected_account_id: account.id,
          scheduled_at: at,
          status: 'scheduled',
          approved: false,
        });
      }
      scheduledShorts.push({ shortId: short.id, clipId: short.suggested_clip_id });
    }
    if (rows.length === 0) return c.json({ scheduled: 0, reason: 'no_free_slots_in_range' });

    const { error } = await supabaseAdmin.from('schedule_slots').insert(rows);
    if (error) return c.json({ error: error.message }, 500);
    await supabaseAdmin
      .from('suggested_clips')
      .update({ status: 'scheduled' })
      .in('id', scheduledShorts.map((s) => s.clipId))
      .eq('status', 'rendered');

    return c.json({ scheduled: scheduledShorts.length, slots_created: rows.length });
  })
  .post('/slots/:id/approve', async (c) => {
    const userId = c.get('userId');
    const { data, error } = await supabaseAdmin
      .from('schedule_slots')
      .update({ approved: true })
      .eq('id', c.req.param('id'))
      .eq('user_id', userId)
      .eq('status', 'scheduled')
      .select('id');
    if (error) return c.json({ error: error.message }, 500);
    if (!data || data.length === 0) return c.json({ error: 'not_found_or_bad_status' }, 409);
    // Envia já pro Blotato com scheduledTime — quem segura o horário é o Blotato
    await queues.publish.add('publish', {
      userId,
      scheduleSlotId: data[0].id,
    } satisfies PublishJob);
    return c.json({ ok: true });
  })
  // Retry de slot que falhou (na fila ou no próprio Blotato). Reseta o post_id
  // pra forçar novo request; horário no passado é empurrado pra daqui a 5 min.
  .post('/slots/:id/retry', async (c) => {
    const userId = c.get('userId');
    const { data: slot } = await supabaseAdmin
      .from('schedule_slots')
      .select('id, scheduled_at')
      .eq('id', c.req.param('id'))
      .eq('user_id', userId)
      .eq('status', 'failed')
      .single();
    if (!slot) return c.json({ error: 'not_found_or_not_failed' }, 409);
    const at = new Date(slot.scheduled_at as string);
    const minFuture = new Date(Date.now() + 5 * 60_000);
    const { error } = await supabaseAdmin
      .from('schedule_slots')
      .update({
        status: 'scheduled',
        approved: true,
        error_message: null,
        blotato_post_id: null,
        scheduled_at: (at < minFuture ? minFuture : at).toISOString(),
      })
      .eq('id', slot.id);
    if (error) return c.json({ error: error.message }, 500);
    await queues.publish.add('publish', { userId, scheduleSlotId: slot.id } satisfies PublishJob);
    return c.json({ ok: true });
  })
  .post('/slots/:id/reschedule', async (c) => {
    const parsed = z
      .object({ new_date: z.string() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const at = DateTime.fromISO(parsed.data.new_date);
    if (!at.isValid || at < DateTime.now()) return c.json({ error: 'invalid_date' }, 400);
    const { data, error } = await supabaseAdmin
      .from('schedule_slots')
      .update({ scheduled_at: at.toUTC().toISO(), approved: false })
      .eq('id', c.req.param('id'))
      .eq('user_id', c.get('userId'))
      .eq('status', 'scheduled')
      .select('id');
    if (error) return c.json({ error: error.message }, 500);
    if (!data || data.length === 0) {
      return c.json({ error: 'not_found_or_already_publishing' }, 409);
    }
    return c.json({ ok: true });
  })
  .delete('/slots/:id', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('schedule_slots')
      .delete()
      .eq('id', c.req.param('id'))
      .eq('user_id', c.get('userId'))
      .eq('status', 'scheduled')
      .select('id');
    if (error) return c.json({ error: error.message }, 500);
    if (!data || data.length === 0) {
      return c.json({ error: 'not_found_or_already_publishing' }, 409);
    }
    return c.json({ ok: true });
  });

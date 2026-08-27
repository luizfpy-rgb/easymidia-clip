import type { Job } from 'bullmq';
import { supabaseAdmin } from '../lib/supabase.js';
import { getBlotatoKey, fetchAnalytics } from '../lib/blotato.js';

// Repeatable (6h) + on-demand via POST /v1/analytics/refresh. Puxa o
// GET /v2/analytics do Blotato (métricas das 8 plataformas) e grava nos
// slots publicados dos últimos 90 dias, casando pelo published_url.
const WINDOW_DAYS = 90;

function toNumber(v: string | number | undefined): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/^http:/, 'https:');
}

export async function collectMetrics(_job: Job) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const { data: slots, error } = await supabaseAdmin
    .from('schedule_slots')
    .select('id, user_id, published_url')
    .eq('status', 'published')
    .not('published_url', 'is', null)
    .gte('scheduled_at', since)
    .limit(500);
  if (error) throw new Error(`listar slots publicados: ${error.message}`);
  if (!slots || slots.length === 0) return { updated: 0 };

  const byUser = new Map<string, typeof slots>();
  for (const slot of slots) {
    const list = byUser.get(slot.user_id) ?? [];
    list.push(slot);
    byUser.set(slot.user_id, list);
  }

  let updated = 0;
  for (const [userId, userSlots] of byUser) {
    try {
      const apiKey = await getBlotatoKey(userId);
      const items = await fetchAnalytics(apiKey, since);
      const byUrl = new Map<string, Record<string, string | number | undefined>>();
      for (const item of items) {
        if (item.postUrl && item.latestMetrics?.metrics) {
          byUrl.set(normalizeUrl(item.postUrl), item.latestMetrics.metrics);
        }
      }
      for (const slot of userSlots) {
        const metrics = byUrl.get(normalizeUrl(slot.published_url as string));
        if (!metrics) continue;
        const { error: updateError } = await supabaseAdmin
          .from('schedule_slots')
          .update({
            views: toNumber(metrics.viewsCount),
            likes: toNumber(metrics.likesCount),
            comments: toNumber(metrics.commentsCount),
            reach: toNumber(metrics.reachCount),
            metrics_updated_at: new Date().toISOString(),
          })
          .eq('id', slot.id);
        if (updateError) throw new Error(updateError.message);
        updated++;
      }
    } catch (err) {
      // Falha de um usuário (ex.: chave revogada) não trava os demais
      console.error(`[collect-metrics] user ${userId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (updated) console.log(`[collect-metrics] ${updated} slot(s) atualizados`);
  return { updated };
}

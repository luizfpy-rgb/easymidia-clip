import type { Job } from 'bullmq';
import type { DiscoverVideosJob } from '@easymidia/shared';
import { env } from '../env.js';
import { supabaseAdmin } from '../lib/supabase.js';

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const MAX_KEYWORDS_PER_RUN = 3; // search.list = 100 units cada (quota 10k/dia)
const MIN_DURATION = 5 * 60;
const MAX_DURATION = 60 * 60;

function parseIsoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

// Fase 5: search.list por keyword + videos.list em lote pra filtrar por views/duração (revisão M4)
export async function discoverVideos(job: Job<DiscoverVideosJob>) {
  const { nicheId, userId } = job.data;
  if (!env.YOUTUBE_DATA_API_KEY) {
    throw new Error('YOUTUBE_DATA_API_KEY não configurada — etapa 9 do setup');
  }

  const { data: niche, error } = await supabaseAdmin
    .from('niches')
    .select('id, keywords, language, min_views, max_age_days')
    .eq('id', nicheId)
    .single();
  if (error || !niche) throw new Error(`niche ${nicheId} não encontrado`);

  const publishedAfter = new Date(Date.now() - niche.max_age_days * 86_400_000).toISOString();
  const lang = (niche.language ?? 'pt-BR').split('-')[0];
  const ids = new Set<string>();

  for (const keyword of niche.keywords.slice(0, MAX_KEYWORDS_PER_RUN)) {
    const params = new URLSearchParams({
      key: env.YOUTUBE_DATA_API_KEY,
      part: 'id',
      q: keyword,
      type: 'video',
      order: 'viewCount',
      publishedAfter,
      regionCode: 'BR',
      relevanceLanguage: lang,
      maxResults: '25',
    });
    const res = await fetch(`${SEARCH_URL}?${params}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`YouTube search ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { items?: { id?: { videoId?: string } }[] };
    for (const item of data.items ?? []) {
      if (item.id?.videoId) ids.add(item.id.videoId);
    }
  }
  if (ids.size === 0) return { discovered: 0 };

  // videos.list em lote (1 unit por chamada de até 50 ids)
  const idList = [...ids];
  const details: {
    youtube_id: string;
    title: string;
    channel: string | null;
    duration_seconds: number;
    views: number;
    published_at: string | null;
  }[] = [];
  for (let i = 0; i < idList.length; i += 50) {
    const params = new URLSearchParams({
      key: env.YOUTUBE_DATA_API_KEY,
      part: 'snippet,contentDetails,statistics',
      id: idList.slice(i, i + 50).join(','),
    });
    const res = await fetch(`${VIDEOS_URL}?${params}`);
    if (!res.ok) throw new Error(`YouTube videos.list ${res.status}`);
    const data = (await res.json()) as {
      items?: {
        id: string;
        snippet?: { title?: string; channelTitle?: string; publishedAt?: string };
        contentDetails?: { duration?: string };
        statistics?: { viewCount?: string };
      }[];
    };
    for (const item of data.items ?? []) {
      details.push({
        youtube_id: item.id,
        title: item.snippet?.title ?? item.id,
        channel: item.snippet?.channelTitle ?? null,
        duration_seconds: parseIsoDuration(item.contentDetails?.duration ?? ''),
        views: Number(item.statistics?.viewCount ?? 0),
        published_at: item.snippet?.publishedAt ?? null,
      });
    }
  }

  const filtered = details.filter(
    (v) =>
      v.views >= niche.min_views &&
      v.duration_seconds >= MIN_DURATION &&
      v.duration_seconds <= MAX_DURATION
  );
  if (filtered.length === 0) return { discovered: 0 };

  // Descobertos NÃO entram no pipeline automaticamente: transcrição só após o
  // usuário confirmar direitos (D1) via POST /source-videos/:id/ingest.
  const { error: upsertError } = await supabaseAdmin.from('source_videos').upsert(
    filtered.map((v) => ({
      user_id: userId,
      niche_id: nicheId,
      youtube_id: v.youtube_id,
      title: v.title,
      channel: v.channel,
      duration_seconds: v.duration_seconds,
      views: v.views,
      published_at: v.published_at,
      discovered_by: 'ai_discovery',
      rights_confirmed: false,
      status: 'pending',
    })),
    { onConflict: 'user_id,youtube_id', ignoreDuplicates: true }
  );
  if (upsertError) throw new Error(`upsert source_videos: ${upsertError.message}`);

  return { discovered: filtered.length };
}

// Diagnóstico da descoberta: nichos, vídeos descobertos e teste real da busca.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: niches } = await db
  .from('niches')
  .select('id, user_id, name, keywords, language, min_views, max_age_days, last_discovery_at, created_at')
  .order('created_at', { ascending: false });
console.log('--- nichos ---');
for (const n of niches ?? []) {
  const { count } = await db
    .from('source_videos')
    .select('id', { count: 'exact', head: true })
    .eq('niche_id', n.id);
  console.log(
    JSON.stringify({
      name: n.name,
      keywords: n.keywords,
      min_views: n.min_views,
      last_discovery_at: n.last_discovery_at,
      discovered: count,
    })
  );
}

// Testa a busca real com o nicho mais recente
const niche = (niches ?? [])[0];
if (!niche) {
  console.log('nenhum nicho');
  process.exit(0);
}
console.log('--- teste da busca (nicho: ' + niche.name + ') ---');
const publishedAfter = new Date(Date.now() - niche.max_age_days * 86_400_000).toISOString();
const lang = (niche.language ?? 'pt-BR').split('-')[0];
for (const keyword of niche.keywords.slice(0, 3)) {
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
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) {
    console.log(`"${keyword}": HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
    continue;
  }
  const data = await res.json();
  const ids = (data.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
  if (ids.length === 0) {
    console.log(`"${keyword}": search retornou 0 vídeos`);
    continue;
  }
  const vres = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({
      key: env.YOUTUBE_DATA_API_KEY,
      part: 'contentDetails,statistics',
      id: ids.join(','),
    })}`
  );
  const vdata = await vres.json();
  const parse = (iso) => {
    const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) ?? [];
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  };
  const items = vdata.items ?? [];
  const pass = items.filter((v) => {
    const d = parse(v.contentDetails?.duration);
    return Number(v.statistics?.viewCount ?? 0) >= niche.min_views && d >= 300 && d <= 3600;
  });
  const durOk = items.filter((v) => {
    const d = parse(v.contentDetails?.duration);
    return d >= 300 && d <= 3600;
  });
  const maxViews = Math.max(0, ...items.map((v) => Number(v.statistics?.viewCount ?? 0)));
  console.log(
    `"${keyword}": ${ids.length} do search | ${durOk.length} com duração 5-60min | ${pass.length} passam no filtro completo | maior viewCount: ${maxViews}`
  );
}

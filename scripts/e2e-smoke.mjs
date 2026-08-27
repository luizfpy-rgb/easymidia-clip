// Smoke test: autentica o usuário e2e, escolhe um vídeo PT-BR recente via YouTube API
// e dispara o pipeline na API alvo. Uso: node scripts/e2e-smoke.mjs https://api.easymidia.io
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const API = process.argv[2] ?? 'http://localhost:8787';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: session, error: loginError } = await anon.auth.signInWithPassword({
  email: 'e2e@easymidia.dev',
  password: 'E2e!easymidia2026',
});
if (loginError) {
  console.error('login e2e:', loginError.message);
  process.exit(1);
}
const token = session.session.access_token;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const health = await fetch(`${API}/v1/health`).then((r) => r.json());
console.log('health:', JSON.stringify(health));

// Vídeo PT-BR recente, 4-20 min, popular
const publishedAfter = new Date(Date.now() - 30 * 86_400_000).toISOString();
const params = new URLSearchParams({
  key: env.YOUTUBE_DATA_API_KEY,
  part: 'snippet',
  q: 'tecnologia',
  type: 'video',
  videoDuration: 'medium',
  order: 'viewCount',
  regionCode: 'BR',
  relevanceLanguage: 'pt',
  maxResults: '5',
  publishedAfter,
});
const search = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`).then((r) => r.json());
const existing = await fetch(`${API}/v1/source-videos`, { headers }).then((r) => r.json());
const used = new Set((existing.videos ?? []).map((v) => v.youtube_id));
const candidate = (search.items ?? []).find((i) => i.id?.videoId && !used.has(i.id.videoId));
if (!candidate) {
  console.error('nenhum vídeo novo encontrado');
  process.exit(1);
}
console.log('vídeo:', candidate.id.videoId, '|', candidate.snippet.title, '|', candidate.snippet.channelTitle);

const res = await fetch(`${API}/v1/source-videos/manual`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    youtube_url: `https://www.youtube.com/watch?v=${candidate.id.videoId}`,
    rights_confirmed: true,
  }),
});
const body = await res.json();
if (!res.ok) {
  console.error('manual:', res.status, JSON.stringify(body));
  process.exit(1);
}
console.log('pipeline disparado:', body.video.id, 'status:', body.video.status);

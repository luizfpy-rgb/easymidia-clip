'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/api';

interface Post {
  id: string;
  scheduled_at: string;
  published_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  reach: number | null;
  metrics_updated_at: string | null;
  rendered_shorts: { caption: string; thumbnail_url: string } | null;
  connected_accounts: { platform: string; handle: string } | null;
}

interface Totals {
  posts: number;
  views: number;
  likes: number;
  comments: number;
  reach: number;
}

const PLATFORM_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  twitter: 'X/Twitter',
  threads: 'Threads',
  bluesky: 'Bluesky',
  pinterest: 'Pinterest',
};

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Intl.NumberFormat('pt-BR').format(Number(n));

export default function Analytics() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [byPlatform, setByPlatform] = useState<Record<string, Totals>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await apiFetch('/v1/analytics');
    setPosts(res.posts);
    setTotals(res.totals);
    setByPlatform(res.by_platform);
  }, []);

  useEffect(() => {
    refresh().catch(() => setMessage('Não foi possível carregar as métricas.'));
  }, [refresh]);

  async function collectNow() {
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch('/v1/analytics/refresh', { method: 'POST' });
      setMessage('Coleta enfileirada — os números atualizam em ~1 minuto.');
      setTimeout(() => refresh().catch(() => {}), 45_000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado');
    }
    setBusy(false);
  }

  const lastUpdate = posts
    .map((p) => p.metrics_updated_at)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <AppShell>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <h1 className="text-xl font-bold">Métricas</h1>
        <button
          onClick={collectNow}
          disabled={busy}
          className="text-sm px-4 py-2 rounded-md border border-edge hover:border-violet-500 disabled:opacity-40 font-semibold"
        >
          Atualizar métricas
        </button>
      </div>
      <p className="text-sm text-mist/60 mb-8">
        Coletadas do Blotato a cada 6 horas.
        {lastUpdate && ` Última coleta: ${new Date(lastUpdate).toLocaleString('pt-BR')}.`}
      </p>

      {message && <p className="text-sm text-amber-400 mb-6">{message}</p>}

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          {(
            [
              ['Posts', totals.posts],
              ['Views', totals.views],
              ['Likes', totals.likes],
              ['Comentários', totals.comments],
              ['Alcance', totals.reach],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-edge bg-ink-2/60 p-5">
              <p className="text-xs text-mist/60 uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{fmt(value)}</p>
            </div>
          ))}
        </div>
      )}

      {Object.keys(byPlatform).length > 0 && (
        <div className="mb-10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-mist/60 uppercase tracking-wide">
                <th className="py-2 pr-4">Rede</th>
                <th className="py-2 pr-4 text-right">Posts</th>
                <th className="py-2 pr-4 text-right">Views</th>
                <th className="py-2 pr-4 text-right">Likes</th>
                <th className="py-2 pr-4 text-right">Comentários</th>
                <th className="py-2 text-right">Alcance</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byPlatform).map(([platform, t]) => (
                <tr key={platform} className="border-t border-edge/60">
                  <td className="py-2.5 pr-4 font-medium">{PLATFORM_LABEL[platform] ?? platform}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmt(t.posts)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmt(t.views)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmt(t.likes)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmt(t.comments)}</td>
                  <td className="py-2.5 text-right tabular-nums">{fmt(t.reach)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-lg font-bold mb-4">Por post</h2>
      {posts.length === 0 ? (
        <div className="border border-dashed border-edge rounded-lg p-10 text-center text-mist/60 text-sm">
          Nenhum post publicado ainda — as métricas aparecem aqui depois da primeira publicação.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-4 border border-edge/60 bg-ink-2/60 rounded-lg px-5 py-3"
            >
              {p.rendered_shorts && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={p.rendered_shorts.thumbnail_url} alt="" className="w-10 rounded shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{p.rendered_shorts?.caption ?? '—'}</p>
                <p className="text-xs text-mist/60">
                  {PLATFORM_LABEL[p.connected_accounts?.platform ?? ''] ??
                    p.connected_accounts?.platform}{' '}
                  {p.connected_accounts?.handle} ·{' '}
                  {new Date(p.scheduled_at).toLocaleDateString('pt-BR')}
                  {p.published_url && (
                    <>
                      {' · '}
                      <a
                        href={p.published_url}
                        target="_blank"
                        className="text-violet-400 hover:underline"
                      >
                        ver post ↗
                      </a>
                    </>
                  )}
                </p>
              </div>
              <div className="flex gap-5 text-right shrink-0 tabular-nums text-sm">
                <div>
                  <p className="text-xs text-mist/60">Views</p>
                  <p>{fmt(p.views)}</p>
                </div>
                <div>
                  <p className="text-xs text-mist/60">Likes</p>
                  <p>{fmt(p.likes)}</p>
                </div>
                <div>
                  <p className="text-xs text-mist/60">Coment.</p>
                  <p>{fmt(p.comments)}</p>
                </div>
                <div>
                  <p className="text-xs text-mist/60">Alcance</p>
                  <p>{fmt(p.reach)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

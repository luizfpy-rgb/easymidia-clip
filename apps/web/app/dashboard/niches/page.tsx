'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/api';

interface Niche {
  id: string;
  name: string;
  keywords: string[];
  min_views: number;
  last_discovery_at: string | null;
}

interface DiscoveredVideo {
  id: string;
  youtube_id: string;
  title: string;
  channel: string | null;
  duration_seconds: number | null;
  views: number | null;
  status: string;
  rights_confirmed: boolean;
}

export default function Niches() {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<DiscoveredVideo[]>([]);
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [minViews, setMinViews] = useState('100000');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadNiches = useCallback(async () => {
    const { niches } = await apiFetch('/v1/niches');
    setNiches(niches);
  }, []);

  const loadResults = useCallback(async (nicheId: string) => {
    const { videos } = await apiFetch(`/v1/discovery/results/${nicheId}`);
    setResults(videos);
  }, []);

  useEffect(() => {
    loadNiches().catch(() => {});
  }, [loadNiches]);

  useEffect(() => {
    if (selected) loadResults(selected).catch(() => {});
    else setResults([]);
  }, [selected, loadResults]);

  async function createNiche(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch('/v1/niches', {
        method: 'POST',
        body: JSON.stringify({
          name,
          keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
          min_views: Number(minViews),
        }),
      });
      setName('');
      setKeywords('');
      await loadNiches();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado');
    }
    setBusy(false);
  }

  async function search(nicheId: string) {
    setMessage(null);
    try {
      const res = await apiFetch('/v1/discovery/search', {
        method: 'POST',
        body: JSON.stringify({ niche_id: nicheId }),
      });
      setSelected(nicheId);
      if (res.cached) {
        setMessage(
          res.last_count === 0
            ? `A última busca não encontrou nenhum vídeo com esses filtros — tente outras palavras-chave ou reduza as views mínimas. Nova tentativa em ~${res.next_search_in_hours}h.`
            : `Busca recente (${res.last_count} vídeo(s)) — nova busca liberada em ~${res.next_search_in_hours}h. Mostrando resultados existentes.`
        );
      } else {
        setMessage('Busca iniciada — os resultados aparecem aqui em ~1 minuto.');
        setTimeout(() => loadResults(nicheId).catch(() => {}), 20_000);
        setTimeout(() => loadResults(nicheId).catch(() => {}), 45_000);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado');
    }
  }

  async function ingest(videoId: string) {
    if (
      !confirm(
        'Você declara ter os direitos ou a permissão necessária para usar este conteúdo, e assume a responsabilidade pela publicação?'
      )
    ) {
      return;
    }
    try {
      await apiFetch(`/v1/source-videos/${videoId}/ingest`, {
        method: 'POST',
        body: JSON.stringify({ rights_confirmed: true }),
      });
      if (selected) await loadResults(selected);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado');
    }
  }

  return (
    <AppShell>
      <h1 className="text-xl font-bold mb-4">Descoberta por nicho</h1>

      <form onSubmit={createNiche} className="flex flex-col gap-3 max-w-2xl mb-10">
        <div className="flex gap-3 flex-wrap">
          <input
            required
            placeholder="Nome do nicho (ex.: IA e Automação Tech)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-56 px-4 py-3 rounded-md bg-zinc-900 border border-zinc-800 focus:border-violet-500 outline-none"
          />
          <input
            required
            placeholder="Palavras-chave separadas por vírgula"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="flex-1 min-w-56 px-4 py-3 rounded-md bg-zinc-900 border border-zinc-800 focus:border-violet-500 outline-none"
          />
          <input
            type="number"
            min={1000}
            value={minViews}
            onChange={(e) => setMinViews(e.target.value)}
            title="Views mínimas"
            className="w-32 px-4 py-3 rounded-md bg-zinc-900 border border-zinc-800 focus:border-violet-500 outline-none tabular-nums"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-6 py-3 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-semibold"
          >
            Criar nicho
          </button>
        </div>
      </form>

      {message && <p className="text-sm text-amber-400 mb-4">{message}</p>}

      <div className="flex gap-2 flex-wrap mb-8">
        {niches.map((n) => (
          <div key={n.id} className="flex items-center gap-1">
            <button
              onClick={() => setSelected(selected === n.id ? null : n.id)}
              className={`px-4 py-2 rounded-md text-sm border ${
                selected === n.id
                  ? 'border-violet-500 text-violet-300 bg-violet-950/40'
                  : 'border-zinc-800 text-zinc-300 hover:border-zinc-600'
              }`}
            >
              {n.name}
            </button>
            <button
              onClick={() => search(n.id)}
              title="Buscar vídeos virais deste nicho"
              className="px-3 py-2 rounded-md text-sm bg-violet-600 hover:bg-violet-500 font-semibold"
            >
              Buscar
            </button>
          </div>
        ))}
        {niches.length === 0 && (
          <p className="text-sm text-zinc-500">Nenhum nicho ainda — crie o primeiro acima.</p>
        )}
      </div>

      {selected && (
        <section>
          <h2 className="text-lg font-bold mb-4">Vídeos descobertos</h2>
          {results.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Nada ainda. Clique em Buscar e aguarde ~1 minuto.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {results.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center gap-4 border border-zinc-900 bg-zinc-900/40 rounded-lg px-5 py-4"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.ytimg.com/vi/${v.youtube_id}/mqdefault.jpg`}
                    alt=""
                    className="w-28 rounded-md shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{v.title}</p>
                    <p className="text-sm text-zinc-500 truncate">
                      {v.channel ?? '—'}
                      {v.views ? ` · ${Intl.NumberFormat('pt-BR').format(v.views)} views` : ''}
                      {v.duration_seconds ? ` · ${Math.round(v.duration_seconds / 60)} min` : ''}
                    </p>
                  </div>
                  {v.rights_confirmed ? (
                    <span className="text-xs text-zinc-500 shrink-0">No pipeline</span>
                  ) : (
                    <button
                      onClick={() => ingest(v.id)}
                      className="text-sm px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 font-semibold shrink-0"
                    >
                      Analisar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </AppShell>
  );
}

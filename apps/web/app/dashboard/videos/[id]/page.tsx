'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';

interface Clip {
  id: string;
  start_seconds: number;
  end_seconds: number;
  hook: string;
  score: number;
  reason: string | null;
  caption: string | null;
  hashtags: string[] | null;
  status: string;
}

const CLIP_STATUS: Record<string, { text: string; cls: string }> = {
  suggested: { text: 'Aguardando decisão', cls: 'bg-zinc-800 text-zinc-300' },
  approved: { text: 'Aprovado', cls: 'bg-emerald-950 text-emerald-300' },
  rejected: { text: 'Rejeitado', cls: 'bg-zinc-900 text-zinc-500' },
  rendering: { text: 'Renderizando', cls: 'bg-violet-950 text-violet-300' },
  rendered: { text: 'Renderizado', cls: 'bg-emerald-950 text-emerald-300' },
  scheduled: { text: 'Agendado', cls: 'bg-sky-950 text-sky-300' },
  publishing: { text: 'Publicando', cls: 'bg-sky-950 text-sky-300' },
  published: { text: 'Publicado', cls: 'bg-emerald-950 text-emerald-300' },
  failed: { text: 'Falhou', cls: 'bg-red-950 text-red-300' },
};

function fmtClock(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function VideoClips() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [ready, setReady] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewClip, setPreviewClip] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyClip, setBusyClip] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { clips } = await apiFetch(`/v1/source-videos/${id}/clips`);
    setClips(clips);
  }, [id]);

  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
      else setReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (ready) refresh().catch(() => setMessage('Não foi possível carregar os trechos.'));
  }, [ready, refresh]);

  async function decide(clipId: string, action: 'approve' | 'reject') {
    setBusyClip(clipId);
    setMessage(null);
    try {
      await apiFetch(`/v1/clips/${clipId}/${action}`, { method: 'POST' });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      setMessage(
        msg === 'no_credits_remaining'
          ? 'Seus créditos acabaram — faça upgrade para aprovar mais shorts.'
          : msg
      );
    }
    setBusyClip(null);
  }

  async function preview(clipId: string) {
    if (previewClip === clipId) {
      setPreviewClip(null);
      setPreviewUrl(null);
      return;
    }
    const { embed_url } = await apiFetch(`/v1/clips/${clipId}/preview`);
    setPreviewClip(clipId);
    setPreviewUrl(embed_url);
  }

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-8 py-10 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Voltar ao dashboard
        </Link>
      </header>

      <h1 className="text-xl font-bold mb-2">Trechos sugeridos</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Aprovar desconta 1 crédito e envia o trecho pra renderização. O preview usa o vídeo
        original do YouTube — custo zero.
      </p>
      {message && <p className="text-sm text-red-400 mb-4">{message}</p>}

      {clips.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-lg p-10 text-center text-zinc-500 text-sm">
          Nenhum trecho ainda. Se o vídeo acabou de ser adicionado, a análise pode estar em
          andamento — volte em alguns minutos.
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {clips.map((clip) => {
            const badge = CLIP_STATUS[clip.status] ?? { text: clip.status, cls: 'bg-zinc-800 text-zinc-300' };
            return (
              <li key={clip.id} className="border border-zinc-900 bg-zinc-900/40 rounded-lg p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-lg font-bold text-violet-400 tabular-nums">
                        {Math.round(clip.score)}
                      </span>
                      <span className="text-xs text-zinc-500 tabular-nums">
                        {fmtClock(clip.start_seconds)} – {fmtClock(clip.end_seconds)} (
                        {Math.round(clip.end_seconds - clip.start_seconds)}s)
                      </span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </div>
                    <p className="font-medium">{clip.hook}</p>
                    {clip.reason && <p className="text-sm text-zinc-400 mt-1">{clip.reason}</p>}
                    {clip.caption && (
                      <p className="text-sm text-zinc-500 mt-2">
                        {clip.caption}{' '}
                        {clip.hashtags && (
                          <span className="text-violet-400">{clip.hashtags.join(' ')}</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => preview(clip.id)}
                    className="px-4 py-2 text-sm rounded-md border border-zinc-800 hover:border-zinc-600"
                  >
                    {previewClip === clip.id ? 'Fechar preview' : 'Preview'}
                  </button>
                  {clip.status === 'suggested' && (
                    <>
                      <button
                        onClick={() => decide(clip.id, 'approve')}
                        disabled={busyClip === clip.id}
                        className="px-4 py-2 text-sm rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-semibold"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => decide(clip.id, 'reject')}
                        disabled={busyClip === clip.id}
                        className="px-4 py-2 text-sm rounded-md border border-zinc-800 hover:border-red-900 hover:text-red-300"
                      >
                        Rejeitar
                      </button>
                    </>
                  )}
                </div>

                {previewClip === clip.id && previewUrl && (
                  <div className="mt-4 aspect-video max-w-xl">
                    <iframe
                      src={previewUrl}
                      className="w-full h-full rounded-md border border-zinc-800"
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';

interface SourceVideo {
  id: string;
  youtube_id: string;
  title: string;
  channel: string | null;
  duration_seconds: number | null;
  views: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: 'Na fila', cls: 'bg-zinc-800 text-zinc-300' },
  downloading: { text: 'Baixando áudio', cls: 'bg-sky-950 text-sky-300' },
  transcribing: { text: 'Transcrevendo', cls: 'bg-violet-950 text-violet-300' },
  analyzing: { text: 'Analisando trechos', cls: 'bg-violet-950 text-violet-300' },
  done: { text: 'Pronto', cls: 'bg-emerald-950 text-emerald-300' },
  failed: { text: 'Falhou', cls: 'bg-red-950 text-red-300' },
};

const ACTIVE_STATUSES = new Set(['pending', 'downloading', 'transcribing', 'analyzing']);

function fmtDuration(s: number | null) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

export default function Dashboard() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [videos, setVideos] = useState<SourceVideo[]>([]);
  const [url, setUrl] = useState('');
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { videos } = await apiFetch('/v1/source-videos');
      setVideos(videos);
    } catch {
      // API fora do ar: mantém a última lista
    }
  }, []);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
      else setEmail(data.user.email ?? null);
    });
  }, [router]);

  useEffect(() => {
    if (!email) return;
    refresh();
    const id = setInterval(() => {
      setVideos((current) => {
        if (current.some((v) => ACTIVE_STATUSES.has(v.status))) refresh();
        return current;
      });
    }, 5000);
    return () => clearInterval(id);
  }, [email, refresh]);

  async function addVideo(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch('/v1/source-videos/manual', {
        method: 'POST',
        body: JSON.stringify({ youtube_url: url, rights_confirmed: rights }),
      });
      setUrl('');
      setRights(false);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      setMessage(
        msg === 'video_already_added'
          ? 'Esse vídeo já foi adicionado.'
          : msg === 'invalid_youtube_url'
            ? 'Link do YouTube inválido.'
            : msg
      );
    }
    setBusy(false);
  }

  if (!email) return null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-8 py-10 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-10">
        <span className="font-bold text-lg tracking-tight">
          easymidia <span className="text-violet-400">clip</span>
        </span>
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <Link href="/dashboard/shorts" className="hover:text-zinc-200">
            Bandeja de produção
          </Link>
          <span>{email}</span>
          <button
            onClick={async () => {
              await supabaseBrowser().auth.signOut();
              router.replace('/');
            }}
            className="px-3 py-1.5 rounded-md border border-zinc-800 hover:border-zinc-600"
          >
            Sair
          </button>
        </div>
      </header>

      <section className="mb-10">
        <h1 className="text-xl font-bold mb-4">Adicionar vídeo do YouTube</h1>
        <form onSubmit={addVideo} className="flex flex-col gap-3 max-w-2xl">
          <div className="flex gap-3">
            <input
              type="url"
              required
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 px-4 py-3 rounded-md bg-zinc-900 border border-zinc-800 focus:border-violet-500 outline-none"
            />
            <button
              type="submit"
              disabled={busy || !rights}
              className="px-6 py-3 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-semibold transition-colors"
            >
              {busy ? 'Enviando…' : 'Adicionar'}
            </button>
          </div>
          <label className="flex items-start gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
              className="mt-1 accent-violet-500"
            />
            Declaro que tenho os direitos ou a permissão necessária para usar este conteúdo, e
            que sou responsável pela sua publicação.
          </label>
          {message && <p className="text-sm text-red-400">{message}</p>}
        </form>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-4">Vídeos fonte</h2>
        {videos.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg p-10 text-center text-zinc-500 text-sm">
            Nenhum vídeo ainda — adicione um link acima para começar.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {videos.map((v) => {
              const badge = STATUS_LABEL[v.status] ?? { text: v.status, cls: 'bg-zinc-800 text-zinc-300' };
              return (
                <li
                  key={v.id}
                  className="flex items-center gap-4 border border-zinc-900 bg-zinc-900/40 rounded-lg px-5 py-4"
                >
                  <img
                    src={`https://i.ytimg.com/vi/${v.youtube_id}/mqdefault.jpg`}
                    alt=""
                    className="w-28 rounded-md shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{v.title}</p>
                    <p className="text-sm text-zinc-500 truncate">
                      {v.channel ?? '—'} · {fmtDuration(v.duration_seconds)}
                      {v.views ? ` · ${Intl.NumberFormat('pt-BR').format(v.views)} views` : ''}
                    </p>
                    {v.status === 'failed' && v.error_message && (
                      <p className="text-xs text-red-400 truncate mt-1">{v.error_message}</p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 ${badge.cls}`}>
                    {badge.text}
                  </span>
                  {v.status === 'done' && (
                    <Link
                      href={`/dashboard/videos/${v.id}`}
                      className="text-sm px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 font-semibold shrink-0"
                    >
                      Ver trechos
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

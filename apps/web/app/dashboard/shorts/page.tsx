'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';

interface Short {
  id: string;
  suggested_clip_id: string;
  video_url: string;
  thumbnail_url: string;
  caption: string;
  hashtags: string[];
  duration_seconds: number | null;
  size_bytes: number | null;
  created_at: string;
}

export default function Shorts() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [shorts, setShorts] = useState<Short[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { shorts } = await apiFetch('/v1/shorts');
    setShorts(shorts);
  }, []);

  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
      else setReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (ready) refresh().catch(() => {});
  }, [ready, refresh]);

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-8 py-10 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Voltar ao dashboard
        </Link>
      </header>

      <h1 className="text-xl font-bold mb-2">Bandeja de produção</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Shorts renderizados, prontos pra agendar. O agendamento e a publicação entram na Fase 6.
      </p>

      {shorts.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-lg p-10 text-center text-zinc-500 text-sm">
          Nenhum short renderizado ainda — aprove um trecho pra começar.
        </div>
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-3 gap-5">
          {shorts.map((s) => (
            <li key={s.id} className="border border-zinc-900 bg-zinc-900/40 rounded-lg overflow-hidden">
              <div className="aspect-[9/16] bg-black">
                {playing === s.id ? (
                  <video src={s.video_url} controls autoPlay className="w-full h-full" />
                ) : (
                  <button onClick={() => setPlaying(s.id)} className="relative w-full h-full group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center text-4xl opacity-80 group-hover:opacity-100">
                      ▶
                    </span>
                  </button>
                )}
              </div>
              <div className="p-3">
                <p className="text-sm truncate">{s.caption}</p>
                <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                  {s.duration_seconds ? `${Math.round(s.duration_seconds)}s` : ''}
                  {s.size_bytes ? ` · ${(s.size_bytes / 1e6).toFixed(1)} MB` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

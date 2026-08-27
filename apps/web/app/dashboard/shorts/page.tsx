'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
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
  const [shorts, setShorts] = useState<Short[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { shorts } = await apiFetch('/v1/shorts');
    setShorts(shorts);
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  return (
    <AppShell>
      <h1 className="text-xl font-bold mb-2">Bandeja de produção</h1>
      <p className="text-sm text-mist/60 mb-8">
        Shorts renderizados, prontos pra publicar — distribua no{' '}
        <Link href="/dashboard/schedule" className="text-violet-400 hover:underline">
          Cronograma
        </Link>{' '}
        e aprove cada post.
      </p>

      {shorts.length === 0 ? (
        <div className="border border-dashed border-edge rounded-lg p-10 text-center text-mist/60 text-sm">
          Nenhum short renderizado ainda — aprove um trecho pra começar.
        </div>
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-3 gap-5">
          {shorts.map((s) => (
            <li key={s.id} className="border border-edge/60 bg-ink-2/60 rounded-lg overflow-hidden">
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
                <p className="text-xs text-mist/60 mt-1 tabular-nums">
                  {s.duration_seconds ? `${Math.round(s.duration_seconds)}s` : ''}
                  {s.size_bytes ? ` · ${(s.size_bytes / 1e6).toFixed(1)} MB` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

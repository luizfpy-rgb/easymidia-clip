'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  schedule_slots: { id: string; status: string }[] | null;
}

// Badge agregado dos slots do short (published > publishing > scheduled > failed)
function slotBadge(short: Short): { text: string; cls: string } | null {
  const statuses = (short.schedule_slots ?? []).map((s) => s.status);
  if (statuses.includes('published'))
    return { text: 'Publicado', cls: 'bg-emerald-950 text-emerald-300' };
  if (statuses.includes('publishing'))
    return { text: 'Publicando', cls: 'bg-sky-950 text-sky-300' };
  if (statuses.includes('scheduled'))
    return { text: 'Agendado', cls: 'bg-sky-950 text-sky-300' };
  if (statuses.includes('failed'))
    return { text: 'Falhou', cls: 'bg-red-950 text-red-300' };
  return null;
}

function hasActiveSlot(short: Short): boolean {
  return (short.schedule_slots ?? []).some((s) => s.status !== 'failed');
}

export default function Shorts() {
  const [shorts, setShorts] = useState<Short[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { shorts } = await apiFetch('/v1/shorts');
    setShorts(shorts);
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const selectable = useMemo(() => shorts.filter((s) => !hasActiveSlot(s)), [shorts]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkPublish(mode: 'now' | 'schedule') {
    if (selected.size === 0) return;
    if (
      mode === 'now' &&
      !confirm(`Publicar ${selected.size} short(s) AGORA em todas as contas conectadas?`)
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch('/v1/schedule/bulk-publish', {
        method: 'POST',
        body: JSON.stringify({ short_ids: [...selected], mode }),
      });
      const skipped = res.skipped > 0 ? ` (${res.skipped} pulado(s) — já tinham agendamento)` : '';
      setMessage(
        mode === 'now'
          ? `${res.scheduled} short(s) enviados pra publicação imediata em ${res.slots_created} conta(s)${skipped}.`
          : `${res.scheduled} short(s) distribuídos nos próximos horários — aprove cada post no Cronograma${skipped}.`
      );
      setSelected(new Set());
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      setMessage(
        msg === 'no_active_accounts'
          ? 'Conecte pelo menos uma conta em Contas antes de publicar.'
          : msg === 'no_free_slots_in_60_days'
            ? 'Sem horários livres nos próximos 60 dias — ajuste suas preferências no Cronograma.'
            : msg
      );
    }
    setBusy(false);
  }

  return (
    <AppShell>
      <h1 className="text-xl font-bold mb-2">Bandeja de produção</h1>
      <p className="text-sm text-mist/60 mb-6">
        Selecione shorts pra publicar agora ou distribuir no{' '}
        <Link href="/dashboard/schedule" className="text-violet-400 hover:underline">
          Cronograma
        </Link>
        .
      </p>

      {shorts.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mb-6 border border-edge/60 bg-ink-2/60 rounded-lg px-4 py-3">
          <span className="text-sm text-mist tabular-nums">
            {selected.size} selecionado(s)
          </span>
          <button
            onClick={() =>
              setSelected(
                selected.size === selectable.length
                  ? new Set()
                  : new Set(selectable.map((s) => s.id))
              )
            }
            className="text-sm px-3 py-1.5 rounded-md border border-edge hover:border-mist/50"
          >
            {selected.size === selectable.length && selectable.length > 0
              ? 'Limpar seleção'
              : 'Selecionar todos'}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => bulkPublish('now')}
            disabled={busy || selected.size === 0}
            className="text-sm px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-semibold"
          >
            Publicar agora
          </button>
          <button
            onClick={() => bulkPublish('schedule')}
            disabled={busy || selected.size === 0}
            className="text-sm px-4 py-2 rounded-md border border-edge hover:border-violet-500 disabled:opacity-40 font-semibold"
          >
            Enviar pro Cronograma
          </button>
        </div>
      )}

      {message && <p className="text-sm text-amber-400 mb-4">{message}</p>}

      {shorts.length === 0 ? (
        <div className="border border-dashed border-edge rounded-lg p-10 text-center text-mist/60 text-sm">
          Nenhum short renderizado ainda — aprove um trecho pra começar.
        </div>
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-3 gap-5">
          {shorts.map((s) => {
            const badge = slotBadge(s);
            const scheduled = hasActiveSlot(s);
            return (
              <li
                key={s.id}
                className={`border rounded-lg overflow-hidden bg-ink-2/60 ${
                  selected.has(s.id) ? 'border-violet-500' : 'border-edge/60'
                }`}
              >
                <div className="aspect-[9/16] bg-black relative">
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
                  {!scheduled && (
                    <label className="absolute top-2 left-2 z-10 flex items-center justify-center w-8 h-8 rounded-md bg-ink/80 border border-edge cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="w-4 h-4 accent-violet-500"
                      />
                    </label>
                  )}
                  {badge && (
                    <span
                      className={`absolute top-2 right-2 z-10 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}
                    >
                      {badge.text}
                    </span>
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
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/api';

interface Prefs {
  posts_per_day: number;
  active_days: string[];
  time_slots: string[];
  timezone: string;
}

interface Slot {
  id: string;
  scheduled_at: string;
  status: string;
  approved: boolean;
  published_url: string | null;
  error_message: string | null;
  rendered_shorts: { thumbnail_url: string; caption: string } | null;
  connected_accounts: { platform: string; handle: string } | null;
}

const DAY_LABEL: Record<string, string> = {
  mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
};

const SLOT_STATUS: Record<string, { text: string; cls: string }> = {
  scheduled: { text: 'Agendado', cls: 'bg-zinc-800 text-zinc-300' },
  publishing: { text: 'No Blotato', cls: 'bg-sky-950 text-sky-300' },
  published: { text: 'Publicado', cls: 'bg-emerald-950 text-emerald-300' },
  failed: { text: 'Falhou', cls: 'bg-red-950 text-red-300' },
};

export default function Schedule() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [timeSlotsText, setTimeSlotsText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [{ prefs }, { slots }] = await Promise.all([
      apiFetch('/v1/schedule/prefs'),
      apiFetch('/v1/schedule/upcoming'),
    ]);
    setPrefs(prefs);
    setTimeSlotsText(prefs.time_slots.join(', '));
    setSlots(slots);
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  async function savePrefs(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch('/v1/schedule/prefs', {
        method: 'PUT',
        body: JSON.stringify({
          ...prefs,
          time_slots: timeSlotsText.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      setMessage('Preferências salvas.');
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado');
    }
    setBusy(false);
  }

  async function autoFill(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch('/v1/schedule/auto-fill', {
        method: 'POST',
        body: JSON.stringify({ start_date: startDate, end_date: endDate }),
      });
      setMessage(
        res.scheduled > 0
          ? `${res.scheduled} short(s) distribuído(s) em ${res.slots_created} slot(s). Aprove cada um abaixo.`
          : 'Nenhum short sem agendamento — renderize e tente de novo.'
      );
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      setMessage(msg === 'no_active_accounts' ? 'Conecte pelo menos uma conta em Contas antes.' : msg);
    }
    setBusy(false);
  }

  async function act(slotId: string, action: 'approve' | 'delete') {
    setBusy(true);
    try {
      if (action === 'approve') {
        await apiFetch(`/v1/schedule/slots/${slotId}/approve`, { method: 'POST' });
      } else {
        await apiFetch(`/v1/schedule/slots/${slotId}`, { method: 'DELETE' });
      }
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado');
    }
    setBusy(false);
  }

  return (
    <AppShell>
      <h1 className="text-xl font-bold mb-6">Cronograma</h1>

      {prefs && (
        <form onSubmit={savePrefs} className="mb-10 max-w-2xl flex flex-col gap-4">
          <div className="flex gap-4 flex-wrap items-end">
            <label className="text-sm text-zinc-400">
              Posts por dia
              <input
                type="number"
                min={1}
                max={10}
                value={prefs.posts_per_day}
                onChange={(e) => setPrefs({ ...prefs, posts_per_day: Number(e.target.value) })}
                className="block mt-1 w-24 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 outline-none tabular-nums"
              />
            </label>
            <label className="text-sm text-zinc-400 flex-1 min-w-56">
              Horários (HH:MM, separados por vírgula)
              <input
                value={timeSlotsText}
                onChange={(e) => setTimeSlotsText(e.target.value)}
                className="block mt-1 w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 rounded-md border border-zinc-700 hover:border-zinc-500 disabled:opacity-40 text-sm font-semibold"
            >
              Salvar
            </button>
          </div>
          <div className="flex gap-2">
            {Object.entries(DAY_LABEL).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setPrefs({
                    ...prefs,
                    active_days: prefs.active_days.includes(key)
                      ? prefs.active_days.filter((d) => d !== key)
                      : [...prefs.active_days, key],
                  })
                }
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  prefs.active_days.includes(key)
                    ? 'border-violet-500 text-violet-300 bg-violet-950/40'
                    : 'border-zinc-800 text-zinc-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </form>
      )}

      <form onSubmit={autoFill} className="mb-10 flex gap-3 items-end flex-wrap">
        <label className="text-sm text-zinc-400">
          De
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="block mt-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 outline-none"
          />
        </label>
        <label className="text-sm text-zinc-400">
          Até
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="block mt-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="px-6 py-2.5 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-semibold text-sm"
        >
          Distribuir shorts prontos
        </button>
      </form>

      {message && <p className="text-sm text-amber-400 mb-6">{message}</p>}

      <h2 className="text-lg font-bold mb-4">Próximos posts</h2>
      {slots.length === 0 ? (
        <p className="text-sm text-zinc-500">Nada agendado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {slots.map((s) => {
            const badge = SLOT_STATUS[s.status] ?? { text: s.status, cls: 'bg-zinc-800 text-zinc-300' };
            return (
              <li
                key={s.id}
                className="flex items-center gap-4 border border-zinc-900 bg-zinc-900/40 rounded-lg px-5 py-3"
              >
                {s.rendered_shorts && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={s.rendered_shorts.thumbnail_url} alt="" className="w-10 rounded shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{s.rendered_shorts?.caption ?? '—'}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(s.scheduled_at).toLocaleString('pt-BR')} ·{' '}
                    <span className="capitalize">{s.connected_accounts?.platform}</span>{' '}
                    {s.connected_accounts?.handle}
                  </p>
                  {s.status === 'failed' && s.error_message && (
                    <p className="text-xs text-red-400 truncate">{s.error_message}</p>
                  )}
                  {s.published_url && (
                    <a
                      href={s.published_url}
                      target="_blank"
                      className="text-xs text-violet-400 hover:underline"
                    >
                      Ver post publicado ↗
                    </a>
                  )}
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${badge.cls}`}>
                  {badge.text}
                </span>
                {s.status === 'scheduled' && !s.approved && (
                  <>
                    <button
                      onClick={() => act(s.id, 'approve')}
                      disabled={busy}
                      className="text-sm px-4 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-semibold shrink-0"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => act(s.id, 'delete')}
                      disabled={busy}
                      className="text-sm px-3 py-1.5 rounded-md border border-zinc-800 hover:border-red-900 hover:text-red-300 shrink-0"
                    >
                      Cancelar
                    </button>
                  </>
                )}
                {s.status === 'scheduled' && s.approved && (
                  <span className="text-xs text-zinc-500 shrink-0">enviando…</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}

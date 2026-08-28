'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/api';

interface Avatar {
  id: string;
  user_id: string | null;
  name: string;
  expressions: Record<string, string>;
  status: 'generating' | 'ready' | 'failed';
  error_message: string | null;
  created_at: string;
}

const EXPRESSION_LABEL: Record<string, string> = {
  idle: 'Neutro',
  watching: 'Reação',
  curious: 'Curioso',
  impressed: 'Impressionado',
  approved: 'Aprovando',
  analytical: 'Analítico',
  laughing: 'Rindo',
  shocked: 'Chocado',
  agreeing: 'Concordando',
};

const STATUS_BADGE: Record<Avatar['status'], { text: string; cls: string }> = {
  generating: { text: 'Gerando…', cls: 'bg-violet-950 text-violet-300' },
  ready: { text: 'Pronto', cls: 'bg-emerald-950 text-emerald-300' },
  failed: { text: 'Falhou', cls: 'bg-red-950 text-red-300' },
};

// Reduz a foto no browser (≤1024px JPEG) — mantém o payload pequeno
async function downscaleToBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponível');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export default function AvatarPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [style, setStyle] = useState<'realistic' | 'cartoon'>('realistic');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await apiFetch('/v1/avatars');
    setAvatars(res.avatars);
    setSelectedId(res.selected_avatar_id);
  }, []);

  useEffect(() => {
    refresh().catch(() => setMessage('Não foi possível carregar os avatares.'));
  }, [refresh]);

  // Enquanto houver geração em andamento, atualiza a cada 5s
  useEffect(() => {
    if (!avatars.some((a) => a.status === 'generating')) return;
    const id = setInterval(() => refresh().catch(() => {}), 5000);
    return () => clearInterval(id);
  }, [avatars, refresh]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const image_base64 = await downscaleToBase64(file);
      await apiFetch('/v1/avatars/generate', {
        method: 'POST',
        body: JSON.stringify({ name, style, image_base64 }),
      });
      setName('');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setMessage('Geração iniciada — o vídeo de reação fica pronto em ~3 minutos.');
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado');
    }
    setBusy(false);
  }

  async function select(avatarId: string | null) {
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch('/v1/avatars/select', {
        method: 'POST',
        body: JSON.stringify({ avatar_id: avatarId }),
      });
      setSelectedId(avatarId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado');
    }
    setBusy(false);
  }

  async function remove(avatarId: string) {
    if (!confirm('Apagar este avatar? Os shorts já renderizados não mudam.')) return;
    try {
      await apiFetch(`/v1/avatars/${avatarId}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado');
    }
  }

  return (
    <AppShell>
      <h1 className="text-xl font-bold mb-2">Avatar</h1>
      <p className="text-sm text-mist/60 mb-8 max-w-2xl">
        O avatar aparece reagindo nos seus shorts como um streamer de react. Envie uma foto
        e a IA gera seu clone sentado num home office, com o vídeo de reação completo.
      </p>

      <form onSubmit={generate} className="flex gap-3 flex-wrap items-end max-w-2xl mb-4">
        <input
          required
          placeholder="Nome do avatar (ex.: Luiz cartoon)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-56 px-4 py-3 rounded-md bg-ink-2 border border-edge focus:border-violet-500 outline-none"
        />
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value as 'realistic' | 'cartoon')}
          title="Estilo do avatar"
          className="px-4 py-3 rounded-md bg-ink-2 border border-edge focus:border-violet-500 outline-none"
        >
          <option value="realistic">Clone realista</option>
          <option value="cartoon">Cartoon 3D</option>
        </select>
        <input
          ref={fileInput}
          required
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-mist file:mr-3 file:px-4 file:py-3 file:rounded-md file:border-0 file:bg-ink-2 file:text-mist file:cursor-pointer"
        />
        <button
          type="submit"
          disabled={busy || !file}
          className="px-6 py-3 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-semibold"
        >
          Gerar avatar
        </button>
      </form>
      <p className="text-xs text-mist/60 mb-8">
        Use uma foto de rosto bem iluminada, de frente. O clone sai sentado num home office
        (cenário fixo, só ele se move) com um vídeo de reação de 10s, fluido e natural:
        assistindo → surpresa gradual → aprovando. ~US$ 0,55/avatar, pronto em ~5 min.
      </p>

      {message && <p className="text-sm text-amber-400 mb-6">{message}</p>}

      <div className="grid md:grid-cols-2 gap-5">
        <div
          className={`rounded-xl border p-5 ${
            selectedId === null ? 'border-violet-500 bg-violet-950/20' : 'border-edge bg-ink-2/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="font-bold">Sem avatar</p>
            {selectedId === null ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-950 text-violet-300">
                Selecionado
              </span>
            ) : (
              <button
                onClick={() => select(null)}
                disabled={busy}
                className="text-sm px-3 py-1.5 rounded-md border border-edge hover:border-violet-500 disabled:opacity-40"
              >
                Usar
              </button>
            )}
          </div>
          <p className="text-sm text-mist/60 mt-2">Shorts saem limpos, só com legendas e marca.</p>
        </div>

        {avatars.map((a) => {
          const badge = STATUS_BADGE[a.status];
          // Avatares antigos podem ter expressões com URL null — filtra antes de usar.
          // O modo "1 card" grava o MESMO vídeo em várias chaves — dedupe por URL.
          const seenUrls = new Set<string>();
          const exprs = Object.entries(a.expressions ?? {}).filter(
            (entry): entry is [string, string] => {
              if (typeof entry[1] !== 'string' || entry[1].length === 0) return false;
              if (seenUrls.has(entry[1])) return false;
              seenUrls.add(entry[1]);
              return true;
            }
          );
          const animated = exprs.some(([, url]) => url.endsWith('.mp4'));
          return (
            <div
              key={a.id}
              className={`rounded-xl border p-5 ${
                selectedId === a.id ? 'border-violet-500 bg-violet-950/20' : 'border-edge bg-ink-2/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold truncate">
                  {a.name}
                  {a.user_id === null && (
                    <span className="ml-2 text-xs text-mist/60">biblioteca</span>
                  )}
                  {animated && (
                    <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-950 text-violet-300">
                      animado
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
                    {badge.text}
                  </span>
                  {a.status === 'ready' &&
                    (selectedId === a.id ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-950 text-violet-300">
                        Selecionado
                      </span>
                    ) : (
                      <button
                        onClick={() => select(a.id)}
                        disabled={busy}
                        className="text-sm px-3 py-1.5 rounded-md border border-edge hover:border-violet-500 disabled:opacity-40"
                      >
                        Usar
                      </button>
                    ))}
                  {a.user_id !== null && (
                    <button
                      onClick={() => remove(a.id)}
                      className="text-sm px-2 py-1.5 rounded-md text-mist/60 hover:text-red-300"
                      title="Apagar avatar"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {a.status === 'failed' && a.error_message && (
                <p className="text-xs text-red-400 mt-2">{a.error_message}</p>
              )}

              <div className="flex gap-2 mt-4 flex-wrap">
                {exprs.length === 0 && a.status === 'generating' && (
                  <p className="text-sm text-mist/60">Gerando expressões…</p>
                )}
                {exprs.map(([expr, url]) => (
                  <figure key={expr} className="text-center">
                    {url.endsWith('.mp4') ? (
                      <video
                        src={url}
                        muted
                        loop
                        autoPlay
                        playsInline
                        className="w-16 h-16 rounded-full object-cover border border-edge"
                      />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={url}
                        alt={expr}
                        className="w-16 h-16 rounded-full object-cover border border-edge"
                      />
                    )}
                    <figcaption className="text-[10px] text-mist/60 mt-1">
                      {EXPRESSION_LABEL[expr] ?? expr}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

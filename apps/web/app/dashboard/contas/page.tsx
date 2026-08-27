'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/api';

interface Account {
  id: string;
  platform: string;
  handle: string;
  active: boolean;
}

export default function Contas() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [{ connected }, { accounts }] = await Promise.all([
      apiFetch('/v1/accounts/blotato/status'),
      apiFetch('/v1/accounts/connected'),
    ]);
    setConnected(connected);
    setAccounts(accounts);
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch('/v1/accounts/blotato/connect', {
        method: 'POST',
        body: JSON.stringify({ api_key: apiKey }),
      });
      setApiKey('');
      setMessage(`Conectado — ${res.accounts_synced} conta(s) sincronizada(s).`);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      setMessage(msg === 'invalid_blotato_key' ? 'Chave inválida — confira no painel do Blotato.' : msg);
    }
    setBusy(false);
  }

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch('/v1/accounts/connected/sync', { method: 'POST' });
      setMessage(`${res.accounts_synced} conta(s) sincronizada(s).`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado');
    }
    setBusy(false);
  }

  async function deactivate(id: string) {
    await apiFetch(`/v1/accounts/connected/${id}`, { method: 'DELETE' });
    await refresh();
  }

  return (
    <AppShell>
      <h1 className="text-xl font-bold mb-2">Contas de publicação</h1>
      <p className="text-sm text-mist/60 mb-8 max-w-2xl">
        Conecte sua conta do Blotato (a partir de US$ 29/mês, blotato.com) e as redes que você
        já ligou lá aparecem aqui. Sua chave fica criptografada no cofre — nunca é exibida de
        volta.
      </p>

      {connected === false && (
        <form onSubmit={connect} className="flex gap-3 max-w-2xl mb-8">
          <input
            required
            type="password"
            placeholder="Cole sua API key do Blotato (Settings → API)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1 px-4 py-3 rounded-md bg-ink-2 border border-edge focus:border-violet-500 outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-6 py-3 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-semibold"
          >
            Conectar
          </button>
        </form>
      )}

      {connected && (
        <div className="flex items-center gap-4 mb-8">
          <span className="text-sm text-emerald-400">● Blotato conectado</span>
          <button
            onClick={sync}
            disabled={busy}
            className="text-sm px-4 py-2 rounded-md border border-edge hover:border-mist/50 disabled:opacity-40"
          >
            Sincronizar contas
          </button>
        </div>
      )}

      {message && <p className="text-sm text-amber-400 mb-4">{message}</p>}

      <ul className="flex flex-col gap-2 max-w-2xl">
        {accounts.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between border border-edge/60 bg-ink-2/60 rounded-lg px-5 py-3"
          >
            <div>
              <span className="font-medium capitalize">{a.platform}</span>
              <span className="text-mist/60 ml-3">{a.handle}</span>
            </div>
            {a.active ? (
              <button
                onClick={() => deactivate(a.id)}
                className="text-sm text-mist/60 hover:text-red-300"
              >
                Desativar
              </button>
            ) : (
              <span className="text-xs text-mist/50">inativa</span>
            )}
          </li>
        ))}
        {connected && accounts.length === 0 && (
          <p className="text-sm text-mist/60">
            Nenhuma conta sincronizada — conecte suas redes no painel do Blotato e clique em
            Sincronizar.
          </p>
        )}
      </ul>
    </AppShell>
  );
}

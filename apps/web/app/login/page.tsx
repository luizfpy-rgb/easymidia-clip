'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = supabaseBrowser();
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      setMessage(error ? error.message : 'Conta criada. Confira seu e-mail para confirmar.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else router.push('/dashboard');
    }
    setBusy(false);
  }

  return (
    <main className="min-h-screen bg-ink text-white flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-center">
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </h1>
        <input
          type="email"
          required
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-4 py-3 rounded-md bg-ink-2 border border-edge focus:border-violet-500 outline-none"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Senha (mín. 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="px-4 py-3 rounded-md bg-ink-2 border border-edge focus:border-violet-500 outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-3 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 font-semibold transition-colors"
        >
          {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta grátis'}
        </button>
        {message && <p className="text-sm text-center text-mist">{message}</p>}
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="text-sm text-mist/60 hover:text-mist"
        >
          {mode === 'login' ? 'Não tem conta? Criar agora' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </main>
  );
}

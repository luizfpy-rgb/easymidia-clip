'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

export default function Dashboard() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
      else setEmail(data.user.email ?? null);
    });
  }, [router]);

  if (!email) return null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-8 py-10 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-10">
        <span className="font-bold text-lg tracking-tight">
          easymidia <span className="text-violet-400">clip</span>
        </span>
        <div className="flex items-center gap-4 text-sm text-zinc-400">
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

      <div className="border border-dashed border-zinc-800 rounded-lg p-12 text-center text-zinc-500">
        <p className="font-semibold text-zinc-300 mb-2">Fase 2 em construção</p>
        <p className="text-sm">
          Aqui entra: adicionar link do YouTube → transcrição → trechos sugeridos pela IA.
        </p>
      </div>
    </main>
  );
}

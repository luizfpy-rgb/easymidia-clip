'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';

interface Profile {
  email: string;
  plan: string;
  credits_remaining: number;
  blotato_connected: boolean;
}

const NAV = [
  { href: '/dashboard', label: 'Vídeos' },
  { href: '/dashboard/niches', label: 'Descoberta' },
  { href: '/dashboard/shorts', label: 'Bandeja' },
  { href: '/dashboard/schedule', label: 'Cronograma' },
  { href: '/dashboard/contas', label: 'Contas' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
      else setAuthed(true);
    });
  }, [router]);

  useEffect(() => {
    if (!authed) return;
    apiFetch('/v1/me')
      .then(({ profile }) => setProfile(profile))
      .catch(() => {});
  }, [authed]);

  if (!authed) return null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-8 py-8 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight">
            easymidia <span className="text-violet-400">clip</span>
          </Link>
          <nav className="flex gap-4 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  pathname === item.href
                    ? 'text-violet-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          {profile && (
            <span className="px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 tabular-nums">
              {profile.plan === 'internal'
                ? 'uso interno'
                : `${profile.credits_remaining} créditos · ${profile.plan}`}
            </span>
          )}
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
      {children}
    </main>
  );
}

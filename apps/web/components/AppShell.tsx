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
  { href: '/dashboard/analytics', label: 'Métricas' },
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
    <main className="min-h-screen bg-ink text-white px-8 py-8 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" className="w-7 h-7 rounded-md" />
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
                    : 'text-mist hover:text-white'
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-mist">
          {profile && (
            <span className="px-3 py-1 rounded-full bg-ink-2 border border-edge tabular-nums">
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
            className="px-3 py-1.5 rounded-md border border-edge hover:border-mist/50"
          >
            Sair
          </button>
        </div>
      </header>
      {children}
    </main>
  );
}

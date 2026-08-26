'use client';

import { supabaseBrowser } from './supabase';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export async function apiFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return body;
}

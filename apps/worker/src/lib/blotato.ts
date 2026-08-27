import { BLOTATO_BASE_URL, type BlotatoPostStatus } from '@easymidia/shared';
import { supabaseAdmin } from './supabase.js';

async function request<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BLOTATO_BASE_URL}${path}`, {
    ...init,
    headers: {
      'blotato-api-key': apiKey,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Blotato ${init.method ?? 'GET'} ${path} → ${res.status}: ${body.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

export async function getBlotatoKey(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('get_blotato_key', { p_user_id: userId });
  if (error || !data) throw new Error('chave Blotato não configurada para este usuário');
  return data as string;
}

/** Sobe a mídia pro storage do Blotato e retorna a URL hospedada lá (revisão I3). */
export async function uploadMedia(apiKey: string, url: string): Promise<string> {
  const res = await request<{ url: string }>(apiKey, '/media', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  return res.url;
}

export interface CreatePostInput {
  accountId: string;
  platform: string;
  text: string;
  mediaUrls: string[];
  scheduledTime: string; // ISO 8601
  pageId?: string | null; // Facebook/LinkedIn pages
  youtubeTitle?: string; // YouTube exige título
}

export async function createPost(apiKey: string, input: CreatePostInput): Promise<string> {
  const target: Record<string, unknown> = { targetType: input.platform };
  if (input.pageId) target.pageId = input.pageId;
  if (input.platform === 'youtube') {
    // Campos obrigatórios validados contra a API real em 27/ago/2026
    target.title = input.youtubeTitle ?? input.text.slice(0, 95);
    target.privacyStatus = 'public';
    target.shouldNotifySubscribers = true;
  }
  const body = {
    post: {
      accountId: input.accountId,
      content: {
        text: input.text,
        platform: input.platform,
        mediaUrls: input.mediaUrls,
      },
      target,
    },
    // Na RAIZ — aninhado dentro de post é ignorado (revisão C1)
    scheduledTime: input.scheduledTime,
  };
  const res = await request<{ postSubmissionId?: string; id?: string }>(apiKey, '/posts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const id = res.postSubmissionId ?? res.id;
  if (!id) throw new Error(`Blotato não retornou postSubmissionId: ${JSON.stringify(res).slice(0, 300)}`);
  return id;
}

export interface PostStatus {
  status: BlotatoPostStatus;
  publicUrl?: string;
  errorMessage?: string;
}

export async function getPostStatus(apiKey: string, postSubmissionId: string): Promise<PostStatus> {
  return request<PostStatus>(apiKey, `/posts/${postSubmissionId}`);
}

export interface BlotatoAccount {
  id: string;
  platform?: string;
  username?: string;
  name?: string;
  [key: string]: unknown;
}

export async function listAccounts(apiKey: string): Promise<BlotatoAccount[]> {
  const res = await request<BlotatoAccount[] | { items?: BlotatoAccount[]; accounts?: BlotatoAccount[] }>(
    apiKey,
    '/users/me/accounts'
  );
  if (Array.isArray(res)) return res;
  return res.items ?? res.accounts ?? [];
}

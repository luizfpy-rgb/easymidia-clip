import { BLOTATO_BASE_URL } from '@easymidia/shared';

export interface BlotatoAccount {
  id: string;
  platform?: string;
  username?: string;
  name?: string;
  [key: string]: unknown;
}

export async function listBlotatoAccounts(apiKey: string): Promise<BlotatoAccount[]> {
  const res = await fetch(`${BLOTATO_BASE_URL}/users/me/accounts`, {
    headers: { 'blotato-api-key': apiKey },
  });
  if (!res.ok) {
    throw new Error(`blotato_${res.status}`);
  }
  const body = (await res.json()) as
    | BlotatoAccount[]
    | { items?: BlotatoAccount[]; accounts?: BlotatoAccount[] };
  if (Array.isArray(body)) return body;
  return body.items ?? body.accounts ?? [];
}

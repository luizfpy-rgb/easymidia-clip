import { env } from '../env.js';

// Alerta de falha DEFINITIVA (após esgotar retries do BullMQ). Telegram quando
// TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID estão configurados; senão fica no log.
// Nunca lança: notificação não pode mascarar o erro original do job.
export async function notifyFailure(subject: string, detail: string): Promise<void> {
  const text = `⚠️ easymidia clip — ${subject}\n\n${detail}`.slice(0, 3900);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.error(`[alerta] ${text.replace(/\n+/g, ' | ')}`);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
    if (!res.ok) console.error(`[alerta] Telegram respondeu ${res.status}`);
  } catch (err) {
    console.error('[alerta] envio Telegram falhou:', err instanceof Error ? err.message : err);
  }
}

// Bloqueio/expiração de cookies do yt-dlp aparece como 403 ou pedido de login
export function isCookieError(message: string): boolean {
  return /HTTP Error 403|Sign in to confirm|not a bot|cookies/i.test(message);
}

export function cookieHint(message: string): string {
  return isCookieError(message)
    ? '\n\n🍪 Parece bloqueio/expiração dos cookies do YouTube — renove o cookies.txt (conta descartável).'
    : '';
}

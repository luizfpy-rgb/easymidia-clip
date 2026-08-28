import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  UPSTASH_REDIS_URL: z.string().min(1),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('easymidia-clips'),
  R2_PUBLIC_URL: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  YOUTUBE_DATA_API_KEY: z.string().optional(),
  // Cookies de conta Google descartável para o yt-dlp (revisão C4)
  YTDLP_COOKIES_FILE: z.string().optional(),
  // Alternativa pra deploy (Railway): conteúdo do cookies.txt em base64
  YTDLP_COOKIES_B64: z.string().optional(),
  // CSV de filas que este worker consome (vazio = todas). Permite split:
  // downloads (transcribe,render) em IP residencial; resto no Railway (C4).
  WORKER_QUEUES: z.string().optional(),
  // Alerta de falha definitiva via Telegram (opcional — sem as duas vars, só loga)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  // Geração de avatares (Google AI Studio) — sem a chave, generate-avatar falha com aviso
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_IMAGE_MODEL: z.string().default('gemini-2.5-flash-image'),
});

// R2/APIs são opcionais na Fase 1; cada processor valida o que precisa ao ser implementado.
const parsed = schema.parse(process.env);
if (!parsed.YTDLP_COOKIES_FILE && parsed.YTDLP_COOKIES_B64) {
  const path = join(tmpdir(), 'em-cookies.txt');
  writeFileSync(path, Buffer.from(parsed.YTDLP_COOKIES_B64, 'base64'));
  parsed.YTDLP_COOKIES_FILE = path;
}
export const env = parsed;

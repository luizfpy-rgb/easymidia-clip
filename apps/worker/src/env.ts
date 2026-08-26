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
});

// R2/APIs são opcionais na Fase 1; cada processor valida o que precisa ao ser implementado.
export const env = schema.parse(process.env);

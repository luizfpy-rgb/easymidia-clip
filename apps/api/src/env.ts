import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  UPSTASH_REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().default(8787),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

export const env = schema.parse(process.env);

import { createMiddleware } from 'hono/factory';
import { supabaseAdmin } from '../lib/supabase.js';

export type AuthVariables = { userId: string };

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    return c.json({ error: 'missing_token' }, 401);
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return c.json({ error: 'invalid_token' }, 401);
  }
  c.set('userId', data.user.id);
  await next();
});

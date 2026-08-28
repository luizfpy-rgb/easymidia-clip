import { Hono } from 'hono';
import { z } from 'zod';
import type { GenerateAvatarJob } from '@easymidia/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { queues } from '../lib/queues.js';

// Foto reduzida no browser a ≤1024px JPEG — o base64 viaja no corpo e no job
// (a API não tem credencial R2; quem sobe pro bucket é o worker). ~4MB de teto.
const generateBody = z.object({
  name: z.string().min(2).max(40),
  style: z.enum(['realistic', 'cartoon']).default('realistic'),
  image_base64: z
    .string()
    .min(100)
    .max(4_000_000)
    .regex(/^(data:image\/(jpeg|png);base64,)?[A-Za-z0-9+/=]+$/),
});

const selectBody = z.object({ avatar_id: z.string().uuid().nullable() });

export const avatars = new Hono<{ Variables: AuthVariables }>()
  .get('/', async (c) => {
    const userId = c.get('userId');
    const [{ data: rows, error }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from('avatars')
        .select('id, user_id, name, expressions, status, error_message, created_at')
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .order('created_at'),
      supabaseAdmin.from('profiles').select('avatar_id').eq('id', userId).single(),
    ]);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ avatars: rows ?? [], selected_avatar_id: profile?.avatar_id ?? null });
  })
  .post('/generate', async (c) => {
    const parsed = generateBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
    const userId = c.get('userId');

    const { data: avatar, error } = await supabaseAdmin
      .from('avatars')
      .insert({ user_id: userId, name: parsed.data.name, expressions: {}, status: 'generating' })
      .select('id, name, status')
      .single();
    if (error) return c.json({ error: error.message }, 500);

    await queues.generateAvatar.add(
      'generate',
      {
        userId,
        avatarId: avatar.id,
        sourceImageBase64: parsed.data.image_base64,
        style: parsed.data.style,
      } satisfies GenerateAvatarJob,
      // Payload grande (foto): não deixar acumulando no Redis
      { attempts: 2, removeOnComplete: true, removeOnFail: { age: 86_400 } }
    );
    return c.json({ avatar }, 201);
  })
  .post('/select', async (c) => {
    const parsed = selectBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const userId = c.get('userId');

    if (parsed.data.avatar_id) {
      const { data: avatar } = await supabaseAdmin
        .from('avatars')
        .select('id, user_id, status')
        .eq('id', parsed.data.avatar_id)
        .single();
      if (!avatar || (avatar.user_id && avatar.user_id !== userId)) {
        return c.json({ error: 'not_found' }, 404);
      }
      if (avatar.status !== 'ready') return c.json({ error: 'avatar_not_ready' }, 409);
    }
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_id: parsed.data.avatar_id })
      .eq('id', userId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, selected_avatar_id: parsed.data.avatar_id });
  })
  .delete('/:id', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('avatars')
      .delete()
      .eq('id', c.req.param('id'))
      .eq('user_id', c.get('userId')) // globais (user_id null) não podem ser apagados
      .select('id');
    if (error) return c.json({ error: error.message }, 500);
    if (!data || data.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  });

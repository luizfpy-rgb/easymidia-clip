import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './env.js';
import { redis } from './lib/queues.js';
import { requireAuth } from './middleware/auth.js';
import {
  accounts, niches, discovery, shorts, schedule, dashboard, usage,
} from './routes/stubs.js';
import { sourceVideos } from './routes/source-videos.js';
import { clips } from './routes/clips.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: [env.NEXT_PUBLIC_APP_URL], credentials: true }));

app.get('/v1/health', async (c) => {
  const redisOk = await redis.ping().then(() => true).catch(() => false);
  return c.json({ ok: true, redis: redisOk, ts: new Date().toISOString() });
});

// Signup/login acontecem no frontend via supabase-js; a API só consome o JWT.
const v1 = new Hono();
v1.use('*', requireAuth);
v1.route('/accounts', accounts);
v1.route('/niches', niches);
v1.route('/discovery', discovery);
v1.route('/source-videos', sourceVideos);
v1.route('/clips', clips);
v1.route('/shorts', shorts);
v1.route('/schedule', schedule);
v1.route('/dashboard', dashboard);
v1.route('/usage', usage);
app.route('/v1', v1);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`easymidia api on :${info.port}`);
});

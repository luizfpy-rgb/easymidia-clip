import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';

// Superfície REST da spec §5. Cada rota nasce 501 e é implementada na sua fase.
const notImplemented = (phase: number) => (c: { json: (o: object, s: 501) => Response }) =>
  c.json({ error: 'not_implemented', phase }, 501);

export const accounts = new Hono<{ Variables: AuthVariables }>()
  .post('/blotato/connect', notImplemented(6))
  .get('/blotato/status', notImplemented(6))
  .get('/connected', notImplemented(6))
  .post('/connected/sync', notImplemented(6))
  .delete('/connected/:id', notImplemented(6));

export const niches = new Hono<{ Variables: AuthVariables }>()
  .post('/', notImplemented(5))
  .get('/', notImplemented(5))
  .patch('/:id', notImplemented(5))
  .delete('/:id', notImplemented(5));

export const discovery = new Hono<{ Variables: AuthVariables }>()
  .post('/search', notImplemented(5))
  .get('/results/:nicheId', notImplemented(5));

export const sourceVideos = new Hono<{ Variables: AuthVariables }>()
  .post('/manual', notImplemented(2))
  .post('/:id/analyze', notImplemented(3))
  .get('/:id/clips', notImplemented(3));

export const clips = new Hono<{ Variables: AuthVariables }>()
  .get('/:id/preview', notImplemented(3))
  .post('/:id/approve', notImplemented(3))
  .post('/:id/reject', notImplemented(3));

export const shorts = new Hono<{ Variables: AuthVariables }>()
  .get('/', notImplemented(4))
  .get('/:id', notImplemented(4))
  .post('/:id/retry', notImplemented(4))
  .delete('/:id', notImplemented(4));

export const schedule = new Hono<{ Variables: AuthVariables }>()
  .get('/prefs', notImplemented(6))
  .put('/prefs', notImplemented(6))
  .get('/upcoming', notImplemented(6))
  .post('/auto-fill', notImplemented(6))
  .post('/slots/:id/approve', notImplemented(6))
  .post('/slots/:id/reschedule', notImplemented(6))
  .delete('/slots/:id', notImplemented(6));

export const dashboard = new Hono<{ Variables: AuthVariables }>()
  .get('/summary', notImplemented(7));

export const usage = new Hono<{ Variables: AuthVariables }>()
  .get('/current-month', notImplemented(7))
  .get('/breakdown', notImplemented(7));

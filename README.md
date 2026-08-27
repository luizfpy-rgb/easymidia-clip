# easymidia clip

SaaS de geraÃ§Ã£o e publicaÃ§Ã£o automatizada de Shorts com IA. Spec v1.0 + revisÃ£o v1.1
(artifacts "RevisÃ£o easymidia clip" e "Setup easymidia clip"). DecisÃµes registradas em
[DECISIONS.md](DECISIONS.md); atualizaÃ§Ãµes futuras em [BACKLOG.md](BACKLOG.md).

**Modo atual: uso interno** (decisÃ£o D6) â€” sem cobranÃ§a; apÃ³s o signup, marcar a conta
com `update public.profiles set plan = 'internal' where email = '<seu e-mail>';`

## Estrutura

```
apps/web      Next.js 15 (App Router, Tailwind 4) â†’ Vercel, www.easymidia.io
apps/api      Hono + Node 22, rotas REST /v1 â†’ Railway, api.easymidia.io
apps/worker   BullMQ (6 filas) + FFmpeg + yt-dlp â†’ Railway (Dockerfile prÃ³prio)
packages/shared  MÃ¡quinas de estado, nomes de fila, planos
supabase/migrations  Schema Postgres com RLS (aplicar no Supabase)
```

## Rodar local

1. Copie `.env.example` para `.env` e preencha (ordem de obtenÃ§Ã£o das chaves no
   artifact "Setup easymidia clip").
2. Aplique `supabase/migrations/0001_init.sql` no SQL Editor do projeto Supabase.
3. `npm install`
4. Em trÃªs terminais: `npm run dev:api`, `npm run dev:worker`, `npm run dev:web`.

API local: http://localhost:8787/v1/health Â· Web: http://localhost:3000

## Deploy (Railway)

Dois serviÃ§os a partir deste repo, ambos com root no repositÃ³rio:

- **api** â€” Dockerfile `apps/api/Dockerfile`
- **worker** â€” Dockerfile `apps/worker/Dockerfile` (inclui FFmpeg e yt-dlp)

Vercel: importar o repo com root directory `apps/web`.

## Fases (roadmap da spec Â§10)

- [x] Fase 1 â€” infra base: monorepo, schema + RLS, esqueleto api/worker
- [x] Fase 2 â€” ingestÃ£o: yt-dlp (sÃ³ Ã¡udio) + Groq Whisper (teste E2E pendente das chaves)
- [x] Fase 3 â€” anÃ¡lise: claude-haiku-4-5 com structured outputs (teste E2E pendente das chaves)
- [x] Fase 4 â€” render: FFmpeg split 70/30 + word timestampsâ†’ASS + avatar (pendentes: assets do Ryu, fonte Space Grotesk no Docker, teste E2E)
- [x] Fase 5 â€” descoberta: YouTube Data API (nichos, cache 24h, ingest com confirmaÃ§Ã£o de direitos)
- [x] Fase 6 â€” Blotato: connect via Vault, sync de contas, cronograma + auto-fill, publish 1-request-por-conta, polling de status (teste E2E pendente)
- [x] Fase 7 (parcial) â€” Stripe checkout + webhook (falta: notificaÃ§Ãµes por e-mail)
- [ ] Fase 8 â€” beta fechado

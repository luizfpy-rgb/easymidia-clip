# easymidia clip

SaaS de geração e publicação automatizada de Shorts com IA. Spec v1.0 + revisão v1.1
(artifacts "Revisão easymidia clip" e "Setup easymidia clip"). Decisões registradas em
[DECISIONS.md](DECISIONS.md).

## Estrutura

```
apps/web      Next.js 15 (App Router, Tailwind 4) → Vercel, app.easymidia.io
apps/api      Hono + Node 22, rotas REST /v1 → Railway, api.easymidia.io
apps/worker   BullMQ (6 filas) + FFmpeg + yt-dlp → Railway (Dockerfile próprio)
packages/shared  Máquinas de estado, nomes de fila, planos
supabase/migrations  Schema Postgres com RLS (aplicar no Supabase)
```

## Rodar local

1. Copie `.env.example` para `.env` e preencha (ordem de obtenção das chaves no
   artifact "Setup easymidia clip").
2. Aplique `supabase/migrations/0001_init.sql` no SQL Editor do projeto Supabase.
3. `npm install`
4. Em três terminais: `npm run dev:api`, `npm run dev:worker`, `npm run dev:web`.

API local: http://localhost:8787/v1/health · Web: http://localhost:3000

## Deploy (Railway)

Dois serviços a partir deste repo, ambos com root no repositório:

- **api** — Dockerfile `apps/api/Dockerfile`
- **worker** — Dockerfile `apps/worker/Dockerfile` (inclui FFmpeg e yt-dlp)

Vercel: importar o repo com root directory `apps/web`.

## Fases (roadmap da spec §10)

- [x] Fase 1 — infra base: monorepo, schema + RLS, esqueleto api/worker
- [x] Fase 2 — ingestão: yt-dlp (só áudio) + Groq Whisper (teste E2E pendente das chaves)
- [x] Fase 3 — análise: claude-haiku-4-5 com structured outputs (teste E2E pendente das chaves)
- [x] Fase 4 — render: FFmpeg split 70/30 + word timestamps→ASS + avatar (pendentes: assets do Ryu, fonte Space Grotesk no Docker, teste E2E)
- [x] Fase 5 — descoberta: YouTube Data API (nichos, cache 24h, ingest com confirmação de direitos)
- [x] Fase 6 — Blotato: connect via Vault, sync de contas, cronograma + auto-fill, publish 1-request-por-conta, polling de status (teste E2E pendente)
- [x] Fase 7 (parcial) — Stripe checkout + webhook (falta: notificações por e-mail)
- [ ] Fase 8 — beta fechado

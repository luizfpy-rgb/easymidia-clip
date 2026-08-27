# easymidia clip

SaaS de geração e publicação automatizada de Shorts com IA. Spec v1.0 + revisão v1.1
(artifacts "Revisão easymidia clip" e "Setup easymidia clip"). Decisões registradas em
[DECISIONS.md](DECISIONS.md); atualizações futuras em [BACKLOG.md](BACKLOG.md).

**Modo atual: uso interno** (decisão D6) — sem cobrança; após o signup, marcar a conta
com `update public.profiles set plan = 'internal' where email = '<seu e-mail>';`

## Estrutura

```
apps/web      Next.js 15 (App Router, Tailwind 4) → Vercel, www.easymidia.io
apps/api      Hono + Node 22, rotas REST /v1 → Railway, api.easymidia.io
apps/worker   BullMQ (6 filas) + FFmpeg + yt-dlp + Deno → Railway (Dockerfile próprio)
packages/shared  Máquinas de estado, nomes de fila, planos
supabase/migrations  Schema Postgres com RLS (aplicar via scripts/migrate.mjs)
```

## Rodar local

1. Copie `.env.example` para `.env` e preencha (ordem de obtenção das chaves no
   artifact "Setup easymidia clip").
2. Migrações: `node scripts/migrate.mjs` (usa `DATABASE_URL` do ambiente).
3. `npm install`
4. Em três terminais: `npm run dev:api`, `npm run dev:worker`, `npm run dev:web`.

API local: http://localhost:8787/v1/health · Web: http://localhost:3000

Requisitos locais do worker: yt-dlp (≥ 2026.08.19), FFmpeg e Deno no PATH.

## Deploy (no ar desde 27/ago/2026)

- **Vercel** (root `apps/web`) → https://www.easymidia.io
- **Railway serviço api** (Dockerfile `apps/api/Dockerfile`, PORT=8787) → https://api.easymidia.io
- **Railway serviço worker** (Dockerfile `apps/worker/Dockerfile`; cookies via
  `YTDLP_COOKIES_B64`) — roda só `discover-videos,analyze-clips,publish,poll-blotato-status,cleanup-r2`
  via `WORKER_QUEUES` (o YouTube bloqueia download em IP de datacenter — risco C4 confirmado).
  ⚠️ `cleanup-r2` entrou em ago/2026: acrescente ao `WORKER_QUEUES` do Railway no próximo deploy.

### Worker de downloads (roda no PC, IP residencial)

Transcrição e render precisam do yt-dlp, que só funciona em IP residencial.
Com o PC ligado, rode:

```powershell
cd C:\Users\lfval\easymidia-clip
$env:Path += ';C:\Users\lfval\AppData\Local\Microsoft\WinGet\Packages\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe;C:\Users\lfval\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin;C:\Users\lfval\AppData\Local\Microsoft\WinGet\Packages\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe'
$env:WORKER_QUEUES = 'transcribe,render'
node --env-file=.env apps/worker/dist/index.js
```

Sem o PC ligado, vídeos ficam em fila (`pending`) até o worker subir. Autonomia
total (proxy residencial ou PO token provider) está no [BACKLOG.md](BACKLOG.md).

## Alertas e limpeza

- **Alerta de falha definitiva** (transcrição/análise/render/publicação, após os 3
  retries): defina `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no worker (local e
  Railway). Sem as vars, o alerta sai só no log. Erros de cookie do YouTube (403 /
  "Sign in to confirm") chegam com a dica de renovar o `cookies.txt`.
- **Limpeza do R2** (fila `cleanup-r2`, 1x/dia): shorts *publicados* há +30 dias têm
  mp4/thumb apagados do bucket (a linha ganha `expired_at` e sai da bandeja); áudio de
  transcrição (+30 dias) também é removido — o `transcript.json`, que o re-render usa, fica.
- **URLs versionadas**: cada render sobe `short-<timestamp>.mp4`, então re-render nunca
  esbarra no cache da Cloudflare (o `?v=` manual do `scripts/rerender.mjs` ficou obsoleto).
- **Retry na UI**: vídeo falhado (Vídeos), clip falhado (Trechos) e slot falhado
  (Cronograma) têm botão "Tentar de novo".

## E-mail com a marca

Os templates prontos estão em `supabase/templates/` (confirmação de conta e reset de
senha). Aplicar em Supabase → Authentication → Emails, colando o HTML de cada arquivo.

## Fases (roadmap da spec §10)

- [x] Fase 1 — infra base: monorepo, schema + RLS, esqueleto api/worker
- [x] Fase 2 — ingestão: yt-dlp (só áudio) + Groq Whisper
- [x] Fase 3 — análise: claude-haiku-4-5 com structured outputs
- [x] Fase 4 — render: template v1.1 Full-frame + word timestamps→ASS (Space Grotesk embarcada; avatares aguardam chave do Google AI Studio)
- [x] Fase 5 — descoberta: YouTube Data API (nichos, cache 24h, ingest com confirmação de direitos)
- [x] Fase 6 — Blotato: connect via Vault, sync de contas, cronograma + auto-fill, publish 1-request-por-conta, polling de status (teste E2E pendente)
- [x] Fase 7 (parcial) — Stripe checkout + webhook (falta: notificações por e-mail)
- [x] Teste E2E local (27/ago/2026): link → transcrição → análise → render → R2, US$ 0,023/short
- [ ] Fase 8 — beta fechado

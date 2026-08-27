# Backlog easymidia clip

Referência única de atualizações futuras. Ordem dentro de cada bloco = prioridade.
Estado atual: Fases 1–7 da spec codadas; produto em modo **uso interno** (plano
`internal`, sem cobrança — decisão D6 em [DECISIONS.md](DECISIONS.md)).

## Agora — deploy e validação (uso próprio)

- [x] Deploy Railway (api + worker) e Vercel (web) — no ar em 27/ago/2026
- [x] Migrações 0001–0007 aplicadas; conta do Luiz marcada como `internal`
- [x] E2E de produção: link → download (worker local) → Groq → Claude (Railway) → render → R2
- [x] Publicação validada nas 3 redes (YouTube/IG/TikTok) com payloads Blotato reais
- [x] Cookies em produção testados: **YouTube bloqueia IP de datacenter mesmo com cookies
      válidos** (C4 confirmado) → split de filas via `WORKER_QUEUES`; downloads rodam no PC
- [ ] Autonomia total de downloads: proxy residencial (~US$1–3/GB) OU bgutil PO token
      provider no container do worker (elimina a dependência do PC ligado)
- [ ] Medir consumo real de créditos Blotato por post (define planos futuros)
- [x] Serviço Railway renomeado "refreshing-beauty" → "worker" — 27/ago
- [x] `cleanup-r2` no `WORKER_QUEUES` do Railway (worker up com 5 filas, confirmado no log) — 27/ago

## Identidade visual

- [x] Kit social publicado (avatar play-fatiado, banner YouTube, bios nas 3 redes) — 27/ago
- [x] Favicon + ícones do app, paleta/Space Grotesk aplicadas no app inteiro — 27/ago
- [x] Landing page real (hero, short real embedado, como funciona, CTA) — 27/ago
- [x] Open Graph/meta tags com imagem própria (`/og.png`) — 27/ago
- [x] Templates de e-mail Supabase com a marca (`supabase/templates/`) —
      **falta colar no dashboard** (Authentication → Emails), 2 min do Luiz
- [x] Fonte Space Grotesk embarcada no worker (legendas e wordmark no render)
- [ ] Sistema de avatares (biblioteca + geração por foto via Gemini image) —
      **bloqueado na chave do Google AI Studio**; Ryu vira o primeiro da biblioteca
- [ ] Thumbnail dedicada do short (frame + arte do gancho ampliada) — o gancho já
      aparece queimado no thumb atual; item virou polimento, não pendência

## Qualidade dos cortes (template v1.1 corrigiu o pior; próximos passos)

- [x] URL versionada no render (`short-<ts>.mp4`) — mata o cache da Cloudflare no re-render
- [x] Legenda: linha não termina mais em conectivo ("E", "DE" descem pra linha seguinte)
- [x] Corte por frase: início/fim do clip encostam na fronteira de segmento mais próxima
      (tolerância 4s + 0.3s de folga no fim)
- [ ] Crop inteligente com detecção de rosto (zoom no falante como Opus Clip) — decisão
      pendente: contraria o full-frame do v1.1, precisa de validação com vídeos reais
- [ ] Validar os cortes por frase com vídeos reais (snap é heurística — conferir 2-3 renders)

## Robustez (antes de rodar sozinho no cronograma)

- [x] Notificação de falha definitiva via Telegram (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`
      no worker; sem as vars, sai no log) — cobre transcribe/analyze/render/publish/Blotato
- [x] Alerta de cookies: erro 403/"Sign in to confirm" chega com dica de renovar cookies.txt
- [x] Limpeza automática do R2 (fila diária `cleanup-r2`: shorts publicados +30d e áudio
      de transcrição)
- [x] Retry na UI: vídeo falhado, clip falhado e slot falhado têm botão
- [ ] Criar bot do Telegram e preencher as vars (2 min do Luiz: @BotFather → token; chat id)
- [ ] Monitoramento externo: UptimeRobot no /v1/health + Sentry nos workers (precisa de contas)
- [ ] Rotação de cookies yt-dlp quando expirarem (alerta já existe; falta automatizar a troca)
- [ ] Proxy residencial como fallback de download (só se o bloqueio começar)

## Fase 2 — lançamento comercial (monetização)

- [ ] Ativar Stripe: CNPJ + conta PJ, 3 produtos (R$ 47/97/297), price IDs no env
- [ ] Página de planos/upgrade no app (o checkout já existe na API: POST /v1/billing/checkout)
- [ ] Trial de 5 shorts funcionando de ponta a ponta (lógica pronta, falta testar)
- [ ] Termos de Uso com cláusula de responsabilidade sobre direitos (D1) — passar por advogado
- [ ] E-mails transacionais via Resend: boas-vindas, post publicado, falha, créditos acabando
- [ ] Onboarding guiado (conectar Blotato → primeiro vídeo → primeiro short)
- [ ] Recrutar 10 beta users da waitlist easymidia.io/curso (Fase 8 da spec)
- [ ] Documentar qual plano Blotato suporta qual plano easymidia (depende da medição acima)

## v2 — produto (itens fora do escopo v1 da spec)

- [ ] Avatar animado com lipsync (RunPod/ComfyUI)
- [ ] Geração de voz IA
- [ ] Editor visual de trechos (ajustar in/out points antes de renderizar)
- [x] Analytics pós-publicação (página Métricas: views/likes/comentários/alcance por
      post e totais por rede, via Blotato analytics) — 27/ago. Falta só "melhor horário
      real" (precisa de histórico acumulado)
- [ ] Templates visuais adicionais (hoje só o v1.1 Full-frame)
- [ ] Avatares customizados por usuário (upload das expressões)
- [ ] Publicação direta sem Blotato (OAuth próprio por plataforma)
- [ ] App mobile

## Escala (gatilhos, não datas)

- [ ] >500 shorts/dia → migrar render pra Creatomate (~$0.10/render) ou workers on-demand
- [ ] >100 usuários → YouTube Data API com billing habilitado (quota paga)
- [ ] Upstash >US$ 10/mês → Redis dedicado no Railway
- [ ] Vercel Hobby → Pro no primeiro usuário externo (ToS proíbe uso comercial no free)
- [ ] Supabase já está no Pro (backup diário ok)

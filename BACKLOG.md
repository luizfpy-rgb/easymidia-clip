# Backlog easymidia clip

Referência única de atualizações futuras. Ordem dentro de cada bloco = prioridade.
Estado atual: Fases 1–7 da spec codadas; produto em modo **uso interno** (plano
`internal`, sem cobrança — decisão D6 em [DECISIONS.md](DECISIONS.md)).

## Agora — deploy e validação (uso próprio)

- [ ] Push pro GitHub e deploy Railway (api + worker) e Vercel (web)
- [ ] Aplicar migrações 0001–0005 no Supabase e marcar a conta do Luiz como `internal`
- [ ] Teste E2E com vídeo real: link → transcrição → análise → aprovação → render → bandeja
- [ ] Validar payload YouTube no Blotato (`target.title`/`privacyStatus` são palpite documentado)
- [ ] Medir consumo real de créditos Blotato por post (define planos futuros)
- [ ] Assets: 5 PNGs do Ryu + logo easymidia (overlay do logo ainda não está no filtro)
- [ ] Fonte Space Grotesk no Docker do worker (legendas hoje saem em DejaVu Sans)
- [ ] Cookies yt-dlp da conta descartável em produção; testar em IP do Railway

## Robustez (antes de rodar sozinho no cronograma)

- [ ] Notificação de falha (e-mail ou Telegram) quando transcribe/render/publish falhar de vez
- [ ] Limpeza automática do R2 (shorts com +30 dias publicados) — custo de storage
- [ ] Monitoramento: healthcheck externo (UptimeRobot), Sentry nos workers
- [ ] Rotação de cookies yt-dlp quando expirarem + alerta no primeiro 403
- [ ] Proxy residencial como fallback de download (só se o bloqueio começar)
- [ ] Retry manual na UI para vídeo/clip que falhou (a API já tem: POST /shorts/:id/retry)

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
- [ ] Analytics pós-publicação (views/likes por plataforma, melhor horário real)
- [ ] Templates visuais adicionais (hoje só split 70/30)
- [ ] Avatares customizados por usuário (upload das expressões)
- [ ] Publicação direta sem Blotato (OAuth próprio por plataforma)
- [ ] App mobile

## Escala (gatilhos, não datas)

- [ ] >500 shorts/dia → migrar render pra Creatomate (~$0.10/render) ou workers on-demand
- [ ] >100 usuários → YouTube Data API com billing habilitado (quota paga)
- [ ] Upstash >US$ 10/mês → Redis dedicado no Railway
- [ ] Vercel Hobby → Pro no primeiro usuário externo (ToS proíbe uso comercial no free)
- [ ] Supabase Free → Pro antes de qualquer usuário externo (backup diário)

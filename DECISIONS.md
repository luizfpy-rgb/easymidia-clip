# Decisões de produto e arquitetura

Complementa a seção 11 da spec v1.0 e a revisão v1.1 (artifacts "Revisão easymidia clip" e "Setup easymidia clip").

## D1 — Conteúdo de terceiros permitido no v1 (26/ago/2026)

Decisão do owner: o v1 **mantém** a clipagem de vídeos de terceiros descobertos pela IA,
contra a recomendação da revisão técnica (item C3), que apontava violação dos ToS do
YouTube no download e exposição do usuário a Content ID/strikes na republicação.

Salvaguardas mínimas obrigatórias antes do beta (Fase 7):
- [ ] Checkbox de declaração de direitos/permissão ao adicionar qualquer vídeo fonte
- [ ] Cláusula no ToS transferindo ao usuário a responsabilidade pelos direitos do conteúdo
- [ ] Item de risco atualizado na spec (strike de canal = risco alto aceito)

## D2 — Storage de vídeo no Cloudflare R2, não Supabase Storage (revisão I7)

Egress zero e API S3-compatible. Supabase fica com auth + Postgres + Vault.

## D3 — Publicação Blotato: 1 request por conta, status via polling (revisão C1)

Não existe publicação multi-plataforma em uma chamada nem webhook. Worker
`poll-blotato-status` (repeatable, 3 min) + limiter de 25 req/min na fila publish.

## D4 — Legendas via SRT→ASS + filtro subtitles do FFmpeg (revisão C2)

`drawtext` com textfile não faz legenda dinâmica; libass resolve estilo e timing.

## D5 — Download YouTube: só áudio para transcrição, trecho em vídeo pós-aprovação (revisão C4)

Cookies de conta Google descartável + PO token; fallback proxy residencial.

# Identidade visual — easymidia clip

## Cores

| Uso | Hex |
|---|---|
| Fundo profundo | `#120C22` / `#1A1327` |
| Roxo da marca (accent) | `#7C3AED` |
| Lilás (secundário/karaokê) | `#A78BFA` |
| Texto principal | `#FFFFFF` |
| Texto apoio | `#C9C2DE` |

## Tipografia

**Space Grotesk** (Bold 700 pra títulos/wordmark, Medium 500 pra apoio).
TTFs estáticos neste diretório; também embarcados no worker (`apps/worker/assets/fonts`).

## Símbolo

"Play fatiado": triângulo de play com um corte diagonal — o pedaço inferior, em lilás,
desliza pra fora (o clip sendo extraído do vídeo). Fontes em `avatar.svg`.

## Arquivos

- `avatar.svg` / `avatar-1024.png` — foto de perfil (YouTube, Instagram, TikTok)
- `banner-youtube.svg` / `banner-youtube.png` — capa do canal (conteúdo na área segura 1546×423)
- `wordmark.svg` / `wordmark.png` — logotipo transparente (marca d'água dos shorts, 55% opacidade)
- `rasterize.mjs` — SVG → PNG com as fontes da marca (`deno run -A brand/rasterize.mjs in.svg out.png [largura]`)

## Aplicações automáticas

- Todo short renderizado recebe a marca d'água (wordmark, canto inferior esquerdo)
  e legendas em Space Grotesk Bold com karaokê lilás — ver `apps/worker/src/processors/render.ts`.

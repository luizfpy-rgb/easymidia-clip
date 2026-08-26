# Worker easymidia — Node 22 + FFmpeg + yt-dlp (Railway usa este Dockerfile)
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 curl ca-certificates fonts-dejavu-core \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências do monorepo (contexto de build = raiz do repo)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
RUN npm ci --workspace @easymidia/shared --workspace @easymidia/worker --include-workspace-root=false

COPY packages/shared packages/shared
COPY apps/worker apps/worker
RUN npm run build -w @easymidia/shared && npm run build -w @easymidia/worker

CMD ["node", "apps/worker/dist/index.js"]

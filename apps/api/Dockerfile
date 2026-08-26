# API easymidia — Node 22 (Railway usa este Dockerfile; contexto de build = raiz do repo)
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @easymidia/shared --workspace @easymidia/api --include-workspace-root=false

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @easymidia/shared && npm run build -w @easymidia/api

EXPOSE 8787
CMD ["node", "apps/api/dist/index.js"]

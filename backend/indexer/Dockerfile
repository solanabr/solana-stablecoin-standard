FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY backend/shared/package.json backend/shared/package.json
COPY backend/indexer/package.json backend/indexer/package.json
RUN corepack enable && pnpm install --filter @stbr/indexer-service... --filter @stbr/backend-shared...
COPY . .
RUN pnpm --filter @stbr/backend-shared build && pnpm --filter @stbr/indexer-service build
EXPOSE 8082
CMD ["node", "backend/indexer/dist/index.js"]

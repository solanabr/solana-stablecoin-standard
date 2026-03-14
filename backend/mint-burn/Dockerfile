FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY backend/shared/package.json backend/shared/package.json
COPY backend/mint-burn/package.json backend/mint-burn/package.json
COPY sdk/core/package.json sdk/core/package.json
RUN corepack enable && pnpm install --filter @stbr/mint-burn-service... --filter @stbr/sss-token... --filter @stbr/backend-shared...
COPY . .
RUN pnpm --filter @stbr/backend-shared build && pnpm --filter @stbr/sss-token build && pnpm --filter @stbr/mint-burn-service build
EXPOSE 8081
CMD ["node", "backend/mint-burn/dist/index.js"]

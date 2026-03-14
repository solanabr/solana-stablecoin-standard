FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY backend/shared/package.json backend/shared/package.json
COPY backend/compliance/package.json backend/compliance/package.json
COPY sdk/core/package.json sdk/core/package.json
RUN corepack enable && pnpm install --filter @stbr/compliance-service... --filter @stbr/sss-token... --filter @stbr/backend-shared...
COPY . .
RUN pnpm --filter @stbr/backend-shared build && pnpm --filter @stbr/sss-token build && pnpm --filter @stbr/compliance-service build
EXPOSE 8083
CMD ["node", "backend/compliance/dist/index.js"]

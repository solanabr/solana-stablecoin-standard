FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace-level files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY sdk/package.json sdk/
COPY backend/package.json backend/

# Install dependencies
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source code
COPY sdk/ sdk/
COPY backend/ backend/

# Copy IDL artifacts required by SDK
COPY target/idl/ target/idl/
COPY target/types/ target/types/

# Build SDK first (backend depends on it), then backend
RUN pnpm --filter @stbr/sss-token build
RUN pnpm --filter sss-backend build

# Production stage
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/sdk/dist ./sdk/dist

RUN addgroup -S sss && adduser -S sss -G sss
USER sss

EXPOSE 3000

CMD ["node", "dist/main.js"]

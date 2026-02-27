# ============================================================================
# Stage 1: Build
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy SDK first (local dependency)
COPY sdk/package.json sdk/tsconfig.json ./sdk/
COPY sdk/src ./sdk/src
RUN cd sdk && npm install && npm run build

# Copy backend package files and install dependencies
COPY backend/package.json backend/tsconfig.json ./backend/
RUN cd backend && npm install

# Copy backend source and build
COPY backend/src ./backend/src
RUN cd backend && npm run build

# ============================================================================
# Stage 2: Runtime
# ============================================================================
FROM node:20-alpine AS runtime

RUN apk add --no-cache tini curl

WORKDIR /app

# Copy built SDK
COPY --from=builder /app/sdk/package.json ./sdk/
COPY --from=builder /app/sdk/dist ./sdk/dist
COPY --from=builder /app/sdk/node_modules ./sdk/node_modules

# Copy built backend
COPY --from=builder /app/backend/package.json ./backend/
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Default environment
ENV NODE_ENV=production
ENV PORT=3000
ENV RPC_URL=http://host.docker.internal:8899

EXPOSE 3000

WORKDIR /app/backend

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/backend/src/server.js"]

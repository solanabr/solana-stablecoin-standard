# Multi-stage build for SSS backend services
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace package files
COPY sdk/package.json sdk/tsconfig.json ./sdk/
COPY backend/package.json backend/tsconfig.json ./backend/

# Install dependencies
RUN cd sdk && npm install --production=false
RUN cd backend && npm install --production=false

# Copy source
COPY sdk/src ./sdk/src
COPY backend/src ./backend/src
COPY backend/config ./backend/config
COPY backend/services ./backend/services

# Build SDK first (backend depends on it)
RUN cd sdk && npm run build
RUN cd backend && npm run build

# --- Production image ---
FROM node:20-slim AS runtime

WORKDIR /app

# Security: non-root user
RUN groupadd -r sss && useradd -r -g sss sss

# Copy built artifacts
COPY --from=builder /app/sdk/dist ./sdk/dist
COPY --from=builder /app/sdk/package.json ./sdk/
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/

# Install production deps only
RUN cd sdk && npm install --production
RUN cd backend && npm install --production

# Copy IDL (must be mounted or baked in)
COPY target/idl ./target/idl

USER sss

EXPOSE 4000

ENV NODE_ENV=production
ENV SSS_PORT=4000

CMD ["node", "backend/dist/index.js"]

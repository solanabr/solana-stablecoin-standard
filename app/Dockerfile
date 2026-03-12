# ============================================================================
# Stage 1: Build
# ============================================================================
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy SDK first (local dependency via file:../sdk)
COPY sdk/package.json sdk/tsconfig.json ./sdk/
COPY sdk/src ./sdk/src
RUN cd sdk && npm install && npm run build

# Copy app package files and install dependencies
COPY app/package.json app/package-lock.json* ./app/
RUN cd app && npm install --install-links

# Copy app source and build
COPY app/src ./app/src
COPY app/public ./app/public
COPY app/next.config.ts app/tsconfig.json app/postcss.config.mjs app/tailwind.config.ts ./app/
COPY app/next-env.d.ts ./app/
COPY app/eslint.config.mjs ./app/

ENV NEXT_TELEMETRY_DISABLED=1
RUN cd app && npm run build

# ============================================================================
# Stage 2: Runtime
# ============================================================================
FROM node:20-alpine AS runtime

RUN apk add --no-cache tini curl

WORKDIR /app

# Copy standalone Next.js output
COPY --from=builder /app/app/.next/standalone ./
COPY --from=builder /app/app/.next/static ./.next/static
COPY --from=builder /app/app/public ./public

ENV NODE_ENV=production
ENV PORT=3003
ENV HOSTNAME=0.0.0.0

EXPOSE 3003

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

# Frontend Dashboard Dockerfile
FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ libudev-dev \
	&& rm -rf /var/lib/apt/lists/*

# Copy SDK first because frontend depends on file:../sdk
COPY sdk ./sdk
COPY frontend ./frontend

WORKDIR /app/sdk
RUN npm ci && npm run build && npm pack

WORKDIR /app/frontend

RUN npm ci --omit=optional
RUN npm install /app/sdk/sss-sdk-*.tgz --no-save

ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_SSS_PROGRAM_ID
ARG NEXT_PUBLIC_API_URL

ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
ENV NEXT_PUBLIC_SSS_PROGRAM_ID=$NEXT_PUBLIC_SSS_PROGRAM_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# Production stage
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid 1001 nextjs

COPY --from=builder /app/frontend/public ./public
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]

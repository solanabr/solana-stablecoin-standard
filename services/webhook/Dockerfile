FROM node:20-alpine AS builder
WORKDIR /app

# Copy root package files and SDK
COPY package.json package-lock.json* ./
COPY sdk/package.json sdk/
COPY services/webhook/package.json services/webhook/

# Install root workspace deps (links SDK)
RUN npm install --workspace=sdk --workspace=services/webhook --ignore-scripts 2>/dev/null || npm install --ignore-scripts

# Copy SDK source and build it
COPY sdk/ sdk/
COPY target/idl/ target/idl/
RUN cd sdk && npx tsc || true

# Copy service source and build
COPY services/webhook/ services/webhook/
RUN cd services/webhook && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/webhook/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/sdk/dist ./node_modules/@stbr/sss-token/dist
COPY --from=builder /app/sdk/package.json ./node_modules/@stbr/sss-token/package.json
COPY services/webhook/package.json ./

ENV NODE_ENV=production
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3004/health || exit 1

CMD ["node", "dist/index.js"]
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root package files and SDK
COPY package.json package-lock.json* ./
COPY sdk/package.json sdk/
COPY services/mint-burn/package.json services/mint-burn/

# Install all root deps (express, pg, @types/* etc.) and link SDK workspace
RUN npm install --include=dev --ignore-scripts
RUN npm install --workspace=sdk --include=dev --ignore-scripts 2>/dev/null || true
# Ensure pg is available for TypeScript compilation (not in root package.json)
RUN npm install --no-save --ignore-scripts pg

# Copy SDK source and build it
COPY sdk/ sdk/
COPY target/idl/ target/idl/
RUN cd sdk && npx tsc || true

# Copy service source and build
COPY services/mint-burn/ services/mint-burn/
RUN cd services/mint-burn && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/mint-burn/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/sdk/dist ./node_modules/@stbr/sss-token/dist
COPY --from=builder /app/sdk/package.json ./node_modules/@stbr/sss-token/package.json
COPY services/mint-burn/package.json ./

ENV NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
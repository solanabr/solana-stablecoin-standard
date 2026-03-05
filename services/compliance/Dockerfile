FROM node:20-alpine AS builder
WORKDIR /app

# Copy root package files and SDK
COPY package.json package-lock.json* ./
COPY sdk/package.json sdk/
COPY services/compliance/package.json services/compliance/

# Install root workspace deps (links SDK)
RUN npm install --workspace=sdk --workspace=services/compliance --ignore-scripts 2>/dev/null || npm install --ignore-scripts

# Copy SDK source and build it
COPY sdk/ sdk/
COPY target/idl/ target/idl/
RUN cd sdk && npx tsc || true

# Copy service source and build
COPY services/compliance/ services/compliance/
RUN cd services/compliance && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/compliance/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/sdk/dist ./node_modules/@stbr/sss-token/dist
COPY --from=builder /app/sdk/package.json ./node_modules/@stbr/sss-token/package.json
COPY services/compliance/package.json ./

ENV NODE_ENV=production
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3003/health || exit 1

CMD ["node", "dist/index.js"]
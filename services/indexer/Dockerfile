FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root config
COPY package.json yarn.lock* ./
COPY sdk/package.json ./sdk/
COPY sdk/dist ./sdk/dist/
COPY services/shared/package.json ./services/shared/
COPY services/indexer/package.json ./services/indexer/

# Install all workspace deps
RUN yarn install --frozen-lockfile --ignore-scripts

# Build shared
COPY services/shared ./services/shared/
RUN yarn workspace @sss/shared build

# Build indexer
COPY services/indexer ./services/indexer/
RUN yarn workspace @sss/indexer build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/sdk/package.json ./sdk/
COPY --from=builder /app/sdk/dist ./sdk/dist
COPY --from=builder /app/services/shared/package.json ./services/shared/
COPY --from=builder /app/services/shared/dist ./services/shared/dist
COPY --from=builder /app/services/indexer/dist ./services/indexer/dist
COPY --from=builder /app/services/indexer/package.json ./services/indexer/

EXPOSE 3001

CMD ["node", "services/indexer/dist/index.js"]

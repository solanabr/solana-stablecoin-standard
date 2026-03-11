FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock* ./
COPY sdk/package.json ./sdk/
COPY sdk/dist ./sdk/dist/
COPY services/shared/package.json ./services/shared/
COPY services/mint-burn/package.json ./services/mint-burn/

RUN yarn install --frozen-lockfile --ignore-scripts

COPY services/shared ./services/shared/
RUN yarn workspace @sss/shared build

COPY services/mint-burn ./services/mint-burn/
RUN yarn workspace @sss/mint-burn build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/sdk/package.json ./sdk/
COPY --from=builder /app/sdk/dist ./sdk/dist
COPY --from=builder /app/services/shared/package.json ./services/shared/
COPY --from=builder /app/services/shared/dist ./services/shared/dist
COPY --from=builder /app/services/mint-burn/dist ./services/mint-burn/dist
COPY --from=builder /app/services/mint-burn/package.json ./services/mint-burn/

EXPOSE 3002

CMD ["node", "services/mint-burn/dist/index.js"]

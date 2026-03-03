FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock* ./
COPY sdk/package.json sdk/
COPY backend/package.json backend/
RUN yarn install --frozen-lockfile || yarn install
COPY sdk/ sdk/
COPY backend/ backend/
RUN yarn workspace @sss/sdk build
RUN yarn workspace @sss/backend build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
COPY sdk/package.json sdk/
COPY services/ services/
RUN yarn install --frozen-lockfile
COPY sdk/ sdk/
COPY services/ services/
COPY target/idl/ target/idl/
RUN yarn workspace @stbr/sss-token build
RUN yarn workspaces run build

# --- Runtime ---
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services ./services
COPY --from=builder /app/sdk/dist ./sdk/dist
COPY --from=builder /app/target/idl ./target/idl
ENV NODE_ENV=production
EXPOSE 3001 3002 3003

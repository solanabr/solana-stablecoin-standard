# ============================================================================
# Stage 1: Build
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and build static site
COPY . .

ENV NODE_ENV=production
RUN npm run build

# ============================================================================
# Stage 2: Runtime -- serve static build with nginx
# ============================================================================
FROM nginx:alpine AS runtime

RUN apk add --no-cache curl

# Copy built static site to nginx html directory
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=5s \
  CMD curl -sf http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]

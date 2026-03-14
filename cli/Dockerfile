# CLI Docker image
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Make CLI globally available
RUN npm link

ENTRYPOINT ["sss"]

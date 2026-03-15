FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Build SDK first (monorepo dependency)
COPY sdk/package.json sdk/tsconfig.json /sdk/
COPY sdk/src /sdk/src
RUN cd /sdk && npm install && npm run build

# Build service
COPY services/mint-burn/package.json services/mint-burn/tsconfig.json ./
RUN npm install
COPY services/mint-burn/src ./src
RUN npm run build

COPY config/.env.example .env
EXPOSE 3001
CMD ["npm", "start"]

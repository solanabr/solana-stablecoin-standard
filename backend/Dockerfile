FROM node:20-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
RUN npx tsc

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]

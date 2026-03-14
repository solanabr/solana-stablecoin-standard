FROM node:22-alpine
WORKDIR /app
COPY package.json .
COPY tsconfig.json .
COPY src ./src
RUN npm install typescript @types/node
RUN npx tsc
CMD ["node", "dist/index.js"]

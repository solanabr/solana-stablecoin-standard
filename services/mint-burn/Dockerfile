FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY dist/ ./dist/
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]

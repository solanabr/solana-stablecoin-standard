FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY dist/ ./dist/
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV DB_PATH=/app/data/compliance.db
EXPOSE 3002
CMD ["node", "dist/index.js"]

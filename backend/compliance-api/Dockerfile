FROM node:20-alpine

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install

# Копируем исходный код
COPY . .

# Компилируем TypeScript
RUN npx tsc

EXPOSE 3000

CMD ["node", "dist/index.js"]
FROM node:18-alpine
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY tsconfig.json .
COPY src ./src

# Build
RUN npm run build

CMD ["npm", "start"]

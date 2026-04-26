FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci --ignore-scripts

RUN npx prisma generate

COPY . .

EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]

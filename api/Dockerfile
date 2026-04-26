FROM node:22.12.0-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY start.sh ./

RUN npm ci --ignore-scripts

RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate

RUN chmod +x start.sh

COPY . .

EXPOSE 3000

ENTRYPOINT ["/bin/sh", "./start.sh"]

FROM node:22.12.0-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY tsconfig.json ./

RUN npm ci --ignore-scripts

RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "echo 'Running prisma db push...' && npx prisma db push && echo 'Starting server...' && npx tsx src/server.ts"]

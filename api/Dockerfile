FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY tsconfig.json ./

ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

RUN npm ci

RUN npx prisma generate --schema=./prisma/schema.prisma

COPY . .

EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]

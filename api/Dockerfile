FROM node:22.12.0-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY tsconfig.json ./

RUN npm ci --ignore-scripts

RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate

COPY . .
COPY start.sh ./

RUN chmod +x start.sh

EXPOSE 3000

CMD ["./start.sh"]

FROM node:22.12.0-alpine

WORKDIR /app

# Copy API package files (relative to repo root)
COPY api/package*.json ./
COPY api/prisma ./prisma/
COPY api/prisma.config.ts ./
COPY api/tsconfig.json ./
COPY api/start.sh ./

RUN npm ci --ignore-scripts

RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate

RUN chmod +x start.sh

COPY api/src ./src/

EXPOSE 3000

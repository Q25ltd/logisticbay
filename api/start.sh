#!/bin/sh
echo "DATABASE_URL is set: $(echo $DATABASE_URL | cut -c1-30)..."
echo "Running prisma db push..."
npx prisma db push --schema=./prisma/schema.prisma
echo "Prisma push exit code: $?"
echo "Starting server..."
npx tsx src/server.ts

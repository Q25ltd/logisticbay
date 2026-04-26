#!/bin/sh
set -e
echo "DATABASE_URL is set: $(echo $DATABASE_URL | cut -c1-30)..."
echo "Running prisma db push..."
npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss
echo "Prisma push done!"
echo "Starting server..."
exec npx tsx src/server.ts

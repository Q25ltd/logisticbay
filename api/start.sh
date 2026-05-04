#!/bin/sh
set -e

echo "Pushing schema to database..."
npx prisma db push --schema prisma/schema.prisma --accept-data-loss

echo "Starting API..."
exec npx tsx src/server.ts

#!/bin/sh
set -e

echo "Pushing schema to database..."
npx prisma migrate deploy --schema prisma/schema.prisma

echo "Starting API..."
exec npx tsx src/server.ts

#!/bin/sh
set -e

echo "Applying database migrations..."
npx prisma migrate deploy --schema prisma/schema.prisma

echo "Starting API..."
exec npx tsx src/server.ts

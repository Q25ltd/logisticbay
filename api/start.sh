#!/bin/sh
set -e

echo "Syncing schema to database..."
npx prisma db push --schema prisma/schema.prisma

echo "Starting API..."
exec npx tsx src/server.ts

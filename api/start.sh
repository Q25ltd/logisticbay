#!/bin/sh
set -e

echo "Applying database migrations..."
# Resolve the RefreshToken migration — it was applied manually due to a Railway
# TIMESTAMP(3) incompatibility. This is a one-time no-op once resolved.
npx prisma migrate resolve --applied 20260510140000_add_refresh_token_table --schema prisma/schema.prisma 2>/dev/null || true
npx prisma migrate deploy --schema prisma/schema.prisma

echo "Starting API..."
exec npx tsx src/server.ts

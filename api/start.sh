#!/bin/sh
set -e

echo "Applying database migrations..."

# ── One-time heal for 2026-05-17 deploy incident ────────────────────────────
# A `prisma db push` ran before migration history was established, creating the
# Job table directly from schema.prisma.  Migration 20260517200000 is now stuck
# in FAILED state because CREATE TABLE "Job" hit "relation already exists".
#
# Fix: mark it rolled-back so migrate deploy re-runs the (now idempotent) SQL.
# Safe no-op on all future deploys — resolve errors on an already-applied
# migration; the `|| true` swallows that error silently.
npx prisma migrate resolve \
    --rolled-back 20260517200000_job_model_redesign \
    --schema prisma/schema.prisma \
    2>/dev/null || true

npx prisma migrate deploy --schema prisma/schema.prisma

echo "Starting API..."
exec npx tsx src/server.ts

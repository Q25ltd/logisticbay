-- Migration: add companyId to ShiftSegment and DeliveryTask
-- Idempotent: uses IF NOT EXISTS / DO $$ so it is safe to re-apply if the
-- production DB already had some of these columns added via db push.

-- ── ShiftSegment ──────────────────────────────────────────────────────────────

ALTER TABLE "ShiftSegment" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

-- Backfill from parent Shift (no-op if column already had values)
UPDATE "ShiftSegment" ss
SET "companyId" = s."companyId"
FROM "Shift" s
WHERE ss."shiftId" = s.id
  AND ss."companyId" IS NULL;

-- Make non-nullable only if not already
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ShiftSegment'
      AND column_name = 'companyId'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "ShiftSegment" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

-- Foreign key (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ShiftSegment_companyId_fkey'
  ) THEN
    ALTER TABLE "ShiftSegment"
      ADD CONSTRAINT "ShiftSegment_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── DeliveryTask ──────────────────────────────────────────────────────────────

ALTER TABLE "DeliveryTask" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

-- Backfill from parent ShiftSegment → Shift
UPDATE "DeliveryTask" dt
SET "companyId" = s."companyId"
FROM "ShiftSegment" ss
JOIN "Shift" s ON ss."shiftId" = s.id
WHERE dt."segmentId" = ss.id
  AND dt."companyId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'DeliveryTask'
      AND column_name = 'companyId'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "DeliveryTask" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'DeliveryTask_companyId_fkey'
  ) THEN
    ALTER TABLE "DeliveryTask"
      ADD CONSTRAINT "DeliveryTask_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "ShiftSegment_companyId_shiftId_idx"    ON "ShiftSegment"("companyId", "shiftId");
CREATE INDEX IF NOT EXISTS "ShiftSegment_companyId_startTime_idx"  ON "ShiftSegment"("companyId", "startTime");
CREATE INDEX IF NOT EXISTS "DeliveryTask_companyId_segmentId_idx"  ON "DeliveryTask"("companyId", "segmentId");
CREATE INDEX IF NOT EXISTS "DeliveryTask_companyId_shiftId_idx"    ON "DeliveryTask"("companyId", "shiftId");

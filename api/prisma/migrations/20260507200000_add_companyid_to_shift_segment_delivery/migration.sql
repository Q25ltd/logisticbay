-- Migration: add companyId to ShiftSegment and DeliveryTask
-- Safe: database is empty at time of writing; backfill step included for any future
-- partial data that may exist (uses parent Shift.companyId).

-- Step 1: add nullable columns
ALTER TABLE "ShiftSegment"  ADD COLUMN "companyId" INTEGER;
ALTER TABLE "DeliveryTask"  ADD COLUMN "companyId" INTEGER;

-- Step 2: backfill from parent Shift (no-op on empty DB; safe on populated DB)
UPDATE "ShiftSegment" ss
SET "companyId" = s."companyId"
FROM "Shift" s
WHERE ss."shiftId" = s.id
  AND ss."companyId" IS NULL;

UPDATE "DeliveryTask" dt
SET "companyId" = s."companyId"
FROM "ShiftSegment" ss
JOIN "Shift" s ON ss."shiftId" = s.id
WHERE dt."segmentId" = ss.id
  AND dt."companyId" IS NULL;

-- Step 3: make non-nullable and add foreign keys
ALTER TABLE "ShiftSegment" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "DeliveryTask"  ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "ShiftSegment"
  ADD CONSTRAINT "ShiftSegment_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryTask"
  ADD CONSTRAINT "DeliveryTask_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 4: add indexes
CREATE INDEX "ShiftSegment_companyId_shiftId_idx"    ON "ShiftSegment"("companyId", "shiftId");
CREATE INDEX "ShiftSegment_companyId_startTime_idx"  ON "ShiftSegment"("companyId", "startTime");
CREATE INDEX "DeliveryTask_companyId_segmentId_idx"  ON "DeliveryTask"("companyId", "segmentId");
CREATE INDEX "DeliveryTask_companyId_shiftId_idx"    ON "DeliveryTask"("companyId", "shiftId");

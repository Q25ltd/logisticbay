-- Clean PlannedJob: remove all fields that belong on Run or are replaced by the new model.
-- No data is recovered from these fields — they have already been migrated to Run/RunAssignment.
-- Mobile compatibility is NOT required for this migration.

-- Drop FK constraints before dropping columns
ALTER TABLE "PlannedJob" DROP CONSTRAINT IF EXISTS "PlannedJob_assignedDriverId_fkey";
ALTER TABLE "PlannedJob" DROP CONSTRAINT IF EXISTS "PlannedJob_pickupLocationId_fkey";
ALTER TABLE "PlannedJob" DROP CONSTRAINT IF EXISTS "PlannedJob_dropoffLocationId_fkey";

-- Drop indexes that reference removed columns
DROP INDEX IF EXISTS "PlannedJob_companyId_assignedDriverId_idx";

-- Remove Run-specific fields (driver/vehicle assignment belongs on Run)
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "assignedDriverId";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "assignedTruck";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "assignedTrailer";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "vehicleClass";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "vehicleClassRequired";

-- Remove legacy 2-stop pattern (replaced by JobParts)
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "sequence";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "pickupLocationId";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "dropoffLocationId";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "pickupTextSnapshot";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "dropoffTextSnapshot";

-- Remove stop-level fields (these live on JobPart now)
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "referenceNumber";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "bookingContactName";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "bookingContactPhone";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "bookingContactEmail";

-- Remove event-derived fields (these come from Events / LoadTrack now)
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "actualQuantity";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "actualUnit";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "podNumber";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "collectionNote";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "deliveryNote";

-- Remove redundant flags (replaced by JobPart.type and LoadTrack)
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "requireCollection";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "requireDeliveryQty";

-- Remove other legacy fields
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "altAddress";
ALTER TABLE "PlannedJob" DROP COLUMN IF EXISTS "returnDestination";

-- Fix status default: jobs start as draft, not pending
ALTER TABLE "PlannedJob" ALTER COLUMN "status" SET DEFAULT 'draft';
UPDATE "PlannedJob" SET "status" = 'draft' WHERE "status" = 'pending';

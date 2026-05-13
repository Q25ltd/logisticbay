-- Drop NOT NULL from Customer optional fields (prior migration only dropped DEFAULT)
ALTER TABLE "Customer" ALTER COLUMN "contactName"  DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "contactPhone" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "contactEmail" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "notes"        DROP NOT NULL;

-- Backfill empty strings to NULL now that the constraint is gone
UPDATE "Customer" SET "contactName"  = NULL WHERE "contactName"  = '';
UPDATE "Customer" SET "contactPhone" = NULL WHERE "contactPhone" = '';
UPDATE "Customer" SET "contactEmail" = NULL WHERE "contactEmail" = '';
UPDATE "Customer" SET "notes"        = NULL WHERE "notes"        = '';

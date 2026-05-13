-- Make Customer optional string fields nullable (empty string → NULL)
ALTER TABLE "Customer" ALTER COLUMN "contactName"  DROP DEFAULT, ALTER COLUMN "contactName"  TYPE TEXT;
ALTER TABLE "Customer" ALTER COLUMN "contactPhone" DROP DEFAULT, ALTER COLUMN "contactPhone" TYPE TEXT;
ALTER TABLE "Customer" ALTER COLUMN "contactEmail" DROP DEFAULT, ALTER COLUMN "contactEmail" TYPE TEXT;
ALTER TABLE "Customer" ALTER COLUMN "notes"        DROP DEFAULT, ALTER COLUMN "notes"        TYPE TEXT;

UPDATE "Customer" SET "contactName"  = NULL WHERE "contactName"  = '';
UPDATE "Customer" SET "contactPhone" = NULL WHERE "contactPhone" = '';
UPDATE "Customer" SET "contactEmail" = NULL WHERE "contactEmail" = '';
UPDATE "Customer" SET "notes"        = NULL WHERE "notes"        = '';

-- Restore loadData blob (goods sub-type details)
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "loadData" JSONB;

-- Extended alternative return address fields
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "alternativeReturnSiteName" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "alternativeReturnAddressLine2" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "alternativeReturnTown" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "alternativeReturnCounty" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "alternativeReturnCountry" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "alternativeReturnLat" DOUBLE PRECISION;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "alternativeReturnLng" DOUBLE PRECISION;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "alternativeReturnNavigationInstructions" TEXT;

-- Rejection / exception policy fields
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "photosRequiredOnRejection" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "rejectionSignatureRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "rejectionNotes" TEXT;

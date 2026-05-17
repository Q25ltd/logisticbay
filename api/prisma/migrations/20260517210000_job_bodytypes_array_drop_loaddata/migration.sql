-- Migration: Job.bodyType String → Job.bodyTypes Json? (array), drop Job.loadData
-- 2026-05-17

-- 1. Add new bodyTypes column (JSONB array)
ALTER TABLE "Job" ADD COLUMN "bodyTypes" JSONB;

-- 2. Migrate existing single-string bodyType values to single-element arrays
--    Empty string becomes NULL; any real value becomes ["value"]
UPDATE "Job"
SET "bodyTypes" = CASE
  WHEN "bodyType" IS NULL OR "bodyType" = '' THEN NULL
  ELSE json_build_array("bodyType")::jsonb
END;

-- 3. Drop old scalar bodyType column
ALTER TABLE "Job" DROP COLUMN "bodyType";

-- 4. Drop loadData blob column (goods sub-type details live in dedicated columns going forward)
ALTER TABLE "Job" DROP COLUMN "loadData";

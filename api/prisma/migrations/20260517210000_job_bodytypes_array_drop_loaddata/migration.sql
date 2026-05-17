-- Migration: Job.bodyType String → Job.bodyTypes Json? (array), drop Job.loadData
-- IDEMPOTENT — all statements are safe to re-run on an already-migrated schema.
-- 2026-05-17

-- 1. Add bodyTypes column if it doesn't already exist
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "bodyTypes" JSONB;

-- 2. Migrate existing scalar bodyType values into single-element arrays.
--    Only runs if the bodyType column still exists (it was removed by db push
--    on some envs before migration history was established).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'Job'
          AND column_name  = 'bodyType'
    ) THEN
        UPDATE "Job"
        SET "bodyTypes" = CASE
            WHEN "bodyType" IS NULL OR "bodyType" = '' THEN NULL
            ELSE json_build_array("bodyType")::jsonb
        END
        WHERE "bodyTypes" IS NULL;
    END IF;
END $$;

-- 3. Drop old scalar bodyType column (IF EXISTS — idempotent)
ALTER TABLE "Job" DROP COLUMN IF EXISTS "bodyType";

-- 4. Drop loadData blob column (IF EXISTS — idempotent)
ALTER TABLE "Job" DROP COLUMN IF EXISTS "loadData";

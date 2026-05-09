-- Migration: Add company ticker, job sequence counters, and job reference
-- Idempotent: uses IF NOT EXISTS throughout.
-- NOTE: ticker stays nullable at DB level here.
-- Existing companies are backfilled with a safe temp ticker.
-- A follow-up migration will enforce NOT NULL once all rows have a value.

-- ── Company: nextJobSequence and jobSequenceYear ──────────────────────────────

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "nextJobSequence" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "jobSequenceYear" INTEGER NOT NULL DEFAULT 2026;

-- ── Company: backfill ticker for existing companies ───────────────────────────
-- ticker column already exists as nullable TEXT UNIQUE.
-- Generate a safe unique temp ticker from the company slug for any NULL rows.

DO $$
DECLARE
  rec     RECORD;
  base_t  TEXT;
  cand    TEXT;
  suffix  INT;
BEGIN
  FOR rec IN SELECT id, slug FROM "Company" WHERE ticker IS NULL LOOP
    base_t := UPPER(REGEXP_REPLACE(rec.slug, '[^A-Za-z]', '', 'g'));
    base_t := SUBSTRING(base_t, 1, 4);
    IF LENGTH(base_t) < 2 THEN
      base_t := 'CO';
    END IF;

    cand   := base_t;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM "Company" WHERE ticker = cand) LOOP
      cand   := SUBSTRING(base_t, 1, 3) || suffix::TEXT;
      suffix := suffix + 1;
    END LOOP;

    UPDATE "Company" SET ticker = cand WHERE id = rec.id;
  END LOOP;
END $$;

-- ── PlannedJob: jobReference ──────────────────────────────────────────────────

ALTER TABLE "PlannedJob"
  ADD COLUMN IF NOT EXISTS "jobReference" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'PlannedJob_companyId_jobReference_key'
  ) THEN
    CREATE UNIQUE INDEX "PlannedJob_companyId_jobReference_key"
      ON "PlannedJob"("companyId", "jobReference")
      WHERE "jobReference" IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'PlannedJob_companyId_jobReference_idx'
  ) THEN
    CREATE INDEX "PlannedJob_companyId_jobReference_idx"
      ON "PlannedJob"("companyId", "jobReference");
  END IF;
END $$;

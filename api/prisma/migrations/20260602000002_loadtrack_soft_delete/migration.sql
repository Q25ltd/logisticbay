-- TASK 4.3: add deletedAt to LoadTrack for soft-delete support.
-- Additive step — no existing data changed.
-- Fixes C.6 (three soft-delete conventions) and B.4 (partial — custody history preserved).

ALTER TABLE "LoadTrack" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "LoadTrack_deletedAt_idx" ON "LoadTrack"("deletedAt");

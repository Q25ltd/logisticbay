-- Drop Job.plannedDate column (E.2 decision, 2026-05-31 Phase 1).
-- The field was removed from all planner-facing UI in session 2026-05-28b.
-- Date is now derived exclusively from the first collection stop's timeWindowStart.
-- S2 gate: confirmed by user "planned date delete not necessary anymore".
-- All code reads/writes migrated in cleanup/discovered-planned-date-drop.

DROP INDEX IF EXISTS "Job_companyId_plannedDate_idx";
ALTER TABLE "Job" DROP COLUMN IF EXISTS "plannedDate";

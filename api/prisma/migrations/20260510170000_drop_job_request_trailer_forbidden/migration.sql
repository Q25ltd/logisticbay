-- Remove trailerTypesForbidden from JobRequest — not part of the intake system
ALTER TABLE "JobRequest" DROP COLUMN IF EXISTS "trailerTypesForbidden";

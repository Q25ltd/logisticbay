-- Add lengthRestriction column to JobPart
-- Previously collected by both forms but never stored (no DB column existed).
-- Now canonical: matches heightRestriction/weightRestriction pattern on the same model.
-- Uses IF NOT EXISTS: column may already exist due to prior db push / schema sync drift.
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "lengthRestriction" TEXT NOT NULL DEFAULT '';

-- Add lengthRestriction column to JobPart
-- Previously collected by both forms but never stored (no DB column existed).
-- Now canonical: matches heightRestriction/weightRestriction pattern on the same model.
ALTER TABLE "JobPart" ADD COLUMN "lengthRestriction" TEXT NOT NULL DEFAULT '';

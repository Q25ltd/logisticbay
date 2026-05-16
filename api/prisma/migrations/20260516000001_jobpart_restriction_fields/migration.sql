-- Add missing restriction fields to JobPart (were in schema but omitted from phase1 migration)
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "heightRestriction" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "weightRestriction" TEXT NOT NULL DEFAULT '';

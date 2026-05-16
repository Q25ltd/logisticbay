-- Add missing restriction fields to JobPart (were in schema but omitted from phase1 migration)
ALTER TABLE "JobPart" ADD COLUMN "heightRestriction" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobPart" ADD COLUMN "weightRestriction" TEXT NOT NULL DEFAULT '';

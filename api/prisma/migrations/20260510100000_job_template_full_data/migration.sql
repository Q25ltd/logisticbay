-- Add defaultJobData JSON column to JobTemplate for full non-variable template storage
ALTER TABLE "JobTemplate" ADD COLUMN IF NOT EXISTS "defaultJobData" JSONB;

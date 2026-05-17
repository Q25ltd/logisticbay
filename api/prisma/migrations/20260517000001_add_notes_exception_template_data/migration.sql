-- Add notesData and exceptionPolicyData blobs to PlannedJob
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "notesData" JSONB;
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "exceptionPolicyData" JSONB;

-- Add templateData blob to ClientRequestLink for public form pre-fill
ALTER TABLE "ClientRequestLink" ADD COLUMN IF NOT EXISTS "templateData" JSONB;

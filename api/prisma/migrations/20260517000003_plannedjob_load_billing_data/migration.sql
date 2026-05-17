-- AddColumn: loadData and billingData to PlannedJob
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "loadData" JSONB;
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "billingData" JSONB;

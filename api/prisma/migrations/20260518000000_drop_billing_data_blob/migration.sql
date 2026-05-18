-- Drop billingData JSON blob from Job.
-- declaredGoodsValue and billingReference are already flat columns on Job.
ALTER TABLE "Job" DROP COLUMN IF EXISTS "billingData";

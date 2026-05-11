-- Add exceptionPolicyData JSON blob to JobRequest for rejection/return policy captured on public intake form.
ALTER TABLE "JobRequest"
  ADD COLUMN IF NOT EXISTS "exceptionPolicyData" JSONB NOT NULL DEFAULT '{}';

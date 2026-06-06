-- Add ShiftSubmitJob outbox table for async shift PDF/email/working-time processing.
-- Fixes B.1: replaces setImmediate (lost on Railway redeploy) with a durable outbox.

CREATE TABLE "ShiftSubmitJob" (
  "id"            SERIAL PRIMARY KEY,
  "shiftId"       INTEGER NOT NULL,
  "companyId"     INTEGER NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'pending',
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "lastError"     TEXT,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShiftSubmitJob_shiftId_fkey"   FOREIGN KEY ("shiftId")   REFERENCES "Shift"("id"),
  CONSTRAINT "ShiftSubmitJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id")
);

CREATE INDEX "ShiftSubmitJob_status_nextAttemptAt_idx" ON "ShiftSubmitJob"("status", "nextAttemptAt");
CREATE INDEX "ShiftSubmitJob_companyId_shiftId_idx"    ON "ShiftSubmitJob"("companyId", "shiftId");

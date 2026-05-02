-- Add sync fields to JobExecutionEvent
ALTER TABLE "JobExecutionEvent"
  ADD COLUMN "clientEventId"    TEXT,
  ADD COLUMN "clientTimestamp"  TIMESTAMP(3),
  ADD COLUMN "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "appVersion"       TEXT,
  ADD COLUMN "needsReview"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reviewReason"     TEXT;

-- Backfill existing rows so we can add NOT NULL constraint
UPDATE "JobExecutionEvent"
  SET "clientEventId"   = 'server-legacy-' || id::text,
      "clientTimestamp" = "createdAt"
  WHERE "clientEventId" IS NULL;

-- Now enforce NOT NULL
ALTER TABLE "JobExecutionEvent"
  ALTER COLUMN "clientEventId"   SET NOT NULL,
  ALTER COLUMN "clientTimestamp" SET NOT NULL;

-- Add tenant-scoped unique constraint
CREATE UNIQUE INDEX "JobExecutionEvent_companyId_clientEventId_key"
  ON "JobExecutionEvent"("companyId", "clientEventId");

-- Create SyncEventLog audit table
CREATE TABLE "SyncEventLog" (
  "id"            SERIAL NOT NULL,
  "companyId"     INTEGER NOT NULL,
  "clientEventId" TEXT NOT NULL,
  "eventType"     TEXT NOT NULL,
  "status"        TEXT NOT NULL,
  "failureReason" TEXT,
  "rawPayload"    JSONB NOT NULL,
  "receivedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncEventLog_pkey" PRIMARY KEY ("id")
);

-- Add indexes on SyncEventLog
CREATE INDEX "SyncEventLog_companyId_clientEventId_idx"
  ON "SyncEventLog"("companyId", "clientEventId");

CREATE INDEX "SyncEventLog_receivedAt_idx"
  ON "SyncEventLog"("receivedAt");

-- Add FK from SyncEventLog to Company
ALTER TABLE "SyncEventLog"
  ADD CONSTRAINT "SyncEventLog_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

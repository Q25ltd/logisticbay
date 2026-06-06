-- TASK 4.1 Migration A — add actorUserId and driverProfileId to JobExecutionEvent.
-- Both nullable. Existing rows keep driverId until backfill + Migration B.
-- This is the additive step — no data changed, no destructive SQL.

ALTER TABLE "JobExecutionEvent" ADD COLUMN "actorUserId"     INTEGER;
ALTER TABLE "JobExecutionEvent" ADD COLUMN "driverProfileId" INTEGER;

-- Foreign key constraints (nullable — no cascade needed on nullable FK)
ALTER TABLE "JobExecutionEvent"
  ADD CONSTRAINT "JobExecutionEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JobExecutionEvent"
  ADD CONSTRAINT "JobExecutionEvent_driverProfileId_fkey"
  FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

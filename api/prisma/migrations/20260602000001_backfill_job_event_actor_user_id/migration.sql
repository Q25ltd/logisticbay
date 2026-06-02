-- TASK 4.1 Migration B — backfill actorUserId and driverProfileId.
-- S8 gate: 3 rows in production (confirmed 2026-06-02) — safe to run.
--
-- actorUserId = driverId (User.id) for all historical events.
-- driverProfileId = the DriverProfile.id for that user in the same company.
-- Both columns remain nullable until Migration C (NOT NULL + drop driverId).

UPDATE "JobExecutionEvent" e
SET "actorUserId" = e."driverId"
WHERE e."actorUserId" IS NULL;

UPDATE "JobExecutionEvent" e
SET "driverProfileId" = dp."id"
FROM "DriverProfile" dp
WHERE dp."userId"     = e."driverId"
  AND dp."companyId"  = e."companyId"
  AND e."driverProfileId" IS NULL;

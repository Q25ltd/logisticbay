-- RunWaypoint: non-job stops on a run (depot start, yard pickup, hub drop, return to base)
CREATE TABLE "RunWaypoint" (
  "id"             SERIAL PRIMARY KEY,
  "companyId"      INTEGER NOT NULL,
  "runId"          INTEGER NOT NULL,
  "sequenceNumber" INTEGER NOT NULL DEFAULT 0,
  "waypointType"   TEXT NOT NULL DEFAULT 'custom',
  "locationId"     INTEGER,
  "locationText"   TEXT,
  "postcode"       TEXT,
  "lat"            DOUBLE PRECISION,
  "lng"            DOUBLE PRECISION,
  "scheduledTime"  TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "RunWaypoint"
  ADD CONSTRAINT "RunWaypoint_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RunWaypoint"
  ADD CONSTRAINT "RunWaypoint_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "SavedLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "RunWaypoint_runId_idx"      ON "RunWaypoint"("runId");
CREATE INDEX "RunWaypoint_companyId_idx"  ON "RunWaypoint"("companyId");

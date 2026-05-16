-- Phase 1 migration: Add Run/RunAssignment/LoadTrack models + rename JobStop → JobPart
-- + expand PlannedJob, JobExecutionEvent, FleetTrailer with new fields
-- + add run sequence counters to Company
--
-- SAFE: additive only. No columns removed. Mobile continues to work unchanged.
-- JobStop table is renamed to JobPart — all existing data preserved.

-- ── 1. Company — run sequence counters ───────────────────────────────────────

ALTER TABLE "Company" ADD COLUMN "nextRunSequence" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Company" ADD COLUMN "runSequenceYear" INTEGER NOT NULL DEFAULT 2026;

-- ── 2. Rename JobStop → JobPart ──────────────────────────────────────────────

ALTER TABLE "JobStop" RENAME TO "JobPart";

-- Rename all indexes associated with the renamed table
-- (Postgres doesn't auto-rename indexes on table rename)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'JobStop_jobId_sequenceNumber_key') THEN
    ALTER INDEX "JobStop_jobId_sequenceNumber_key" RENAME TO "JobPart_jobId_sequenceNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'JobStop_companyId_jobId_idx') THEN
    ALTER INDEX "JobStop_companyId_jobId_idx" RENAME TO "JobPart_companyId_jobId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'JobStop_companyId_savedLocationId_idx') THEN
    ALTER INDEX "JobStop_companyId_savedLocationId_idx" RENAME TO "JobPart_companyId_savedLocationId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'JobStop_pkey') THEN
    ALTER INDEX "JobStop_pkey" RENAME TO "JobPart_pkey";
  END IF;
END $$;

-- ── 3. JobPart — new fields ──────────────────────────────────────────────────

ALTER TABLE "JobPart" ADD COLUMN "coordinateVerified"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobPart" ADD COLUMN "quantityRequired"       DECIMAL(65,30);
ALTER TABLE "JobPart" ADD COLUMN "quantityUnit"           TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobPart" ADD COLUMN "quantityCollected"      DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "JobPart" ADD COLUMN "quantityDelivered"      DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "JobPart" ADD COLUMN "proofRequirements"      JSONB;
ALTER TABLE "JobPart" ADD COLUMN "accessRequirements"     JSONB;
ALTER TABLE "JobPart" ADD COLUMN "handlingMethods"        JSONB;
ALTER TABLE "JobPart" ADD COLUMN "stopGoodsType"          TEXT;
ALTER TABLE "JobPart" ADD COLUMN "stopWeight"             DECIMAL(65,30);
ALTER TABLE "JobPart" ADD COLUMN "temperatureControlled"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobPart" ADD COLUMN "temperatureRange"       TEXT;
ALTER TABLE "JobPart" ADD COLUMN "hazardous"              BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobPart" ADD COLUMN "hazardClass"            TEXT;
ALTER TABLE "JobPart" ADD COLUMN "oversized"              BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobPart" ADD COLUMN "stopNotes"              TEXT NOT NULL DEFAULT '';
-- navigationInstructions already exists from a prior migration — no ADD COLUMN needed

-- ── 4. PlannedJob — override close + vehicle/trailer requirement sources ─────

ALTER TABLE "PlannedJob" ADD COLUMN "overrideClosed"            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlannedJob" ADD COLUMN "overrideReason"            TEXT;
ALTER TABLE "PlannedJob" ADD COLUMN "overrideNotes"             TEXT;
ALTER TABLE "PlannedJob" ADD COLUMN "overrideQuantityDelivered" DECIMAL(65,30);
ALTER TABLE "PlannedJob" ADD COLUMN "overrideQuantityShortfall" DECIMAL(65,30);
ALTER TABLE "PlannedJob" ADD COLUMN "closedAt"                  TIMESTAMP(3);
ALTER TABLE "PlannedJob" ADD COLUMN "closedBy"                  INTEGER;
ALTER TABLE "PlannedJob" ADD COLUMN "vehicleRequirementSource"  TEXT NOT NULL DEFAULT 'not_specified';
ALTER TABLE "PlannedJob" ADD COLUMN "trailerRequirementSource"  TEXT NOT NULL DEFAULT 'not_specified';
ALTER TABLE "PlannedJob" ADD COLUMN "customerVehicleType"       TEXT;
ALTER TABLE "PlannedJob" ADD COLUMN "customerTrailerTypes"      JSONB;
ALTER TABLE "PlannedJob" ADD COLUMN "derivedVehicleType"        TEXT;
ALTER TABLE "PlannedJob" ADD COLUMN "derivedTrailerTypes"       JSONB;
ALTER TABLE "PlannedJob" ADD COLUMN "finalVehicleType"          TEXT;
ALTER TABLE "PlannedJob" ADD COLUMN "finalTrailerTypes"         JSONB;

-- ── 5. JobExecutionEvent — links to new models ───────────────────────────────

ALTER TABLE "JobExecutionEvent" ADD COLUMN "runId"             INTEGER;
ALTER TABLE "JobExecutionEvent" ADD COLUMN "runAssignmentId"   INTEGER;
ALTER TABLE "JobExecutionEvent" ADD COLUMN "jobPartId"         INTEGER;
ALTER TABLE "JobExecutionEvent" ADD COLUMN "quantityConfirmed" DECIMAL(65,30);
ALTER TABLE "JobExecutionEvent" ADD COLUMN "fromCustody"       TEXT;
ALTER TABLE "JobExecutionEvent" ADD COLUMN "toCustody"         TEXT;

CREATE INDEX "JobExecutionEvent_companyId_runId_idx" ON "JobExecutionEvent"("companyId", "runId");

-- ── 6. FleetTrailer — standing load tracking ─────────────────────────────────

ALTER TABLE "FleetTrailer" ADD COLUMN "loadStatus"    TEXT NOT NULL DEFAULT 'empty';
ALTER TABLE "FleetTrailer" ADD COLUMN "standingNote"  TEXT;
ALTER TABLE "FleetTrailer" ADD COLUMN "standingRunId" INTEGER;

-- ── 7. New model: Run ────────────────────────────────────────────────────────

CREATE TABLE "Run" (
    "id"                          SERIAL PRIMARY KEY,
    "companyId"                   INTEGER NOT NULL,
    "runReference"                TEXT NOT NULL,
    "status"                      TEXT NOT NULL DEFAULT 'draft',
    "assignedDriverId"            INTEGER,
    "assignedTruckId"             INTEGER,
    "assignedTrailerId"           INTEGER,
    "plannedDate"                 TIMESTAMP(3),
    "estimatedStartTime"          TEXT,
    "estimatedEndTime"            TEXT,
    "actualStartTime"             TIMESTAMP(3),
    "actualEndTime"               TIMESTAMP(3),
    "publishedToDriver"           BOOLEAN NOT NULL DEFAULT false,
    "plannerNotes"                TEXT,
    "endInstruction"              TEXT,
    "endInstructionNote"          TEXT,
    "returnToBase"                BOOLEAN NOT NULL DEFAULT false,
    "returnToBaseNote"            TEXT,
    "returningAt"                 TIMESTAMP(3),
    "arrivedBaseAt"               TIMESTAMP(3),
    "requiredTrailerType"         TEXT,
    "requiredEquipment"           JSONB,
    "maxLoadWeight"               DECIMAL(65,30),
    "hasHazardous"                BOOLEAN NOT NULL DEFAULT false,
    "hasTemperatureLoad"          BOOLEAN NOT NULL DEFAULT false,
    "hasOversized"                BOOLEAN NOT NULL DEFAULT false,
    "trailerCompatible"           BOOLEAN NOT NULL DEFAULT true,
    "vehicleCompatible"           BOOLEAN NOT NULL DEFAULT true,
    "compatibilityOverridden"     BOOLEAN NOT NULL DEFAULT false,
    "compatibilityOverrideReason" TEXT,
    "createdBy"                   INTEGER NOT NULL,
    "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Run" ADD CONSTRAINT "Run_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id");

ALTER TABLE "Run" ADD CONSTRAINT "Run_assignedDriverId_fkey"
    FOREIGN KEY ("assignedDriverId") REFERENCES "DriverProfile"("id");

ALTER TABLE "Run" ADD CONSTRAINT "Run_companyId_runReference_key"
    UNIQUE ("companyId", "runReference");

CREATE INDEX "Run_companyId_plannedDate_idx"      ON "Run"("companyId", "plannedDate");
CREATE INDEX "Run_companyId_status_idx"           ON "Run"("companyId", "status");
CREATE INDEX "Run_companyId_assignedDriverId_idx" ON "Run"("companyId", "assignedDriverId");

-- ── 8. New model: RunAssignment ──────────────────────────────────────────────

CREATE TABLE "RunAssignment" (
    "id"               SERIAL PRIMARY KEY,
    "companyId"        INTEGER NOT NULL,
    "runId"            INTEGER NOT NULL,
    "jobPartId"        INTEGER NOT NULL,
    "jobId"            INTEGER NOT NULL,
    "sequenceNumber"   INTEGER NOT NULL,
    "quantityAssigned" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "quantityUnit"     TEXT NOT NULL DEFAULT '',
    "status"           TEXT NOT NULL DEFAULT 'pending',
    "addedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy"          INTEGER NOT NULL,
    "removedAt"        TIMESTAMP(3),
    "removedBy"        INTEGER,
    "removalReason"    TEXT,
    "notes"            TEXT
);

ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id");

ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "Run"("id");

ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_jobPartId_fkey"
    FOREIGN KEY ("jobPartId") REFERENCES "JobPart"("id");

ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "PlannedJob"("id");

ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_runId_sequenceNumber_key"
    UNIQUE ("runId", "sequenceNumber");

CREATE INDEX "RunAssignment_companyId_runId_idx"     ON "RunAssignment"("companyId", "runId");
CREATE INDEX "RunAssignment_companyId_jobPartId_idx" ON "RunAssignment"("companyId", "jobPartId");
CREATE INDEX "RunAssignment_companyId_jobId_idx"     ON "RunAssignment"("companyId", "jobId");

-- ── 9. New model: LoadTrack (append-only — never update or delete) ────────────

CREATE TABLE "LoadTrack" (
    "id"               SERIAL PRIMARY KEY,
    "companyId"        INTEGER NOT NULL,
    "jobId"            INTEGER NOT NULL,
    "jobPartId"        INTEGER NOT NULL,
    "runId"            INTEGER,
    "runAssignmentId"  INTEGER,
    "eventId"          INTEGER NOT NULL,
    "transactionType"  TEXT NOT NULL,
    "quantity"         DECIMAL(65,30) NOT NULL,
    "unit"             TEXT NOT NULL DEFAULT '',
    "fromCustody"      TEXT NOT NULL,
    "toCustody"        TEXT NOT NULL,
    "driverId"         INTEGER,
    "trailerId"        TEXT NOT NULL DEFAULT '',
    "timestamp"        TIMESTAMP(3) NOT NULL,
    "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gpsLat"           DOUBLE PRECISION,
    "gpsLng"           DOUBLE PRECISION,
    "notes"            TEXT
);

ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id");

ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "PlannedJob"("id");

ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_jobPartId_fkey"
    FOREIGN KEY ("jobPartId") REFERENCES "JobPart"("id");

ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "Run"("id");

ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_runAssignmentId_fkey"
    FOREIGN KEY ("runAssignmentId") REFERENCES "RunAssignment"("id");

ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "JobExecutionEvent"("id");

CREATE INDEX "LoadTrack_companyId_jobId_idx"     ON "LoadTrack"("companyId", "jobId");
CREATE INDEX "LoadTrack_companyId_jobPartId_idx" ON "LoadTrack"("companyId", "jobPartId");
CREATE INDEX "LoadTrack_companyId_runId_idx"     ON "LoadTrack"("companyId", "runId");
CREATE INDEX "LoadTrack_companyId_timestamp_idx" ON "LoadTrack"("companyId", "timestamp");

-- ── 10. Now wire the FK from JobExecutionEvent → Run ─────────────────────────
--  (Run table must exist first — done above)

ALTER TABLE "JobExecutionEvent" ADD CONSTRAINT "JobExecutionEvent_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "Run"("id");

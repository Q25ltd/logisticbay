-- Phase 1 migration: Add Run/RunAssignment/LoadTrack models + rename JobStop → JobPart
-- + expand PlannedJob, JobExecutionEvent, FleetTrailer with new fields
-- + add run sequence counters to Company
--
-- IDEMPOTENT: all ADD COLUMN / CREATE TABLE / CREATE INDEX statements use IF NOT EXISTS.
-- Safe to re-run if a previous apply partially succeeded (e.g. after prisma db push).

-- ── 1. Company — run sequence counters ───────────────────────────────────────

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "nextRunSequence" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "runSequenceYear" INTEGER NOT NULL DEFAULT 2026;

-- ── 2. Rename JobStop → JobPart ──────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'JobStop' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'JobPart' AND table_schema = 'public')
  THEN
    ALTER TABLE "JobStop" RENAME TO "JobPart";
  END IF;
END $$;

-- Rename indexes only if they still have the old name
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

ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "coordinateVerified"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "quantityRequired"       DECIMAL(65,30);
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "quantityUnit"           TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "quantityCollected"      DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "quantityDelivered"      DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "proofRequirements"      JSONB;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "accessRequirements"     JSONB;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "handlingMethods"        JSONB;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "stopGoodsType"          TEXT;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "stopWeight"             DECIMAL(65,30);
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "temperatureControlled"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "temperatureRange"       TEXT;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "hazardous"              BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "hazardClass"            TEXT;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "oversized"              BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "stopNotes"              TEXT NOT NULL DEFAULT '';
-- navigationInstructions already exists from a prior migration — no ADD COLUMN needed

-- ── 4. PlannedJob — override close + vehicle/trailer requirement sources ─────

ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "overrideClosed"            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "overrideReason"            TEXT;
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "overrideNotes"             TEXT;
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "overrideQuantityDelivered" DECIMAL(65,30);
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "overrideQuantityShortfall" DECIMAL(65,30);
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "closedAt"                  TIMESTAMP(3);
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "closedBy"                  INTEGER;
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "vehicleRequirementSource"  TEXT NOT NULL DEFAULT 'not_specified';
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "trailerRequirementSource"  TEXT NOT NULL DEFAULT 'not_specified';
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "customerVehicleType"       TEXT;
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "customerTrailerTypes"      JSONB;
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "derivedVehicleType"        TEXT;
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "derivedTrailerTypes"       JSONB;
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "finalVehicleType"          TEXT;
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "finalTrailerTypes"         JSONB;

-- ── 5. JobExecutionEvent — links to new models ───────────────────────────────

ALTER TABLE "JobExecutionEvent" ADD COLUMN IF NOT EXISTS "runId"             INTEGER;
ALTER TABLE "JobExecutionEvent" ADD COLUMN IF NOT EXISTS "runAssignmentId"   INTEGER;
ALTER TABLE "JobExecutionEvent" ADD COLUMN IF NOT EXISTS "jobPartId"         INTEGER;
ALTER TABLE "JobExecutionEvent" ADD COLUMN IF NOT EXISTS "quantityConfirmed" DECIMAL(65,30);
ALTER TABLE "JobExecutionEvent" ADD COLUMN IF NOT EXISTS "fromCustody"       TEXT;
ALTER TABLE "JobExecutionEvent" ADD COLUMN IF NOT EXISTS "toCustody"         TEXT;

CREATE INDEX IF NOT EXISTS "JobExecutionEvent_companyId_runId_idx" ON "JobExecutionEvent"("companyId", "runId");

-- ── 6. FleetTrailer — standing load tracking ─────────────────────────────────

ALTER TABLE "FleetTrailer" ADD COLUMN IF NOT EXISTS "loadStatus"    TEXT NOT NULL DEFAULT 'empty';
ALTER TABLE "FleetTrailer" ADD COLUMN IF NOT EXISTS "standingNote"  TEXT;
ALTER TABLE "FleetTrailer" ADD COLUMN IF NOT EXISTS "standingRunId" INTEGER;

-- ── 7. New model: Run ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Run" (
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Run_companyId_fkey') THEN
    ALTER TABLE "Run" ADD CONSTRAINT "Run_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Run_assignedDriverId_fkey') THEN
    ALTER TABLE "Run" ADD CONSTRAINT "Run_assignedDriverId_fkey"
        FOREIGN KEY ("assignedDriverId") REFERENCES "DriverProfile"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Run_companyId_runReference_key')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Run_companyId_runReference_key')
  THEN
    ALTER TABLE "Run" ADD CONSTRAINT "Run_companyId_runReference_key"
        UNIQUE ("companyId", "runReference");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Run_companyId_plannedDate_idx"      ON "Run"("companyId", "plannedDate");
CREATE INDEX IF NOT EXISTS "Run_companyId_status_idx"           ON "Run"("companyId", "status");
CREATE INDEX IF NOT EXISTS "Run_companyId_assignedDriverId_idx" ON "Run"("companyId", "assignedDriverId");

-- ── 8. New model: RunAssignment ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "RunAssignment" (
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RunAssignment_companyId_fkey') THEN
    ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RunAssignment_runId_fkey') THEN
    ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_runId_fkey"
        FOREIGN KEY ("runId") REFERENCES "Run"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RunAssignment_jobPartId_fkey') THEN
    ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_jobPartId_fkey"
        FOREIGN KEY ("jobPartId") REFERENCES "JobPart"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RunAssignment_jobId_fkey') THEN
    ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_jobId_fkey"
        FOREIGN KEY ("jobId") REFERENCES "PlannedJob"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RunAssignment_runId_sequenceNumber_key')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'RunAssignment_runId_sequenceNumber_key')
  THEN
    ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_runId_sequenceNumber_key"
        UNIQUE ("runId", "sequenceNumber");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "RunAssignment_companyId_runId_idx"     ON "RunAssignment"("companyId", "runId");
CREATE INDEX IF NOT EXISTS "RunAssignment_companyId_jobPartId_idx" ON "RunAssignment"("companyId", "jobPartId");
CREATE INDEX IF NOT EXISTS "RunAssignment_companyId_jobId_idx"     ON "RunAssignment"("companyId", "jobId");

-- ── 9. New model: LoadTrack (append-only — never update or delete) ────────────

CREATE TABLE IF NOT EXISTS "LoadTrack" (
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoadTrack_companyId_fkey') THEN
    ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoadTrack_jobId_fkey') THEN
    ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_jobId_fkey"
        FOREIGN KEY ("jobId") REFERENCES "PlannedJob"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoadTrack_jobPartId_fkey') THEN
    ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_jobPartId_fkey"
        FOREIGN KEY ("jobPartId") REFERENCES "JobPart"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoadTrack_runId_fkey') THEN
    ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_runId_fkey"
        FOREIGN KEY ("runId") REFERENCES "Run"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoadTrack_runAssignmentId_fkey') THEN
    ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_runAssignmentId_fkey"
        FOREIGN KEY ("runAssignmentId") REFERENCES "RunAssignment"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoadTrack_eventId_fkey') THEN
    ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "JobExecutionEvent"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LoadTrack_companyId_jobId_idx"     ON "LoadTrack"("companyId", "jobId");
CREATE INDEX IF NOT EXISTS "LoadTrack_companyId_jobPartId_idx" ON "LoadTrack"("companyId", "jobPartId");
CREATE INDEX IF NOT EXISTS "LoadTrack_companyId_runId_idx"     ON "LoadTrack"("companyId", "runId");
CREATE INDEX IF NOT EXISTS "LoadTrack_companyId_timestamp_idx" ON "LoadTrack"("companyId", "timestamp");

-- ── 10. Wire FK from JobExecutionEvent → Run ─────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobExecutionEvent_runId_fkey') THEN
    ALTER TABLE "JobExecutionEvent" ADD CONSTRAINT "JobExecutionEvent_runId_fkey"
        FOREIGN KEY ("runId") REFERENCES "Run"("id");
  END IF;
END $$;

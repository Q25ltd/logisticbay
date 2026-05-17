-- ────────────────────────────────────────────────────────────────────────────
-- Job model redesign  (IDEMPOTENT — safe to re-run after partial apply)
--
-- Why idempotent? A prisma db push ran before migration history was established,
-- creating the Job table directly from schema.prisma. This migration is now
-- re-run via `migrate resolve --rolled-back` + `migrate deploy`, so every
-- statement must be a safe no-op when the target already exists.
-- ────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Drop staging table and load details ───────────────────────────────
DROP TABLE IF EXISTS "JobRequest" CASCADE;
DROP TABLE IF EXISTS "LoadDetails" CASCADE;

-- ── Step 2: Truncate child tables (test data only — confirmed safe) ───────────
-- TRUNCATE with CASCADE is safe because the referenced Job table will exist after
-- Step 4. Orphaned rows are cleared here so FK constraints can be (re-)added.

TRUNCATE TABLE "LoadTrack"          RESTART IDENTITY CASCADE;
TRUNCATE TABLE "RunAssignment"      RESTART IDENTITY CASCADE;
TRUNCATE TABLE "JobExecutionEvent"  RESTART IDENTITY CASCADE;
TRUNCATE TABLE "JobAudit"           RESTART IDENTITY CASCADE;
TRUNCATE TABLE "JobPart"            RESTART IDENTITY CASCADE;

-- ── Step 3: Drop PlannedJob ───────────────────────────────────────────────────
DROP TABLE IF EXISTS "PlannedJob" CASCADE;

-- ── Step 4: Create Job (IF NOT EXISTS — idempotent) ───────────────────────────

CREATE TABLE IF NOT EXISTS "Job" (
    "id"              SERIAL,

    -- identity
    "companyId"       INTEGER NOT NULL,
    "customerId"      INTEGER,
    "templateId"      INTEGER,
    "createdByUserId" INTEGER NOT NULL,
    "parentJobId"     INTEGER,
    "jobReference"    TEXT,
    "status"          TEXT NOT NULL DEFAULT 'draft',
    "priority"        TEXT NOT NULL DEFAULT 'normal',
    "jobTitle"        TEXT,

    -- scheduling
    "plannedDate"      TIMESTAMP(3),
    "serviceType"      TEXT NOT NULL DEFAULT '',
    "jobType"          TEXT NOT NULL DEFAULT '',
    "canSplitShipment" TEXT NOT NULL DEFAULT 'must_stay_together',

    -- customer
    "customerName"        TEXT NOT NULL DEFAULT '',
    "customerRef"         TEXT NOT NULL DEFAULT '',
    "purchaseOrderNumber" TEXT NOT NULL DEFAULT '',
    "billingReference"    TEXT,
    "declaredGoodsValue"  TEXT,
    "billingNotes"        TEXT NOT NULL DEFAULT '',
    "billingData"         JSONB,
    "bookingContactName"  TEXT NOT NULL DEFAULT '',
    "bookingContactPhone" TEXT NOT NULL DEFAULT '',
    "bookingContactEmail" TEXT NOT NULL DEFAULT '',
    "custRefRequired"     BOOLEAN NOT NULL DEFAULT false,
    "poRequired"          BOOLEAN NOT NULL DEFAULT false,

    -- planner
    "plannerNotes"       TEXT NOT NULL DEFAULT '',
    "internalNotes"      TEXT NOT NULL DEFAULT '',
    "driverNoteChips"    JSONB,
    "driverVisibleNotes" TEXT,
    "safetyInstructions" TEXT,

    -- load (merged from LoadDetails)
    "goodsType"            TEXT NOT NULL DEFAULT '',
    "goodsDescription"     TEXT NOT NULL DEFAULT '',
    "quantity"             DOUBLE PRECISION,
    "quantityUnit"         TEXT NOT NULL DEFAULT '',
    "weight"               DOUBLE PRECISION,
    "volume"               DOUBLE PRECISION,
    "dimensions"           TEXT NOT NULL DEFAULT '',
    "fragile"              BOOLEAN NOT NULL DEFAULT false,
    "stackable"            BOOLEAN NOT NULL DEFAULT false,
    "tempControlled"       BOOLEAN NOT NULL DEFAULT false,
    "tempRange"            TEXT NOT NULL DEFAULT '',
    "hazardClass"          TEXT NOT NULL DEFAULT '',
    "photosRequired"       BOOLEAN NOT NULL DEFAULT false,
    "weighbridgeRequired"  BOOLEAN NOT NULL DEFAULT false,
    "securingRequirements" JSONB,
    "specialRequirements"  JSONB,

    -- vehicle requirements
    "vehicleCategory"    TEXT NOT NULL DEFAULT '',
    "bodyTypes"          JSONB,
    "minGvwClass"        TEXT NOT NULL DEFAULT '',
    "equipment"          JSONB,
    "trailersAllowed"    JSONB,
    "vehicleAccessNotes" TEXT NOT NULL DEFAULT '',

    -- exception policy
    "failureAction"                 TEXT NOT NULL DEFAULT 'call_assistance',
    "assistancePhone"               TEXT NOT NULL DEFAULT '',
    "assistanceNote"                TEXT NOT NULL DEFAULT '',
    "approvalContactName"           TEXT,
    "approvalContactPhone"          TEXT,
    "alternativeReturnAddress"      TEXT,
    "alternativeReturnPostcode"     TEXT,
    "alternativeReturnContactName"  TEXT,
    "alternativeReturnContactPhone" TEXT,

    -- proof / quality
    "requirePOD"       BOOLEAN NOT NULL DEFAULT false,
    "validationStatus" TEXT NOT NULL DEFAULT 'draft',
    "qualityScore"     INTEGER NOT NULL DEFAULT 0,

    -- override close
    "overrideClosed"            BOOLEAN NOT NULL DEFAULT false,
    "overrideReason"            TEXT,
    "overrideNotes"             TEXT,
    "overrideQuantityDelivered" DECIMAL(65,30),
    "overrideQuantityShortfall" DECIMAL(65,30),
    "closedAt"                  TIMESTAMP(3),
    "closedBy"                  INTEGER,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- ── Step 5: Indexes (IF NOT EXISTS — idempotent) ──────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "Job_companyId_jobReference_key" ON "Job"("companyId", "jobReference");
CREATE INDEX        IF NOT EXISTS "Job_companyId_plannedDate_idx"  ON "Job"("companyId", "plannedDate");
CREATE INDEX        IF NOT EXISTS "Job_companyId_status_idx"       ON "Job"("companyId", "status");
CREATE INDEX        IF NOT EXISTS "Job_companyId_customerId_idx"   ON "Job"("companyId", "customerId");
CREATE INDEX        IF NOT EXISTS "Job_companyId_updatedAt_idx"    ON "Job"("companyId", "updatedAt");
CREATE INDEX        IF NOT EXISTS "Job_companyId_jobReference_idx" ON "Job"("companyId", "jobReference");

-- ── Step 6: FK constraints ON Job — wrapped in DO blocks (idempotent) ─────────

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_companyId_fkey') THEN
        ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_customerId_fkey') THEN
        ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey"
            FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_templateId_fkey') THEN
        ALTER TABLE "Job" ADD CONSTRAINT "Job_templateId_fkey"
            FOREIGN KEY ("templateId") REFERENCES "JobTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_createdByUserId_fkey') THEN
        ALTER TABLE "Job" ADD CONSTRAINT "Job_createdByUserId_fkey"
            FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_parentJobId_fkey') THEN
        ALTER TABLE "Job" ADD CONSTRAINT "Job_parentJobId_fkey"
            FOREIGN KEY ("parentJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ── Step 7: FK constraints FROM child tables → Job (idempotent) ───────────────

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobPart_jobId_fkey') THEN
        ALTER TABLE "JobPart" ADD CONSTRAINT "JobPart_jobId_fkey"
            FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobAudit_jobId_fkey') THEN
        ALTER TABLE "JobAudit" ADD CONSTRAINT "JobAudit_jobId_fkey"
            FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobExecutionEvent_jobId_fkey') THEN
        ALTER TABLE "JobExecutionEvent" ADD CONSTRAINT "JobExecutionEvent_jobId_fkey"
            FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RunAssignment_jobId_fkey') THEN
        ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_jobId_fkey"
            FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoadTrack_jobId_fkey') THEN
        ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_jobId_fkey"
            FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

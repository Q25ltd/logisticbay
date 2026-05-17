-- ────────────────────────────────────────────────────────────────────────────
-- Job model redesign
--
-- Changes:
--   1. Drop JobRequest staging table (PRF will write directly to Job)
--   2. Drop LoadDetails (fields merged into Job)
--   3. Rename PlannedJob → Job + clean columns:
--        - Remove 12 redundant vehicle-requirement fields (15 → 5 clean fields)
--        - Flatten notesData / billingData / exceptionPolicyData blobs into columns
--        - Add goodsType, goodsDescription, weight, volume, dimensions,
--          fragile, stackable, tempControlled, tempRange, hazardClass,
--          photosRequired, weighbridgeRequired, securingRequirements,
--          specialRequirements from LoadDetails
--        - Add billingReference, declaredGoodsValue from billingData blob
--        - Add driverNoteChips, driverVisibleNotes, safetyInstructions from notesData blob
--        - Add approvalContactName/Phone, alternativeReturn* from exceptionPolicyData blob
--        - Add parentJobId (nullable self-relation for job splitting)
--        - Add jobType, jobTitle
--        - Rename reqBodyCategory → vehicleCategory
--                 reqBodyType    → bodyType
--                 reqGvwMin      → minGvwClass
--                 reqEquipment   → equipment
--                 trailerTypesAllowed → trailersAllowed
--
-- All data in job-related tables is TEST DATA — confirmed safe to drop.
-- ────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Drop staging table and load details ───────────────────────────────
-- CASCADE drops their FK constraints and data automatically.

DROP TABLE IF EXISTS "JobRequest" CASCADE;
DROP TABLE IF EXISTS "LoadDetails" CASCADE;

-- ── Step 2: Truncate all child tables that reference PlannedJob ───────────────
-- Needed before we can drop PlannedJob.
-- These all contain test data only — user confirmed.

TRUNCATE TABLE "LoadTrack"          RESTART IDENTITY CASCADE;
TRUNCATE TABLE "RunAssignment"      RESTART IDENTITY CASCADE;
TRUNCATE TABLE "JobExecutionEvent"  RESTART IDENTITY CASCADE;
TRUNCATE TABLE "JobAudit"           RESTART IDENTITY CASCADE;
TRUNCATE TABLE "JobPart"            RESTART IDENTITY CASCADE;

-- ── Step 3: Drop PlannedJob ───────────────────────────────────────────────────
-- CASCADE removes all FK constraints that reference PlannedJob
-- (JobStop_jobId_fkey / JobAudit_jobId_fkey / JobExecutionEvent_jobId_fkey /
--  RunAssignment_jobId_fkey / LoadTrack_jobId_fkey).

DROP TABLE IF EXISTS "PlannedJob" CASCADE;

-- ── Step 4: Create Job ────────────────────────────────────────────────────────

CREATE TABLE "Job" (
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
    "billingData"         JSONB,       -- vatRegistered, vatNumber (kept as blob)
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
    "loadData"             JSONB,

    -- vehicle requirements (Job says what it NEEDS; system checks at assignment)
    "vehicleCategory"    TEXT NOT NULL DEFAULT '',
    "bodyType"           TEXT NOT NULL DEFAULT '',
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

-- ── Step 5: Indexes on Job ────────────────────────────────────────────────────

CREATE UNIQUE INDEX "Job_companyId_jobReference_key"    ON "Job"("companyId", "jobReference");
CREATE INDEX        "Job_companyId_plannedDate_idx"     ON "Job"("companyId", "plannedDate");
CREATE INDEX        "Job_companyId_status_idx"          ON "Job"("companyId", "status");
CREATE INDEX        "Job_companyId_customerId_idx"      ON "Job"("companyId", "customerId");
CREATE INDEX        "Job_companyId_updatedAt_idx"       ON "Job"("companyId", "updatedAt");
CREATE INDEX        "Job_companyId_jobReference_idx"    ON "Job"("companyId", "jobReference");

-- ── Step 6: FK constraints ON Job (Job → other tables) ───────────────────────

ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey"
    FOREIGN KEY ("companyId")       REFERENCES "Company"("id")     ON DELETE RESTRICT  ON UPDATE CASCADE;

ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey"
    FOREIGN KEY ("customerId")      REFERENCES "Customer"("id")    ON DELETE SET NULL  ON UPDATE CASCADE;

ALTER TABLE "Job" ADD CONSTRAINT "Job_templateId_fkey"
    FOREIGN KEY ("templateId")      REFERENCES "JobTemplate"("id") ON DELETE SET NULL  ON UPDATE CASCADE;

ALTER TABLE "Job" ADD CONSTRAINT "Job_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")        ON DELETE RESTRICT  ON UPDATE CASCADE;

ALTER TABLE "Job" ADD CONSTRAINT "Job_parentJobId_fkey"
    FOREIGN KEY ("parentJobId")     REFERENCES "Job"("id")         ON DELETE SET NULL  ON UPDATE CASCADE;

-- ── Step 7: FK constraints FROM child tables → Job ───────────────────────────

ALTER TABLE "JobPart" ADD CONSTRAINT "JobPart_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobAudit" ADD CONSTRAINT "JobAudit_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobExecutionEvent" ADD CONSTRAINT "JobExecutionEvent_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RunAssignment" ADD CONSTRAINT "RunAssignment_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LoadTrack" ADD CONSTRAINT "LoadTrack_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

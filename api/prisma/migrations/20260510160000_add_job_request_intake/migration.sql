-- Migration: add_job_request_intake
-- Adds ClientRequestLink and JobRequest models for customer intake portal

-- ClientRequestLink: permanent reusable token-based intake links
CREATE TABLE "ClientRequestLink" (
  "id"          SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL,
  "customerId"  INTEGER,
  "name"        TEXT NOT NULL,
  "tokenHash"   TEXT NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "expiresAt"   TIMESTAMP(3),
  "lastUsedAt"  TIMESTAMP(3),
  "usageCount"  INTEGER NOT NULL DEFAULT 0,
  "createdBy"   INTEGER NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientRequestLink_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "ClientRequestLink_companyId_fkey"  FOREIGN KEY ("companyId")  REFERENCES "Company"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClientRequestLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ClientRequestLink_createdBy_fkey"  FOREIGN KEY ("createdBy")  REFERENCES "User"("id")     ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ClientRequestLink_companyId_idx"   ON "ClientRequestLink"("companyId");
CREATE INDEX "ClientRequestLink_tokenHash_idx"   ON "ClientRequestLink"("tokenHash");

-- JobRequest: incoming transport requests before planning
CREATE TABLE "JobRequest" (
  "id"                          SERIAL PRIMARY KEY,
  "companyId"                   INTEGER NOT NULL,
  "requestLinkId"               INTEGER,
  "customerId"                  INTEGER,

  "source"                      TEXT NOT NULL DEFAULT 'client_request_link',
  "status"                      TEXT NOT NULL DEFAULT 'pending_review',

  -- Requester identity
  "customerCompanyName"         TEXT NOT NULL,
  "contactName"                 TEXT NOT NULL,
  "contactPhone"                TEXT NOT NULL,
  "contactEmail"                TEXT NOT NULL,

  -- Operational references (required)
  "collectionReference"         TEXT NOT NULL,
  "deliveryReference"           TEXT NOT NULL,

  -- Customer commercial info
  "purchaseOrderNumber"         TEXT,
  "billingReference"            TEXT,
  "declaredGoodsValue"          DOUBLE PRECISION,
  "currency"                    TEXT NOT NULL DEFAULT 'GBP',
  "pricingType"                 TEXT NOT NULL DEFAULT 'quote_required',

  -- Pickup and delivery as JSON blobs (normalised into JobStops on accept)
  "pickupData"                  JSONB NOT NULL,
  "deliveryData"                JSONB NOT NULL,

  -- Load details as JSON blob
  "loadData"                    JSONB NOT NULL DEFAULT '{}',

  -- Vehicle requirements (existing taxonomy)
  "reqBodyCategory"             TEXT,
  "reqBodyType"                 TEXT,
  "reqEquipment"                JSONB,
  "trailerTypesAllowed"         JSONB,
  "trailerTypesForbidden"       JSONB,
  "minimumVehicleSize"          TEXT,
  "heightRestriction"           TEXT,
  "weightRestriction"           TEXT,
  "lengthRestriction"           TEXT,
  "accessRestrictionNotes"      TEXT,
  "driverQualificationRequired" TEXT,

  -- Proof requirements (Phase 2: documents upload)
  "proofOfDeliveryRequired"     BOOLEAN NOT NULL DEFAULT false,
  "photosRequired"              BOOLEAN NOT NULL DEFAULT false,
  "weighbridgeTicketRequired"   BOOLEAN NOT NULL DEFAULT false,

  -- Notes (separated by audience)
  "driverVisibleNotes"          TEXT,
  "customerNotes"               TEXT,
  "specialInstructions"         TEXT,
  "safetyInstructions"          TEXT,
  "internalOfficeNotes"         TEXT,

  -- Review
  "reviewedAt"                  TIMESTAMP(3),
  "reviewedBy"                  INTEGER,
  "rejectionReason"             TEXT,
  "reviewNotes"                 TEXT,

  -- Link to PlannedJob created on accept
  "convertedJobId"              INTEGER,

  "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JobRequest_convertedJobId_key"      UNIQUE ("convertedJobId"),
  CONSTRAINT "JobRequest_companyId_fkey"          FOREIGN KEY ("companyId")       REFERENCES "Company"("id")           ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JobRequest_requestLinkId_fkey"      FOREIGN KEY ("requestLinkId")   REFERENCES "ClientRequestLink"("id") ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT "JobRequest_customerId_fkey"         FOREIGN KEY ("customerId")      REFERENCES "Customer"("id")          ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT "JobRequest_reviewedBy_fkey"         FOREIGN KEY ("reviewedBy")      REFERENCES "User"("id")              ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT "JobRequest_convertedJobId_fkey"     FOREIGN KEY ("convertedJobId")  REFERENCES "PlannedJob"("id")        ON DELETE SET NULL  ON UPDATE CASCADE
);

CREATE INDEX "JobRequest_companyId_status_idx"  ON "JobRequest"("companyId", "status");
CREATE INDEX "JobRequest_companyId_createdAt_idx" ON "JobRequest"("companyId", "createdAt");
CREATE INDEX "JobRequest_requestLinkId_idx"     ON "JobRequest"("requestLinkId");

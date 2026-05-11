-- JobRequest redesign: move everything into JSON blobs.
-- Old schema had 30+ individual columns; new schema uses 7 JSON blobs
-- plus a few denormalized summary columns for list queries.

-- Drop old individual columns
ALTER TABLE "JobRequest"
  DROP COLUMN IF EXISTS "customerCompanyName",
  DROP COLUMN IF EXISTS "contactName",
  DROP COLUMN IF EXISTS "contactPhone",
  DROP COLUMN IF EXISTS "contactEmail",
  DROP COLUMN IF EXISTS "collectionReference",
  DROP COLUMN IF EXISTS "deliveryReference",
  DROP COLUMN IF EXISTS "purchaseOrderNumber",
  DROP COLUMN IF EXISTS "billingReference",
  DROP COLUMN IF EXISTS "declaredGoodsValue",
  DROP COLUMN IF EXISTS "currency",
  DROP COLUMN IF EXISTS "pricingType",
  DROP COLUMN IF EXISTS "pickupData",
  DROP COLUMN IF EXISTS "deliveryData",
  DROP COLUMN IF EXISTS "reqBodyCategory",
  DROP COLUMN IF EXISTS "reqBodyType",
  DROP COLUMN IF EXISTS "reqEquipment",
  DROP COLUMN IF EXISTS "trailerTypesAllowed",
  DROP COLUMN IF EXISTS "minimumVehicleSize",
  DROP COLUMN IF EXISTS "heightRestriction",
  DROP COLUMN IF EXISTS "weightRestriction",
  DROP COLUMN IF EXISTS "lengthRestriction",
  DROP COLUMN IF EXISTS "accessRestrictionNotes",
  DROP COLUMN IF EXISTS "driverQualificationRequired",
  DROP COLUMN IF EXISTS "proofOfDeliveryRequired",
  DROP COLUMN IF EXISTS "photosRequired",
  DROP COLUMN IF EXISTS "weighbridgeTicketRequired",
  DROP COLUMN IF EXISTS "driverVisibleNotes",
  DROP COLUMN IF EXISTS "customerNotes",
  DROP COLUMN IF EXISTS "specialInstructions",
  DROP COLUMN IF EXISTS "safetyInstructions";

-- Add denormalized summary columns (for list view / querying without parsing blobs)
ALTER TABLE "JobRequest"
  ADD COLUMN IF NOT EXISTS "customerName"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "contactName"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "contactPhone"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "contactEmail"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "pricingType"   TEXT NOT NULL DEFAULT 'quote_required';

-- Add JSON blob columns
ALTER TABLE "JobRequest"
  ADD COLUMN IF NOT EXISTS "requesterData"             JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "stops"                     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "specialRequirementsData"   JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "transportRequirementsData" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "billingData"               JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "notesData"                 JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "reviewData"                JSONB;

-- loadData and internalOfficeNotes columns already exist from previous migration; keep them.

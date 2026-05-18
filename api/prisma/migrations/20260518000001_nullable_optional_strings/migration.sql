-- Migration: make optional string fields nullable (drop NOT NULL + empty-string default, backfill)
-- Models: Job, JobPart, SavedLocation, JobTemplate

-- ── Job ──────────────────────────────────────────────────────────────────────

ALTER TABLE "Job" ALTER COLUMN "serviceType"         DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "serviceType"         DROP DEFAULT;
UPDATE "Job" SET "serviceType"         = NULL WHERE "serviceType"         = '';

ALTER TABLE "Job" ALTER COLUMN "jobType"             DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "jobType"             DROP DEFAULT;
UPDATE "Job" SET "jobType"             = NULL WHERE "jobType"             = '';

ALTER TABLE "Job" ALTER COLUMN "customerName"        DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "customerName"        DROP DEFAULT;
UPDATE "Job" SET "customerName"        = NULL WHERE "customerName"        = '';

ALTER TABLE "Job" ALTER COLUMN "customerRef"         DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "customerRef"         DROP DEFAULT;
UPDATE "Job" SET "customerRef"         = NULL WHERE "customerRef"         = '';

ALTER TABLE "Job" ALTER COLUMN "purchaseOrderNumber" DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "purchaseOrderNumber" DROP DEFAULT;
UPDATE "Job" SET "purchaseOrderNumber" = NULL WHERE "purchaseOrderNumber" = '';

ALTER TABLE "Job" ALTER COLUMN "billingNotes"        DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "billingNotes"        DROP DEFAULT;
UPDATE "Job" SET "billingNotes"        = NULL WHERE "billingNotes"        = '';

ALTER TABLE "Job" ALTER COLUMN "bookingContactName"  DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "bookingContactName"  DROP DEFAULT;
UPDATE "Job" SET "bookingContactName"  = NULL WHERE "bookingContactName"  = '';

ALTER TABLE "Job" ALTER COLUMN "bookingContactPhone" DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "bookingContactPhone" DROP DEFAULT;
UPDATE "Job" SET "bookingContactPhone" = NULL WHERE "bookingContactPhone" = '';

ALTER TABLE "Job" ALTER COLUMN "bookingContactEmail" DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "bookingContactEmail" DROP DEFAULT;
UPDATE "Job" SET "bookingContactEmail" = NULL WHERE "bookingContactEmail" = '';

ALTER TABLE "Job" ALTER COLUMN "plannerNotes"        DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "plannerNotes"        DROP DEFAULT;
UPDATE "Job" SET "plannerNotes"        = NULL WHERE "plannerNotes"        = '';

ALTER TABLE "Job" ALTER COLUMN "internalNotes"       DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "internalNotes"       DROP DEFAULT;
UPDATE "Job" SET "internalNotes"       = NULL WHERE "internalNotes"       = '';

ALTER TABLE "Job" ALTER COLUMN "goodsType"           DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "goodsType"           DROP DEFAULT;
UPDATE "Job" SET "goodsType"           = NULL WHERE "goodsType"           = '';

ALTER TABLE "Job" ALTER COLUMN "goodsDescription"    DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "goodsDescription"    DROP DEFAULT;
UPDATE "Job" SET "goodsDescription"    = NULL WHERE "goodsDescription"    = '';

ALTER TABLE "Job" ALTER COLUMN "quantityUnit"        DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "quantityUnit"        DROP DEFAULT;
UPDATE "Job" SET "quantityUnit"        = NULL WHERE "quantityUnit"        = '';

ALTER TABLE "Job" ALTER COLUMN "dimensions"          DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "dimensions"          DROP DEFAULT;
UPDATE "Job" SET "dimensions"          = NULL WHERE "dimensions"          = '';

ALTER TABLE "Job" ALTER COLUMN "tempRange"           DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "tempRange"           DROP DEFAULT;
UPDATE "Job" SET "tempRange"           = NULL WHERE "tempRange"           = '';

ALTER TABLE "Job" ALTER COLUMN "hazardClass"         DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "hazardClass"         DROP DEFAULT;
UPDATE "Job" SET "hazardClass"         = NULL WHERE "hazardClass"         = '';

ALTER TABLE "Job" ALTER COLUMN "vehicleCategory"     DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "vehicleCategory"     DROP DEFAULT;
UPDATE "Job" SET "vehicleCategory"     = NULL WHERE "vehicleCategory"     = '';

ALTER TABLE "Job" ALTER COLUMN "minGvwClass"         DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "minGvwClass"         DROP DEFAULT;
UPDATE "Job" SET "minGvwClass"         = NULL WHERE "minGvwClass"         = '';

ALTER TABLE "Job" ALTER COLUMN "vehicleAccessNotes"  DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "vehicleAccessNotes"  DROP DEFAULT;
UPDATE "Job" SET "vehicleAccessNotes"  = NULL WHERE "vehicleAccessNotes"  = '';

ALTER TABLE "Job" ALTER COLUMN "assistancePhone"     DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "assistancePhone"     DROP DEFAULT;
UPDATE "Job" SET "assistancePhone"     = NULL WHERE "assistancePhone"     = '';

ALTER TABLE "Job" ALTER COLUMN "assistanceNote"      DROP NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "assistanceNote"      DROP DEFAULT;
UPDATE "Job" SET "assistanceNote"      = NULL WHERE "assistanceNote"      = '';

-- ── JobPart ───────────────────────────────────────────────────────────────────

ALTER TABLE "JobPart" ALTER COLUMN "siteName"              DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "siteName"              DROP DEFAULT;
UPDATE "JobPart" SET "siteName"              = NULL WHERE "siteName"              = '';

ALTER TABLE "JobPart" ALTER COLUMN "unitName"              DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "unitName"              DROP DEFAULT;
UPDATE "JobPart" SET "unitName"              = NULL WHERE "unitName"              = '';

ALTER TABLE "JobPart" ALTER COLUMN "street"               DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "street"               DROP DEFAULT;
UPDATE "JobPart" SET "street"               = NULL WHERE "street"               = '';

ALTER TABLE "JobPart" ALTER COLUMN "town"                 DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "town"                 DROP DEFAULT;
UPDATE "JobPart" SET "town"                 = NULL WHERE "town"                 = '';

ALTER TABLE "JobPart" ALTER COLUMN "postcode"             DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "postcode"             DROP DEFAULT;
UPDATE "JobPart" SET "postcode"             = NULL WHERE "postcode"             = '';

ALTER TABLE "JobPart" ALTER COLUMN "locationTextSnapshot" DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "locationTextSnapshot" DROP DEFAULT;
UPDATE "JobPart" SET "locationTextSnapshot" = NULL WHERE "locationTextSnapshot" = '';

ALTER TABLE "JobPart" ALTER COLUMN "standingChargeNote"   DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "standingChargeNote"   DROP DEFAULT;
UPDATE "JobPart" SET "standingChargeNote"   = NULL WHERE "standingChargeNote"   = '';

ALTER TABLE "JobPart" ALTER COLUMN "contactName"          DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "contactName"          DROP DEFAULT;
UPDATE "JobPart" SET "contactName"          = NULL WHERE "contactName"          = '';

ALTER TABLE "JobPart" ALTER COLUMN "contactPhone"         DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "contactPhone"         DROP DEFAULT;
UPDATE "JobPart" SET "contactPhone"         = NULL WHERE "contactPhone"         = '';

ALTER TABLE "JobPart" ALTER COLUMN "contactEmail"         DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "contactEmail"         DROP DEFAULT;
UPDATE "JobPart" SET "contactEmail"         = NULL WHERE "contactEmail"         = '';

ALTER TABLE "JobPart" ALTER COLUMN "referenceNumber"      DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "referenceNumber"      DROP DEFAULT;
UPDATE "JobPart" SET "referenceNumber"      = NULL WHERE "referenceNumber"      = '';

ALTER TABLE "JobPart" ALTER COLUMN "bookingRef"           DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "bookingRef"           DROP DEFAULT;
UPDATE "JobPart" SET "bookingRef"           = NULL WHERE "bookingRef"           = '';

ALTER TABLE "JobPart" ALTER COLUMN "openingHours"         DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "openingHours"         DROP DEFAULT;
UPDATE "JobPart" SET "openingHours"         = NULL WHERE "openingHours"         = '';

ALTER TABLE "JobPart" ALTER COLUMN "instructions"         DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "instructions"         DROP DEFAULT;
UPDATE "JobPart" SET "instructions"         = NULL WHERE "instructions"         = '';

ALTER TABLE "JobPart" ALTER COLUMN "navigationInstructions" DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "navigationInstructions" DROP DEFAULT;
UPDATE "JobPart" SET "navigationInstructions" = NULL WHERE "navigationInstructions" = '';

ALTER TABLE "JobPart" ALTER COLUMN "locationType"         DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "locationType"         DROP DEFAULT;
UPDATE "JobPart" SET "locationType"         = NULL WHERE "locationType"         = '';

ALTER TABLE "JobPart" ALTER COLUMN "quantityUnit"         DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "quantityUnit"         DROP DEFAULT;
UPDATE "JobPart" SET "quantityUnit"         = NULL WHERE "quantityUnit"         = '';

ALTER TABLE "JobPart" ALTER COLUMN "exchangeUnit"         DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "exchangeUnit"         DROP DEFAULT;
UPDATE "JobPart" SET "exchangeUnit"         = NULL WHERE "exchangeUnit"         = '';

ALTER TABLE "JobPart" ALTER COLUMN "loadReadiness"        DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "loadReadiness"        DROP DEFAULT;
UPDATE "JobPart" SET "loadReadiness"        = NULL WHERE "loadReadiness"        = '';

ALTER TABLE "JobPart" ALTER COLUMN "heightRestriction"    DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "heightRestriction"    DROP DEFAULT;
UPDATE "JobPart" SET "heightRestriction"    = NULL WHERE "heightRestriction"    = '';

ALTER TABLE "JobPart" ALTER COLUMN "weightRestriction"    DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "weightRestriction"    DROP DEFAULT;
UPDATE "JobPart" SET "weightRestriction"    = NULL WHERE "weightRestriction"    = '';

ALTER TABLE "JobPart" ALTER COLUMN "lengthRestriction"    DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "lengthRestriction"    DROP DEFAULT;
UPDATE "JobPart" SET "lengthRestriction"    = NULL WHERE "lengthRestriction"    = '';

ALTER TABLE "JobPart" ALTER COLUMN "internalNotes"        DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "internalNotes"        DROP DEFAULT;
UPDATE "JobPart" SET "internalNotes"        = NULL WHERE "internalNotes"        = '';

ALTER TABLE "JobPart" ALTER COLUMN "stopNotes"            DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "stopNotes"            DROP DEFAULT;
UPDATE "JobPart" SET "stopNotes"            = NULL WHERE "stopNotes"            = '';

ALTER TABLE "JobPart" ALTER COLUMN "addressLine2"         DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "addressLine2"         DROP DEFAULT;
UPDATE "JobPart" SET "addressLine2"         = NULL WHERE "addressLine2"         = '';

ALTER TABLE "JobPart" ALTER COLUMN "countyRegion"         DROP NOT NULL;
ALTER TABLE "JobPart" ALTER COLUMN "countyRegion"         DROP DEFAULT;
UPDATE "JobPart" SET "countyRegion"         = NULL WHERE "countyRegion"         = '';

-- ── SavedLocation ─────────────────────────────────────────────────────────────

ALTER TABLE "SavedLocation" ALTER COLUMN "siteName"             DROP NOT NULL;
ALTER TABLE "SavedLocation" ALTER COLUMN "siteName"             DROP DEFAULT;
UPDATE "SavedLocation" SET "siteName"             = NULL WHERE "siteName"             = '';

ALTER TABLE "SavedLocation" ALTER COLUMN "unitName"             DROP NOT NULL;
ALTER TABLE "SavedLocation" ALTER COLUMN "unitName"             DROP DEFAULT;
UPDATE "SavedLocation" SET "unitName"             = NULL WHERE "unitName"             = '';

ALTER TABLE "SavedLocation" ALTER COLUMN "locationTextSnapshot" DROP NOT NULL;
ALTER TABLE "SavedLocation" ALTER COLUMN "locationTextSnapshot" DROP DEFAULT;
UPDATE "SavedLocation" SET "locationTextSnapshot" = NULL WHERE "locationTextSnapshot" = '';

ALTER TABLE "SavedLocation" ALTER COLUMN "street"               DROP NOT NULL;
ALTER TABLE "SavedLocation" ALTER COLUMN "street"               DROP DEFAULT;
UPDATE "SavedLocation" SET "street"               = NULL WHERE "street"               = '';

ALTER TABLE "SavedLocation" ALTER COLUMN "town"                 DROP NOT NULL;
ALTER TABLE "SavedLocation" ALTER COLUMN "town"                 DROP DEFAULT;
UPDATE "SavedLocation" SET "town"                 = NULL WHERE "town"                 = '';

ALTER TABLE "SavedLocation" ALTER COLUMN "postcode"             DROP NOT NULL;
ALTER TABLE "SavedLocation" ALTER COLUMN "postcode"             DROP DEFAULT;
UPDATE "SavedLocation" SET "postcode"             = NULL WHERE "postcode"             = '';

ALTER TABLE "SavedLocation" ALTER COLUMN "contactName"          DROP NOT NULL;
ALTER TABLE "SavedLocation" ALTER COLUMN "contactName"          DROP DEFAULT;
UPDATE "SavedLocation" SET "contactName"          = NULL WHERE "contactName"          = '';

ALTER TABLE "SavedLocation" ALTER COLUMN "contactPhone"         DROP NOT NULL;
ALTER TABLE "SavedLocation" ALTER COLUMN "contactPhone"         DROP DEFAULT;
UPDATE "SavedLocation" SET "contactPhone"         = NULL WHERE "contactPhone"         = '';

ALTER TABLE "SavedLocation" ALTER COLUMN "instructions"         DROP NOT NULL;
ALTER TABLE "SavedLocation" ALTER COLUMN "instructions"         DROP DEFAULT;
UPDATE "SavedLocation" SET "instructions"         = NULL WHERE "instructions"         = '';

ALTER TABLE "SavedLocation" ALTER COLUMN "internalNotes"        DROP NOT NULL;
ALTER TABLE "SavedLocation" ALTER COLUMN "internalNotes"        DROP DEFAULT;
UPDATE "SavedLocation" SET "internalNotes"        = NULL WHERE "internalNotes"        = '';

-- ── JobTemplate ───────────────────────────────────────────────────────────────

ALTER TABLE "JobTemplate" ALTER COLUMN "pickupTextSnapshot"  DROP NOT NULL;
ALTER TABLE "JobTemplate" ALTER COLUMN "pickupTextSnapshot"  DROP DEFAULT;
UPDATE "JobTemplate" SET "pickupTextSnapshot"  = NULL WHERE "pickupTextSnapshot"  = '';

ALTER TABLE "JobTemplate" ALTER COLUMN "dropoffTextSnapshot" DROP NOT NULL;
ALTER TABLE "JobTemplate" ALTER COLUMN "dropoffTextSnapshot" DROP DEFAULT;
UPDATE "JobTemplate" SET "dropoffTextSnapshot" = NULL WHERE "dropoffTextSnapshot" = '';

ALTER TABLE "JobTemplate" ALTER COLUMN "defaultReference"    DROP NOT NULL;
ALTER TABLE "JobTemplate" ALTER COLUMN "defaultReference"    DROP DEFAULT;
UPDATE "JobTemplate" SET "defaultReference"    = NULL WHERE "defaultReference"    = '';

ALTER TABLE "JobTemplate" ALTER COLUMN "defaultNotes"        DROP NOT NULL;
ALTER TABLE "JobTemplate" ALTER COLUMN "defaultNotes"        DROP DEFAULT;
UPDATE "JobTemplate" SET "defaultNotes"        = NULL WHERE "defaultNotes"        = '';

ALTER TABLE "JobTemplate" ALTER COLUMN "defaultMaterialType" DROP NOT NULL;
ALTER TABLE "JobTemplate" ALTER COLUMN "defaultMaterialType" DROP DEFAULT;
UPDATE "JobTemplate" SET "defaultMaterialType" = NULL WHERE "defaultMaterialType" = '';

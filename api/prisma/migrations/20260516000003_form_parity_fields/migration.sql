-- Migration: form_parity_fields
-- Adds fields needed to bring the internal CreateJob form to parity with the
-- public RequestForm. All ADD COLUMN IF NOT EXISTS — fully idempotent.

-- PlannedJob: can the shipment be split across multiple runs?
ALTER TABLE "PlannedJob" ADD COLUMN IF NOT EXISTS "canSplitShipment" TEXT NOT NULL DEFAULT 'must_stay_together';

-- JobPart: per-stop quantity fields (separate from legacy numPallets / quantityRequired)
-- exchange: how many empties are dropped / collected at this stop
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "exchangeDropQty"    DECIMAL(65,30);
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "exchangeCollectQty" DECIMAL(65,30);
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "exchangeUnit"       TEXT NOT NULL DEFAULT '';
-- load readiness reported by the customer at booking time
ALTER TABLE "JobPart" ADD COLUMN IF NOT EXISTS "loadReadiness"      TEXT NOT NULL DEFAULT '';

-- LoadDetails: goods type (pallets / bulk / refrigerated / etc.) and securing requirements
ALTER TABLE "LoadDetails" ADD COLUMN IF NOT EXISTS "goodsType"            TEXT NOT NULL DEFAULT '';
ALTER TABLE "LoadDetails" ADD COLUMN IF NOT EXISTS "securingRequirements" JSONB;
ALTER TABLE "LoadDetails" ADD COLUMN IF NOT EXISTS "specialRequirements"  JSONB;

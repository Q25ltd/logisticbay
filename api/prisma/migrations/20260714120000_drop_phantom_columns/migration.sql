-- Drop phantom columns: no intake form ever wrote them (verified 0 rows with
-- data in dev AND production before this migration). Algorithms reading them
-- were checking permanently-false/empty data.
ALTER TABLE "SavedLocation" DROP COLUMN "gateLat";
ALTER TABLE "SavedLocation" DROP COLUMN "gateLng";
ALTER TABLE "JobPart" DROP COLUMN "gateLat";
ALTER TABLE "JobPart" DROP COLUMN "gateLng";
ALTER TABLE "JobPart" DROP COLUMN "coordinateVerified";
ALTER TABLE "JobPart" DROP COLUMN "standingChargeNote";
ALTER TABLE "JobPart" DROP COLUMN "stopGoodsType";
ALTER TABLE "JobPart" DROP COLUMN "stopWeight";
ALTER TABLE "JobPart" DROP COLUMN "tempControlled";
ALTER TABLE "JobPart" DROP COLUMN "tempRange";
ALTER TABLE "JobPart" DROP COLUMN "hazardous";
ALTER TABLE "JobPart" DROP COLUMN "hazardClass";
ALTER TABLE "JobPart" DROP COLUMN "oversized";
ALTER TABLE "FleetTrailer" DROP COLUMN "loadStatus";
ALTER TABLE "FleetTrailer" DROP COLUMN "standingNote";
ALTER TABLE "FleetTrailer" DROP COLUMN "standingRunId";

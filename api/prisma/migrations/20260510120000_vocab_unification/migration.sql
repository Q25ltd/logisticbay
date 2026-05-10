-- Additive vocabulary unification fields. Legacy columns stay for rollout safety.

ALTER TABLE "DriverProfile"
ADD COLUMN IF NOT EXISTS "endorsements" JSONB,
ADD COLUMN IF NOT EXISTS "canDriveCategories" JSONB;

ALTER TABLE "PlannedJob"
ADD COLUMN IF NOT EXISTS "reqBodyCategory" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "reqGvwMin" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "reqBodyType" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "reqEquipment" JSONB,
ADD COLUMN IF NOT EXISTS "reqLicenceClass" TEXT NOT NULL DEFAULT '';

ALTER TABLE "FleetUnit"
ADD COLUMN IF NOT EXISTS "vehicleClassLegacy" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "bodyCategory" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "gvwClass" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "bodyType" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "onboardEquipment" JSONB;

UPDATE "FleetUnit"
SET "vehicleClassLegacy" = "vehicleClass"
WHERE "vehicleClassLegacy" = '' AND "vehicleClass" <> '';

ALTER TABLE "FleetTrailer"
ADD COLUMN IF NOT EXISTS "bodyType" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "trailerLength" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "decks" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "compartments" INTEGER,
ADD COLUMN IF NOT EXISTS "onboardEquipment" JSONB;

ALTER TABLE "ShiftSegment"
ALTER COLUMN "vehicleClass" SET DEFAULT 'tractor';

UPDATE "ShiftSegment"
SET "vehicleClass" = CASE
  WHEN LOWER("vehicleClass") IN ('class1', 'class 1', 'artic') THEN 'tractor'
  WHEN LOWER("vehicleClass") IN ('class2', 'class 2') THEN 'rigid'
  ELSE "vehicleClass"
END
WHERE LOWER("vehicleClass") IN ('class1', 'class 1', 'artic', 'class2', 'class 2');

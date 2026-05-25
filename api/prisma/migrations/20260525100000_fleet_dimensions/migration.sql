-- Add physical dimension fields to FleetUnit and FleetTrailer
-- Used for ORS HGV route restriction checks (weight, height, width, length)

ALTER TABLE "FleetUnit"
  ADD COLUMN "heightM"   DOUBLE PRECISION,
  ADD COLUMN "widthM"    DOUBLE PRECISION,
  ADD COLUMN "lengthM"   DOUBLE PRECISION,
  ADD COLUMN "axleLoadT" DOUBLE PRECISION;

ALTER TABLE "FleetTrailer"
  ADD COLUMN "heightM"   DOUBLE PRECISION,
  ADD COLUMN "widthM"    DOUBLE PRECISION,
  ADD COLUMN "lengthM"   DOUBLE PRECISION,
  ADD COLUMN "axleLoadT" DOUBLE PRECISION;

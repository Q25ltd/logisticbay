-- Add work pattern and geocoded base postcode to DriverProfile
-- workPattern: "day_driver" | "night_driver" | "tramper" — separate from driverType (employment type)
-- basePostcode / baseLat / baseLng: home/depot location for return-to-base calculations

ALTER TABLE "DriverProfile" ADD COLUMN "workPattern"  TEXT;
ALTER TABLE "DriverProfile" ADD COLUMN "basePostcode" TEXT;
ALTER TABLE "DriverProfile" ADD COLUMN "baseLat"      DOUBLE PRECISION;
ALTER TABLE "DriverProfile" ADD COLUMN "baseLng"      DOUBLE PRECISION;

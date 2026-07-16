-- MOT / annual test expiry on fleet assets — form-born field for the
-- readiness "MOT / inspection" check (was an honest-unknown stub).
ALTER TABLE "FleetUnit" ADD COLUMN "motExpiryDate" TIMESTAMP(3);
ALTER TABLE "FleetTrailer" ADD COLUMN "motExpiryDate" TIMESTAMP(3);

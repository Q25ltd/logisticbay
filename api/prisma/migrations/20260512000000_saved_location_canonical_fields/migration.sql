-- Rename SavedLocation columns to canonical names
-- addressText → locationTextSnapshot
-- latitude    → lat
-- longitude   → lng

ALTER TABLE "SavedLocation" RENAME COLUMN "addressText" TO "locationTextSnapshot";
ALTER TABLE "SavedLocation" RENAME COLUMN "latitude" TO "lat";
ALTER TABLE "SavedLocation" RENAME COLUMN "longitude" TO "lng";

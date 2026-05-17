-- Migration: add bookingContactName/Phone/Email to PlannedJob
-- These denormalised contact fields hold the booking contact (person who
-- made the booking), separate from per-stop contacts.

ALTER TABLE "PlannedJob"
  ADD COLUMN IF NOT EXISTS "bookingContactName"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "bookingContactPhone" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "bookingContactEmail" TEXT NOT NULL DEFAULT '';

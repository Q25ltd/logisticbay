-- Add shift-end GPS coordinates to Shift table
-- Captured automatically when driver submits their shift on mobile
-- Used to track: driver location, trailer/load last-known position, Day 2 run start point

ALTER TABLE "Shift" ADD COLUMN "endLat" DOUBLE PRECISION;
ALTER TABLE "Shift" ADD COLUMN "endLng" DOUBLE PRECISION;

-- Add company type field: "carrier" | "sender" | "both"
-- All existing companies are carriers — default covers them, no data migration needed.
-- Sender and "both" types are unlocked when marketplace launches (Phase 4).
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'carrier';

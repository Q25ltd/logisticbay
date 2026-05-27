-- Rename JobPart temperature fields to match canonical names on Job model
-- Job uses: tempControlled / tempRange
-- JobPart used: temperatureControlled / temperatureRange  ← stale names
-- After this migration both models use the same names.

ALTER TABLE "JobPart" RENAME COLUMN "temperatureControlled" TO "tempControlled";
ALTER TABLE "JobPart" RENAME COLUMN "temperatureRange"      TO "tempRange";

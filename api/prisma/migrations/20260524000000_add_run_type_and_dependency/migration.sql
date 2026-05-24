-- Add runType and dependsOnRunId to Run
ALTER TABLE "Run" ADD COLUMN "runType" TEXT;
ALTER TABLE "Run" ADD COLUMN "dependsOnRunId" INTEGER;

-- Self-referencing FK for run dependency chain
ALTER TABLE "Run" ADD CONSTRAINT "Run_dependsOnRunId_fkey"
  FOREIGN KEY ("dependsOnRunId") REFERENCES "Run"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for fast lookup of dependent runs
CREATE INDEX "Run_dependsOnRunId_idx" ON "Run"("dependsOnRunId");

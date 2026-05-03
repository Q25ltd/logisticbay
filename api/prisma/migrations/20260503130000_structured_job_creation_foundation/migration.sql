-- DropForeignKey
ALTER TABLE "PlannedJob" DROP CONSTRAINT "PlannedJob_assignedDriverId_fkey";

-- AlterTable
ALTER TABLE "JobTemplate" ADD COLUMN     "defaultLoadDetails" JSONB,
ADD COLUMN     "defaultStops" JSONB,
ADD COLUMN     "qualityScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trailerTypesAllowed" JSONB;

-- AlterTable
ALTER TABLE "PlannedJob" ADD COLUMN     "internalNotes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "priority" INTEGER,
ADD COLUMN     "qualityScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "serviceType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "trailerTypesAllowed" JSONB,
ADD COLUMN     "validationStatus" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN     "vehicleClassRequired" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "assignedDriverId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SavedLocation" ADD COLUMN     "accessConfidence" TEXT NOT NULL DEFAULT 'low',
ADD COLUMN     "accessType" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "driverReportCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gateLat" DOUBLE PRECISION,
ADD COLUMN     "gateLng" DOUBLE PRECISION,
ADD COLUMN     "issueFlags" JSONB;

-- CreateTable
CREATE TABLE "JobStop" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "savedLocationId" INTEGER,
    "locationTextSnapshot" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "gateLat" DOUBLE PRECISION,
    "gateLng" DOUBLE PRECISION,
    "timeWindowStart" TIMESTAMP(3),
    "timeWindowEnd" TIMESTAMP(3),
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "referenceNumber" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadDetails" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT '',
    "weight" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "materialType" TEXT NOT NULL DEFAULT '',
    "hazardClass" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoadDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAudit" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "changedBy" INTEGER,
    "action" TEXT NOT NULL,
    "field" TEXT NOT NULL DEFAULT '',
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobStop_companyId_jobId_idx" ON "JobStop"("companyId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobStop_jobId_sequenceNumber_key" ON "JobStop"("jobId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LoadDetails_jobId_key" ON "LoadDetails"("jobId");

-- CreateIndex
CREATE INDEX "JobAudit_companyId_jobId_idx" ON "JobAudit"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobAudit_createdAt_idx" ON "JobAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStop" ADD CONSTRAINT "JobStop_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStop" ADD CONSTRAINT "JobStop_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PlannedJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStop" ADD CONSTRAINT "JobStop_savedLocationId_fkey" FOREIGN KEY ("savedLocationId") REFERENCES "SavedLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadDetails" ADD CONSTRAINT "LoadDetails_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadDetails" ADD CONSTRAINT "LoadDetails_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PlannedJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAudit" ADD CONSTRAINT "JobAudit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAudit" ADD CONSTRAINT "JobAudit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PlannedJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAudit" ADD CONSTRAINT "JobAudit_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

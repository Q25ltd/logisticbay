/*
  Warnings:

  - You are about to drop the column `email` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `passwordHash` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[slug]` on the table `Company` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ticker]` on the table `Company` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slug` to the `Company` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_companyId_fkey";

-- DropIndex
DROP INDEX "Company_email_key";

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "email",
DROP COLUMN "passwordHash",
ADD COLUMN     "maxHolidaysPerDay" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "reportEmail" TEXT,
ADD COLUMN     "reportEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'trial',
ADD COLUMN     "ticker" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeliveryTask" ADD COLUMN     "loadType" TEXT NOT NULL DEFAULT 'weight',
ADD COLUMN     "pallets" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "breakMins" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "endTime" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "startTime" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "totalHours" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ShiftSegment" ADD COLUMN     "needsTrailerCheck" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "needsTruckCheck" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vehicleClass" TEXT NOT NULL DEFAULT 'class1',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "companyId",
DROP COLUMN "role",
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "CompanyMembership" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverProfile" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "displayName" TEXT NOT NULL,
    "employeeNumber" TEXT,
    "phoneNumber" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "minHoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "holidayAllowance" INTEGER NOT NULL DEFAULT 28,
    "holidayUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedLocation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "addressText" TEXT NOT NULL,
    "postcode" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTemplate" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "pickupLocationId" INTEGER,
    "dropoffLocationId" INTEGER,
    "pickupTextSnapshot" TEXT NOT NULL DEFAULT '',
    "dropoffTextSnapshot" TEXT NOT NULL DEFAULT '',
    "defaultReference" TEXT NOT NULL DEFAULT '',
    "defaultNotes" TEXT NOT NULL DEFAULT '',
    "defaultMaterialType" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedJob" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "templateId" INTEGER,
    "assignedDriverId" INTEGER NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "pickupLocationId" INTEGER,
    "dropoffLocationId" INTEGER,
    "pickupTextSnapshot" TEXT NOT NULL DEFAULT '',
    "dropoffTextSnapshot" TEXT NOT NULL DEFAULT '',
    "referenceNumber" TEXT NOT NULL DEFAULT '',
    "materialType" TEXT NOT NULL DEFAULT '',
    "quantityExpected" TEXT NOT NULL DEFAULT '',
    "quantityUnit" TEXT NOT NULL DEFAULT '',
    "plannerNotes" TEXT NOT NULL DEFAULT '',
    "assignedTruck" TEXT NOT NULL DEFAULT '',
    "assignedTrailer" TEXT NOT NULL DEFAULT '',
    "vehicleClass" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "actualQuantity" TEXT NOT NULL DEFAULT '',
    "actualUnit" TEXT NOT NULL DEFAULT '',
    "podNumber" TEXT NOT NULL DEFAULT '',
    "collectionNote" TEXT NOT NULL DEFAULT '',
    "deliveryNote" TEXT NOT NULL DEFAULT '',
    "requireCollection" BOOLEAN NOT NULL DEFAULT false,
    "requirePOD" BOOLEAN NOT NULL DEFAULT false,
    "requireDeliveryQty" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobExecutionEvent" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "driverId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "clientEventId" TEXT NOT NULL,
    "clientTimestamp" TIMESTAMP(3) NOT NULL,
    "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appVersion" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobExecutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEventLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverAvailability" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "driverProfileId" INTEGER NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "monPref" TEXT NOT NULL DEFAULT 'normal',
    "tuePref" TEXT NOT NULL DEFAULT 'normal',
    "wedPref" TEXT NOT NULL DEFAULT 'normal',
    "thuPref" TEXT NOT NULL DEFAULT 'normal',
    "friPref" TEXT NOT NULL DEFAULT 'normal',
    "satPref" TEXT NOT NULL DEFAULT 'unavailable',
    "sunPref" TEXT NOT NULL DEFAULT 'unavailable',
    "monNote" TEXT NOT NULL DEFAULT '',
    "tueNote" TEXT NOT NULL DEFAULT '',
    "wedNote" TEXT NOT NULL DEFAULT '',
    "thuNote" TEXT NOT NULL DEFAULT '',
    "friNote" TEXT NOT NULL DEFAULT '',
    "satNote" TEXT NOT NULL DEFAULT '',
    "sunNote" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftPreference" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "driverProfileId" INTEGER NOT NULL,
    "shiftDate" TIMESTAMP(3) NOT NULL,
    "preferenceType" TEXT NOT NULL DEFAULT 'normal',
    "requestedHours" DOUBLE PRECISION,
    "finishByTime" TEXT,
    "shortDayReason" TEXT NOT NULL DEFAULT '',
    "shortDayNote" TEXT NOT NULL DEFAULT '',
    "overtimeHours" DOUBLE PRECISION,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "plannerNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayRequest" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "driverProfileId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "plannerNote" TEXT NOT NULL DEFAULT '',
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HolidayRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverWorkingTimeSummary" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "driverProfileId" INTEGER NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shiftCount" INTEGER NOT NULL DEFAULT 0,
    "reducedRestUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverWorkingTimeSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMembership_companyId_userId_key" ON "CompanyMembership"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_userId_key" ON "DriverProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JobExecutionEvent_companyId_clientEventId_key" ON "JobExecutionEvent"("companyId", "clientEventId");

-- CreateIndex
CREATE INDEX "SyncEventLog_companyId_clientEventId_idx" ON "SyncEventLog"("companyId", "clientEventId");

-- CreateIndex
CREATE INDEX "SyncEventLog_receivedAt_idx" ON "SyncEventLog"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DriverAvailability_driverProfileId_weekStartDate_key" ON "DriverAvailability"("driverProfileId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "DriverWorkingTimeSummary_driverProfileId_weekStartDate_key" ON "DriverWorkingTimeSummary"("driverProfileId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Company_ticker_key" ON "Company"("ticker");

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedLocation" ADD CONSTRAINT "SavedLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTemplate" ADD CONSTRAINT "JobTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTemplate" ADD CONSTRAINT "JobTemplate_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "SavedLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTemplate" ADD CONSTRAINT "JobTemplate_dropoffLocationId_fkey" FOREIGN KEY ("dropoffLocationId") REFERENCES "SavedLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JobTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "SavedLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_dropoffLocationId_fkey" FOREIGN KEY ("dropoffLocationId") REFERENCES "SavedLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionEvent" ADD CONSTRAINT "JobExecutionEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PlannedJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionEvent" ADD CONSTRAINT "JobExecutionEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionEvent" ADD CONSTRAINT "JobExecutionEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEventLog" ADD CONSTRAINT "SyncEventLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAvailability" ADD CONSTRAINT "DriverAvailability_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAvailability" ADD CONSTRAINT "DriverAvailability_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftPreference" ADD CONSTRAINT "ShiftPreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftPreference" ADD CONSTRAINT "ShiftPreference_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayRequest" ADD CONSTRAINT "HolidayRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayRequest" ADD CONSTRAINT "HolidayRequest_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverWorkingTimeSummary" ADD CONSTRAINT "DriverWorkingTimeSummary_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverWorkingTimeSummary" ADD CONSTRAINT "DriverWorkingTimeSummary_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

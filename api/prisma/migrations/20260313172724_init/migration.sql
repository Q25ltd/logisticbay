-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ticker" TEXT,
    "nextJobSequence" INTEGER NOT NULL DEFAULT 1,
    "jobSequenceYear" INTEGER NOT NULL DEFAULT 2026,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "reportEmail" TEXT,
    "reportEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxHolidaysPerDay" INTEGER NOT NULL DEFAULT 2,
    "holidayYearResetMonth" INTEGER NOT NULL DEFAULT 1,
    "holidayYearResetDay" INTEGER NOT NULL DEFAULT 1,
    "holidayWarnDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "holidayCarryOverAllowed" BOOLEAN NOT NULL DEFAULT false,
    "holidayCarryOverMaxDays" INTEGER NOT NULL DEFAULT 0,
    "baseHolidayAllowanceDays" INTEGER NOT NULL DEFAULT 28,
    "holidaySeniorityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "holidaySeniorityYears" INTEGER NOT NULL DEFAULT 5,
    "holidaySeniorityExtraDays" INTEGER NOT NULL DEFAULT 1,
    "holidaySeniorityMaxExtraDays" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

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
    "employmentStartDate" TIMESTAMP(3),
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "driverType" TEXT NOT NULL DEFAULT 'permanent',
    "licenceClass" TEXT NOT NULL DEFAULT '',
    "endorsements" JSONB,
    "canDriveCategories" JSONB,
    "canUseTrailer" BOOLEAN NOT NULL DEFAULT false,
    "trailerTypesAllowed" JSONB,
    "adrAllowed" BOOLEAN NOT NULL DEFAULT false,
    "hiabAllowed" BOOLEAN NOT NULL DEFAULT false,
    "moffettAllowed" BOOLEAN NOT NULL DEFAULT false,
    "manualHandlingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "preferredStartTime" TEXT NOT NULL DEFAULT '',
    "earliestStartTime" TEXT NOT NULL DEFAULT '',
    "latestFinishTime" TEXT NOT NULL DEFAULT '',
    "preferredShiftHours" DOUBLE PRECISION,
    "normalWorkingDays" JSONB,
    "weekendAvailable" BOOLEAN NOT NULL DEFAULT false,
    "nightWorkAllowed" BOOLEAN NOT NULL DEFAULT false,
    "nightsOutAllowed" BOOLEAN NOT NULL DEFAULT false,
    "overtimeAllowed" BOOLEAN NOT NULL DEFAULT false,
    "baseLocation" TEXT NOT NULL DEFAULT '',
    "operatingArea" TEXT NOT NULL DEFAULT '',
    "avoidAreas" TEXT NOT NULL DEFAULT '',
    "plannerNotes" TEXT NOT NULL DEFAULT '',
    "minHoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "holidayAllowance" INTEGER NOT NULL DEFAULT 28,
    "holidayUsed" INTEGER NOT NULL DEFAULT 0,
    "defaultTruckReg" TEXT NOT NULL DEFAULT '',
    "defaultTruckClass" TEXT NOT NULL DEFAULT '',
    "defaultTrailerReg" TEXT NOT NULL DEFAULT '',
    "defaultTrailerClass" TEXT NOT NULL DEFAULT '',
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
    "siteName" TEXT NOT NULL DEFAULT '',
    "unitName" TEXT NOT NULL DEFAULT '',
    "addressText" TEXT NOT NULL DEFAULT '',
    "street" TEXT NOT NULL DEFAULT '',
    "town" TEXT NOT NULL DEFAULT '',
    "postcode" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "gateLat" DOUBLE PRECISION,
    "gateLng" DOUBLE PRECISION,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "accessType" TEXT NOT NULL DEFAULT 'unknown',
    "accessConfidence" TEXT NOT NULL DEFAULT 'low',
    "driverReportCount" INTEGER NOT NULL DEFAULT 0,
    "issueFlags" JSONB,
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
    "trailerTypesAllowed" JSONB,
    "defaultStops" JSONB,
    "defaultLoadDetails" JSONB,
    "defaultJobData" JSONB,
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedJob" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "customerName" TEXT NOT NULL DEFAULT '',
    "templateId" INTEGER,
    "assignedDriverId" INTEGER,
    "createdByUserId" INTEGER NOT NULL,
    "plannedDate" TIMESTAMP(3),
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "pickupLocationId" INTEGER,
    "dropoffLocationId" INTEGER,
    "pickupTextSnapshot" TEXT NOT NULL DEFAULT '',
    "dropoffTextSnapshot" TEXT NOT NULL DEFAULT '',
    "jobReference" TEXT,
    "referenceNumber" TEXT NOT NULL DEFAULT '',
    "materialType" TEXT NOT NULL DEFAULT '',
    "quantityExpected" TEXT NOT NULL DEFAULT '',
    "quantityUnit" TEXT NOT NULL DEFAULT '',
    "plannerNotes" TEXT NOT NULL DEFAULT '',
    "assignedTruck" TEXT NOT NULL DEFAULT '',
    "assignedTrailer" TEXT NOT NULL DEFAULT '',
    "vehicleClass" TEXT NOT NULL DEFAULT '',
    "vehicleClassRequired" TEXT NOT NULL DEFAULT '',
    "reqBodyCategory" TEXT NOT NULL DEFAULT '',
    "reqGvwMin" TEXT NOT NULL DEFAULT '',
    "reqBodyType" TEXT NOT NULL DEFAULT '',
    "reqEquipment" JSONB,
    "reqLicenceClass" TEXT NOT NULL DEFAULT '',
    "trailerTypesAllowed" JSONB,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "serviceType" TEXT NOT NULL DEFAULT '',
    "jobType" TEXT NOT NULL DEFAULT '',
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "customerRef" TEXT NOT NULL DEFAULT '',
    "purchaseOrderNumber" TEXT NOT NULL DEFAULT '',
    "bookingContactName" TEXT NOT NULL DEFAULT '',
    "bookingContactPhone" TEXT NOT NULL DEFAULT '',
    "bookingContactEmail" TEXT NOT NULL DEFAULT '',
    "billingNotes" TEXT NOT NULL DEFAULT '',
    "customerInstructions" TEXT NOT NULL DEFAULT '',
    "custRefRequired" BOOLEAN NOT NULL DEFAULT false,
    "poRequired" BOOLEAN NOT NULL DEFAULT false,
    "minVehicleSize" TEXT NOT NULL DEFAULT '',
    "trailerTypesForbidden" JSONB,
    "equipmentRequired" JSONB,
    "driverQualificationsReq" JSONB,
    "heightRestriction" TEXT NOT NULL DEFAULT '',
    "weightRestriction" TEXT NOT NULL DEFAULT '',
    "lengthRestriction" TEXT NOT NULL DEFAULT '',
    "vehicleAccessNotes" TEXT NOT NULL DEFAULT '',
    "failureAction" TEXT NOT NULL DEFAULT 'call_assistance',
    "assistancePhone" TEXT NOT NULL DEFAULT '',
    "assistanceNote" TEXT NOT NULL DEFAULT '',
    "returnDestination" TEXT NOT NULL DEFAULT '',
    "altAddress" JSONB,
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "validationStatus" TEXT NOT NULL DEFAULT 'draft',
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE "JobStop" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "savedLocationId" INTEGER,
    "siteName" TEXT NOT NULL DEFAULT '',
    "unitName" TEXT NOT NULL DEFAULT '',
    "street" TEXT NOT NULL DEFAULT '',
    "town" TEXT NOT NULL DEFAULT '',
    "postcode" TEXT NOT NULL DEFAULT '',
    "locationTextSnapshot" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "gateLat" DOUBLE PRECISION,
    "gateLng" DOUBLE PRECISION,
    "timeWindowStart" TIMESTAMP(3),
    "timeWindowEnd" TIMESTAMP(3),
    "bookedTime" TIMESTAMP(3),
    "earliestArrivalMinutes" INTEGER,
    "unloadingAllowanceMinutes" INTEGER,
    "standingChargeNote" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "referenceNumber" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "bookingRequired" BOOLEAN NOT NULL DEFAULT false,
    "bookingRef" TEXT NOT NULL DEFAULT '',
    "openingHours" TEXT NOT NULL DEFAULT '',
    "locationType" TEXT NOT NULL DEFAULT '',
    "navigationInstructions" TEXT NOT NULL DEFAULT '',
    "numPallets" INTEGER,
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'United Kingdom',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "countyRegion" TEXT NOT NULL DEFAULT '',
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
    "dimensions" TEXT NOT NULL DEFAULT '',
    "fragile" BOOLEAN NOT NULL DEFAULT false,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "tempControlled" BOOLEAN NOT NULL DEFAULT false,
    "tempRange" TEXT NOT NULL DEFAULT '',
    "photosRequired" BOOLEAN NOT NULL DEFAULT false,
    "weighbridgeRequired" BOOLEAN NOT NULL DEFAULT false,
    "forkliftRequired" BOOLEAN NOT NULL DEFAULT false,
    "tailLiftRequired" BOOLEAN NOT NULL DEFAULT false,
    "craneRequired" BOOLEAN NOT NULL DEFAULT false,
    "loadingMethod" TEXT NOT NULL DEFAULT '',
    "unloadingMethod" TEXT NOT NULL DEFAULT '',
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
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
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
CREATE TABLE "Shift" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "driverId" INTEGER NOT NULL,
    "driverName" TEXT NOT NULL,
    "shiftDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oilWaterChecked" BOOLEAN NOT NULL DEFAULT false,
    "fuelDrawn" TEXT NOT NULL DEFAULT '',
    "adBlueDrawn" TEXT NOT NULL DEFAULT '',
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "totalHours" TEXT NOT NULL DEFAULT '',
    "breakMins" TEXT NOT NULL DEFAULT '',
    "poaMins" TEXT NOT NULL DEFAULT '',
    "nightOut" BOOLEAN NOT NULL DEFAULT false,
    "expenses" TEXT NOT NULL DEFAULT '',
    "delaysNote" TEXT NOT NULL DEFAULT '',
    "defectsNote" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftSegment" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "segmentNumber" INTEGER NOT NULL,
    "vehicleClass" TEXT NOT NULL DEFAULT 'tractor',
    "truckReg" TEXT NOT NULL,
    "trailerReg" TEXT,
    "odometerStart" INTEGER NOT NULL,
    "odometerEnd" INTEGER,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "needsTruckCheck" BOOLEAN NOT NULL DEFAULT true,
    "needsTrailerCheck" BOOLEAN NOT NULL DEFAULT true,
    "truckChecks" JSONB NOT NULL,
    "trailerChecks" JSONB,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryTask" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "segmentId" INTEGER NOT NULL,
    "materials" TEXT NOT NULL DEFAULT '',
    "collectFrom" TEXT NOT NULL DEFAULT '',
    "deliverTo" TEXT NOT NULL DEFAULT '',
    "ticketNo" TEXT NOT NULL DEFAULT '',
    "startTime" TEXT NOT NULL DEFAULT '',
    "finishTime" TEXT NOT NULL DEFAULT '',
    "hours" TEXT NOT NULL DEFAULT '',
    "loadType" TEXT NOT NULL DEFAULT 'weight',
    "pallets" TEXT NOT NULL DEFAULT '',
    "mileage" TEXT NOT NULL DEFAULT '',
    "tonnes" TEXT NOT NULL DEFAULT '',
    "kgs" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryTask_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "FleetUnit" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "registration" TEXT NOT NULL,
    "vehicleClass" TEXT NOT NULL,
    "vehicleClassLegacy" TEXT NOT NULL DEFAULT '',
    "bodyCategory" TEXT NOT NULL DEFAULT '',
    "gvwClass" TEXT NOT NULL DEFAULT '',
    "bodyType" TEXT NOT NULL DEFAULT '',
    "onboardEquipment" JSONB,
    "status" TEXT NOT NULL DEFAULT 'available',
    "notes" TEXT,
    "assignedDriverId" INTEGER,
    "currentTrailerId" INTEGER,
    "yardLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetTrailer" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "registration" TEXT NOT NULL,
    "trailerType" TEXT NOT NULL,
    "bodyType" TEXT NOT NULL DEFAULT '',
    "trailerLength" TEXT NOT NULL DEFAULT '',
    "decks" INTEGER NOT NULL DEFAULT 1,
    "compartments" INTEGER,
    "onboardEquipment" JSONB,
    "status" TEXT NOT NULL DEFAULT 'available',
    "notes" TEXT,
    "attachedUnitId" INTEGER,
    "linkedJobId" INTEGER,
    "yardLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetTrailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "actorId" INTEGER,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT NOT NULL DEFAULT '',
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Company_ticker_key" ON "Company"("ticker");

-- CreateIndex
CREATE INDEX "Customer_companyId_status_idx" ON "Customer"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_name_key" ON "Customer"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMembership_companyId_userId_key" ON "CompanyMembership"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_userId_key" ON "DriverProfile"("userId");

-- CreateIndex
CREATE INDEX "DriverProfile_companyId_status_idx" ON "DriverProfile"("companyId", "status");

-- CreateIndex
CREATE INDEX "DriverProfile_companyId_displayName_idx" ON "DriverProfile"("companyId", "displayName");

-- CreateIndex
CREATE INDEX "SavedLocation_companyId_name_idx" ON "SavedLocation"("companyId", "name");

-- CreateIndex
CREATE INDEX "SavedLocation_companyId_postcode_idx" ON "SavedLocation"("companyId", "postcode");

-- CreateIndex
CREATE INDEX "JobTemplate_companyId_status_idx" ON "JobTemplate"("companyId", "status");

-- CreateIndex
CREATE INDEX "PlannedJob_companyId_plannedDate_idx" ON "PlannedJob"("companyId", "plannedDate");

-- CreateIndex
CREATE INDEX "PlannedJob_companyId_status_idx" ON "PlannedJob"("companyId", "status");

-- CreateIndex
CREATE INDEX "PlannedJob_companyId_assignedDriverId_idx" ON "PlannedJob"("companyId", "assignedDriverId");

-- CreateIndex
CREATE INDEX "PlannedJob_companyId_customerId_idx" ON "PlannedJob"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "PlannedJob_companyId_updatedAt_idx" ON "PlannedJob"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "PlannedJob_companyId_validationStatus_idx" ON "PlannedJob"("companyId", "validationStatus");

-- CreateIndex
CREATE INDEX "PlannedJob_companyId_jobReference_idx" ON "PlannedJob"("companyId", "jobReference");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedJob_companyId_jobReference_key" ON "PlannedJob"("companyId", "jobReference");

-- CreateIndex
CREATE INDEX "JobStop_companyId_jobId_idx" ON "JobStop"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobStop_companyId_savedLocationId_idx" ON "JobStop"("companyId", "savedLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "JobStop_jobId_sequenceNumber_key" ON "JobStop"("jobId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LoadDetails_jobId_key" ON "LoadDetails"("jobId");

-- CreateIndex
CREATE INDEX "JobAudit_companyId_jobId_idx" ON "JobAudit"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobAudit_createdAt_idx" ON "JobAudit"("createdAt");

-- CreateIndex
CREATE INDEX "JobExecutionEvent_companyId_createdAt_idx" ON "JobExecutionEvent"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobExecutionEvent_companyId_clientEventId_key" ON "JobExecutionEvent"("companyId", "clientEventId");

-- CreateIndex
CREATE INDEX "SyncEventLog_companyId_clientEventId_idx" ON "SyncEventLog"("companyId", "clientEventId");

-- CreateIndex
CREATE INDEX "SyncEventLog_receivedAt_idx" ON "SyncEventLog"("receivedAt");

-- CreateIndex
CREATE INDEX "Shift_companyId_driverId_shiftDate_idx" ON "Shift"("companyId", "driverId", "shiftDate");

-- CreateIndex
CREATE INDEX "Shift_companyId_status_idx" ON "Shift"("companyId", "status");

-- CreateIndex
CREATE INDEX "ShiftSegment_companyId_shiftId_idx" ON "ShiftSegment"("companyId", "shiftId");

-- CreateIndex
CREATE INDEX "ShiftSegment_companyId_startTime_idx" ON "ShiftSegment"("companyId", "startTime");

-- CreateIndex
CREATE INDEX "DeliveryTask_companyId_segmentId_idx" ON "DeliveryTask"("companyId", "segmentId");

-- CreateIndex
CREATE INDEX "DeliveryTask_companyId_shiftId_idx" ON "DeliveryTask"("companyId", "shiftId");

-- CreateIndex
CREATE INDEX "DriverAvailability_companyId_status_idx" ON "DriverAvailability"("companyId", "status");

-- CreateIndex
CREATE INDEX "DriverAvailability_companyId_weekStartDate_idx" ON "DriverAvailability"("companyId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "DriverAvailability_driverProfileId_weekStartDate_key" ON "DriverAvailability"("driverProfileId", "weekStartDate");

-- CreateIndex
CREATE INDEX "ShiftPreference_companyId_driverProfileId_shiftDate_idx" ON "ShiftPreference"("companyId", "driverProfileId", "shiftDate");

-- CreateIndex
CREATE INDEX "ShiftPreference_companyId_status_idx" ON "ShiftPreference"("companyId", "status");

-- CreateIndex
CREATE INDEX "HolidayRequest_companyId_status_idx" ON "HolidayRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "HolidayRequest_companyId_startDate_idx" ON "HolidayRequest"("companyId", "startDate");

-- CreateIndex
CREATE INDEX "DriverWorkingTimeSummary_companyId_driverProfileId_weekStar_idx" ON "DriverWorkingTimeSummary"("companyId", "driverProfileId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "DriverWorkingTimeSummary_driverProfileId_weekStartDate_key" ON "DriverWorkingTimeSummary"("driverProfileId", "weekStartDate");

-- CreateIndex
CREATE INDEX "FleetUnit_companyId_idx" ON "FleetUnit"("companyId");

-- CreateIndex
CREATE INDEX "FleetUnit_companyId_status_idx" ON "FleetUnit"("companyId", "status");

-- CreateIndex
CREATE INDEX "FleetUnit_companyId_registration_idx" ON "FleetUnit"("companyId", "registration");

-- CreateIndex
CREATE INDEX "FleetTrailer_companyId_idx" ON "FleetTrailer"("companyId");

-- CreateIndex
CREATE INDEX "FleetTrailer_companyId_status_idx" ON "FleetTrailer"("companyId", "status");

-- CreateIndex
CREATE INDEX "FleetTrailer_companyId_registration_idx" ON "FleetTrailer"("companyId", "registration");

-- CreateIndex
CREATE INDEX "FleetTrailer_companyId_linkedJobId_idx" ON "FleetTrailer"("companyId", "linkedJobId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entityType_entityId_idx" ON "AuditLog"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_actorId_idx" ON "AuditLog"("companyId", "actorId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JobTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "SavedLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_dropoffLocationId_fkey" FOREIGN KEY ("dropoffLocationId") REFERENCES "SavedLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "JobExecutionEvent" ADD CONSTRAINT "JobExecutionEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PlannedJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionEvent" ADD CONSTRAINT "JobExecutionEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionEvent" ADD CONSTRAINT "JobExecutionEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEventLog" ADD CONSTRAINT "SyncEventLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSegment" ADD CONSTRAINT "ShiftSegment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSegment" ADD CONSTRAINT "ShiftSegment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTask" ADD CONSTRAINT "DeliveryTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTask" ADD CONSTRAINT "DeliveryTask_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "ShiftSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "FleetUnit" ADD CONSTRAINT "FleetUnit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetTrailer" ADD CONSTRAINT "FleetTrailer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

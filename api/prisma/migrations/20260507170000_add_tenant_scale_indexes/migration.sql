-- Tenant-first indexes for planner, dashboard, fleet, and operational lists.
-- These are non-destructive and support the DEVLOG bounded-query contract.

CREATE INDEX IF NOT EXISTS "DriverProfile_companyId_status_idx"
  ON "DriverProfile"("companyId", "status");

CREATE INDEX IF NOT EXISTS "DriverProfile_companyId_displayName_idx"
  ON "DriverProfile"("companyId", "displayName");

CREATE INDEX IF NOT EXISTS "SavedLocation_companyId_name_idx"
  ON "SavedLocation"("companyId", "name");

CREATE INDEX IF NOT EXISTS "SavedLocation_companyId_postcode_idx"
  ON "SavedLocation"("companyId", "postcode");

CREATE INDEX IF NOT EXISTS "JobTemplate_companyId_status_idx"
  ON "JobTemplate"("companyId", "status");

CREATE INDEX IF NOT EXISTS "PlannedJob_companyId_plannedDate_idx"
  ON "PlannedJob"("companyId", "plannedDate");

CREATE INDEX IF NOT EXISTS "PlannedJob_companyId_status_idx"
  ON "PlannedJob"("companyId", "status");

CREATE INDEX IF NOT EXISTS "PlannedJob_companyId_assignedDriverId_idx"
  ON "PlannedJob"("companyId", "assignedDriverId");

CREATE INDEX IF NOT EXISTS "PlannedJob_companyId_customerId_idx"
  ON "PlannedJob"("companyId", "customerId");

CREATE INDEX IF NOT EXISTS "PlannedJob_companyId_updatedAt_idx"
  ON "PlannedJob"("companyId", "updatedAt");

CREATE INDEX IF NOT EXISTS "PlannedJob_companyId_validationStatus_idx"
  ON "PlannedJob"("companyId", "validationStatus");

CREATE INDEX IF NOT EXISTS "JobStop_companyId_savedLocationId_idx"
  ON "JobStop"("companyId", "savedLocationId");

CREATE INDEX IF NOT EXISTS "JobExecutionEvent_companyId_createdAt_idx"
  ON "JobExecutionEvent"("companyId", "createdAt");

CREATE INDEX IF NOT EXISTS "Shift_companyId_driverId_shiftDate_idx"
  ON "Shift"("companyId", "driverId", "shiftDate");

CREATE INDEX IF NOT EXISTS "Shift_companyId_status_idx"
  ON "Shift"("companyId", "status");

CREATE INDEX IF NOT EXISTS "DriverAvailability_companyId_status_idx"
  ON "DriverAvailability"("companyId", "status");

CREATE INDEX IF NOT EXISTS "DriverAvailability_companyId_weekStartDate_idx"
  ON "DriverAvailability"("companyId", "weekStartDate");

CREATE INDEX IF NOT EXISTS "ShiftPreference_companyId_driverProfileId_shiftDate_idx"
  ON "ShiftPreference"("companyId", "driverProfileId", "shiftDate");

CREATE INDEX IF NOT EXISTS "ShiftPreference_companyId_status_idx"
  ON "ShiftPreference"("companyId", "status");

CREATE INDEX IF NOT EXISTS "HolidayRequest_companyId_status_idx"
  ON "HolidayRequest"("companyId", "status");

CREATE INDEX IF NOT EXISTS "HolidayRequest_companyId_startDate_idx"
  ON "HolidayRequest"("companyId", "startDate");

CREATE INDEX IF NOT EXISTS "DriverWorkingTimeSummary_companyId_driverProfileId_weekStartDate_idx"
  ON "DriverWorkingTimeSummary"("companyId", "driverProfileId", "weekStartDate");

CREATE INDEX IF NOT EXISTS "FleetUnit_companyId_status_idx"
  ON "FleetUnit"("companyId", "status");

CREATE INDEX IF NOT EXISTS "FleetUnit_companyId_registration_idx"
  ON "FleetUnit"("companyId", "registration");

CREATE INDEX IF NOT EXISTS "FleetTrailer_companyId_status_idx"
  ON "FleetTrailer"("companyId", "status");

CREATE INDEX IF NOT EXISTS "FleetTrailer_companyId_registration_idx"
  ON "FleetTrailer"("companyId", "registration");

CREATE INDEX IF NOT EXISTS "FleetTrailer_companyId_linkedJobId_idx"
  ON "FleetTrailer"("companyId", "linkedJobId");

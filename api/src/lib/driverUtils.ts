import type { CreateDriverBody, PatchDriverBody } from "../types/requests.js";
import { optionalString, optionalNumber, optionalDate } from "./coerce.js";
import { canDriveCategoriesForLicence } from "./vehicleCompat.js";

export function driverProfileData(body: CreateDriverBody | PatchDriverBody) {
  const licenceClass = body.licenceClass !== undefined ? optionalString(body.licenceClass) ?? "" : undefined;
  return {
    ...(body.displayName !== undefined ? { displayName: optionalString(body.displayName) ?? "" } : {}),
    ...(body.employmentStartDate !== undefined ? { employmentStartDate: optionalDate(body.employmentStartDate) } : {}),
    ...(body.employeeNumber !== undefined ? { employeeNumber: optionalString(body.employeeNumber) || null } : {}),
    ...(body.phoneNumber !== undefined ? { phoneNumber: optionalString(body.phoneNumber) || null, contactPhone: optionalString(body.phoneNumber) || null } : {}),
    ...(body.defaultTruckReg !== undefined ? { defaultTruckReg: optionalString(body.defaultTruckReg) ?? "" } : {}),
    ...(body.defaultTruckClass !== undefined ? { defaultTruckClass: optionalString(body.defaultTruckClass) ?? "" } : {}),
    ...(body.defaultTrailerReg !== undefined ? { defaultTrailerReg: optionalString(body.defaultTrailerReg) ?? "" } : {}),
    ...(body.defaultTrailerClass !== undefined ? { defaultTrailerClass: optionalString(body.defaultTrailerClass) ?? "" } : {}),
    ...(body.driverType !== undefined ? { driverType: optionalString(body.driverType) || "permanent" } : {}),
    ...(licenceClass !== undefined ? { licenceClass, canDriveCategories: canDriveCategoriesForLicence(licenceClass) } : {}),
    ...(body.endorsements !== undefined ? { endorsements: Array.isArray(body.endorsements) ? body.endorsements : [] } : {}),
    ...(body.canUseTrailer !== undefined ? { canUseTrailer: Boolean(body.canUseTrailer) } : {}),
    ...(body.trailerTypesAllowed !== undefined ? { trailerTypesAllowed: Array.isArray(body.trailerTypesAllowed) ? body.trailerTypesAllowed : [] } : {}),
    ...(body.adrAllowed !== undefined ? { adrAllowed: Boolean(body.adrAllowed) } : {}),
    ...(body.hiabAllowed !== undefined ? { hiabAllowed: Boolean(body.hiabAllowed) } : {}),
    ...(body.moffettAllowed !== undefined ? { moffettAllowed: Boolean(body.moffettAllowed) } : {}),
    ...(body.manualHandlingAllowed !== undefined ? { manualHandlingAllowed: Boolean(body.manualHandlingAllowed) } : {}),
    ...(body.preferredStartTime !== undefined ? { preferredStartTime: optionalString(body.preferredStartTime) ?? "" } : {}),
    ...(body.earliestStartTime !== undefined ? { earliestStartTime: optionalString(body.earliestStartTime) ?? "" } : {}),
    ...(body.latestFinishTime !== undefined ? { latestFinishTime: optionalString(body.latestFinishTime) ?? "" } : {}),
    ...(body.preferredShiftHours !== undefined ? { preferredShiftHours: optionalNumber(body.preferredShiftHours) ?? null } : {}),
    ...(body.normalWorkingDays !== undefined ? { normalWorkingDays: Array.isArray(body.normalWorkingDays) ? body.normalWorkingDays : [] } : {}),
    ...(body.weekendAvailable !== undefined ? { weekendAvailable: Boolean(body.weekendAvailable) } : {}),
    ...(body.nightWorkAllowed !== undefined ? { nightWorkAllowed: Boolean(body.nightWorkAllowed) } : {}),
    ...(body.nightsOutAllowed !== undefined ? { nightsOutAllowed: Boolean(body.nightsOutAllowed) } : {}),
    ...(body.overtimeAllowed !== undefined ? { overtimeAllowed: Boolean(body.overtimeAllowed) } : {}),
    ...(body.baseLocation !== undefined ? { baseLocation: optionalString(body.baseLocation) ?? "" } : {}),
    ...(body.operatingArea !== undefined ? { operatingArea: optionalString(body.operatingArea) ?? "" } : {}),
    ...(body.avoidAreas !== undefined ? { avoidAreas: optionalString(body.avoidAreas) ?? "" } : {}),
    ...(body.plannerNotes !== undefined ? { plannerNotes: optionalString(body.plannerNotes) ?? "" } : {}),
    ...(body.holidayAllowance !== undefined ? { holidayAllowance: Math.max(0, Math.round(optionalNumber(body.holidayAllowance) ?? 28)) } : {}),
    ...(body.driverType !== undefined && optionalString(body.driverType) !== "permanent"
      ? { holidayAllowance: 0, holidayUsed: 0 }
      : {}),
  };
}

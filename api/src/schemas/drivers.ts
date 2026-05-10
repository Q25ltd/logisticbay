import { z } from "zod";

const DriverPlanningFields = z.object({
  employmentStartDate:    z.string().nullable().optional(),
  driverType:             z.string().optional(),
  licenceClass:           z.enum(["B", "C1", "C1E", "C", "CE", ""]).optional(),
  endorsements:           z.array(z.string()).optional(),
  canDriveCategories:     z.array(z.string()).optional(),
  canUseTrailer:          z.boolean().optional(),
  trailerTypesAllowed:    z.array(z.string()).optional(),
  adrAllowed:             z.boolean().optional(),
  hiabAllowed:            z.boolean().optional(),
  moffettAllowed:         z.boolean().optional(),
  manualHandlingAllowed:  z.boolean().optional(),
  preferredStartTime:     z.string().optional(),
  earliestStartTime:      z.string().optional(),
  latestFinishTime:       z.string().optional(),
  preferredShiftHours:    z.union([z.number(), z.string(), z.null()]).optional(),
  normalWorkingDays:      z.array(z.string()).optional(),
  weekendAvailable:       z.boolean().optional(),
  nightWorkAllowed:       z.boolean().optional(),
  nightsOutAllowed:       z.boolean().optional(),
  overtimeAllowed:        z.boolean().optional(),
  baseLocation:           z.string().optional(),
  operatingArea:          z.string().optional(),
  avoidAreas:             z.string().optional(),
  plannerNotes:           z.string().optional(),
  holidayAllowance:       z.union([z.number(), z.string()]).optional(),
  holidayRequests:        z.array(z.object({
    startDate: z.string(),
    endDate:   z.string(),
    reason:    z.string().optional(),
    note:      z.string().optional(),
    status:    z.string().optional(),
  })).optional(),
});

export const CreateDriverSchema = DriverPlanningFields.extend({
  displayName:          z.string().min(1, "Display name is required").max(200),
  email:                z.string().email().optional(),
  employeeNumber:       z.string().optional(),
  phoneNumber:          z.string().optional(),
  defaultTruckReg:      z.string().optional(),
  defaultTruckClass:    z.string().optional(),
  defaultTrailerReg:    z.string().optional(),
  defaultTrailerClass:  z.string().optional(),
});

export const PatchDriverSchema = DriverPlanningFields.extend({
  displayName:          z.string().min(1).max(200).optional(),
  employeeNumber:       z.string().optional(),
  phoneNumber:          z.string().optional(),
  defaultTruckReg:      z.string().optional(),
  defaultTruckClass:    z.string().optional(),
  defaultTrailerReg:    z.string().optional(),
  defaultTrailerClass:  z.string().optional(),
});

export const PatchDriverStatusSchema = z.object({
  status: z.enum(["active", "inactive"]),
});

export type CreateDriverBody      = z.infer<typeof CreateDriverSchema>;
export type PatchDriverBody       = z.infer<typeof PatchDriverSchema>;
export type PatchDriverStatusBody = z.infer<typeof PatchDriverStatusSchema>;

import { z } from "zod";

const DriverPlanningFields = z.object({
  employmentStartDate:    z.string().max(200).nullable().optional(),
  driverType:             z.string().max(64).optional(),
  workPattern:            z.enum(["day_driver", "night_driver", "tramper"]).nullable().optional(),
  licenceClass:           z.enum(["B", "C1", "C1E", "C", "CE", ""]).optional(),
  endorsements:           z.array(z.string().max(200)).optional(),
  canDriveCategories:     z.array(z.string().max(200)).optional(),
  canUseTrailer:          z.boolean().optional(),
  trailerTypesAllowed:    z.array(z.string().max(64)).optional(),
  adrAllowed:             z.boolean().optional(),
  hiabAllowed:            z.boolean().optional(),
  moffettAllowed:         z.boolean().optional(),
  manualHandlingAllowed:  z.boolean().optional(),
  preferredStartTime:     z.string().max(200).optional(),
  earliestStartTime:      z.string().max(200).optional(),
  latestFinishTime:       z.string().max(200).optional(),
  preferredShiftHours:    z.union([z.number(), z.string().max(200), z.null()]).optional(),
  normalWorkingDays:      z.array(z.string().max(200)).optional(),
  weekendAvailable:       z.boolean().optional(),
  nightWorkAllowed:       z.boolean().optional(),
  nightsOutAllowed:       z.boolean().optional(),
  overtimeAllowed:        z.boolean().optional(),
  baseLocation:           z.string().max(200).optional(),
  basePostcode:           z.string().max(16).nullable().optional(),
  baseLat:                z.number().nullable().optional(),
  baseLng:                z.number().nullable().optional(),
  operatingArea:          z.string().max(200).optional(),
  avoidAreas:             z.string().max(200).optional(),
  plannerNotes:           z.string().max(4000).optional(),
  holidayAllowance:       z.union([z.number(), z.string().max(200)]).optional(),
  holidayRequests:        z.array(z.object({
    startDate: z.string().max(200),
    endDate:   z.string().max(200),
    reason:    z.string().max(4000).optional(),
    note:      z.string().max(4000).optional(),
    status:    z.string().max(64).optional(),
  })).optional(),
});

export const CreateDriverSchema = DriverPlanningFields.extend({
  displayName:          z.string().min(1, "Display name is required").max(200),
  email:                z.string().max(320).email().optional(),
  employeeNumber:       z.string().max(200).optional(),
  phoneNumber:          z.string().max(32).optional(),
  defaultTruckReg:      z.string().max(64).optional(),
  defaultTruckClass:    z.string().max(64).optional(),
  defaultTrailerReg:    z.string().max(64).optional(),
  defaultTrailerClass:  z.string().max(64).optional(),
});

export const PatchDriverSchema = DriverPlanningFields.extend({
  displayName:          z.string().min(1).max(200).optional(),
  email:                z.string().max(320).email().optional(),
  employeeNumber:       z.string().max(200).optional(),
  phoneNumber:          z.string().max(32).optional(),
  defaultTruckReg:      z.string().max(64).optional(),
  defaultTruckClass:    z.string().max(64).optional(),
  defaultTrailerReg:    z.string().max(64).optional(),
  defaultTrailerClass:  z.string().max(64).optional(),
});

export const PatchDriverStatusSchema = z.object({
  status: z.enum(["active", "inactive"]),
});

export type CreateDriverBody      = z.infer<typeof CreateDriverSchema>;
export type PatchDriverBody       = z.infer<typeof PatchDriverSchema>;
export type PatchDriverStatusBody = z.infer<typeof PatchDriverStatusSchema>;

import { z } from "zod";

const CheckItemSchema = z.object({
  key:    z.string(),
  label:  z.string().optional(),
  result: z.enum(["pass", "fail"]).optional(),
  ok:     z.boolean().optional(),
  note:   z.string().optional(),
});

export const CreateShiftSchema = z.object({
  shiftDate: z.string().optional(),
  startTime: z.string().optional(),
});

export const CreateSegmentSchema = z.object({
  truckReg:           z.string().min(1, "Truck registration is required"),
  trailerReg:         z.string().optional(),
  vehicleClass:       z.string().optional(),
  odometerStart:      z.number().int().min(0).optional(),
  truckChecks:        z.array(CheckItemSchema).optional(),
  trailerChecks:      z.array(CheckItemSchema).optional(),
  needsTruckCheck:    z.boolean().optional(),
  needsTrailerCheck:  z.boolean().optional(),
  prevOdometerEnd:    z.number().int().min(0).optional(),
});

export const CreateDeliverySchema = z.object({
  materials:   z.string().optional(),
  collectFrom: z.string().optional(),
  deliverTo:   z.string().optional(),
  ticketNo:    z.string().optional(),
  startTime:   z.string().optional(),
  finishTime:  z.string().optional(),
  hours:       z.string().optional(),
  mileage:     z.string().optional(),
  tonnes:      z.string().optional(),
  kgs:         z.string().optional(),
  notes:       z.string().optional(),
  loadType:    z.string().optional(),
  pallets:     z.string().optional(),
});

export const SubmitShiftSchema = z.object({
  odometerEnd:   z.number().int().min(0).optional(),
  segmentNotes:  z.string().optional(),
  nightOut:      z.boolean().optional(),
  expenses:      z.string().optional(),
  delaysNote:    z.string().optional(),
  defectsNote:   z.string().optional(),
  endTime:       z.string().optional(),
  totalHours:    z.string().optional(),
  breakMins:     z.union([z.string(), z.number()]).optional(),
  poaMins:       z.union([z.string(), z.number()]).optional(),
  workingMins:   z.union([z.string(), z.number()]).optional(),
  fuelDrawn:     z.string().optional(),
  adBlueDrawn:   z.string().optional(),
});

export type CreateShiftBody    = z.infer<typeof CreateShiftSchema>;
export type CreateSegmentBody  = z.infer<typeof CreateSegmentSchema>;
export type CreateDeliveryBody = z.infer<typeof CreateDeliverySchema>;
export type SubmitShiftBody    = z.infer<typeof SubmitShiftSchema>;

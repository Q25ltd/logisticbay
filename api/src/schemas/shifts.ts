import { z } from "zod";

const CheckItemSchema = z.object({
  key:    z.string().max(64),
  label:  z.string().max(200).optional(),
  result: z.enum(["pass", "fail"]).optional(),
  ok:     z.boolean().optional(),
  note:   z.string().max(4000).optional(),
});

export const CreateShiftSchema = z.object({
  shiftDate: z.string().max(200).optional(),
  startTime: z.string().max(200).optional(),
});

export const CreateSegmentSchema = z.object({
  truckReg:           z.string().max(64).min(1, "Truck registration is required"),
  trailerReg:         z.string().max(64).optional(),
  vehicleClass:       z.string().max(64).optional(),
  odometerStart:      z.number().int().min(0).optional(),
  truckChecks:        z.array(CheckItemSchema).optional(),
  trailerChecks:      z.array(CheckItemSchema).optional(),
  needsTruckCheck:    z.boolean().optional(),
  needsTrailerCheck:  z.boolean().optional(),
  prevOdometerEnd:    z.number().int().min(0).optional(),
});

export const CreateDeliverySchema = z.object({
  materials:   z.string().max(200).optional(),
  collectFrom: z.string().max(200).optional(),
  deliverTo:   z.string().max(200).optional(),
  ticketNo:    z.string().max(200).optional(),
  startTime:   z.string().max(200).optional(),
  finishTime:  z.string().max(200).optional(),
  hours:       z.string().max(200).optional(),
  mileage:     z.string().max(200).optional(),
  tonnes:      z.string().max(200).optional(),
  kgs:         z.string().max(200).optional(),
  notes:       z.string().max(4000).optional(),
  loadType:    z.string().max(64).optional(),
  pallets:     z.string().max(200).optional(),
});

export const SubmitShiftSchema = z.object({
  odometerEnd:   z.number().int().min(0).optional(),
  segmentNotes:  z.string().max(4000).optional(),
  nightOut:      z.boolean().optional(),
  expenses:      z.string().max(200).optional(),
  delaysNote:    z.string().max(4000).optional(),
  defectsNote:   z.string().max(4000).optional(),
  endTime:       z.string().max(200).optional(),
  totalHours:    z.string().max(200).optional(),
  breakMins:     z.union([z.string().max(200), z.number()]).optional(),
  poaMins:       z.union([z.string().max(200), z.number()]).optional(),
  workingMins:   z.union([z.string().max(200), z.number()]).optional(),
  fuelDrawn:     z.string().max(200).optional(),
  adBlueDrawn:   z.string().max(200).optional(),
});

export type CreateShiftBody    = z.infer<typeof CreateShiftSchema>;
export type CreateSegmentBody  = z.infer<typeof CreateSegmentSchema>;
export type CreateDeliveryBody = z.infer<typeof CreateDeliverySchema>;
export type SubmitShiftBody    = z.infer<typeof SubmitShiftSchema>;

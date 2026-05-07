import { z } from "zod";

export const CreateFleetUnitSchema = z.object({
  registration:     z.string().min(1, "Registration is required").max(20).transform(s => s.trim().toUpperCase()),
  vehicleClass:     z.string().min(1, "Vehicle class is required"),
  status:           z.string().optional(),
  notes:            z.string().nullable().optional(),
  assignedDriverId: z.number().int().nullable().optional(),
  currentTrailerId: z.number().int().nullable().optional(),
  yardLocation:     z.string().nullable().optional(),
});

export const PatchFleetUnitSchema = z.object({
  registration:     z.string().min(1).max(20).transform(s => s.trim().toUpperCase()).optional(),
  vehicleClass:     z.string().optional(),
  status:           z.string().optional(),
  notes:            z.string().nullable().optional(),
  assignedDriverId: z.number().int().nullable().optional(),
  currentTrailerId: z.number().int().nullable().optional(),
  yardLocation:     z.string().nullable().optional(),
});

export const CreateFleetTrailerSchema = z.object({
  registration:  z.string().min(1, "Registration is required").max(20).transform(s => s.trim().toUpperCase()),
  trailerType:   z.string().min(1, "Trailer type is required"),
  status:        z.string().optional(),
  notes:         z.string().nullable().optional(),
  attachedUnitId: z.number().int().nullable().optional(),
  linkedJobId:   z.number().int().nullable().optional(),
  yardLocation:  z.string().nullable().optional(),
});

export const PatchFleetTrailerSchema = z.object({
  registration:  z.string().min(1).max(20).transform(s => s.trim().toUpperCase()).optional(),
  trailerType:   z.string().optional(),
  status:        z.string().optional(),
  notes:         z.string().nullable().optional(),
  attachedUnitId: z.number().int().nullable().optional(),
  linkedJobId:   z.number().int().nullable().optional(),
  yardLocation:  z.string().nullable().optional(),
});

export type CreateFleetUnitBody    = z.infer<typeof CreateFleetUnitSchema>;
export type PatchFleetUnitBody     = z.infer<typeof PatchFleetUnitSchema>;
export type CreateFleetTrailerBody = z.infer<typeof CreateFleetTrailerSchema>;
export type PatchFleetTrailerBody  = z.infer<typeof PatchFleetTrailerSchema>;

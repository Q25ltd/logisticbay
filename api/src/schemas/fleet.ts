import { z } from "zod";

export const CreateFleetUnitSchema = z.object({
  registration:     z.string().min(1, "Registration is required").max(20).transform(s => s.trim().toUpperCase()),
  vehicleClass:     z.string().optional(),
  bodyCategory:     z.string().min(1, "Body category is required"),
  gvwClass:         z.string().min(1, "GVW class is required"),
  bodyType:         z.string().optional(),
  onboardEquipment: z.array(z.string()).optional(),
  status:           z.string().optional(),
  notes:            z.string().nullable().optional(),
  assignedDriverId: z.number().int().nullable().optional(),
  currentTrailerId: z.number().int().nullable().optional(),
  yardLocation:     z.string().nullable().optional(),
});

export const PatchFleetUnitSchema = z.object({
  registration:     z.string().min(1).max(20).transform(s => s.trim().toUpperCase()).optional(),
  vehicleClass:     z.string().optional(),
  bodyCategory:     z.string().optional(),
  gvwClass:         z.string().optional(),
  bodyType:         z.string().optional(),
  onboardEquipment: z.array(z.string()).optional(),
  status:           z.string().optional(),
  notes:            z.string().nullable().optional(),
  assignedDriverId: z.number().int().nullable().optional(),
  currentTrailerId: z.number().int().nullable().optional(),
  yardLocation:     z.string().nullable().optional(),
});

export const CreateFleetTrailerSchema = z.object({
  registration:  z.string().min(1, "Registration is required").max(20).transform(s => s.trim().toUpperCase()),
  trailerType:   z.string().optional(),
  bodyType:      z.string().min(1, "Trailer body type is required"),
  trailerLength: z.string().optional(),
  decks:         z.number().int().min(1).max(2).optional(),
  compartments:  z.number().int().nullable().optional(),
  onboardEquipment: z.array(z.string()).optional(),
  status:        z.string().optional(),
  notes:         z.string().nullable().optional(),
  attachedUnitId: z.number().int().nullable().optional(),
  linkedJobId:   z.number().int().nullable().optional(),
  yardLocation:  z.string().nullable().optional(),
});

export const PatchFleetTrailerSchema = z.object({
  registration:  z.string().min(1).max(20).transform(s => s.trim().toUpperCase()).optional(),
  trailerType:   z.string().optional(),
  bodyType:      z.string().optional(),
  trailerLength: z.string().optional(),
  decks:         z.number().int().min(1).max(2).optional(),
  compartments:  z.number().int().nullable().optional(),
  onboardEquipment: z.array(z.string()).optional(),
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

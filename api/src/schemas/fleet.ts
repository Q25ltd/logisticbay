/**
 * Fleet intake schemas — unit/trailer registration is one of the four intake
 * gates (ARCHITECTURE.md § Four intake gates). Shape, caps, numeric sanity
 * bounds, and status enums live here; taxonomy validity (bodyCategory /
 * gvwClass / bodyType) is enforced in the routes because it runs AFTER the
 * legacy vehicleClass/trailerType fallback merge.
 */
import { z } from "zod";
import { UNIT_STATUSES, TRAILER_STATUSES } from "../constants/fleetVocab.js";

const registrationField = z.string().trim().min(1, "Registration is required").max(20);

// Loose physical sanity bounds — catch unit mistakes (cm typed as m), not legal limits.
const dimensionFields = {
  heightM:   z.number().positive().max(8,  "Height must be in metres").nullable().optional(),
  widthM:    z.number().positive().max(5,  "Width must be in metres").nullable().optional(),
  lengthM:   z.number().positive().max(40, "Length must be in metres").nullable().optional(),
  axleLoadT: z.number().positive().max(20, "Axle load must be in tonnes").nullable().optional(),
};

const sharedFields = {
  onboardEquipment: z.array(z.string().max(64)).max(50).optional(),
  notes:            z.string().max(4000).nullable().optional(),
  yardLocation:     z.string().max(200).nullable().optional(),
  ...dimensionFields,
};

export const CreateFleetUnitSchema = z.object({
  registration: registrationField,
  vehicleClass: z.string().trim().max(64).optional(),
  bodyCategory: z.string().trim().max(64).optional(),
  gvwClass:     z.string().trim().max(64).optional(),
  bodyType:     z.string().trim().max(64).optional(),
  status:       z.enum(UNIT_STATUSES).optional(),
  ...sharedFields,
});
export const PatchFleetUnitSchema = CreateFleetUnitSchema.partial();

export const CreateFleetTrailerSchema = z.object({
  registration:  registrationField,
  trailerType:   z.string().trim().max(64).optional(), // legacy alias — mapped, never persisted raw
  bodyType:      z.string().trim().max(64).optional(),
  trailerLength: z.string().trim().max(64).optional(),
  decks:         z.number().int().min(1).max(2).optional(),
  compartments:  z.number().int().min(0).max(20).nullable().optional(),
  status:        z.enum(TRAILER_STATUSES).optional(),
  ...sharedFields,
});
export const PatchFleetTrailerSchema = CreateFleetTrailerSchema.partial();


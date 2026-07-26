import { z } from "zod";

// ── Stop (JobPart) schema ─────────────────────────────────────────────────────

const JobPartSchema = z.object({
  sequenceNumber:            z.number().int().min(1),
  type:                      z.string().max(64).min(1),
  savedLocationId:           z.number().int().nullable().optional(),
  siteName:                  z.string().max(200).optional(),
  unitName:                  z.string().max(64).optional(),
  street:                    z.string().max(4000).optional(),
  addressLine2:              z.string().max(4000).optional(),
  town:                      z.string().max(200).optional(),
  countyRegion:              z.string().max(64).optional(),
  postcode:                  z.string().max(16).optional(),
  country:                   z.string().max(200).optional(),
  locationTextSnapshot:      z.string().max(4000).default(""),
  lat:                       z.number().nullable().optional(),
  lng:                       z.number().nullable().optional(),
  timeWindowStart:           z.string().max(200).nullable().optional(),
  timeWindowEnd:             z.string().max(200).nullable().optional(),
  bookedTime:                z.string().max(200).nullable().optional(),
  unloadingAllowanceMinutes: z.number().int().nullable().optional(),
  contactName:               z.string().max(200).optional(),
  contactPhone:              z.string().max(32).optional(),
  contactEmail:              z.string().max(320).optional(),
  referenceNumber:           z.string().max(64).optional(),
  bookingRequired:           z.boolean().optional(),
  bookingRef:                z.string().max(200).optional(),
  openingHours:              z.string().max(200).optional(),
  locationType:              z.string().max(64).optional(),
  instructions:              z.string().max(4000).optional(),
  navigationInstructions:    z.string().max(4000).optional(),
  internalNotes:             z.string().max(4000).optional(),
  quantityRequired:          z.number().nullable().optional(),
  quantityUnit:              z.string().max(64).optional(),
  exchangeDropQty:           z.number().nullable().optional(),
  exchangeCollectQty:        z.number().nullable().optional(),
  exchangeUnit:              z.string().max(64).optional(),
  handlingMethods:           z.array(z.string().max(200)).nullable().optional(),
  accessRequirements:        z.array(z.string().max(200)).nullable().optional(),
  proofRequirements:         z.array(z.string().max(200)).nullable().optional(),
  loadReadiness:             z.string().max(200).optional(),
  stopNotes:                 z.string().max(4000).optional(),
  heightRestriction:         z.string().max(200).optional(),
  weightRestriction:         z.string().max(200).optional(),
  lengthRestriction:         z.string().max(200).optional(),
  // legacy compat — still accepted but not read by new route code
  numPallets:                z.number().int().nullable().optional(),
  earliestArrivalMinutes:    z.number().int().nullable().optional(),
}).strip();

// ── Job base schema (fields both CJP and PRF can set) ─────────────────────────

const JobCreateBaseSchema = z.object({
  // Identity & customer
  customerId:              z.number().int().nullable().optional(),
  customerName:            z.string().max(200).optional(),
  customerRef:             z.string().max(200).optional(),
  purchaseOrderNumber:     z.string().max(200).optional(),
  jobTitle:                z.string().max(200).nullable().optional(),
  priority:                z.enum(["low", "normal", "high", "urgent"]).optional(),
  serviceType:             z.string().max(64).optional(),
  jobType:                 z.string().max(64).optional(),
  canSplitShipment:        z.string().max(200).optional(),
  templateId:              z.number().int().optional(),

  // Booking contact
  bookingContactName:      z.string().max(200).optional(),
  bookingContactPhone:     z.string().max(32).optional(),
  bookingContactEmail:     z.string().max(320).optional(),

  // Billing
  billingReference:        z.string().max(64).nullable().optional(),
  billingNotes:            z.string().max(4000).optional(),
  declaredGoodsValue:      z.string().max(200).nullable().optional(),
  custRefRequired:         z.boolean().optional(),
  poRequired:              z.boolean().optional(),

  // Load
  goodsType:               z.string().max(64).optional(),
  goodsDescription:        z.string().max(4000).optional(),
  quantity:                z.number().nullable().optional(),
  quantityUnit:            z.string().max(64).optional(),
  weight:                  z.number().nullable().optional(),
  volume:                  z.number().nullable().optional(),
  dimensions:              z.string().max(200).optional(),
  fragile:                 z.boolean().optional(),
  stackable:               z.boolean().optional(),
  tempControlled:          z.boolean().optional(),
  tempRange:               z.string().max(200).optional(),
  hazardClass:             z.string().max(64).optional(),
  tunnelCode:              z.string().max(64).nullable().optional(),
  photosRequired:          z.boolean().optional(),
  weighbridgeRequired:     z.boolean().optional(),
  securingRequirements:    z.array(z.string().max(200)).nullable().optional(),
  specialRequirements:     z.array(z.string().max(200)).nullable().optional(),
  // Goods sub-type details blob
  loadData:                              z.record(z.string().max(4000), z.unknown()).nullable().optional(),

  // Vehicle requirements
  vehicleCategory:         z.string().max(200).nullable().optional(),
  bodyTypes:               z.array(z.string().max(64)).nullable().optional(),
  minGvwClass:             z.string().max(64).nullable().optional(),
  equipment:               z.array(z.string().max(200)).nullable().optional(),
  trailersAllowed:         z.array(z.string().max(200)).nullable().optional(),
  vehicleAccessNotes:      z.string().max(4000).optional(),

  // Exception policy
  failureAction:           z.string().max(200).optional(),
  assistancePhone:         z.string().max(32).nullable().optional(),
  assistanceNote:          z.string().max(4000).nullable().optional(),
  approvalContactName:     z.string().max(200).nullable().optional(),
  approvalContactPhone:    z.string().max(32).nullable().optional(),
  alternativeReturnAddress:      z.string().max(4000).nullable().optional(),
  alternativeReturnPostcode:     z.string().max(16).nullable().optional(),
  alternativeReturnContactName:  z.string().max(200).nullable().optional(),
  alternativeReturnContactPhone: z.string().max(32).nullable().optional(),
  // Extended alternative return address
  alternativeReturnSiteName:              z.string().max(200).nullable().optional(),
  alternativeReturnAddressLine2:          z.string().max(4000).nullable().optional(),
  alternativeReturnTown:                  z.string().max(200).nullable().optional(),
  alternativeReturnCounty:                z.string().max(200).nullable().optional(),
  alternativeReturnCountry:               z.string().max(200).nullable().optional(),
  alternativeReturnLat:                   z.number().nullable().optional(),
  alternativeReturnLng:                   z.number().nullable().optional(),
  alternativeReturnNavigationInstructions: z.string().max(4000).nullable().optional(),
  // Rejection policy
  photosRequiredOnRejection:              z.boolean().optional(),
  rejectionSignatureRequired:             z.boolean().optional(),
  rejectionNotes:                         z.string().max(4000).nullable().optional(),

  // Proof
  requirePOD:              z.boolean().optional(),

  // Driver-visible notes
  driverNoteChips:         z.array(z.string().max(4000)).nullable().optional(),
  driverVisibleNotes:      z.string().max(4000).nullable().optional(),
  safetyInstructions:      z.string().max(4000).nullable().optional(),

  // Stops
  stops:                   z.array(JobPartSchema).optional(),
}).strip();

// ── CJP variant — adds planner-only fields ────────────────────────────────────

export const CreateJobSchema = JobCreateBaseSchema.extend({
  saveMode:       z.enum(["draft", "ready_to_plan"]).optional(),
  plannerNotes:   z.string().max(4000).nullable().optional(),
  internalNotes:  z.string().max(4000).nullable().optional(),
  saveAsTemplate: z.boolean().optional(),
  templateName:   z.string().max(200).optional(),
}).strip();

// ── PATCH variant — all fields optional ───────────────────────────────────────

export const PatchJobSchema = JobCreateBaseSchema.extend({
  saveMode:      z.enum(["draft", "ready_to_plan"]).optional(),
  plannerNotes:  z.string().max(4000).nullable().optional(),
  internalNotes: z.string().max(4000).nullable().optional(),
  status:        z.string().max(64).optional(),
}).strip();

// ── Accept a PRF request into planning ────────────────────────────────────────
// The planner reviews the customer's submission and may add/adjust the
// driver-facing notes here (CJP deliberately has no driver-notes section —
// they are added at accept time).
export const AcceptJobRequestSchema = z.object({
  plannerNotes:       z.string().max(4000).optional(),
  vehicleCategory:    z.string().max(200).optional(),
  bodyTypes:          z.array(z.string().max(64)).optional(),
  driverVisibleNotes: z.string().max(4000).optional(),
  safetyInstructions: z.string().max(4000).optional(),
});

// ── Status update, note ───────────────────────────────────────────────────────

export const UpdateJobStatusSchema = z.object({
  status:          z.string().max(64).min(1, "Status is required"),
  note:            z.string().max(4000).optional(),
  actualQuantity:  z.string().max(200).optional(),
  actualUnit:      z.string().max(64).optional(),
  collectionNote:  z.string().max(4000).optional(),
  podNumber:       z.string().max(200).optional(),
  deliveryNote:    z.string().max(4000).optional(),
  clientEventId:   z.string().max(200).min(1).optional(),
  clientTimestamp: z.string().max(200).optional(),
  gpsLat:          z.number().min(-90).max(90).optional(),
  gpsLng:          z.number().min(-180).max(180).optional(),
  // Optional: the app knows which JobPart/assignment card the driver is acting
  // on (job.runAssignments). When given, it's used directly (validated against
  // this job+driver); otherwise applyJobEvent picks the assignment whose
  // current state is eligible for this event — a job normally has 2+
  // assignments (one per JobPart), so "the driver's first" is not reliable.
  runAssignmentId: z.number().int().positive().optional(),
});

export const AddJobNoteSchema = z.object({
  note:          z.string().min(1, "Note cannot be empty").max(4000).trim(),
  clientEventId: z.string().min(1).max(64).trim(),
});

/**
 * TASK 3.8 — Planner override status change.
 * Used by POST /jobs/:id/status_override.
 * reason is mandatory so planners cannot silently override without explanation.
 */
export const StatusOverrideSchema = z.object({
  status:  z.string().max(64).trim(),
  reason:  z.string().min(1, "Reason is required").max(1000).trim(),
  notes:   z.string().max(4000).trim().optional(),
});

export type CreateJobInput         = z.infer<typeof CreateJobSchema>;
export type PatchJobInput          = z.infer<typeof PatchJobSchema>;
export type UpdateJobStatusInput   = z.infer<typeof UpdateJobStatusSchema>;
export type AddJobNoteInput        = z.infer<typeof AddJobNoteSchema>;
export type StatusOverrideInput    = z.infer<typeof StatusOverrideSchema>;

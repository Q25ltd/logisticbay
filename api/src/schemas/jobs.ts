import { z } from "zod";

// ── Stop (JobPart) schema ─────────────────────────────────────────────────────

const JobPartSchema = z.object({
  sequenceNumber:            z.number().int().min(1),
  type:                      z.string().min(1),
  savedLocationId:           z.number().int().nullable().optional(),
  siteName:                  z.string().optional(),
  unitName:                  z.string().optional(),
  street:                    z.string().optional(),
  addressLine2:              z.string().optional(),
  town:                      z.string().optional(),
  countyRegion:              z.string().optional(),
  postcode:                  z.string().optional(),
  country:                   z.string().optional(),
  locationTextSnapshot:      z.string().default(""),
  lat:                       z.number().nullable().optional(),
  lng:                       z.number().nullable().optional(),
  gateLat:                   z.number().nullable().optional(),
  gateLng:                   z.number().nullable().optional(),
  timeWindowStart:           z.string().nullable().optional(),
  timeWindowEnd:             z.string().nullable().optional(),
  bookedTime:                z.string().nullable().optional(),
  unloadingAllowanceMinutes: z.number().int().nullable().optional(),
  contactName:               z.string().optional(),
  contactPhone:              z.string().optional(),
  contactEmail:              z.string().optional(),
  referenceNumber:           z.string().optional(),
  bookingRequired:           z.boolean().optional(),
  bookingRef:                z.string().optional(),
  openingHours:              z.string().optional(),
  locationType:              z.string().optional(),
  instructions:              z.string().optional(),
  navigationInstructions:    z.string().optional(),
  internalNotes:             z.string().optional(),
  quantityRequired:          z.number().nullable().optional(),
  quantityUnit:              z.string().optional(),
  exchangeDropQty:           z.number().nullable().optional(),
  exchangeCollectQty:        z.number().nullable().optional(),
  exchangeUnit:              z.string().optional(),
  handlingMethods:           z.array(z.string()).nullable().optional(),
  accessRequirements:        z.array(z.string()).nullable().optional(),
  proofRequirements:         z.array(z.string()).nullable().optional(),
  loadReadiness:             z.string().optional(),
  stopNotes:                 z.string().optional(),
  heightRestriction:         z.string().optional(),
  weightRestriction:         z.string().optional(),
  lengthRestriction:         z.string().optional(),
  // legacy compat — still accepted but not read by new route code
  numPallets:                z.number().int().nullable().optional(),
  earliestArrivalMinutes:    z.number().int().nullable().optional(),
}).strip();

// ── Job base schema (fields both CJP and PRF can set) ─────────────────────────

const JobCreateBaseSchema = z.object({
  // Identity & customer
  customerId:              z.number().int().nullable().optional(),
  customerName:            z.string().optional(),
  customerRef:             z.string().optional(),
  purchaseOrderNumber:     z.string().optional(),
  jobTitle:                z.string().nullable().optional(),
  priority:                z.enum(["low", "normal", "high", "urgent"]).optional(),
  serviceType:             z.string().optional(),
  jobType:                 z.string().optional(),
  canSplitShipment:        z.string().optional(),
  templateId:              z.number().int().optional(),

  // Booking contact
  bookingContactName:      z.string().optional(),
  bookingContactPhone:     z.string().optional(),
  bookingContactEmail:     z.string().optional(),

  // Billing
  billingReference:        z.string().nullable().optional(),
  billingNotes:            z.string().optional(),
  declaredGoodsValue:      z.string().nullable().optional(),
  custRefRequired:         z.boolean().optional(),
  poRequired:              z.boolean().optional(),

  // Load
  goodsType:               z.string().optional(),
  goodsDescription:        z.string().optional(),
  quantity:                z.number().nullable().optional(),
  quantityUnit:            z.string().optional(),
  weight:                  z.number().nullable().optional(),
  volume:                  z.number().nullable().optional(),
  dimensions:              z.string().optional(),
  fragile:                 z.boolean().optional(),
  stackable:               z.boolean().optional(),
  tempControlled:          z.boolean().optional(),
  tempRange:               z.string().optional(),
  hazardClass:             z.string().optional(),
  photosRequired:          z.boolean().optional(),
  weighbridgeRequired:     z.boolean().optional(),
  securingRequirements:    z.array(z.string()).nullable().optional(),
  specialRequirements:     z.array(z.string()).nullable().optional(),
  // Goods sub-type details blob
  loadData:                              z.record(z.string(), z.unknown()).nullable().optional(),

  // Vehicle requirements
  vehicleCategory:         z.string().optional(),
  bodyTypes:               z.array(z.string()).nullable().optional(),
  minGvwClass:             z.string().optional(),
  equipment:               z.array(z.string()).nullable().optional(),
  trailersAllowed:         z.array(z.string()).nullable().optional(),
  vehicleAccessNotes:      z.string().optional(),

  // Exception policy
  failureAction:           z.string().optional(),
  assistancePhone:         z.string().nullable().optional(),
  assistanceNote:          z.string().nullable().optional(),
  approvalContactName:     z.string().nullable().optional(),
  approvalContactPhone:    z.string().nullable().optional(),
  alternativeReturnAddress:      z.string().nullable().optional(),
  alternativeReturnPostcode:     z.string().nullable().optional(),
  alternativeReturnContactName:  z.string().nullable().optional(),
  alternativeReturnContactPhone: z.string().nullable().optional(),
  // Extended alternative return address
  alternativeReturnSiteName:              z.string().nullable().optional(),
  alternativeReturnAddressLine2:          z.string().nullable().optional(),
  alternativeReturnTown:                  z.string().nullable().optional(),
  alternativeReturnCounty:                z.string().nullable().optional(),
  alternativeReturnCountry:               z.string().nullable().optional(),
  alternativeReturnLat:                   z.number().nullable().optional(),
  alternativeReturnLng:                   z.number().nullable().optional(),
  alternativeReturnNavigationInstructions: z.string().nullable().optional(),
  // Rejection policy
  photosRequiredOnRejection:              z.boolean().optional(),
  rejectionSignatureRequired:             z.boolean().optional(),
  rejectionNotes:                         z.string().nullable().optional(),

  // Proof
  requirePOD:              z.boolean().optional(),

  // Driver-visible notes
  driverNoteChips:         z.array(z.string()).nullable().optional(),
  driverVisibleNotes:      z.string().nullable().optional(),
  safetyInstructions:      z.string().nullable().optional(),

  // Stops
  stops:                   z.array(JobPartSchema).optional(),
}).strip();

// ── CJP variant — adds planner-only fields ────────────────────────────────────

export const CreateJobSchema = JobCreateBaseSchema.extend({
  saveMode:       z.enum(["draft", "ready_to_plan"]).optional(),
  plannedDate:    z.string().nullable().optional(),
  plannerNotes:   z.string().nullable().optional(),
  internalNotes:  z.string().nullable().optional(),
  saveAsTemplate: z.boolean().optional(),
  templateName:   z.string().optional(),
}).strip();

// ── PATCH variant — all fields optional ───────────────────────────────────────

export const PatchJobSchema = JobCreateBaseSchema.extend({
  saveMode:      z.enum(["draft", "ready_to_plan"]).optional(),
  plannedDate:   z.string().nullable().optional(),
  plannerNotes:  z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  status:        z.string().optional(),
}).strip();

// ── Status update, note ───────────────────────────────────────────────────────

export const UpdateJobStatusSchema = z.object({
  status:          z.string().min(1, "Status is required"),
  note:            z.string().optional(),
  actualQuantity:  z.string().optional(),
  actualUnit:      z.string().optional(),
  collectionNote:  z.string().optional(),
  podNumber:       z.string().optional(),
  deliveryNote:    z.string().optional(),
  clientEventId:   z.string().min(1).optional(),
  clientTimestamp: z.string().optional(),
  gpsLat:          z.number().min(-90).max(90).optional(),
  gpsLng:          z.number().min(-180).max(180).optional(),
});

export const AddJobNoteSchema = z.object({
  note: z.string().min(1, "Note cannot be empty"),
});

export type CreateJobInput        = z.infer<typeof CreateJobSchema>;
export type PatchJobInput         = z.infer<typeof PatchJobSchema>;
export type UpdateJobStatusInput  = z.infer<typeof UpdateJobStatusSchema>;
export type AddJobNoteInput       = z.infer<typeof AddJobNoteSchema>;

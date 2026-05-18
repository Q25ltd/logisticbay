import type { StructuredJobPartInput, StructuredLoadDetailsInput } from "../services/jobValidation.js";
import { toNullableDate } from "./coerce.js";
import { Prisma } from "../generated/client.js";

export function hasLoadDetailsInput(loadDetails: StructuredLoadDetailsInput | null | undefined): boolean {
  if (!loadDetails) return false;
  return Object.values(loadDetails).some(v => v !== undefined && v !== null && v !== "");
}

export function appendPlannerReason(existing: string, reason: string): string {
  const cleanReason = reason.trim();
  if (!cleanReason) return existing;
  const stamp = new Date().toISOString();
  return [existing?.trim(), `[Planner allocation ${stamp}] ${cleanReason}`].filter(Boolean).join("\n");
}

export function buildStopData(s: StructuredJobPartInput, companyId: number) {
  return {
    companyId,
    sequenceNumber:            s.sequenceNumber ?? 0,
    type:                      String(s.type ?? ""),
    savedLocationId:           s.savedLocationId ?? null,
    siteName:                  typeof s.siteName === "string" ? (s.siteName.trim() || null) : null,
    unitName:                  typeof s.unitName === "string" ? (s.unitName.trim() || null) : null,
    street:                    typeof s.street === "string" ? (s.street.trim() || null) : null,
    town:                      typeof s.town === "string" ? (s.town.trim() || null) : null,
    postcode:                  typeof s.postcode === "string" ? (s.postcode.trim().toUpperCase() || null) : null,
    locationTextSnapshot:      s.locationTextSnapshot != null ? (String(s.locationTextSnapshot).trim() || null) : null,
    lat:                       s.lat ?? null,
    lng:                       s.lng ?? null,
    gateLat:                   s.gateLat ?? null,
    gateLng:                   s.gateLng ?? null,
    timeWindowStart:           toNullableDate(s.timeWindowStart),
    timeWindowEnd:             toNullableDate(s.timeWindowEnd),
    bookedTime:                toNullableDate(s.bookedTime),
    earliestArrivalMinutes:    s.earliestArrivalMinutes != null ? Math.round(Number(s.earliestArrivalMinutes)) : null,
    unloadingAllowanceMinutes: s.unloadingAllowanceMinutes != null ? Math.round(Number(s.unloadingAllowanceMinutes)) : null,
    contactName:               typeof s.contactName === "string" ? (s.contactName.trim() || null) : null,
    contactPhone:              typeof s.contactPhone === "string" ? (s.contactPhone.trim() || null) : null,
    referenceNumber:           typeof s.referenceNumber === "string" ? (s.referenceNumber.trim() || null) : null,
    instructions:              typeof s.instructions === "string" ? (s.instructions.trim() || null) : null,
    contactEmail:              typeof s.contactEmail === "string" ? (s.contactEmail.trim() || null) : null,
    bookingRequired:           s.bookingRequired ?? false,
    bookingRef:                typeof s.bookingRef === "string" ? (s.bookingRef.trim() || null) : null,
    openingHours:              typeof s.openingHours === "string" ? (s.openingHours.trim() || null) : null,
    locationType:              typeof s.locationType === "string" ? (s.locationType.trim() || null) : null,
    navigationInstructions:    typeof s.navigationInstructions === "string" ? (s.navigationInstructions.trim() || null) : null,
    numPallets:                s.numPallets != null ? Math.round(Number(s.numPallets)) : null,
    internalNotes:             typeof s.internalNotes === "string" ? (s.internalNotes.trim() || null) : null,
    country:                   typeof s.country === "string" ? s.country.trim() : "United Kingdom",
    addressLine2:              typeof s.addressLine2 === "string" ? (s.addressLine2.trim() || null) : null,
    countyRegion:              typeof s.countyRegion === "string" ? (s.countyRegion.trim() || null) : null,
    // New form-parity fields
    quantityRequired:          s.quantityRequired != null ? Number(s.quantityRequired) : null,
    quantityUnit:              typeof s.quantityUnit === "string" ? (s.quantityUnit.trim() || null) : null,
    exchangeDropQty:           s.exchangeDropQty != null ? Number(s.exchangeDropQty) : null,
    exchangeCollectQty:        s.exchangeCollectQty != null ? Number(s.exchangeCollectQty) : null,
    exchangeUnit:              typeof s.exchangeUnit === "string" ? (s.exchangeUnit.trim() || null) : null,
    handlingMethods:           Array.isArray(s.handlingMethods) ? (s.handlingMethods as Prisma.InputJsonValue) : undefined,
    accessRequirements:        Array.isArray(s.accessRequirements) ? (s.accessRequirements as Prisma.InputJsonValue) : undefined,
    proofRequirements:         Array.isArray(s.proofRequirements) ? (s.proofRequirements as Prisma.InputJsonValue) : undefined,
    loadReadiness:             typeof s.loadReadiness === "string" ? (s.loadReadiness.trim() || null) : null,
    stopNotes:                 typeof s.stopNotes === "string" ? (s.stopNotes.trim() || null) : null,
    status:                    "pending",
  };
}

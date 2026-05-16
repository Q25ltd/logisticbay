import type { StructuredJobPartInput, StructuredLoadDetailsInput } from "../services/jobValidation.js";
import { toNullableDate } from "./coerce.js";

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
    siteName:                  typeof s.siteName === "string" ? s.siteName.trim() : "",
    unitName:                  typeof s.unitName === "string" ? s.unitName.trim() : "",
    street:                    typeof s.street === "string" ? s.street.trim() : "",
    town:                      typeof s.town === "string" ? s.town.trim() : "",
    postcode:                  typeof s.postcode === "string" ? s.postcode.trim().toUpperCase() : "",
    locationTextSnapshot:      String(s.locationTextSnapshot ?? "").trim(),
    lat:                       s.lat ?? null,
    lng:                       s.lng ?? null,
    gateLat:                   s.gateLat ?? null,
    gateLng:                   s.gateLng ?? null,
    timeWindowStart:           toNullableDate(s.timeWindowStart),
    timeWindowEnd:             toNullableDate(s.timeWindowEnd),
    bookedTime:                toNullableDate(s.bookedTime),
    earliestArrivalMinutes:    s.earliestArrivalMinutes != null ? Math.round(Number(s.earliestArrivalMinutes)) : null,
    unloadingAllowanceMinutes: s.unloadingAllowanceMinutes != null ? Math.round(Number(s.unloadingAllowanceMinutes)) : null,
    contactName:               typeof s.contactName === "string" ? s.contactName.trim() : "",
    contactPhone:              typeof s.contactPhone === "string" ? s.contactPhone.trim() : "",
    referenceNumber:           typeof s.referenceNumber === "string" ? s.referenceNumber.trim() : "",
    instructions:              typeof s.instructions === "string" ? s.instructions.trim() : "",
    contactEmail:              typeof s.contactEmail === "string" ? s.contactEmail.trim() : "",
    bookingRequired:           s.bookingRequired ?? false,
    bookingRef:                typeof s.bookingRef === "string" ? s.bookingRef.trim() : "",
    openingHours:              typeof s.openingHours === "string" ? s.openingHours.trim() : "",
    locationType:              typeof s.locationType === "string" ? s.locationType.trim() : "",
    navigationInstructions:    typeof s.navigationInstructions === "string" ? s.navigationInstructions.trim() : "",
    numPallets:                s.numPallets != null ? Math.round(Number(s.numPallets)) : null,
    internalNotes:             typeof s.internalNotes === "string" ? s.internalNotes.trim() : "",
    country:                   typeof s.country === "string" ? s.country.trim() : "United Kingdom",
    addressLine2:              typeof s.addressLine2 === "string" ? s.addressLine2.trim() : "",
    countyRegion:              typeof s.countyRegion === "string" ? s.countyRegion.trim() : "",
    status:                    "pending",
  };
}

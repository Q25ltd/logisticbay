import type {
  StructuredJobPartInput,
  StructuredLoadDetailsInput,
} from "./jobValidation.js";

export interface JobQualityResult {
  score: number;
  reasons: string[];
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// The "Exact entrance pin" on the stop card is captured in lat/lng — the
// former gateLat/gateLng duplicate columns were removed 2026-07-14 (no form
// wrote them, so this check silently failed for every job).
function hasGate(stop: StructuredJobPartInput): boolean {
  return typeof stop.lat === "number" && Number.isFinite(stop.lat)
    && typeof stop.lng === "number" && Number.isFinite(stop.lng);
}

function hasTimeWindow(stop: StructuredJobPartInput): boolean {
  return !!stop.timeWindowStart && !!stop.timeWindowEnd;
}

function hasContact(stop: StructuredJobPartInput): boolean {
  return hasText(stop.contactName) || hasText(stop.contactPhone);
}

function hasSavedLocation(stop: StructuredJobPartInput): boolean {
  return typeof stop.savedLocationId === "number" && stop.savedLocationId > 0;
}

function hasLoadDetails(loadDetails?: StructuredLoadDetailsInput | null): boolean {
  if (!loadDetails) return false;
  return loadDetails.quantity !== undefined
    || hasText(loadDetails.unit)
    || hasText(loadDetails.materialType)
    || hasText(loadDetails.notes);
}

export function scoreStructuredJob(input: {
  stops?: StructuredJobPartInput[];
  loadDetails?: StructuredLoadDetailsInput | null;
}): JobQualityResult {
  const reasons: string[] = [];
  let score = 0;

  const stops = Array.isArray(input.stops) ? input.stops : [];

  if (stops.length > 0 && stops.every(s => hasText(s.locationTextSnapshot))) {
    score += 30;
    reasons.push("All stops have addresses");
  }

  if (stops.length > 0 && stops.every(hasContact)) {
    score += 10;
    reasons.push("All stops have contact info");
  }

  if (stops.length > 0 && stops.every(hasTimeWindow)) {
    score += 10;
    reasons.push("All stops have time windows");
  }

  if (stops.length > 0 && stops.every(hasGate)) {
    score += 15;
    reasons.push("All stops have gate coordinates");
  }

  if (stops.length > 0 && stops.every(hasSavedLocation)) {
    score += 15;
    reasons.push("All stops reuse saved locations");
  }

  if (hasLoadDetails(input.loadDetails)) {
    score += 10;
    reasons.push("Load details provided");
  }

  if (stops.some(s => hasText(s.instructions) || hasText(s.referenceNumber))) {
    score += 10;
    reasons.push("Instructions or references provided");
  }

  return {
    score: Math.min(100, score),
    reasons,
  };
}

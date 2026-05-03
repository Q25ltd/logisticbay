import type {
  StructuredJobStopInput,
  StructuredLoadDetailsInput,
} from "./jobValidation.js";

export interface JobQualityResult {
  score: number;
  reasons: string[];
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasGate(stop: StructuredJobStopInput): boolean {
  return typeof stop.gateLat === "number" && Number.isFinite(stop.gateLat)
    && typeof stop.gateLng === "number" && Number.isFinite(stop.gateLng);
}

function hasTimeWindow(stop: StructuredJobStopInput): boolean {
  return !!stop.timeWindowStart && !!stop.timeWindowEnd;
}

function hasContact(stop: StructuredJobStopInput): boolean {
  return hasText(stop.contactName) || hasText(stop.contactPhone);
}

function hasSavedLocation(stop: StructuredJobStopInput): boolean {
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
  stops?: StructuredJobStopInput[];
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

import {
  isJobStopType,
  isLoadUnit,
  isTrailerType,
  isVehicleClass,
} from "../constants/jobCreation.js";

export interface StructuredJobStopInput {
  sequenceNumber?: number;
  type?: unknown;
  locationTextSnapshot?: unknown;
  savedLocationId?: number | null;
  lat?: number | null;
  lng?: number | null;
  gateLat?: number | null;
  gateLng?: number | null;
  timeWindowStart?: string | Date | null;
  timeWindowEnd?: string | Date | null;
  contactName?: unknown;
  contactPhone?: unknown;
  referenceNumber?: unknown;
  instructions?: unknown;
}

export interface StructuredLoadDetailsInput {
  quantity?: number | string | null;
  unit?: unknown;
  weight?: number | string | null;
  volume?: number | string | null;
  materialType?: unknown;
  hazardClass?: unknown;
  notes?: unknown;
}

export interface StructuredJobValidationInput {
  saveMode?: "draft" | "ready_to_plan";
  customerId?: number | null;
  plannedDate?: unknown;
  vehicleClassRequired?: unknown;
  trailerTypesAllowed?: unknown;
  stops?: StructuredJobStopInput[];
  loadDetails?: StructuredLoadDetailsInput | null;
}

export interface JobValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validationStatus: "draft" | "needs_info" | "ready_to_plan";
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumberOrMissing(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "number" && Number.isFinite(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isQuantityPresent(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

export function validateStructuredJob(input: StructuredJobValidationInput): JobValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const saveMode = input.saveMode ?? "draft";
  const stops = Array.isArray(input.stops) ? input.stops : [];

  // ── Hard blocks (ready_to_plan only) ─────────────────────────────────────

  if (saveMode === "ready_to_plan") {
    if (!input.customerId) errors.push("Customer is required");
    if (!input.plannedDate) errors.push("Job date is required");
    if (!hasText(input.vehicleClassRequired)) errors.push("Vehicle type is required");

    if (stops.length === 0) errors.push("At least one stop is required");
    if (!stops.some(s => s.type === "pickup")) errors.push("At least one pickup stop is required");
    if (!stops.some(s => s.type === "dropoff")) errors.push("At least one dropoff stop is required");

    if (!input.loadDetails) {
      errors.push("Quantity is required");
      errors.push("Unit is required");
      errors.push("Material is required");
    } else {
      if (!isQuantityPresent(input.loadDetails.quantity)) errors.push("Quantity is required");
      if (!hasText(input.loadDetails.unit)) errors.push("Unit is required");
      if (!hasText(input.loadDetails.materialType)) errors.push("Material is required");
    }
  }

  // ── Field-level validation ────────────────────────────────────────────────

  if (hasText(input.vehicleClassRequired) && !isVehicleClass(input.vehicleClassRequired)) {
    errors.push("vehicleClassRequired is invalid");
  }

  const trailerTypes = Array.isArray(input.trailerTypesAllowed) ? input.trailerTypesAllowed : [];
  for (const t of trailerTypes) {
    if (!isTrailerType(t)) errors.push(`Invalid trailer type: ${String(t)}`);
  }

  if (input.vehicleClassRequired === "class1" && saveMode === "ready_to_plan" && trailerTypes.length === 0) {
    errors.push("At least one trailer type is required for class1 jobs");
  }

  // ── Stop-level validation ─────────────────────────────────────────────────

  const seenSequence = new Set<number>();

  for (const stop of stops) {
    const seq = stop.sequenceNumber;

    if (typeof seq !== "number" || !Number.isInteger(seq) || seq <= 0) {
      errors.push("Every stop must have a positive integer sequenceNumber");
    } else if (seenSequence.has(seq)) {
      errors.push(`Duplicate stop sequenceNumber: ${seq}`);
    } else {
      seenSequence.add(seq);
    }

    if (stop.type !== undefined && !isJobStopType(stop.type)) {
      errors.push(`Invalid stop type: ${String(stop.type)}`);
    }

    if (saveMode === "ready_to_plan") {
      if (!hasText(stop.locationTextSnapshot)) {
        errors.push(`Stop ${seq ?? "?"} is missing address`);
      }

      if (!isFiniteNumber(stop.lat) || !isFiniteNumber(stop.lng)) {
        errors.push(`Stop ${seq ?? "?"} is missing coordinates (lat/lng required)`);
      }
    } else {
      if (!hasText(stop.contactName) && !hasText(stop.contactPhone)) {
        warnings.push("Stop is missing contact info");
      }
      if (!stop.lat || !stop.lng) {
        warnings.push(`Stop ${seq ?? "?"} has no coordinates — driver may get lost`);
      }
    }

    if (!isFiniteNumberOrMissing(stop.lat) || !isFiniteNumberOrMissing(stop.lng)) {
      errors.push("Stop lat/lng must be valid numbers when provided");
    }
    if (!isFiniteNumberOrMissing(stop.gateLat) || !isFiniteNumberOrMissing(stop.gateLng)) {
      errors.push("Stop gateLat/gateLng must be valid numbers when provided");
    }

    if (saveMode === "ready_to_plan") {
      if (!hasText(stop.contactName) && !hasText(stop.contactPhone)) {
        warnings.push(`Stop ${seq ?? "?"} is missing contact info`);
      }
      if (!stop.timeWindowStart || !stop.timeWindowEnd) {
        warnings.push(`Stop ${seq ?? "?"} is missing time window`);
      }
    }

    if (!stop.savedLocationId) warnings.push("Stop is not linked to a saved location");
  }

  // ── Stop order: first stop cannot be dropoff; pickup must precede dropoffs ─

  const orderedStops = [...stops]
    .filter(s => typeof s.sequenceNumber === "number")
    .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));

  const firstPickupIndex  = orderedStops.findIndex(s => s.type === "pickup");
  const lastDropoffIndex  = orderedStops.map(s => s.type).lastIndexOf("dropoff");
  const firstStopType     = orderedStops[0]?.type;

  if (saveMode === "ready_to_plan" && firstStopType === "dropoff") {
    errors.push("First stop cannot be a dropoff");
  }

  if (firstPickupIndex >= 0 && lastDropoffIndex >= 0 && firstPickupIndex > lastDropoffIndex) {
    errors.push("Pickup must occur before final dropoff");
  }

  // ── Load details unit check ───────────────────────────────────────────────

  if (input.loadDetails && hasText(input.loadDetails.unit) && !isLoadUnit(input.loadDetails.unit)) {
    errors.push("Load unit is invalid");
  }

  // ── Soft warnings (missing optional but important fields) ─────────────────

  if (!input.customerId) warnings.push("No customer assigned");
  if (!input.loadDetails) warnings.push("Load details are missing");

  const dedupedWarnings = [...new Set(warnings)];

  const validationStatus =
    saveMode === "draft"
      ? "draft"
      : errors.length > 0
        ? "needs_info"
        : "ready_to_plan";

  return {
    isValid: errors.length === 0,
    errors,
    warnings: dedupedWarnings,
    validationStatus,
  };
}

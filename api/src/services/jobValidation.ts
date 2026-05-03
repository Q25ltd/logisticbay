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
  bookedTime?: string | Date | null;
  earliestArrivalMinutes?: number | null;
  unloadingAllowanceMinutes?: number | null;
  standingChargeNote?: unknown;
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
  customerId?: unknown;
  customerName?: unknown;
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

export function validateStructuredJob(input: StructuredJobValidationInput): JobValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const saveMode = input.saveMode ?? "draft";
  const stops = Array.isArray(input.stops) ? input.stops : [];

  if (saveMode === "ready_to_plan") {
    if (!input.customerId && !hasText(input.customerName)) errors.push("Customer is required");
    if (!input.plannedDate) errors.push("plannedDate is required");
    if (!hasText(input.vehicleClassRequired)) errors.push("vehicleClassRequired is required");
  }

  if (hasText(input.vehicleClassRequired) && !isVehicleClass(input.vehicleClassRequired)) {
    errors.push("vehicleClassRequired is invalid");
  }

  const trailerTypes = Array.isArray(input.trailerTypesAllowed) ? input.trailerTypesAllowed : [];
  for (const t of trailerTypes) {
    if (!isTrailerType(t)) errors.push(`Invalid trailer type: ${String(t)}`);
  }

  if (input.vehicleClassRequired === "class1" && saveMode === "ready_to_plan" && trailerTypes.length === 0) {
    warnings.push("No trailer type selected — planner may allocate unsuitable equipment");
  }

  if (saveMode === "ready_to_plan") {
    if (stops.length === 0) errors.push("At least one stop is required");
    if (!stops.some(s => s.type === "pickup")) errors.push("At least one pickup stop is required");
    if (!stops.some(s => s.type === "dropoff")) errors.push("At least one dropoff stop is required");
  }

  const seenSequence = new Set<number>();
  for (const stop of stops) {
    if (typeof stop.sequenceNumber !== "number" || !Number.isInteger(stop.sequenceNumber) || stop.sequenceNumber <= 0) {
      errors.push("Every stop must have a positive integer sequenceNumber");
    } else if (seenSequence.has(stop.sequenceNumber)) {
      errors.push(`Duplicate stop sequenceNumber: ${stop.sequenceNumber}`);
    } else {
      seenSequence.add(stop.sequenceNumber);
    }

    if (stop.type !== undefined && !isJobStopType(stop.type)) errors.push(`Invalid stop type: ${String(stop.type)}`);
    if (saveMode === "ready_to_plan" && !hasText(stop.locationTextSnapshot)) errors.push("Every stop must have locationTextSnapshot");

    if (!isFiniteNumberOrMissing(stop.lat) || !isFiniteNumberOrMissing(stop.lng)) {
      errors.push("Stop lat/lng must be valid numbers when provided");
    }
    if (!isFiniteNumberOrMissing(stop.gateLat) || !isFiniteNumberOrMissing(stop.gateLng)) {
      errors.push("Stop gateLat/gateLng must be valid numbers when provided");
    }

    if (saveMode === "ready_to_plan" && stop.type === "dropoff" && !stop.bookedTime) {
      errors.push("Booked delivery time is required for dropoff stops");
    }

    if (!hasText(stop.contactName) && !hasText(stop.contactPhone)) warnings.push("Stop is missing contact info");
    if (!stop.timeWindowStart || !stop.timeWindowEnd) warnings.push("Stop is missing time window");
    if (stop.lat === undefined || stop.lng === undefined || stop.lat === null || stop.lng === null) {
      warnings.push("No exact entrance/loading coordinates set — driver may arrive at the wrong gate, causing delays or missed collection/delivery");
    }
    if (!hasText(stop.instructions)) warnings.push("Stop is missing instructions");
    if (!stop.savedLocationId) warnings.push("Stop is not linked to a saved location");
  }

  const orderedStops = [...stops]
    .filter(s => typeof s.sequenceNumber === "number")
    .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));

  const firstPickupIndex = orderedStops.findIndex(s => s.type === "pickup");
  const lastDropoffIndex = orderedStops.map(s => s.type).lastIndexOf("dropoff");
  if (firstPickupIndex >= 0 && lastDropoffIndex >= 0 && firstPickupIndex > lastDropoffIndex) {
    errors.push("Pickup must occur before final dropoff");
  }

  if (!input.loadDetails) {
    warnings.push("Load details are missing — wrong equipment or loading delays are more likely");
  } else {
    if (hasText(input.loadDetails.unit) && !isLoadUnit(input.loadDetails.unit)) {
      errors.push("Load unit is invalid");
    }
    if (!input.loadDetails.quantity) warnings.push("Load quantity is missing");
    if (!hasText(input.loadDetails.unit)) warnings.push("Load unit is missing");
    if (!hasText(input.loadDetails.materialType)) warnings.push("Material/load type is missing");
  }

  const validationStatus =
    saveMode === "draft"
      ? "draft"
      : errors.length > 0
        ? "needs_info"
        : "ready_to_plan";

  return {
    isValid: errors.length === 0,
    errors,
    warnings: [...new Set(warnings)],
    validationStatus,
  };
}

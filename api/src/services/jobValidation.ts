import {
  bodyCategoryNeedsTrailer,
  isJobPartType,
  isLoadUnit,
  isBodyCategory,
  isBodyType,
  isGvwClass,
  isOnboardEquipment,
  isLicenceClass,
} from "../constants/jobCreation.js";
import type { PrismaClient } from "../generated/client.js";

export interface StructuredJobPartInput {
  sequenceNumber?: number;
  type?: unknown;
  locationTextSnapshot?: unknown;
  savedLocationId?: number | null;
  siteName?: unknown;
  unitName?: unknown;
  street?: unknown;
  town?: unknown;
  postcode?: unknown;
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
  contactEmail?: unknown;
  bookingRequired?: boolean;
  bookingRef?: unknown;
  openingHours?: unknown;
  locationType?: unknown;
  navigationInstructions?: unknown;
  numPallets?: number | null;
  internalNotes?: unknown;
  country?: unknown;
  addressLine2?: unknown;
  countyRegion?: unknown;
  // New form-parity fields
  quantityRequired?: number | null;
  quantityUnit?: unknown;
  exchangeDropQty?: number | null;
  exchangeCollectQty?: number | null;
  exchangeUnit?: unknown;
  handlingMethods?: unknown[] | null;
  accessRequirements?: unknown[] | null;
  proofRequirements?: unknown[] | null;
  loadReadiness?: unknown;
  stopNotes?: unknown;
  heightRestriction?: unknown;
  weightRestriction?: unknown;
  lengthRestriction?: unknown;
}

export interface StructuredLoadDetailsInput {
  quantity?: number | string | null;
  unit?: unknown;
  weight?: number | string | null;
  volume?: number | string | null;
  materialType?: unknown;
  hazardClass?: unknown;
  notes?: unknown;
  dimensions?: unknown;
  fragile?: boolean;
  stackable?: boolean;
  tempControlled?: boolean;
  tempRange?: unknown;
  photosRequired?: boolean;
  weighbridgeRequired?: boolean;
  forkliftRequired?: boolean;
  tailLiftRequired?: boolean;
  craneRequired?: boolean;
  loadingMethod?: unknown;
  unloadingMethod?: unknown;
  goodsType?: unknown;
  securingRequirements?: unknown[] | null;
  specialRequirements?: unknown[] | null;
}

export interface StructuredJobValidationInput {
  saveMode?: "draft" | "ready_to_plan";
  customerId?: number | null;
  customerName?: unknown;
  plannedDate?: unknown;
  vehicleCategory?: unknown;
  minGvwClass?: unknown;
  bodyType?: unknown;
  equipment?: unknown;
  trailersAllowed?: unknown;
  stops?: StructuredJobPartInput[];
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

function legacyVehicleToBodyCategory(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim().toLowerCase();
  if (!v) return "";
  if (v === "artic" || /^class\s*1$/.test(v)) return "tractor";
  if (/^class\s*2$/.test(v) || v === "rigid" || v === "tipper" || v === "grab" || v === "mixer" || v === "hiab" || v === "refrigerated") return "rigid";
  if (v === "van") return "van";
  if (v.startsWith("other:") || v === "other") return "rigid";
  return "";
}

export function validateStructuredJob(input: StructuredJobValidationInput): JobValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const saveMode = input.saveMode ?? "draft";
  const stops = Array.isArray(input.stops) ? input.stops : [];
  const vehicleCategory = hasText(input.vehicleCategory) ? String(input.vehicleCategory) : "";

  // ── Hard blocks (ready_to_plan only) ──────────────────────────────────────

  if (saveMode === "ready_to_plan") {
    if (!input.customerId && !hasText(input.customerName)) errors.push("Customer is required");
    if (!input.plannedDate) errors.push("Job date is required");
    if (!hasText(vehicleCategory)) errors.push("Vehicle type is required");

    if (stops.length === 0) errors.push("At least one stop is required");
    if (!stops.some(s => s.type === "pickup" || s.type === "collection"))  errors.push("At least one pickup stop is required");
    if (!stops.some(s => s.type === "dropoff" || s.type === "delivery")) errors.push("At least one dropoff stop is required");

    if (!input.loadDetails) {
      errors.push("Quantity is required");
      errors.push("Unit is required");
      errors.push("Material is required");
    } else {
      if (!isQuantityPresent(input.loadDetails.quantity)) errors.push("Quantity is required");
      if (!hasText(input.loadDetails.unit))               errors.push("Unit is required");
      if (!hasText(input.loadDetails.materialType))       errors.push("Material is required");
    }
  }

  // ── Field-level validation ────────────────────────────────────────────────

  if (hasText(input.vehicleCategory) && !isBodyCategory(input.vehicleCategory)) {
    errors.push("vehicleCategory is invalid");
  }

  if (hasText(input.minGvwClass) && !isGvwClass(input.minGvwClass)) {
    errors.push("minGvwClass is invalid");
  }

  if (hasText(input.bodyType) && !isBodyType(input.bodyType)) {
    errors.push("bodyType is invalid");
  }

  const trailerTypes = Array.isArray(input.trailersAllowed) ? input.trailersAllowed : [];
  for (const t of trailerTypes) {
    if (!isBodyType(t)) errors.push(`Invalid trailer type: ${String(t)}`);
  }

  const equipment = Array.isArray(input.equipment) ? input.equipment : [];
  for (const e of equipment) {
    if (!isOnboardEquipment(e)) errors.push(`Invalid onboard equipment: ${String(e)}`);
  }

  if (isBodyCategory(vehicleCategory) && bodyCategoryNeedsTrailer(vehicleCategory) && saveMode === "ready_to_plan" && trailerTypes.length === 0) {
    errors.push(vehicleCategory === "tractor"
      ? "Tractor unit requires at least one trailer body type"
      : "Vehicle requires at least one trailer body type");
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

    if (stop.type !== undefined && !isJobPartType(stop.type)) {
      errors.push(`Invalid stop type: ${String(stop.type)}`);
    }

    if (saveMode === "ready_to_plan") {
      if (!hasText(stop.locationTextSnapshot)) {
        errors.push(`Stop ${seq ?? "?"} is missing address`);
      }
      if ((stop.type === "dropoff" || stop.type === "delivery") && !stop.bookedTime) {
        warnings.push(`Stop ${seq ?? "?"} (dropoff) has no booked delivery time`);
      }
    }

    if (!isFiniteNumberOrMissing(stop.lat) || !isFiniteNumberOrMissing(stop.lng)) {
      errors.push("Stop lat/lng must be valid numbers when provided");
    }
    if (!isFiniteNumberOrMissing(stop.gateLat) || !isFiniteNumberOrMissing(stop.gateLng)) {
      errors.push("Stop gateLat/gateLng must be valid numbers when provided");
    }

    if (!hasText(stop.contactName) && !hasText(stop.contactPhone)) {
      warnings.push(`Stop ${seq ?? "?"} is missing contact info`);
    }
    if (!stop.timeWindowStart || !stop.timeWindowEnd) {
      warnings.push(`Stop ${seq ?? "?"} is missing time window`);
    }
    if (!stop.lat || !stop.lng) {
      warnings.push(`Stop ${seq ?? "?"} has no coordinates — driver may arrive at the wrong gate`);
    }
    if (!hasText(stop.instructions)) {
      warnings.push(`Stop ${seq ?? "?"} is missing instructions`);
    }
    if (!stop.savedLocationId) {
      warnings.push("Stop is not linked to a saved location");
    }
  }

  // ── Stop order: pickup must precede dropoffs ──────────────────────────────

  const orderedStops = [...stops]
    .filter(s => typeof s.sequenceNumber === "number")
    .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));

  const isPickupType  = (t: unknown) => t === "pickup"  || t === "collection";
  const isDropoffType = (t: unknown) => t === "dropoff" || t === "delivery";

  const firstStopType    = orderedStops[0]?.type;
  const firstPickupIndex = orderedStops.findIndex(s => isPickupType(s.type));
  const stopTypes        = orderedStops.map(s => s.type);
  const lastDropoffIndex: number = stopTypes.reduce<number>((last, t, i) => isDropoffType(t) ? i : last, -1);

  if (saveMode === "ready_to_plan" && isDropoffType(firstStopType)) {
    errors.push("First stop cannot be a dropoff");
  }

  if (firstPickupIndex >= 0 && lastDropoffIndex >= 0 && firstPickupIndex > lastDropoffIndex) {
    errors.push("Pickup must occur before final dropoff");
  }

  // ── Load details unit check ───────────────────────────────────────────────

  if (input.loadDetails && hasText(input.loadDetails.unit) && !isLoadUnit(input.loadDetails.unit)) {
    errors.push("Load unit is invalid");
  }

  // ── Soft warnings ──────────────────────────────────��──────────────────────

  if (!input.customerId) warnings.push("No customer assigned");
  if (!input.loadDetails) warnings.push("Load details are missing");

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

export async function findInvalidStopLocationId(
  prisma: PrismaClient,
  companyId: number,
  stops: StructuredJobPartInput[],
): Promise<number | null> {
  const stopLocationIds = [...new Set(stops
    .map(s => s.savedLocationId)
    .filter((id): id is number => typeof id === "number"))];

  if (stopLocationIds.length === 0) return null;

  const validLocs = await prisma.savedLocation.findMany({
    where:  { id: { in: stopLocationIds }, companyId },
    select: { id: true },
  });
  const validIds = new Set(validLocs.map(l => l.id));
  return stopLocationIds.find(id => !validIds.has(id)) ?? null;
}

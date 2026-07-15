/**
 * Rule-based vehicle and trailer suggestion.
 *
 * No AI — all logic is deterministic rules based on weight, pallet count,
 * temperature requirements, ADR class, and fleet availability.
 */

import { categoryFromWeight, KG_PER_PALLET } from "../lib/vehicleClass.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StopAreaHint {
  type:      string;
  areaType?: string;
  label?:    string;
}

export interface VehicleSuggestionInput {
  weight?:               number;    // kg
  quantity?:             number;
  quantityUnit?:         string;
  goodsType?:            string;
  goodsDescription?:     string;
  tempControlled?:       boolean;
  hazardClass?:          string;
  specialRequirements?:  string[];
  stopCount?:            number;
  stops?:                StopAreaHint[];
  fleetBodyTypes?:       string[];
  fleetHasAdr?:          boolean;
}

export interface VehicleSuggestion {
  vehicleCategory:    string;
  suggestedBodyTypes: string[];
  reasoning:          string;
  confidence:         "high" | "medium" | "low";
  fleetWarning?:      string | null;
}

// Vehicle sizing (categoryFromWeight, KG_PER_PALLET) lives in lib/vehicleClass.ts
// so the suggestion and the planning suitability check share one source.

// ── Body type selection rules ─────────────────────────────────────────────────

// Temperature-controlled bodies (ordered by preference)
const FRIDGE_BODIES = ["fridge", "fridge_multi_temp", "fridge_pharma", "insulated"];

// Bodies for ADR hazardous loads (open/semi-open — no fume build-up)
const ADR_BODIES = ["curtain_sider", "flatbed", "dropside"];

// Keyword → preferred body types (checked in goodsType + goodsDescription)
const DESCRIPTION_BODY_MAP: { patterns: string[]; bodies: string[] }[] = [
  { patterns: ["steel", "coil", "metal", "machinery", "plant", "equipment", "oversized"],
    bodies:   ["flatbed", "step_frame", "low_loader", "dropside"] },
  { patterns: ["bulk", "grain", "aggregate", "sand", "gravel", "topsoil"],
    bodies:   ["bulk_tipper", "walking_floor", "tipper"] },
  { patterns: ["fuel", "petrol", "diesel", "lpg"],
    bodies:   ["tanker_fuel"] },
  { patterns: ["chemical", "acid", "solvent"],
    bodies:   ["tanker_chemical"] },
  { patterns: ["food liquid", "milk", "beverage", "drink"],
    bodies:   ["tanker_food"] },
  { patterns: ["container", "iso", "shipping container"],
    bodies:   ["skeletal_40", "skeletal_20"] },
  { patterns: ["livestock", "cattle", "sheep", "pigs", "poultry", "animals"],
    bodies:   ["livestock"] },
  { patterns: ["car", "vehicle", "cars"],
    bodies:   ["car_transporter"] },
  { patterns: ["glass"],
    bodies:   ["glass_inloader", "curtain_sider"] },
];

// Default bodies for standard palletised / general freight
const DEFAULT_BODIES = ["curtain_sider", "box"];

function selectBodyTypes(input: VehicleSuggestionInput): string[] {
  const desc = ((input.goodsDescription ?? "") + " " + (input.goodsType ?? "")).toLowerCase();

  // Temperature-controlled loads
  if (input.tempControlled) return FRIDGE_BODIES;

  // ADR hazardous
  if (input.hazardClass) return ADR_BODIES;

  // Description keyword matching — whole words only: substring matching
  // suggested a car transporter for "cardboard" and a low-loader for
  // "plant pots" (same failure class as "coil" containing "oil").
  for (const { patterns, bodies } of DESCRIPTION_BODY_MAP) {
    if (patterns.some(p => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(desc))) return bodies;
  }

  return DEFAULT_BODIES;
}

function filterByFleet(bodies: string[], fleetBodyTypes?: string[]): string[] {
  if (!fleetBodyTypes?.length) return bodies;
  const fleet = new Set(fleetBodyTypes);
  return bodies.filter(b => fleet.has(b));
}

// ── Main function (synchronous — no AI) ──────────────────────────────────────

export function suggestVehicleSync(input: VehicleSuggestionInput): VehicleSuggestion {
  // Determine effective weight — use quantity × pallet weight as fallback
  let effectiveKg = input.weight ?? 0;
  if (effectiveKg === 0 && (input.quantity ?? 0) > 0) {
    const unit = (input.quantityUnit ?? "").toLowerCase();
    if (unit === "pallets" || unit === "pallet") {
      effectiveKg = input.quantity! * KG_PER_PALLET;
    }
  }

  // Has residential/narrow stops → prefer smaller vehicle unless weight forces up
  const hasResidential = input.stops?.some(s =>
    s.areaType === "residential" || s.areaType === "rural",
  ) ?? false;

  let vehicleCategory = effectiveKg > 0
    ? categoryFromWeight(effectiveKg)
    : "rigid"; // safe default when no weight given

  // Downgrade to smaller category for residential areas if weight allows
  if (hasResidential && vehicleCategory === "tractor" && effectiveKg <= 16_000) {
    vehicleCategory = "rigid";
  }

  // Upgrade if special requirements say it
  const specials = (input.specialRequirements ?? []).map(s => s.toLowerCase());
  if (specials.some(s => s.includes("abnormal") || s.includes("heavy haulage") || s.includes("stgo"))) {
    vehicleCategory = "heavy_haulage";
  }

  const idealBodies  = selectBodyTypes(input);
  const fleetBodies  = filterByFleet(idealBodies, input.fleetBodyTypes);
  const suggestedBodyTypes = fleetBodies.length > 0 ? fleetBodies : (input.fleetBodyTypes?.length ? [] : idealBodies);

  // Fleet warnings
  let fleetWarning: string | null = null;
  if (input.tempControlled && input.fleetBodyTypes?.length) {
    const hasFridge = input.fleetBodyTypes.some(b =>
      ["fridge", "fridge_multi_temp", "fridge_pharma", "insulated"].includes(b),
    );
    if (!hasFridge) {
      fleetWarning = "Your fleet has no refrigerated vehicles — this load requires temperature control.";
    }
  }
  if (input.hazardClass && input.fleetHasAdr === false) {
    fleetWarning = `Hazardous load (ADR class ${input.hazardClass}) requires an ADR-certified vehicle — none found in your fleet.`;
  }
  if (input.fleetBodyTypes?.length && suggestedBodyTypes.length === 0 && !fleetWarning) {
    fleetWarning = "None of your fleet body types are a standard match for this load type.";
  }

  // Build reasoning sentence
  const parts: string[] = [];
  if (effectiveKg > 0) {
    parts.push(`${(effectiveKg / 1000).toFixed(1)} t load`);
  } else if ((input.quantity ?? 0) > 0) {
    parts.push(`${input.quantity} ${input.quantityUnit ?? "units"}`);
  } else {
    parts.push("load details not specified");
  }
  if (input.tempControlled) parts.push("temperature controlled");
  if (input.hazardClass)    parts.push(`ADR class ${input.hazardClass}`);
  if (hasResidential)       parts.push("residential/rural stops — smaller vehicle preferred");

  const reasoning = `${parts.join(", ")} — suggests ${vehicleCategory.replace(/_/g, " ")}.`;

  const confidence: "high" | "medium" | "low" =
    effectiveKg > 0 ? "high"
    : (input.quantity ?? 0) > 0 ? "medium"
    : "low";

  return { vehicleCategory, suggestedBodyTypes, reasoning, confidence, fleetWarning };
}

// Async wrapper for API route compatibility
export async function suggestVehicle(input: VehicleSuggestionInput): Promise<VehicleSuggestion> {
  return suggestVehicleSync(input);
}

// ── Trailer suggestion for planning board ─────────────────────────────────────

export interface TrailerOption {
  id:           number;
  registration: string;
  trailerType:  string;
  bodyType:     string;
  status:       string;
}

export interface TrailerSuggestion {
  trailerId:            number | null;
  trailerRegistration:  string | null;
  reasoning:            string;
  confidence:           "high" | "medium" | "low";
}

// Body types that provide temperature control
const FRIDGE_TRAILER_BODIES = new Set([
  "fridge", "fridge_multi_temp", "fridge_pharma", "insulated",
  "reefer", "refrigerated",
]);

// Body types suitable for hazardous (ADR) loads
const ADR_TRAILER_BODIES = new Set([
  "curtain_sider", "curtainsider", "flatbed", "dropside",
  "tanker_chemical", "tanker_fuel",
]);

// Statuses that mean the trailer is unavailable
const UNAVAILABLE_STATUSES = new Set(["disposed", "off_road", "sold"]);

export async function suggestTrailerForRun(input: {
  weight?:             number;
  quantity?:           number;
  quantityUnit?:       string;
  goodsType?:          string;
  tempControlled?:     boolean;
  hazardClass?:        string;
  stopCount?:          number;
  availableTrailers:   TrailerOption[];
}): Promise<TrailerSuggestion> {

  const candidates = input.availableTrailers.filter(
    t => !UNAVAILABLE_STATUSES.has(t.status),
  );

  if (!candidates.length) {
    return {
      trailerId:           null,
      trailerRegistration: null,
      reasoning:           "No trailers available in fleet.",
      confidence:          "low",
    };
  }

  // Temperature-controlled load → must use fridge trailer
  if (input.tempControlled) {
    const fridge = candidates.find(
      t => FRIDGE_TRAILER_BODIES.has(t.bodyType) || FRIDGE_TRAILER_BODIES.has(t.trailerType),
    );
    if (fridge) {
      return {
        trailerId:           fridge.id,
        trailerRegistration: fridge.registration,
        reasoning:           "Temperature-controlled load — refrigerated trailer selected.",
        confidence:          "high",
      };
    }
    return {
      trailerId:           null,
      trailerRegistration: null,
      reasoning:           "Temperature-controlled load but no refrigerated trailer is available.",
      confidence:          "high",
    };
  }

  // Hazardous load → curtainsider or flatbed preferred, never fridge/box
  if (input.hazardClass) {
    const adr = candidates.find(
      t => ADR_TRAILER_BODIES.has(t.bodyType) || ADR_TRAILER_BODIES.has(t.trailerType),
    );
    if (adr) {
      return {
        trailerId:           adr.id,
        trailerRegistration: adr.registration,
        reasoning:           `ADR class ${input.hazardClass} — open-body trailer selected.`,
        confidence:          "high",
      };
    }
  }

  // General / palletised — prefer curtainsider, then any available
  const curtain = candidates.find(
    t => t.bodyType === "curtain_sider" || t.trailerType === "curtainsider" || t.trailerType === "curtain_sider",
  );
  if (curtain) {
    return {
      trailerId:           curtain.id,
      trailerRegistration: curtain.registration,
      reasoning:           "Curtain sider selected — best for general palletised freight.",
      confidence:          "high",
    };
  }

  // Fallback: first available trailer
  const first = candidates[0];
  return {
    trailerId:           first.id,
    trailerRegistration: first.registration,
    reasoning:           "Best available trailer in fleet.",
    confidence:          "low",
  };
}

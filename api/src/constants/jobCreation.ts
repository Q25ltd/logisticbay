export {
  BODY_CATEGORIES,
  BODY_TYPES,
  GVW_CLASSES,
  ONBOARD_EQUIPMENT,
  DRIVER_LICENCE_CLASSES,
  DRIVER_ENDORSEMENTS,
  bodyCategoryNeedsTrailer,
  gvwForCategory,
  licencesThatCanDrive,
  isBodyCategory,
  isBodyType,
  isGvwClass,
  isOnboardEquipment,
  isLicenceClass,
} from "./vehicleTaxonomy.js";

// Canonical stop types (matches DATA_DICTIONARY.md JobPart.type)
// Legacy aliases (pickup/dropoff/handover/yard/depot) are still accepted for
// backwards compatibility with existing API clients, but new data should use
// the canonical values only.
export const JOB_STOP_TYPES = [
  "collection",
  "delivery",
  "reload",
  "return",
  "waypoint",
  "other",
  // legacy aliases — kept for backwards compat, deprecated
  "pickup",
  "dropoff",
  "handover",
  "yard",
  "depot",
] as const;

export const LOAD_UNITS = [
  "pallets",
  "roll_cages",
  "kg",
  "tonnes",
  "loads",
  "items",
  "bags",
  "litres",
  "cubic_metres",
  "other",
] as const;

export type JobPartType = typeof JOB_STOP_TYPES[number];
export type LoadUnit = typeof LOAD_UNITS[number];

export function isJobPartType(value: unknown): value is JobPartType {
  return typeof value === "string" && (JOB_STOP_TYPES as readonly string[]).includes(value);
}

export function isLoadUnit(value: unknown): value is LoadUnit {
  return typeof value === "string" && (LOAD_UNITS as readonly string[]).includes(value);
}

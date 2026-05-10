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

export const JOB_STOP_TYPES = [
  "pickup",
  "dropoff",
  "collection",
  "delivery",
  "handover",
  "yard",
  "depot",
] as const;

export const LOAD_UNITS = [
  "pallets",
  "kg",
  "tonnes",
  "loads",
  "items",
  "bags",
  "litres",
  "m3",
  "other",
] as const;

export type JobStopType = typeof JOB_STOP_TYPES[number];
export type LoadUnit = typeof LOAD_UNITS[number];

export function isJobStopType(value: unknown): value is JobStopType {
  return typeof value === "string" && (JOB_STOP_TYPES as readonly string[]).includes(value);
}

export function isLoadUnit(value: unknown): value is LoadUnit {
  return typeof value === "string" && (LOAD_UNITS as readonly string[]).includes(value);
}

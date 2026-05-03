export const VEHICLE_CLASSES = ["van", "class2", "class1"] as const;

export const TRAILER_TYPES = [
  "curtain_sider",
  "box",
  "fridge",
  "flatbed",
  "low_loader",
  "tanker",
  "walking_floor",
  "tipper",
  "container",
  "other",
] as const;

export const JOB_STOP_TYPES = [
  "pickup",
  "dropoff",
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
  "other",
] as const;

export type VehicleClass = typeof VEHICLE_CLASSES[number];
export type TrailerType = typeof TRAILER_TYPES[number];
export type JobStopType = typeof JOB_STOP_TYPES[number];
export type LoadUnit = typeof LOAD_UNITS[number];

export function isVehicleClass(value: unknown): value is VehicleClass {
  return typeof value === "string" && (VEHICLE_CLASSES as readonly string[]).includes(value);
}

export function isTrailerType(value: unknown): value is TrailerType {
  return typeof value === "string" && (TRAILER_TYPES as readonly string[]).includes(value);
}

export function isJobStopType(value: unknown): value is JobStopType {
  return typeof value === "string" && (JOB_STOP_TYPES as readonly string[]).includes(value);
}

export function isLoadUnit(value: unknown): value is LoadUnit {
  return typeof value === "string" && (LOAD_UNITS as readonly string[]).includes(value);
}

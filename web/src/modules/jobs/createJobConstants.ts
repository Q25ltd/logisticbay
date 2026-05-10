import {
  BODY_CATEGORIES,
  BODY_TYPES,
  DRIVER_ENDORSEMENTS,
  DRIVER_LICENCE_CLASSES,
  GVW_CLASSES,
  JOB_TYPES as TAXONOMY_JOB_TYPES,
  ONBOARD_EQUIPMENT,
  SERVICE_TYPES as TAXONOMY_SERVICE_TYPES,
  TRAILER_LENGTHS,
} from "../../constants/vehicleTaxonomy";

// ── Options ───────────────────────────────────────────────────────────────────

export {
  BODY_CATEGORIES,
  BODY_TYPES,
  GVW_CLASSES,
  ONBOARD_EQUIPMENT,
  DRIVER_LICENCE_CLASSES,
  DRIVER_ENDORSEMENTS,
  TRAILER_LENGTHS,
};

export const SERVICE_TYPES: [string, string][] = TAXONOMY_SERVICE_TYPES.map(x => [x.value, x.label]);

export const JOB_TYPES: [string, string][] = TAXONOMY_JOB_TYPES.map(x => [x.value, x.label]);

export const PRIORITY_OPTS: [string, string][] = [
  ["low",    "Low"],
  ["normal", "Normal"],
  ["high",   "High — Urgent"],
];

export const LOCATION_TYPES: [string, string][] = [
  ["warehouse",   "Warehouse / RDC"],
  ["depot",       "Depot"],
  ["site",        "Construction site"],
  ["retail",      "Retail / store"],
  ["residential", "Residential"],
  ["port",        "Port / terminal"],
  ["airport",     "Airport"],
  ["other",       "Other"],
];

export const BODY_CATEGORY_OPTS: [string, string][] = BODY_CATEGORIES.map(x => [x.value, x.label]);
export const BODY_TYPE_OPTS: [string, string][] = BODY_TYPES.map(x => [x.value, x.label]);
export const GVW_CLASS_OPTS: [string, string][] = GVW_CLASSES.map(x => [x.value, x.label]);
export const ONBOARD_EQUIPMENT_OPTS: [string, string][] = ONBOARD_EQUIPMENT.map(x => [x.value, x.label]);
export const DRIVER_LICENCE_OPTS: [string, string][] = DRIVER_LICENCE_CLASSES.map(x => [x.value, x.label]);
export const DRIVER_ENDORSEMENT_OPTS: [string, string][] = DRIVER_ENDORSEMENTS.map(x => [x.value, x.label]);
export const TRAILER_LENGTH_OPTS: [string, string][] = TRAILER_LENGTHS.map(x => [x.value, x.label]);

export const LOAD_UNITS: [string, string][] = [
  ["tonnes",  "Tonnes"],
  ["kg",      "Kg"],
  ["pallets", "Pallets"],
  ["bags",    "Bags"],
  ["loads",   "Loads"],
  ["litres",  "Litres"],
  ["m3",      "Cubic metres"],
  ["items",   "Items"],
  ["other",   "Other"],
];

export const HANDLING_METHODS: [string, string][] = [
  ["forklift",          "Forklift"],
  ["handball",          "Handball"],
  ["crane",             "Crane"],
  ["pump",              "Pump"],
  ["tip",               "Tip"],
  ["customer_loads",    "Customer loads / unloads"],
  ["driver_loads",      "Driver loads / unloads"],
  ["other",             "Other"],
];

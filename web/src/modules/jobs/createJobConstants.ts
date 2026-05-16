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
  TRAILER_BODY_TYPE_VALUES,
  equipmentForBodyType,
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
  TRAILER_BODY_TYPE_VALUES,
  equipmentForBodyType,
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
  ["crane",             "Crane / HIAB"],
  ["moffett",           "Moffett / vehicle forklift"],
  ["tail_lift",         "Tail lift"],
  ["pump_truck",        "Pump truck / pallet jack"],
  ["tipper_discharge",  "Tipper discharge"],
  ["grab",              "Grab"],
  ["pump_discharge",    "Pump discharge (tanker)"],
  ["loading_bay",       "Loading bay"],
  ["roro",              "RORO (drive on/off)"],
  ["customer_loads",    "Customer loads / unloads"],
  ["driver_loads",      "Driver loads / unloads"],
  ["other",             "Other"],
];

export const EXCHANGE_UNITS: [string, string][] = [
  ["pallets",    "Pallets"],
  ["roll_cages", "Roll cages / yorks"],
  ["stillages",  "Stillages"],
  ["ibc_tanks",  "IBC tanks"],
  ["other",      "Other"],
];

export const PROOF_REQUIREMENTS: [string, string][] = [
  ["signature_required",         "Signature"],
  ["photos_required",            "Photos"],
  ["pod_required",               "POD document"],
  ["weighbridge_ticket_required","Weighbridge ticket"],
  ["seal_number_required",       "Seal number"],
  ["name_required",              "Printed name"],
];

export const LOAD_READINESS: [string, string][] = [
  ["ready_now",            "Ready now"],
  ["ready_at_booked_time", "Ready at booked time"],
  ["still_being_prepared", "Still being prepared"],
  ["unsure",               "Unsure"],
];

export const GOODS_TYPES: [string, string][] = [
  ["pallets",            "Pallets"],
  ["roll_cages",         "Roll cages / yorks"],
  ["machinery",          "Machinery"],
  ["building_materials", "Building materials"],
  ["food_refrigerated",  "Food / refrigerated"],
  ["bulk_material",      "Bulk material"],
  ["liquid_bulk",        "Liquid / tanker"],
  ["steel_long",         "Steel / long loads"],
  ["vehicles",           "Vehicles"],
  ["containers",         "Containers"],
  ["general",            "General goods"],
  ["other",              "Other"],
];

export const SECURING_REQUIREMENTS: [string, string][] = [
  ["straps_required",                 "Straps required"],
  ["chains_required",                 "Chains required"],
  ["edge_protection_required",        "Edge protection"],
  ["sheets_required",                 "Sheets"],
  ["curtains_must_not_touch_load",    "Curtains must not touch load"],
  ["stanchions_required",             "Stanchions / stake poles"],
  ["temperature_monitoring_required", "Temperature monitoring"],
];

export const SPECIAL_REQUIREMENTS_OPTS: [string, string][] = [
  ["dangerous_goods",           "Dangerous goods (ADR)"],
  ["fragile",                   "Fragile / handle with care"],
  ["high_value",                "High value goods"],
  ["oversized",                 "Oversized load"],
  ["secure_transport_required", "Secure transport"],
  ["escort_required",           "Police escort required"],
];

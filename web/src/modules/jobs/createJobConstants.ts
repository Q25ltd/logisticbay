// ── Options ───────────────────────────────────────────────────────────────────

export const SERVICE_TYPES: [string, string][] = [
  ["delivery",            "Delivery"],
  ["collection",          "Collection"],
  ["transfer",            "Transfer / Trunking"],
  ["collection_delivery", "Collection & Delivery"],
  ["trunking",            "Linehaul / Trunking"],
];

export const JOB_TYPES: [string, string][] = [
  ["full_load",   "Full Load (FTL)"],
  ["part_load",   "Part Load (LTL)"],
  ["multi_drop",  "Multi-Drop"],
  ["groupage",    "Groupage"],
  ["return_load", "Return Load"],
  ["trunking",    "Trunking / Linehaul"],
  ["abnormal",    "Abnormal / Specialist"],
];

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

export const VEHICLE_TYPES: [string, string][] = [
  ["van",          "Van"],
  ["rigid",        "Rigid"],
  ["artic",        "Artic"],
  ["tipper",       "Tipper"],
  ["grab",         "Grab"],
  ["mixer",        "Mixer"],
  ["hiab",         "HIAB"],
  ["refrigerated", "Refrigerated"],
  ["other",        "Other"],
];

export const MIN_SIZES: [string, string][] = [
  ["3.5t",  "3.5t"],
  ["7.5t",  "7.5t"],
  ["18t",   "18t"],
  ["26t",   "26t"],
  ["44t",   "44t"],
];

// Vehicle types that always pull a separate trailer
export const TRAILER_REQUIRED_TYPES = new Set(["artic"]);

export const TRAILER_TYPES: [string, string][] = [
  ["curtain_sider",       "Curtain sider"],
  ["flatbed",             "Flatbed"],
  ["box",                 "Box"],
  ["tipper",              "Tipper"],
  ["tanker",              "Tanker"],
  ["low_loader",          "Low loader"],
  ["skeletal",            "Skeletal"],
  ["refrigerated_trailer","Refrigerated trailer"],
  ["other",               "Other"],
];

export const EQUIPMENT_OPTS: [string, string][] = [
  ["tail_lift",    "Tail lift"],
  ["forklift",     "Forklift"],
  ["crane",        "Crane"],
  ["pallet_truck", "Pallet truck"],
  ["straps",       "Straps"],
  ["chains",       "Chains"],
  ["sheeting",     "Sheeting"],
  ["pump",         "Pump"],
  ["ppe",          "PPE"],
  ["other",        "Other"],
];

export const DRIVER_QUALS: [string, string][] = [
  ["adr",      "ADR"],
  ["hiab",     "HIAB"],
  ["moffett",  "Moffett"],
  ["forklift", "Forklift"],
  ["tanker",   "Tanker"],
  ["other",    "Other"],
];

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

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
  ["forklift",         "Forklift"],
  ["loading_bay",      "Loading bay"],
  ["hiab",             "HIAB / truck crane"],
  ["moffett",          "Moffett / vehicle forklift"],
  ["tail_lift",        "Tail lift"],
  ["pump_truck",       "Pump truck / pallet jack"],
  ["handball",         "Handball (manual)"],
  ["overhead_crane",   "Overhead / gantry crane"],
  ["magnetic_crane",   "Magnetic overhead crane"],
  ["side_loading",     "Side loading"],
  ["roro",             "RORO (drive on / drive off)"],
  ["tipper_discharge", "Tipper discharge"],
  ["grab",             "Grab (aggregate / scrap)"],
  ["pump_discharge",   "Pump discharge (tanker)"],
  ["walking_floor",    "Walking floor"],
  ["conveyor",         "Conveyor"],
  ["other",            "Other"],
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
  ["stanchions_required",             "Stanchions / stake poles (flatbed)"],
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

// ── Rejection / return policy ─────────────────────────────────────────────────

export const REJECTION_ACTIONS: [string, string][] = [
  ["call_office_before_leaving",     "Call office before leaving"],
  ["return_to_collection_point",     "Return to collection point"],
  ["deliver_to_alternative_address", "Deliver to alternative address"],
  ["wait_for_further_instruction",   "Wait for further instruction"],
  ["do_not_return_without_approval", "Do not return without approval"],
  ["other",                          "Other"],
];

// ── Driver note chips ─────────────────────────────────────────────────────────

export const DRIVER_NOTE_CHIPS: [string, string][] = [
  ["call_before_arrival",  "Call before arrival"],
  ["report_to_security",   "Report to security"],
  ["use_rear_entrance",    "Use rear entrance"],
  ["ppe_required",         "PPE required"],
  ["bring_straps",         "Bring straps"],
  ["bring_pump_truck",     "Bring pump truck"],
  ["do_not_arrive_early",  "Do not arrive early"],
];

// ── PPE items (matches PublicRequestForm) ─────────────────────────────────────

export const PPE_ITEMS: [string, string][] = [
  ["ppe_safety_boots", "Safety boots"],
  ["ppe_hi_vis",       "Hi-vis vest"],
  ["ppe_hard_hat",     "Hard hat"],
  ["ppe_gloves",       "Gloves"],
  ["ppe_glasses",      "Safety glasses"],
];

// ── Site access requirements (matches PublicRequestForm) ──────────────────────

export const ACCESS_REQUIREMENTS: [string, string][] = [
  ["narrow_road",           "Narrow road"],
  ["height_restriction",    "Height restriction"],
  ["weight_restriction",    "Weight restriction"],
  ["length_restriction",    "Length restriction"],
  ["no_artic_access",       "No artic access"],
  ["no_trailer_access",     "No trailer access"],
  ["residential_area",      "Residential area"],
  ["security_checkin",      "Security check-in"],
  ["driver_id_required",    "Driver ID required"],
  ["do_not_arrive_early",   "Do not arrive early"],
  ["holding_area_required", "Holding area required"],
  ["port_access",           "Port access"],
  ["airport_access",        "Airport access"],
];

// ── Countries (ISO 3166-1 alpha-2, GB first then EU-27) ───────────────────────

export const COUNTRIES: [string, string][] = [
  ["GB", "United Kingdom"],
  ["AT", "Austria"],
  ["BE", "Belgium"],
  ["BG", "Bulgaria"],
  ["HR", "Croatia"],
  ["CY", "Cyprus"],
  ["CZ", "Czech Republic"],
  ["DK", "Denmark"],
  ["EE", "Estonia"],
  ["FI", "Finland"],
  ["FR", "France"],
  ["DE", "Germany"],
  ["GR", "Greece"],
  ["HU", "Hungary"],
  ["IE", "Ireland"],
  ["IT", "Italy"],
  ["LV", "Latvia"],
  ["LT", "Lithuania"],
  ["LU", "Luxembourg"],
  ["MT", "Malta"],
  ["NL", "Netherlands"],
  ["PL", "Poland"],
  ["PT", "Portugal"],
  ["RO", "Romania"],
  ["SK", "Slovakia"],
  ["SI", "Slovenia"],
  ["ES", "Spain"],
  ["SE", "Sweden"],
];

// ── Postcode label / placeholder by country ───────────────────────────────────

export const POSTCODE_META: Record<string, { label: string; placeholder: string }> = {
  GB: { label: "Postcode",          placeholder: "B1 1AA" },
  AT: { label: "Postleitzahl",      placeholder: "1010" },
  BE: { label: "Postcode",          placeholder: "1000" },
  BG: { label: "Postcode",          placeholder: "1000" },
  HR: { label: "Poštanski broj",    placeholder: "10000" },
  CY: { label: "Postcode",          placeholder: "1010" },
  CZ: { label: "PSČ",               placeholder: "110 00" },
  DK: { label: "Postnummer",        placeholder: "1050" },
  EE: { label: "Sihtnumber",        placeholder: "10111" },
  FI: { label: "Postinumero",       placeholder: "00100" },
  FR: { label: "Code postal",       placeholder: "75001" },
  DE: { label: "Postleitzahl",      placeholder: "10115" },
  GR: { label: "Τ.Κ.",              placeholder: "106 72" },
  HU: { label: "Irányítószám",      placeholder: "1051" },
  IE: { label: "Eircode",           placeholder: "D02 XY45" },
  IT: { label: "CAP",               placeholder: "00100" },
  LV: { label: "Pasta indekss",     placeholder: "LV-1010" },
  LT: { label: "Pašto kodas",       placeholder: "LT-01001" },
  LU: { label: "Code postal",       placeholder: "2800" },
  MT: { label: "Postcode",          placeholder: "VLT 1116" },
  NL: { label: "Postcode",          placeholder: "1234 AB" },
  PL: { label: "Kod pocztowy",      placeholder: "00-001" },
  PT: { label: "Código postal",     placeholder: "1000-001" },
  RO: { label: "Cod poștal",        placeholder: "010011" },
  SK: { label: "PSČ",               placeholder: "811 01" },
  SI: { label: "Poštna številka",   placeholder: "1000" },
  ES: { label: "Código postal",     placeholder: "28001" },
  SE: { label: "Postnummer",        placeholder: "111 20" },
};

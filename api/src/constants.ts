export interface CheckItem {
  key:       string;
  label:     string;
  category:  "inside" | "outside" | "body" | "load";
  naAllowed: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRACTOR UNIT — Truck checks (DVSA 2023 + oil/water pre-drive)
// ─────────────────────────────────────────────────────────────────────────────

export const TRUCK_CHECKS: CheckItem[] = [
  { key: "oil_water",          label: "Oil and water levels — checked and topped up if needed",              category: "inside",  naAllowed: false },
  { key: "mirrors_glass",      label: "Mirrors, cameras and glass — no cracks, scratches or tint",          category: "inside",  naAllowed: false },
  { key: "wipers_washers",     label: "Windscreen wipers and washers — working, not damaged",                category: "inside",  naAllowed: false },
  { key: "dashboard_warnings", label: "Dashboard warning lights and gauges — engine, ABS, EBS, emissions",  category: "inside",  naAllowed: false },
  { key: "steering",           label: "Steering — no excessive play, power assist working",                  category: "inside",  naAllowed: false },
  { key: "horn",               label: "Horn — working and accessible from driver seat",                      category: "inside",  naAllowed: false },
  { key: "brakes_air",         label: "Brakes and air build-up — pressure correct, no leaks, parking brake",category: "inside",  naAllowed: false },
  { key: "height_marker",      label: "Height marker — correct vehicle height displayed in cab",             category: "inside",  naAllowed: false },
  { key: "seatbelt",           label: "Seatbelt — no cuts or fraying, locks and retracts correctly",        category: "inside",  naAllowed: false },
  { key: "cab_security",       label: "Cab security — doors, steps, body panels and mountings secure",      category: "inside",  naAllowed: false },
  { key: "alt_fuel_hv",        label: "Alternative fuel / high voltage cutoff — working if fitted",          category: "inside",  naAllowed: true  },
  { key: "lights_indicators",  label: "Lights and indicators — all working, clean, correct colour",          category: "outside", naAllowed: false },
  { key: "reflectors_plate",   label: "Reflectors and number plate — clean, secure and visible",             category: "outside", naAllowed: false },
  { key: "tyres_wheels",       label: "Tyres and wheels — tread depth (min 1mm), pressure, wheel nuts",     category: "outside", naAllowed: false },
  { key: "fluid_levels",       label: "Fluid levels — fuel, oil, coolant, AdBlue, washer fluid, no leaks",  category: "outside", naAllowed: false },
  { key: "bodywork",           label: "Bodywork — no sharp edges, panels secure, no dangerous damage",       category: "outside", naAllowed: false },
  { key: "exhaust_emissions",  label: "Exhaust — no excessive smoke or emissions",                           category: "outside", naAllowed: false },
  { key: "spray_suppression",  label: "Spray suppression — mudguards and spray guards fitted and secure",    category: "outside", naAllowed: true  },
  { key: "battery",            label: "Battery — secure, no damage or corrosion",                            category: "outside", naAllowed: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// TRACTOR UNIT — Trailer checks (10 items)
// ─────────────────────────────────────────────────────────────────────────────

export const TRAILER_CHECKS: CheckItem[] = [
  { key: "trailer_lights",     label: "Lights and indicators — all working, clean, correct colour",          category: "outside", naAllowed: false },
  { key: "trailer_reflectors", label: "Reflectors and number plate — clean, secure and visible",             category: "outside", naAllowed: false },
  { key: "trailer_tyres",      label: "Tyres and wheels — tread depth (min 1mm), pressure, wheel nuts",     category: "outside", naAllowed: false },
  { key: "trailer_brakes",     label: "Brakes — air lines connected, no leaks, brake function confirmed",   category: "outside", naAllowed: false },
  { key: "coupling",           label: "Coupling — fifth wheel/kingpin secure, safety locks engaged",         category: "outside", naAllowed: false },
  { key: "electrical_conn",    label: "Electrical connection — connected and working",                       category: "outside", naAllowed: false },
  { key: "trailer_bodywork",   label: "Bodywork — no damage, doors secure and not likely to open",           category: "outside", naAllowed: false },
  { key: "load_security",      label: "Load security points — rings, straps, hooks in good condition",       category: "outside", naAllowed: false },
  { key: "trailer_spray",      label: "Spray suppression — mudguards and spray guards fitted",              category: "outside", naAllowed: true  },
  { key: "tail_lift",          label: "Tail lift — condition and operation checked (if fitted)",             category: "outside", naAllowed: true  },
];

// ─────────────────────────────────────────────────────────────────────────────
// RIGID HGV — Truck + body checks
// ─────────────────────────────────────────────────────────────────────────────

export const RIGID_CHECKS: CheckItem[] = [
  { key: "oil_water",          label: "Oil and water levels — checked and topped up if needed",              category: "inside",  naAllowed: false },
  { key: "mirrors_glass",      label: "Mirrors, cameras and glass — no cracks, scratches or tint",          category: "inside",  naAllowed: false },
  { key: "wipers_washers",     label: "Windscreen wipers and washers — working, not damaged",                category: "inside",  naAllowed: false },
  { key: "dashboard_warnings", label: "Dashboard warning lights and gauges — engine, ABS, EBS, emissions",  category: "inside",  naAllowed: false },
  { key: "steering",           label: "Steering — no excessive play, power assist working",                  category: "inside",  naAllowed: false },
  { key: "horn",               label: "Horn — working and accessible from driver seat",                      category: "inside",  naAllowed: false },
  { key: "brakes_air",         label: "Brakes and air build-up — pressure correct, no leaks, parking brake",category: "inside",  naAllowed: false },
  { key: "height_marker",      label: "Height marker — correct vehicle height displayed in cab",             category: "inside",  naAllowed: false },
  { key: "seatbelt",           label: "Seatbelt — no cuts or fraying, locks and retracts correctly",        category: "inside",  naAllowed: false },
  { key: "cab_security",       label: "Cab security — doors, steps, body panels and mountings secure",      category: "inside",  naAllowed: false },
  { key: "alt_fuel_hv",        label: "Alternative fuel / high voltage cutoff — working if fitted",          category: "inside",  naAllowed: true  },
  { key: "lights_indicators",  label: "Lights and indicators — all working, clean, correct colour",          category: "outside", naAllowed: false },
  { key: "reflectors_plate",   label: "Reflectors and number plate — clean, secure and visible",             category: "outside", naAllowed: false },
  { key: "tyres_wheels",       label: "Tyres and wheels — tread depth (min 1mm), pressure, wheel nuts",     category: "outside", naAllowed: false },
  { key: "fluid_levels",       label: "Fluid levels — fuel, oil, coolant, AdBlue, washer fluid, no leaks",  category: "outside", naAllowed: false },
  { key: "exhaust_emissions",  label: "Exhaust — no excessive smoke or emissions",                           category: "outside", naAllowed: false },
  { key: "spray_suppression",  label: "Spray suppression — mudguards and spray guards fitted and secure",    category: "outside", naAllowed: true  },
  { key: "battery",            label: "Battery — secure, no damage or corrosion",                            category: "outside", naAllowed: false },
  { key: "body_condition",     label: "Body/load area — no sharp edges, panels secure, no damage",          category: "body",    naAllowed: false },
  { key: "body_doors",         label: "Body doors — secure, hinges good, not likely to open in transit",    category: "body",    naAllowed: false },
  { key: "load_security",      label: "Load security points — rings, straps, hooks in good condition",       category: "body",    naAllowed: false },
  { key: "tail_lift",          label: "Tail lift — condition and operation checked (if fitted)",             category: "body",    naAllowed: true  },
];

// ─────────────────────────────────────────────────────────────────────────────
// VAN — checks (legally required for goods vehicles up to 3.5t)
// ─────────────────────────────────────────────────────────────────────────────

export const VAN_CHECKS: CheckItem[] = [
  { key: "oil_water",         label: "Oil and water levels — checked and topped up if needed",               category: "inside",  naAllowed: false },
  { key: "lights_indicators", label: "Lights and indicators — all working, clean, correct colour",           category: "outside", naAllowed: false },
  { key: "tyres",             label: "Tyres — condition, pressure and legal tread depth (min 1.6mm)",        category: "outside", naAllowed: false },
  { key: "brakes",            label: "Brakes — effective operation, no pulling or grinding",                 category: "inside",  naAllowed: false },
  { key: "mirrors",           label: "Mirrors — clean, correctly adjusted, no damage",                      category: "inside",  naAllowed: false },
  { key: "wipers_washers",    label: "Windscreen wipers and washers — working, screen clear",                category: "inside",  naAllowed: false },
  { key: "horn",              label: "Horn — working",                                                       category: "inside",  naAllowed: false },
  { key: "seatbelt",          label: "Seatbelt — condition, locks and retracts correctly",                  category: "inside",  naAllowed: false },
  { key: "bodywork",          label: "Bodywork — no damage likely to cause injury to others",               category: "outside", naAllowed: false },
  { key: "fluid_levels",      label: "Fuel, oil, coolant and washer fluid levels — no leaks",               category: "outside", naAllowed: false },
  { key: "number_plate",      label: "Number plate — clean, secure and visible",                            category: "outside", naAllowed: false },
  { key: "load_security",     label: "Load security — items secured and not obstructing driver",            category: "load",    naAllowed: true  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Key arrays — used for validation
// ─────────────────────────────────────────────────────────────────────────────

export const TRUCK_CHECK_KEYS   = TRUCK_CHECKS.map(c => c.key);
export const TRAILER_CHECK_KEYS = TRAILER_CHECKS.map(c => c.key);
export const RIGID_CHECK_KEYS   = RIGID_CHECKS.map(c => c.key);
export const VAN_CHECK_KEYS     = VAN_CHECKS.map(c => c.key);

// All possible truck-side keys across all vehicle classes
export const ALL_TRUCK_KEYS = [
  ...new Set([...TRUCK_CHECK_KEYS, ...RIGID_CHECK_KEYS, ...VAN_CHECK_KEYS])
];

export const SHIFT_STATUSES = ["draft","submitted","completed","failed","deleted"] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const USER_ROLES    = ["company_admin", "driver"] as const;
export const USER_STATUSES = ["active", "inactive", "deleted"] as const;
export type UserRole   = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];

// SINGLE SOURCE OF TRUTH for vehicle/trailer/driver vocab.
// Touched by: jobs, fleet, drivers, allocation, mobile checks.

export const BODY_CATEGORIES = [
  { value: "van", label: "Van (<=3.5t LCV)", needsTrailer: false, group: "van" },
  { value: "luton_van", label: "Luton van (3.5t)", needsTrailer: false, group: "van" },
  { value: "pickup", label: "Pickup / 4x4", needsTrailer: false, group: "van" },
  { value: "rigid", label: "Rigid HGV", needsTrailer: false, group: "hgv" },
  { value: "tractor", label: "Tractor unit (artic head)", needsTrailer: true, group: "hgv" },
  { value: "drawbar", label: "Drawbar (rigid + trailer)", needsTrailer: true, group: "hgv" },
  { value: "heavy_haulage", label: "Heavy haulage tractor", needsTrailer: true, group: "specialist" },
  { value: "spmt", label: "Self-propelled modular (SPMT)", needsTrailer: false, group: "specialist" },
  { value: "plant", label: "Plant / off-highway", needsTrailer: false, group: "specialist" },
] as const;
export type BodyCategory = typeof BODY_CATEGORIES[number]["value"];

export const GVW_CLASSES = [
  { value: "3.5t", label: "3.5t", applicableTo: ["van"] },
  { value: "7.5t", label: "7.5t", applicableTo: ["rigid"] },
  { value: "12t", label: "12t", applicableTo: ["rigid"] },
  { value: "18t", label: "18t", applicableTo: ["rigid"] },
  { value: "26t", label: "26t", applicableTo: ["rigid"] },
  { value: "32t", label: "32t", applicableTo: ["rigid", "drawbar"] },
  { value: "44t", label: "44t", applicableTo: ["tractor", "drawbar"] },
] as const;
export type GvwClass = typeof GVW_CLASSES[number]["value"];

export const BODY_TYPES = [
  { value: "curtain_sider", label: "Curtain sider / tautliner", group: "general" },
  { value: "double_deck_curtain", label: "Double-deck curtain", group: "general" },
  { value: "box", label: "Box (rigid box body)", group: "general" },
  { value: "double_deck_box", label: "Double-deck box", group: "general" },
  { value: "panel", label: "Panel van body", group: "general" },
  { value: "luton", label: "Luton (overcab box)", group: "general" },
  { value: "sliding_tarp", label: "Sliding tarp / coni", group: "general" },
  { value: "flatbed", label: "Flatbed", group: "flat" },
  { value: "dropside", label: "Dropside", group: "flat" },
  { value: "extending_flat", label: "Extending / tele flatbed", group: "flat" },
  { value: "step_frame", label: "Step-frame trailer", group: "flat" },
  { value: "beavertail", label: "Beavertail (plant carrier)", group: "flat" },
  { value: "tipper", label: "Tipper", group: "bulk" },
  { value: "bulk_tipper", label: "Bulk tipper (ag / grain)", group: "bulk" },
  { value: "walking_floor", label: "Walking floor", group: "bulk" },
  { value: "ejector_trailer", label: "Ejector trailer", group: "bulk" },
  { value: "powder_tanker", label: "Bulk powder tanker (cement)", group: "bulk" },
  { value: "blower_tanker", label: "Blower / pneumatic tanker", group: "bulk" },
  { value: "tanker_food", label: "Food tanker (milk / oil)", group: "tanker" },
  { value: "tanker_fuel", label: "Fuel tanker (petrol/diesel)", group: "tanker" },
  { value: "tanker_chemical", label: "Chemical tanker (ADR)", group: "tanker" },
  { value: "tanker_water", label: "Water tanker / bowser", group: "tanker" },
  { value: "tanker_vacuum", label: "Vacuum tanker (waste/slurry)", group: "tanker" },
  { value: "tanker_bitumen", label: "Bitumen tanker (heated)", group: "tanker" },
  { value: "tanker_other", label: "Tanker - other", group: "tanker" },
  { value: "fridge", label: "Fridge / refrigerated", group: "temp" },
  { value: "fridge_multi_temp", label: "Multi-temp fridge", group: "temp" },
  { value: "fridge_pharma", label: "Pharma-validated fridge (GDP)", group: "temp" },
  { value: "insulated", label: "Insulated (no chiller)", group: "temp" },
  { value: "skeletal_20", label: "Skeletal - 20ft", group: "container" },
  { value: "skeletal_40", label: "Skeletal - 40ft", group: "container" },
  { value: "skeletal_45", label: "Skeletal - 45ft", group: "container" },
  { value: "skeletal_extending", label: "Skeletal - extending", group: "container" },
  { value: "swap_body", label: "Swap-body chassis", group: "container" },
  { value: "low_loader", label: "Low loader", group: "heavy" },
  { value: "low_loader_extending", label: "Extending low loader", group: "heavy" },
  { value: "modular_heavy", label: "Modular heavy haulage", group: "heavy" },
  { value: "girder_frame", label: "Girder / drop-frame", group: "heavy" },
  { value: "mixer", label: "Concrete mixer", group: "specialist" },
  { value: "concrete_pump", label: "Concrete pump", group: "specialist" },
  { value: "hooklift", label: "Hooklift / hookloader (skip)", group: "specialist" },
  { value: "skip_loader", label: "Skip loader", group: "specialist" },
  { value: "roro_lorry", label: "RORO refuse", group: "specialist" },
  { value: "refuse", label: "Refuse / bin lorry", group: "specialist" },
  { value: "sweeper", label: "Road sweeper", group: "specialist" },
  { value: "gritter", label: "Gritter / winter", group: "specialist" },
  { value: "recovery_slide", label: "Recovery - slide bed", group: "specialist" },
  { value: "recovery_spec", label: "Recovery - heavy spec", group: "specialist" },
  { value: "car_transporter", label: "Car transporter", group: "specialist" },
  { value: "boat_trailer", label: "Boat trailer", group: "specialist" },
  { value: "livestock", label: "Livestock transporter", group: "specialist" },
  { value: "horsebox", label: "Horse transport", group: "specialist" },
  { value: "pole_timber", label: "Pole / timber trailer", group: "specialist" },
  { value: "coil_carrier", label: "Coil carrier (steel)", group: "specialist" },
  { value: "glass_inloader", label: "Glass inloader", group: "specialist" },
  { value: "cherry_picker", label: "Cherry picker / MEWP truck", group: "specialist" },
  { value: "other", label: "Other (specify in notes)", group: "other" },
] as const;
export type BodyType = typeof BODY_TYPES[number]["value"];

export const BODY_TYPES_BY_CATEGORY: Record<BodyCategory, BodyType[]> = {
  van: ["panel", "luton", "box", "fridge", "insulated", "dropside", "flatbed", "tipper", "other"],
  luton_van: ["luton", "box", "fridge", "other"],
  pickup: ["dropside", "flatbed", "tipper", "other"],
  rigid: [
    "curtain_sider", "box", "double_deck_box", "fridge", "fridge_multi_temp", "insulated",
    "flatbed", "dropside", "tipper", "bulk_tipper", "mixer", "concrete_pump",
    "tanker_food", "tanker_fuel", "tanker_chemical", "tanker_water", "tanker_vacuum", "tanker_bitumen", "tanker_other",
    "powder_tanker", "blower_tanker", "walking_floor", "ejector_trailer",
    "hooklift", "skip_loader", "refuse", "sweeper", "gritter",
    "recovery_slide", "recovery_spec", "car_transporter", "cherry_picker", "livestock", "horsebox",
    "other",
  ],
  tractor: [],
  drawbar: [],
  heavy_haulage: [],
  spmt: ["modular_heavy", "girder_frame", "other"],
  plant: ["other"],
};

export const ONBOARD_EQUIPMENT = [
  { value: "tail_lift", label: "Tail lift", group: "lifting" },
  { value: "tail_lift_column", label: "Tail lift - column type", group: "lifting" },
  { value: "hiab_crane", label: "HIAB / lorry-mounted crane", group: "lifting" },
  { value: "hiab_jib", label: "HIAB with fly-jib extension", group: "lifting" },
  { value: "moffett", label: "Moffett (truck-mounted forklift)", group: "lifting" },
  { value: "moffett_brackets", label: "Moffett brackets (trailer-side)", group: "lifting" },
  { value: "forklift", label: "Onboard forklift", group: "lifting" },
  { value: "pallet_truck", label: "Pallet truck (manual)", group: "lifting" },
  { value: "pallet_truck_pwd", label: "Powered pallet truck", group: "lifting" },
  { value: "drum_lifter", label: "Drum / barrel lifter", group: "lifting" },
  { value: "winch", label: "Recovery winch", group: "lifting" },
  { value: "skip_grab", label: "Skip / brick grab", group: "lifting" },
  { value: "bin_lift", label: "Bin lift", group: "lifting" },
  { value: "pump", label: "Pump (tanker)", group: "bulk" },
  { value: "compressor", label: "Compressor (powder discharge)", group: "bulk" },
  { value: "hose_set", label: "Hose set", group: "bulk" },
  { value: "metered_discharge", label: "Metered discharge", group: "bulk" },
  { value: "food_grade_liner", label: "Food-grade liner", group: "bulk" },
  { value: "straps", label: "Ratchet straps", group: "secure" },
  { value: "chains", label: "Chains", group: "secure" },
  { value: "load_bars", label: "Load bars", group: "secure" },
  { value: "dunnage_bags", label: "Dunnage / inflatable bags", group: "secure" },
  { value: "cargo_nets", label: "Cargo nets", group: "secure" },
  { value: "sheeting", label: "Sheeting / tarpaulin", group: "secure" },
  { value: "twist_locks", label: "Container twist-locks", group: "secure" },
  { value: "coil_well", label: "Coil well", group: "secure" },
  { value: "horse_partitions", label: "Livestock / horse partitions", group: "secure" },
  { value: "fridge_unit", label: "Refrigeration unit (TK / Carrier)", group: "temp" },
  { value: "multi_temp_partition", label: "Multi-temp partition", group: "temp" },
  { value: "temp_logger", label: "Temperature logger / recorder", group: "temp" },
  { value: "pre_cool", label: "Pre-cool capability", group: "temp" },
  { value: "twin_deck", label: "Twin / double-deck floor", group: "spec" },
  { value: "air_ride", label: "Air-ride suspension", group: "spec" },
  { value: "side_door", label: "Side / sliding door", group: "spec" },
  { value: "roller_floor", label: "Roller floor / load assist", group: "spec" },
  { value: "tail_doors", label: "Tail / barn doors", group: "spec" },
  { value: "shutter_door", label: "Roller shutter rear door", group: "spec" },
  { value: "adr_kit", label: "ADR safety kit", group: "safety" },
  { value: "adr_placards", label: "ADR placards mount", group: "safety" },
  { value: "spill_kit", label: "Spill kit", group: "safety" },
  { value: "fire_extinguisher", label: "Fire extinguisher", group: "safety" },
  { value: "first_aid_kit", label: "First-aid kit", group: "safety" },
  { value: "ppe_spare", label: "Spare PPE on board", group: "safety" },
  { value: "wheel_chocks", label: "Wheel chocks", group: "safety" },
  { value: "tracker", label: "GPS tracker", group: "telematics" },
  { value: "dashcam", label: "Dashcam", group: "telematics" },
  { value: "reverse_camera", label: "Reverse camera", group: "telematics" },
  { value: "side_camera_360", label: "360 / side cameras (FORS)", group: "telematics" },
  { value: "alarm", label: "Alarm / immobiliser", group: "telematics" },
  { value: "panic_button", label: "Panic / driver duress button", group: "telematics" },
  { value: "abnormal_lights", label: "Abnormal-load light bar", group: "other" },
  { value: "escort_signage", label: "Escort / convoy signage", group: "other" },
] as const;
export type OnboardEquipment = typeof ONBOARD_EQUIPMENT[number]["value"];

export const DRIVER_LICENCE_CLASSES = [
  { value: "B", label: "B - Car / van <=3.5t", drives: ["van"] },
  { value: "C1", label: "C1 - 3.5-7.5t rigid", drives: ["van", "rigid"] },
  { value: "C1E", label: "C1+E - 7.5t rigid + trailer", drives: ["van", "rigid", "drawbar"] },
  { value: "C", label: "C - Rigid HGV >=7.5t (Class 2)", drives: ["van", "rigid"] },
  { value: "CE", label: "C+E - Artic / drawbar (Class 1)", drives: ["van", "rigid", "tractor", "drawbar"] },
] as const;
export type DriverLicenceClass = typeof DRIVER_LICENCE_CLASSES[number]["value"];

export const DRIVER_ENDORSEMENTS = [
  { value: "cpc", label: "Driver CPC" },
  { value: "adr", label: "ADR (any class)" },
  { value: "adr_tank", label: "ADR - Tanker" },
  { value: "adr_class1", label: "ADR - Class 1 explosives" },
  { value: "hiab", label: "HIAB / crane operator" },
  { value: "moffett", label: "Moffett operator" },
  { value: "forklift_cb", label: "Forklift counterbalance" },
  { value: "forklift_re", label: "Forklift reach" },
  { value: "tanker_cert", label: "Tanker safety cert" },
  { value: "fors_silver", label: "FORS Silver driver" },
  { value: "fors_gold", label: "FORS Gold driver" },
  { value: "cscs", label: "CSCS card" },
  { value: "first_aid", label: "First aid trained" },
] as const;
export type DriverEndorsement = typeof DRIVER_ENDORSEMENTS[number]["value"];

export const TRAILER_LENGTHS = [
  { value: "8m", label: "8 m" },
  { value: "10m", label: "10 m" },
  { value: "13.6m", label: "13.6 m (UK standard)" },
  { value: "13.6m_ext", label: "13.6 m extending" },
  { value: "14.6m", label: "14.6 m" },
  { value: "15.65m", label: "15.65 m (extended)" },
  { value: "16.5m", label: "16.5 m" },
  { value: "double", label: "Double-deck / mega" },
  { value: "stgo_cat1", label: "STGO Cat 1 (<=80t GVW)" },
  { value: "stgo_cat2", label: "STGO Cat 2 (<=100t GVW)" },
  { value: "stgo_cat3", label: "STGO Cat 3 (<=150t GVW)" },
] as const;
export type TrailerLength = typeof TRAILER_LENGTHS[number]["value"];

export const SERVICE_TYPES = [
  { value: "delivery", label: "Delivery only" },
  { value: "collection", label: "Collection only" },
  { value: "collection_delivery", label: "Collection + delivery" },
  { value: "transfer", label: "Internal transfer / depot to depot" },
  { value: "trunking", label: "Linehaul / trunking" },
  { value: "sameday", label: "Sameday / express" },
  { value: "next_day", label: "Next day" },
  { value: "economy", label: "Economy / scheduled" },
  { value: "last_mile", label: "Last mile" },
  { value: "first_mile", label: "First mile" },
  { value: "drayage", label: "Drayage / port haulage" },
  { value: "container_haulage", label: "Container haulage" },
  { value: "intermodal", label: "Intermodal (rail/sea + road)" },
  { value: "cross_dock", label: "Cross-dock" },
  { value: "warehousing", label: "Warehousing + distribution" },
  { value: "returns", label: "Reverse logistics / returns" },
  { value: "abnormal", label: "Abnormal / heavy haulage" },
  { value: "removals", label: "Removals" },
  { value: "courier", label: "Courier / parcels" },
] as const;

export const JOB_TYPES = [
  { value: "ftl", label: "Full Load (FTL)" },
  { value: "ltl", label: "Part Load / LTL" },
  { value: "groupage", label: "Groupage" },
  { value: "multi_drop", label: "Multi-drop" },
  { value: "multi_collection", label: "Multi-collection" },
  { value: "milk_run", label: "Milk run / route" },
  { value: "return_load", label: "Return / backload" },
  { value: "trunking", label: "Trunking" },
  { value: "shunt", label: "Yard shunt" },
  { value: "pallet_network", label: "Pallet network (Palletline / Palletways / etc.)" },
  { value: "fcl", label: "FCL container" },
  { value: "lcl", label: "LCL / consolidated container" },
  { value: "sameday_express", label: "Sameday express" },
  { value: "abnormal", label: "Abnormal / specialist" },
  { value: "subcontracted", label: "Sub-contracted out" },
] as const;

export function bodyCategoryNeedsTrailer(c: BodyCategory): boolean {
  return BODY_CATEGORIES.find(x => x.value === c)?.needsTrailer ?? false;
}

export function gvwForCategory(c: BodyCategory) {
  return GVW_CLASSES.filter(g => (g.applicableTo as readonly string[]).includes(c));
}

export function licencesThatCanDrive(c: BodyCategory) {
  return DRIVER_LICENCE_CLASSES.filter(l => (l.drives as readonly string[]).includes(c));
}

export const isBodyCategory = (v: unknown): v is BodyCategory =>
  typeof v === "string" && BODY_CATEGORIES.some(x => x.value === v);
export const isGvwClass = (v: unknown): v is GvwClass =>
  typeof v === "string" && GVW_CLASSES.some(x => x.value === v);
export const isBodyType = (v: unknown): v is BodyType =>
  typeof v === "string" && BODY_TYPES.some(x => x.value === v);
export const isOnboardEquipment = (v: unknown): v is OnboardEquipment =>
  typeof v === "string" && ONBOARD_EQUIPMENT.some(x => x.value === v);
export const isLicenceClass = (v: unknown): v is DriverLicenceClass =>
  typeof v === "string" && DRIVER_LICENCE_CLASSES.some(x => x.value === v);

const EXTRA_EQUIPMENT_BY_BODY_GROUP: Record<string, readonly string[]> = {
  general:    ["lifting", "secure", "spec"],
  flat:       ["lifting", "secure"],
  bulk:       [],
  tanker:     ["bulk"],
  temp:       ["lifting", "secure", "temp", "spec"],
  container:  ["lifting", "secure", "spec"],
  heavy:      ["lifting", "secure", "spec", "other"],
  specialist: ["lifting"],
  other:      ["lifting", "secure", "bulk", "temp", "spec", "other"],
};

const EXTRA_EQUIPMENT_BY_CATEGORY: Partial<Record<BodyCategory, readonly string[]>> = {
  drawbar:       ["lifting", "secure", "spec"],
  heavy_haulage: ["secure", "spec", "other"],
  spmt:          ["other"],
  plant:         [],
  van:           ["lifting", "secure", "spec"],
  luton_van:     ["lifting", "secure", "spec"],
  pickup:        ["lifting", "secure"],
  rigid:         ["lifting", "secure", "spec"],
};

const ITEM_ALLOWLIST_BY_CATEGORY: Partial<Record<BodyCategory, readonly OnboardEquipment[]>> = {
  tractor:       ["hiab_crane", "hiab_jib", "winch"],
  heavy_haulage: ["hiab_crane", "hiab_jib", "winch"],
};

export function equipmentForBodyType(
  bodyType: BodyType | "",
  bodyCategory: BodyCategory | "" = "",
): typeof ONBOARD_EQUIPMENT[number][] {
  const alwaysGroups = ["safety", "telematics"];

  if (!bodyType && bodyCategory) {
    const itemList = ITEM_ALLOWLIST_BY_CATEGORY[bodyCategory as BodyCategory];
    if (itemList) {
      return ONBOARD_EQUIPMENT.filter(
        e => alwaysGroups.includes(e.group) || (itemList as readonly string[]).includes(e.value),
      );
    }
  }

  let extra: readonly string[];
  if (bodyType) {
    const bt = BODY_TYPES.find(b => b.value === bodyType);
    extra = EXTRA_EQUIPMENT_BY_BODY_GROUP[bt?.group ?? "other"] ?? [];
  } else if (bodyCategory) {
    extra = EXTRA_EQUIPMENT_BY_CATEGORY[bodyCategory as BodyCategory] ?? [];
  } else {
    return [...ONBOARD_EQUIPMENT];
  }

  const allowed = new Set([...alwaysGroups, ...extra]);
  return ONBOARD_EQUIPMENT.filter(e => allowed.has(e.group));
}

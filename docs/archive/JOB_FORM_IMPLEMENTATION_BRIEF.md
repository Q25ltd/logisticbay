# Job Creation Form — Logistics Completeness Implementation Brief

**Audience:** A coding agent (Claude Code, Cursor, etc.) tasked with extending the existing job creation form so it is production-ready for a real-world UK/EU logistics company.

**Source repo layout (already exists, do NOT recreate):**
- DB / ORM: `api/prisma/schema.prisma` (Prisma + SQLite in dev)
- API Zod schemas: `api/src/schemas/jobs.ts`
- API server validation: `api/src/services/jobValidation.ts`
- API enums: `api/src/constants/jobCreation.ts`
- API routes: `api/src/routes/jobs.ts`
- UI page: `web/src/modules/jobs/CreateJobPage.tsx`
- UI per-stop: `web/src/modules/jobs/StopCard.tsx`
- UI form helpers: `web/src/modules/jobs/CreateJobFormComponents.tsx`
- UI constants: `web/src/modules/jobs/createJobConstants.ts`
- UI types: `web/src/modules/jobs/createJobTypes.ts`
- UI payload mapper: `web/src/modules/jobs/createJobPayload.ts`
- UI utils (completion checks): `web/src/modules/jobs/createJobUtils.ts`

**General rules for the agent**

1. Work in the existing files — do not introduce new architecture (no Redux, no new state libs). The form already uses `useState` per field; keep that pattern.
2. Every new persistent field must touch all five layers: Prisma model → migration → Zod schema → server validation → UI state → UI render → payload builder → edit-mode load → template apply.
3. New UI sections follow the existing `Section 0X — Title` pattern with `secNCollapsed`, `secNStarted`, `secNComplete` flags and the `SectionHeader` / `SectionFooter` components.
4. Use the existing `OptionalToggle`, `Toggle`, `MultiCheck`, `FieldLabel`, `ReadOnlyField` helpers from `CreateJobFormComponents.tsx`. Do not invent new primitives.
5. New required fields must be enforced in BOTH `jobValidation.ts` (server-side, hard) and the per-section `complete` derived booleans (UI gate for the green tick).
6. All free-text fields default to `""`, all booleans default to `false`, all numbers/IDs to `null`. Match the existing pattern.
7. Run `pnpm prisma migrate dev --name <phase_name>` after each Prisma change.
8. After each phase: run `pnpm typecheck` in `api/` and `web/`, run `pnpm test` if tests exist, then commit with a clear message.
9. **Do not break** existing job creation — every change is additive. Existing rows get sane defaults via the migration.

---

## Phase A — Read before changing anything

Open and read in full:

- `web/src/modules/jobs/CreateJobPage.tsx` (the form is ~1900 lines; you must understand the section layout before editing)
- `web/src/modules/jobs/StopCard.tsx`
- `web/src/modules/jobs/createJobPayload.ts` (this is where front-end state becomes the API body — every new field must be mapped here)
- `api/src/services/jobValidation.ts` (server hard-rules for `ready_to_plan` save mode)
- `api/prisma/schema.prisma` models `PlannedJob`, `JobStop`, `LoadDetails`

**Confirm before you begin:** the existing form already saves drafts and `ready_to_plan` jobs; do not change that flow. You are only adding sections and fields.

---

# Phase 0 — Vocabulary Unification (PREREQUISITE FOR ALL OTHER PHASES)

> **Do this phase first. Do NOT start Phases 1–12 until Phase 0 is merged.** Every later phase references vehicle, trailer, body, equipment, and licence concepts. If the vocabulary is wrong, the whole TMS is wrong.

## 0.1 The problem (read carefully)

The codebase currently has **three different vocabularies** for vehicles and trailers, none of which agree, and several distinct logistics concepts have been **collapsed into a single dropdown**. Specifically:

| Layer | File | Problem |
|-|-|-|
| Job form UI | `web/src/modules/jobs/createJobConstants.ts` → `VEHICLE_TYPES` | Mixes body category (`van`, `rigid`, `artic`) with body subtype (`tipper`, `mixer`, `hiab`) with cooling spec (`refrigerated`) into one list |
| Job form server | `api/src/constants/jobCreation.ts` → `VEHICLE_CLASSES` | Same mix **plus `class1` and `class2`** which are HGV licence classes — not vehicle types at all |
| Fleet UI | `web/src/modules/fleet/fleetConstants.ts` → `VEHICLE_CLASSES` / `TRAILER_TYPES` | Stores **Title Case display strings** as values (`"Artic unit"`, `"Curtain sider"`) instead of stable slug values — joins with the job form list are impossible |
| Driver form | `web/src/modules/drivers/DriverForm.tsx` → `licenceClass` | Free-text input with placeholder `"Class 1 / CE"` — anyone can type anything |
| Job form server | `api/src/constants/jobCreation.ts` → `TRAILER_TYPES` | Has both `fridge` AND `refrigerated_trailer` as duplicates, plus extra `walking_floor` and `container` not present in UI |

The result: a job saved with `vehicleClassRequired = "artic"` cannot match a driver whose `licenceClass = "Class 1"`, cannot match a unit whose `vehicleClass = "Artic unit"` (note the trailing word and capitalisation), and cannot enforce that a `class1`-required job actually gets a tractor unit with a trailer.

## 0.2 The right model (separate concepts that were collapsed)

The agent must implement these **five orthogonal concepts** as separate fields, not collapsed into one:

1. **Body category** — what the chassis fundamentally is. Drives whether a trailer is needed.
2. **GVW class** — gross weight rating. Drives which licence the driver needs.
3. **Body type** — the rigid body OR the trailer body shape (same vocabulary, used in two places).
4. **Onboard equipment** — bolt-on extras carried by a unit and/or trailer.
5. **Driver licence class** — the actual UK driving licence category (separate from any vehicle attribute).

A `tractor` body category has **no** body type (it's just a head). It tows a `trailer` which has a body type. A `rigid` body category **has** a body type built onto it. A `van` body category may have a body type (panel, dropside, luton) or none.

## 0.3 The canonical taxonomy

Create a **single shared file** that drives every form across the system. Path:

`shared/vehicleTaxonomy.ts` — copied identically into both `api/src/constants/vehicleTaxonomy.ts` and `web/src/constants/vehicleTaxonomy.ts` (and `mobile/src/constants/vehicleTaxonomy.ts` if mobile uses any of these).

> If the repo has a workspace package setup that allows true sharing (Turborepo, pnpm workspaces with internal packages), prefer that. Otherwise duplicate the file in three places and add a CI check (`scripts/check-vocab-sync.ts`) that hashes the three files and fails the build if they diverge. Do not let them drift again.

Contents:

```ts
// shared/vehicleTaxonomy.ts — SINGLE SOURCE OF TRUTH for vehicle/trailer/driver vocab.
// Touched by: jobs, fleet (units + trailers), drivers, allocation, mobile checks.

// ── 1. Body category ────────────────────────────────────────────────────────
// What is the chassis fundamentally? Determines: needs a trailer? what licence?
// NOTE: This list intentionally covers everything from sameday couriers to
// heavy haulage. Each operator will use only a subset, but the taxonomy
// must be exhaustive so no operator is forced to type "other".
export const BODY_CATEGORIES = [
  // Light / sameday
  { value: "bicycle",        label: "Bicycle / cargo bike",       needsTrailer: false, group: "courier" },
  { value: "motorcycle",     label: "Motorcycle",                 needsTrailer: false, group: "courier" },
  { value: "car",            label: "Car (sameday)",              needsTrailer: false, group: "courier" },
  { value: "small_van",      label: "Small van (SWB ≤2.0t)",      needsTrailer: false, group: "van" },
  { value: "van",            label: "Van (≤3.5t LCV)",            needsTrailer: false, group: "van" },
  { value: "luton_van",      label: "Luton van (3.5t)",           needsTrailer: false, group: "van" },
  { value: "pickup",         label: "Pickup / 4x4",               needsTrailer: false, group: "van" },
  // HGV
  { value: "rigid",          label: "Rigid HGV",                  needsTrailer: false, group: "hgv" },
  { value: "tractor",        label: "Tractor unit (artic head)",  needsTrailer: true,  group: "hgv" },
  { value: "drawbar",        label: "Drawbar (rigid + trailer)",  needsTrailer: true,  group: "hgv" },
  // Specialist heavy
  { value: "heavy_haulage",  label: "Heavy haulage tractor",      needsTrailer: true,  group: "specialist" },
  { value: "spmt",           label: "Self-propelled modular (SPMT)", needsTrailer: false, group: "specialist" },
  // Off-highway / plant
  { value: "plant",          label: "Plant / off-highway",        needsTrailer: false, group: "specialist" },
] as const;
export type BodyCategory = typeof BODY_CATEGORIES[number]["value"];

// ── 2. GVW class ────────────────────────────────────────────────────────────
// Gross vehicle weight. Determines licence requirement.
// `applicableTo` lets the UI hide irrelevant options when bodyCategory is known.
export const GVW_CLASSES = [
  { value: "3.5t", label: "3.5t",  applicableTo: ["van"] },
  { value: "7.5t", label: "7.5t",  applicableTo: ["rigid"] },
  { value: "12t",  label: "12t",   applicableTo: ["rigid"] },
  { value: "18t",  label: "18t",   applicableTo: ["rigid"] },
  { value: "26t",  label: "26t",   applicableTo: ["rigid"] },
  { value: "32t",  label: "32t",   applicableTo: ["rigid", "drawbar"] },
  { value: "44t",  label: "44t",   applicableTo: ["tractor", "drawbar"] },
] as const;
export type GvwClass = typeof GVW_CLASSES[number]["value"];

// ── 3. Body type (used for rigid body OR trailer body) ──────────────────────
// `group` lets the UI show grouped option lists. `usableOn` lets the form
// hide irrelevant body types when bodyCategory is fixed (e.g. "tanker" is
// not a usable rigid body for a small_van).
export const BODY_TYPES = [
  // ── General haulage ───────────────────────────────────────────────────
  { value: "curtain_sider",     label: "Curtain sider / tautliner",  group: "general" },
  { value: "double_deck_curtain", label: "Double-deck curtain",      group: "general" },
  { value: "box",               label: "Box (rigid box body)",        group: "general" },
  { value: "double_deck_box",   label: "Double-deck box",             group: "general" },
  { value: "panel",             label: "Panel van body",              group: "general" },
  { value: "luton",             label: "Luton (overcab box)",         group: "general" },
  { value: "sliding_tarp",      label: "Sliding tarp / coni",         group: "general" },
  // ── Flatbeds / open ───────────────────────────────────────────────────
  { value: "flatbed",           label: "Flatbed",                     group: "flat" },
  { value: "dropside",          label: "Dropside",                    group: "flat" },
  { value: "extending_flat",    label: "Extending / tele flatbed",    group: "flat" },
  { value: "step_frame",        label: "Step-frame trailer",          group: "flat" },
  { value: "beavertail",        label: "Beavertail (plant carrier)",  group: "flat" },
  // ── Tippers / bulk ────────────────────────────────────────────────────
  { value: "tipper",            label: "Tipper",                      group: "bulk" },
  { value: "bulk_tipper",       label: "Bulk tipper (ag / grain)",    group: "bulk" },
  { value: "walking_floor",     label: "Walking floor",               group: "bulk" },
  { value: "ejector_trailer",   label: "Ejector trailer",             group: "bulk" },
  { value: "powder_tanker",     label: "Bulk powder tanker (cement)", group: "bulk" },
  { value: "blower_tanker",     label: "Blower / pneumatic tanker",   group: "bulk" },
  // ── Tankers ───────────────────────────────────────────────────────────
  { value: "tanker_food",       label: "Food tanker (milk / oil)",    group: "tanker" },
  { value: "tanker_fuel",       label: "Fuel tanker (petrol/diesel)", group: "tanker" },
  { value: "tanker_chemical",   label: "Chemical tanker (ADR)",       group: "tanker" },
  { value: "tanker_water",      label: "Water tanker / bowser",       group: "tanker" },
  { value: "tanker_vacuum",     label: "Vacuum tanker (waste/slurry)",group: "tanker" },
  { value: "tanker_bitumen",    label: "Bitumen tanker (heated)",     group: "tanker" },
  { value: "tanker_other",      label: "Tanker — other",              group: "tanker" },
  // ── Temperature controlled ────────────────────────────────────────────
  { value: "fridge",            label: "Fridge / refrigerated",       group: "temp" },
  { value: "fridge_multi_temp", label: "Multi-temp fridge",           group: "temp" },
  { value: "fridge_pharma",     label: "Pharma-validated fridge (GDP)", group: "temp" },
  { value: "insulated",         label: "Insulated (no chiller)",      group: "temp" },
  // ── Container / intermodal ────────────────────────────────────────────
  { value: "skeletal_20",       label: "Skeletal — 20ft",             group: "container" },
  { value: "skeletal_40",       label: "Skeletal — 40ft",             group: "container" },
  { value: "skeletal_45",       label: "Skeletal — 45ft",             group: "container" },
  { value: "skeletal_extending",label: "Skeletal — extending",        group: "container" },
  { value: "swap_body",         label: "Swap-body chassis",           group: "container" },
  // ── Heavy / abnormal ──────────────────────────────────────────────────
  { value: "low_loader",        label: "Low loader",                  group: "heavy" },
  { value: "low_loader_extending", label: "Extending low loader",     group: "heavy" },
  { value: "modular_heavy",     label: "Modular heavy haulage",       group: "heavy" },
  { value: "girder_frame",      label: "Girder / drop-frame",         group: "heavy" },
  // ── Specialist ────────────────────────────────────────────────────────
  { value: "mixer",             label: "Concrete mixer",              group: "specialist" },
  { value: "concrete_pump",     label: "Concrete pump",               group: "specialist" },
  { value: "hooklift",          label: "Hooklift / hookloader (skip)",group: "specialist" },
  { value: "skip_loader",       label: "Skip loader",                 group: "specialist" },
  { value: "roro_lorry",        label: "RORO refuse",                 group: "specialist" },
  { value: "refuse",            label: "Refuse / bin lorry",          group: "specialist" },
  { value: "sweeper",           label: "Road sweeper",                group: "specialist" },
  { value: "gritter",           label: "Gritter / winter",            group: "specialist" },
  { value: "recovery_slide",    label: "Recovery — slide bed",        group: "specialist" },
  { value: "recovery_spec",     label: "Recovery — heavy spec",       group: "specialist" },
  { value: "car_transporter",   label: "Car transporter",             group: "specialist" },
  { value: "boat_trailer",      label: "Boat trailer",                group: "specialist" },
  { value: "livestock",         label: "Livestock transporter",       group: "specialist" },
  { value: "horsebox",          label: "Horse transport",             group: "specialist" },
  { value: "pole_timber",       label: "Pole / timber trailer",       group: "specialist" },
  { value: "coil_carrier",      label: "Coil carrier (steel)",        group: "specialist" },
  { value: "glass_inloader",    label: "Glass inloader",              group: "specialist" },
  { value: "cherry_picker",     label: "Cherry picker / MEWP truck",  group: "specialist" },
  // ── Catch-all ─────────────────────────────────────────────────────────
  { value: "other",             label: "Other (specify in notes)",    group: "other" },
] as const;
export type BodyType = typeof BODY_TYPES[number]["value"];

// Optional: helper to filter body types by category for cleaner UI.
// Called from the cascading picker — `tractor` shows trailer body types only,
// `van` shows van-shaped bodies, etc. Keep this list explicit; do not auto-derive.
export const BODY_TYPES_BY_CATEGORY: Record<BodyCategory, BodyType[]> = {
  bicycle: [],
  motorcycle: [],
  car: [],
  small_van: ["panel", "luton"],
  van: ["panel", "luton", "box", "fridge", "insulated", "dropside", "flatbed", "tipper", "other"],
  luton_van: ["luton", "box", "fridge", "other"],
  pickup: ["dropside", "flatbed", "tipper", "other"],
  rigid: [
    "curtain_sider","box","double_deck_box","fridge","fridge_multi_temp","insulated",
    "flatbed","dropside","tipper","bulk_tipper","mixer","concrete_pump",
    "tanker_food","tanker_fuel","tanker_chemical","tanker_water","tanker_vacuum","tanker_bitumen","tanker_other",
    "powder_tanker","blower_tanker","walking_floor","ejector_trailer",
    "hooklift","skip_loader","refuse","sweeper","gritter",
    "recovery_slide","recovery_spec","car_transporter","cherry_picker","livestock","horsebox",
    "other",
  ],
  tractor: [],   // Tractor itself has no body — its trailer does. UI must drive trailer body types.
  drawbar: [],   // Same — body lives on the trailer.
  heavy_haulage: [],
  spmt: ["modular_heavy","girder_frame","other"],
  plant: ["other"],
};

// ── 4. Onboard equipment ────────────────────────────────────────────────────
// Bolted onto unit or trailer. Multi-select.
// Grouped so the UI can render in sensible columns / accordions.
export const ONBOARD_EQUIPMENT = [
  // Lifting
  { value: "tail_lift",        label: "Tail lift",                       group: "lifting" },
  { value: "tail_lift_column", label: "Tail lift — column type",         group: "lifting" },
  { value: "hiab_crane",       label: "HIAB / lorry-mounted crane",      group: "lifting" },
  { value: "hiab_jib",         label: "HIAB with fly-jib extension",     group: "lifting" },
  { value: "moffett",          label: "Moffett (truck-mounted forklift)",group: "lifting" },
  { value: "moffett_brackets", label: "Moffett brackets (trailer-side)", group: "lifting" },
  { value: "forklift",         label: "Onboard forklift",                group: "lifting" },
  { value: "pallet_truck",     label: "Pallet truck (manual)",           group: "lifting" },
  { value: "pallet_truck_pwd", label: "Powered pallet truck",            group: "lifting" },
  { value: "drum_lifter",      label: "Drum / barrel lifter",            group: "lifting" },
  { value: "winch",            label: "Recovery winch",                  group: "lifting" },
  { value: "skip_grab",        label: "Skip / brick grab",               group: "lifting" },
  { value: "bin_lift",         label: "Bin lift",                        group: "lifting" },
  // Tanker / bulk
  { value: "pump",             label: "Pump (tanker)",                   group: "bulk" },
  { value: "compressor",       label: "Compressor (powder discharge)",   group: "bulk" },
  { value: "hose_set",         label: "Hose set",                        group: "bulk" },
  { value: "metered_discharge",label: "Metered discharge",               group: "bulk" },
  { value: "food_grade_liner", label: "Food-grade liner",                group: "bulk" },
  // Securing
  { value: "straps",           label: "Ratchet straps",                  group: "secure" },
  { value: "chains",           label: "Chains",                          group: "secure" },
  { value: "load_bars",        label: "Load bars",                       group: "secure" },
  { value: "dunnage_bags",     label: "Dunnage / inflatable bags",       group: "secure" },
  { value: "cargo_nets",       label: "Cargo nets",                      group: "secure" },
  { value: "sheeting",         label: "Sheeting / tarpaulin",            group: "secure" },
  { value: "twist_locks",      label: "Container twist-locks",           group: "secure" },
  { value: "coil_well",        label: "Coil well",                       group: "secure" },
  { value: "horse_partitions", label: "Livestock / horse partitions",    group: "secure" },
  // Refrigeration / temp
  { value: "fridge_unit",      label: "Refrigeration unit (TK / Carrier)", group: "temp" },
  { value: "multi_temp_partition", label: "Multi-temp partition",        group: "temp" },
  { value: "temp_logger",      label: "Temperature logger / recorder",   group: "temp" },
  { value: "pre_cool",         label: "Pre-cool capability",             group: "temp" },
  // Trailer spec
  { value: "twin_deck",        label: "Twin / double-deck floor",        group: "spec" },
  { value: "air_ride",         label: "Air-ride suspension",             group: "spec" },
  { value: "side_door",        label: "Side / sliding door",             group: "spec" },
  { value: "roller_floor",     label: "Roller floor / load assist",      group: "spec" },
  { value: "tail_doors",       label: "Tail / barn doors",               group: "spec" },
  { value: "shutter_door",     label: "Roller shutter rear door",        group: "spec" },
  // Compliance / safety
  { value: "adr_kit",          label: "ADR safety kit",                  group: "safety" },
  { value: "adr_placards",     label: "ADR placards mount",              group: "safety" },
  { value: "spill_kit",        label: "Spill kit",                       group: "safety" },
  { value: "fire_extinguisher",label: "Fire extinguisher",               group: "safety" },
  { value: "first_aid_kit",    label: "First-aid kit",                   group: "safety" },
  { value: "ppe_spare",        label: "Spare PPE on board",              group: "safety" },
  { value: "wheel_chocks",     label: "Wheel chocks",                    group: "safety" },
  // Telematics / security
  { value: "tracker",          label: "GPS tracker",                     group: "telematics" },
  { value: "dashcam",          label: "Dashcam",                         group: "telematics" },
  { value: "reverse_camera",   label: "Reverse camera",                  group: "telematics" },
  { value: "side_camera_360",  label: "360 / side cameras (FORS)",       group: "telematics" },
  { value: "alarm",            label: "Alarm / immobiliser",             group: "telematics" },
  { value: "panic_button",     label: "Panic / driver duress button",    group: "telematics" },
  // Other
  { value: "abnormal_lights",  label: "Abnormal-load light bar",         group: "other" },
  { value: "escort_signage",   label: "Escort / convoy signage",         group: "other" },
] as const;
export type OnboardEquipment = typeof ONBOARD_EQUIPMENT[number]["value"];

// ── 5. Driver licence class (UK) ────────────────────────────────────────────
// Maps cleanly onto BodyCategory + GvwClass for allocation.
export const DRIVER_LICENCE_CLASSES = [
  { value: "B",    label: "B — Car / van ≤3.5t",          drives: ["van"] },
  { value: "C1",   label: "C1 — 3.5–7.5t rigid",           drives: ["van", "rigid"] },
  { value: "C1E",  label: "C1+E — 7.5t rigid + trailer",   drives: ["van", "rigid", "drawbar"] },
  { value: "C",    label: "C — Rigid HGV ≥7.5t (Class 2)", drives: ["van", "rigid"] },
  { value: "CE",   label: "C+E — Artic / drawbar (Class 1)", drives: ["van", "rigid", "tractor", "drawbar"] },
] as const;
export type DriverLicenceClass = typeof DRIVER_LICENCE_CLASSES[number]["value"];

// ── 6. Driver endorsements (separate from class — additive) ─────────────────
export const DRIVER_ENDORSEMENTS = [
  { value: "cpc",          label: "Driver CPC" },
  { value: "adr",          label: "ADR (any class)" },
  { value: "adr_tank",     label: "ADR — Tanker" },
  { value: "adr_class1",   label: "ADR — Class 1 explosives" },
  { value: "hiab",         label: "HIAB / crane operator" },
  { value: "moffett",      label: "Moffett operator" },
  { value: "forklift_cb",  label: "Forklift counterbalance" },
  { value: "forklift_re",  label: "Forklift reach" },
  { value: "tanker_cert",  label: "Tanker safety cert" },
  { value: "fors_silver",  label: "FORS Silver driver" },
  { value: "fors_gold",    label: "FORS Gold driver" },
  { value: "cscs",         label: "CSCS card" },
  { value: "first_aid",    label: "First aid trained" },
] as const;
export type DriverEndorsement = typeof DRIVER_ENDORSEMENTS[number]["value"];

// ── 7. Trailer length / spec (sub-attributes) ───────────────────────────────
export const TRAILER_LENGTHS = [
  { value: "8m",     label: "8 m" },
  { value: "10m",    label: "10 m" },
  { value: "13.6m",  label: "13.6 m (UK standard)" },
  { value: "13.6m_ext", label: "13.6 m extending" },
  { value: "14.6m",  label: "14.6 m" },
  { value: "15.65m", label: "15.65 m (extended)" },
  { value: "16.5m",  label: "16.5 m" },
  { value: "double", label: "Double-deck / mega" },
  { value: "stgo_cat1", label: "STGO Cat 1 (≤80t GVW)" },
  { value: "stgo_cat2", label: "STGO Cat 2 (≤100t GVW)" },
  { value: "stgo_cat3", label: "STGO Cat 3 (≤150t GVW)" },
] as const;

// ── 8. Service types (revised — covers full UK/EU service set) ──────────────
// REPLACES the existing SERVICE_TYPES in createJobConstants.ts.
export const SERVICE_TYPES = [
  // Movement direction
  { value: "delivery",            label: "Delivery only" },
  { value: "collection",          label: "Collection only" },
  { value: "collection_delivery", label: "Collection + delivery" },
  { value: "transfer",            label: "Internal transfer / depot to depot" },
  { value: "trunking",            label: "Linehaul / trunking" },
  // Speed bands
  { value: "sameday",             label: "Sameday / express" },
  { value: "next_day",            label: "Next day" },
  { value: "economy",             label: "Economy / scheduled" },
  // Specialist movement
  { value: "last_mile",           label: "Last mile" },
  { value: "first_mile",          label: "First mile" },
  { value: "drayage",             label: "Drayage / port haulage" },
  { value: "container_haulage",   label: "Container haulage" },
  { value: "intermodal",          label: "Intermodal (rail/sea + road)" },
  { value: "cross_dock",          label: "Cross-dock" },
  { value: "warehousing",         label: "Warehousing + distribution" },
  { value: "returns",             label: "Reverse logistics / returns" },
  { value: "abnormal",            label: "Abnormal / heavy haulage" },
  { value: "removals",            label: "Removals" },
  { value: "courier",             label: "Courier / parcels" },
] as const;

// ── 9. Job types (revised) ──────────────────────────────────────────────────
export const JOB_TYPES = [
  { value: "ftl",            label: "Full Load (FTL)" },
  { value: "ltl",            label: "Part Load / LTL" },
  { value: "groupage",       label: "Groupage" },
  { value: "multi_drop",     label: "Multi-drop" },
  { value: "multi_collection", label: "Multi-collection" },
  { value: "milk_run",       label: "Milk run / route" },
  { value: "return_load",    label: "Return / backload" },
  { value: "trunking",       label: "Trunking" },
  { value: "shunt",          label: "Yard shunt" },
  { value: "pallet_network", label: "Pallet network (Palletline / Palletways / etc.)" },
  { value: "fcl",            label: "FCL container" },
  { value: "lcl",            label: "LCL / consolidated container" },
  { value: "sameday_express",label: "Sameday express" },
  { value: "abnormal",       label: "Abnormal / specialist" },
  { value: "subcontracted",  label: "Sub-contracted out" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────
export function bodyCategoryNeedsTrailer(c: BodyCategory): boolean {
  return BODY_CATEGORIES.find(x => x.value === c)?.needsTrailer ?? false;
}
export function gvwForCategory(c: BodyCategory) {
  return GVW_CLASSES.filter(g => (g.applicableTo as readonly string[]).includes(c));
}
export function licencesThatCanDrive(c: BodyCategory) {
  return DRIVER_LICENCE_CLASSES.filter(l => (l.drives as readonly string[]).includes(c));
}

export const isBodyCategory     = (v: unknown): v is BodyCategory     => typeof v === "string" && BODY_CATEGORIES.some(x => x.value === v);
export const isGvwClass         = (v: unknown): v is GvwClass         => typeof v === "string" && GVW_CLASSES.some(x => x.value === v);
export const isBodyType         = (v: unknown): v is BodyType         => typeof v === "string" && BODY_TYPES.some(x => x.value === v);
export const isOnboardEquipment = (v: unknown): v is OnboardEquipment => typeof v === "string" && ONBOARD_EQUIPMENT.some(x => x.value === v);
export const isLicenceClass     = (v: unknown): v is DriverLicenceClass => typeof v === "string" && DRIVER_LICENCE_CLASSES.some(x => x.value === v);
```

## 0.4 DB schema changes

### 0.4.1 `model FleetUnit` — replace single `vehicleClass` field

```prisma
model FleetUnit {
  // ... existing fields ...
  // REMOVE: vehicleClass String       // legacy — keep until Phase 0.7 backfill done, then drop in 0.8
  vehicleClassLegacy String  @default("")    // RENAME old field to this for safe backfill
  bodyCategory       String  @default("")    // BodyCategory
  gvwClass           String  @default("")    // GvwClass
  bodyType           String  @default("")    // BodyType — empty for tractors
  onboardEquipment   Json?                    // OnboardEquipment[]
  // ... existing fields ...
}
```

### 0.4.2 `model FleetTrailer`

```prisma
model FleetTrailer {
  // ... existing fields ...
  // REPLACE: trailerType String -> stays but value space narrows to BodyType
  bodyType           String  @default("")    // BodyType (canonical)
  trailerLength      String  @default("")    // TrailerLength.value
  decks              Int     @default(1)
  compartments       Int?                     // for tankers
  onboardEquipment   Json?                    // OnboardEquipment[]
  // ... existing fields ...
}
```

### 0.4.3 `model DriverProfile`

```prisma
model DriverProfile {
  // ... existing fields ...
  // REPLACE free-text licenceClass with controlled enum string
  // licenceClass String @default("")  -- already exists; keep field, narrow value space
  endorsements           Json?     // DriverEndorsement[]
  canDriveCategories     Json?     // BodyCategory[] -- denormalised for fast allocation queries
  // Also widen existing single-trailer-type to multi:
  // canUseTrailer Boolean -- keep (means "is allowed to handle a trailer at all")
  // trailerTypesAllowed Json -- already an array; treat as BodyType[] going forward
  // ... existing fields ...
}
```

### 0.4.4 `model PlannedJob` — vehicle requirement narrowing

```prisma
model PlannedJob {
  // ... existing fields ...
  // KEEP for back-compat:
  // vehicleClassRequired String  -- treat as legacy on read; new writes use the four below
  reqBodyCategory     String  @default("")    // BodyCategory
  reqGvwMin           String  @default("")    // GvwClass — minimum acceptable
  reqBodyType         String  @default("")    // BodyType — empty if any
  reqEquipment        Json?                    // OnboardEquipment[] required
  reqLicenceClass     String  @default("")    // DriverLicenceClass — minimum
  // trailerTypesAllowed/Forbidden -- already arrays; treat as BodyType[]
  // ... existing fields ...
}
```

Run: `pnpm --filter api prisma migrate dev --name vocab_unification`

## 0.5 API schema + validation

### 0.5.1 Replace ad-hoc strings in `api/src/constants/jobCreation.ts`

Delete `VEHICLE_CLASSES` and `TRAILER_TYPES` constants entirely. Re-export from the new taxonomy:

```ts
export {
  BODY_CATEGORIES, BODY_TYPES, GVW_CLASSES, ONBOARD_EQUIPMENT,
  DRIVER_LICENCE_CLASSES, DRIVER_ENDORSEMENTS,
  isBodyCategory, isBodyType, isGvwClass, isOnboardEquipment, isLicenceClass,
} from "./vehicleTaxonomy.js";

// Legacy LOAD_UNITS, JOB_STOP_TYPES stay where they are.
```

Update `api/src/services/jobValidation.ts`:
- Replace `isVehicleClass(input.vehicleClassRequired)` with `isBodyCategory(input.reqBodyCategory)`.
- Replace `isTrailerType(t)` with `isBodyType(t)`.
- Add the new fields to `StructuredJobValidationInput`.
- For `ready_to_plan`, hard-require `reqBodyCategory`. If `bodyCategoryNeedsTrailer(reqBodyCategory)` then require at least one trailer type in `trailerTypesAllowed`.
- If `reqEquipment` contains items, every value must pass `isOnboardEquipment`.

### 0.5.2 `api/src/schemas/jobs.ts`

In `JobCommonFields`, ADD:

```ts
  reqBodyCategory:    z.string().optional(),
  reqGvwMin:          z.string().optional(),
  reqBodyType:        z.string().optional(),
  reqEquipment:       z.array(z.string()).optional(),
  reqLicenceClass:    z.string().optional(),
```

Keep `vehicleClassRequired`, `trailerTypesAllowed` etc. for back-compat reads — do NOT remove until 0.8.

### 0.5.3 `api/src/schemas/fleet.ts`

```ts
export const CreateFleetUnitSchema = z.object({
  registration:     z.string().min(1).max(20).transform(s => s.trim().toUpperCase()),
  // REPLACE single vehicleClass field with four:
  bodyCategory:     z.string().min(1, "Body category is required"),
  gvwClass:         z.string().min(1, "GVW class is required"),
  bodyType:         z.string().optional(),     // empty for tractors
  onboardEquipment: z.array(z.string()).optional(),
  status:           z.string().optional(),
  notes:            z.string().nullable().optional(),
  assignedDriverId: z.number().int().nullable().optional(),
  currentTrailerId: z.number().int().nullable().optional(),
  yardLocation:     z.string().nullable().optional(),
});
// Equivalent for PatchFleetUnitSchema — all four fields optional on patch.
```

For `CreateFleetTrailerSchema`:
```ts
{
  registration:     z.string().min(1).max(20).transform(s => s.trim().toUpperCase()),
  bodyType:         z.string().min(1, "Trailer body type is required"),  // canonical BodyType
  trailerLength:    z.string().optional(),
  decks:            z.number().int().min(1).max(2).optional(),
  compartments:     z.number().int().nullable().optional(),
  onboardEquipment: z.array(z.string()).optional(),
  status:           z.string().optional(),
  notes:            z.string().nullable().optional(),
  attachedUnitId:   z.number().int().nullable().optional(),
  linkedJobId:      z.number().int().nullable().optional(),
  yardLocation:     z.string().nullable().optional(),
}
```

### 0.5.4 `api/src/schemas/drivers.ts`

In `DriverPlanningFields`, REPLACE `licenceClass: z.string().optional()` validation with:

```ts
  licenceClass: z.enum(["B","C1","C1E","C","CE",""]).optional(),   // "" means unset
  endorsements: z.array(z.string()).optional(),                    // DriverEndorsement[]
  canDriveCategories: z.array(z.string()).optional(),              // BodyCategory[] — denorm
```

Server hook on driver create/update: derive `canDriveCategories` from `licenceClass` using `licencesThatCanDrive` (run server-side; do not trust the client to compute it).

## 0.6 UI changes

### 0.6.1 Job form — `web/src/modules/jobs/createJobConstants.ts`

Delete the local `VEHICLE_TYPES`, `MIN_SIZES`, `TRAILER_TYPES` constants. Re-export from the shared taxonomy:

```ts
export { BODY_CATEGORIES, BODY_TYPES, GVW_CLASSES, ONBOARD_EQUIPMENT } from "../../constants/vehicleTaxonomy";
```

Keep `LOCATION_TYPES`, `EQUIPMENT_OPTS` (delete; use ONBOARD_EQUIPMENT), `DRIVER_QUALS` (delete; use DRIVER_ENDORSEMENTS), `LOAD_UNITS`, `HANDLING_METHODS`, `SERVICE_TYPES`, `JOB_TYPES`, `PRIORITY_OPTS` — these are unrelated.

### 0.6.2 Job form — Section 5 (Vehicle Requirements) — full UI rewrite

Replace the existing `vehicleType` single dropdown with a **cascading picker**:

```
┌─────────────────────────────────────────────────────────────┐
│ Section 05 — Vehicle requirements                          │
│                                                             │
│ Body category *      [ Van | Rigid | Tractor | Drawbar ]   │  ← pill buttons
│                                                             │
│ ── if Rigid or Drawbar ──                                  │
│ Min GVW              [ 7.5t | 12t | 18t | 26t | 32t ]      │  ← only those applicableTo cat
│ Body type *          [ Box | Curtain | Tipper | … | Other] │  ← BODY_TYPES
│                                                             │
│ ── if Tractor ──                                           │
│ Trailer body type *  [☐ Curtain ☐ Box ☐ Fridge ☐ Tipper…] │  ← MultiCheck of BODY_TYPES
│ Trailer length       [ Std 13.6m | Ext 15.65m | Mega ]     │
│                                                             │
│ ── always ──                                               │
│ Onboard equipment    [☐ Tail lift ☐ HIAB ☐ Moffett ☐ Pump…]│  ← MultiCheck of ONBOARD_EQUIPMENT
│ Min driver licence   [ B | C1 | C1+E | C | C+E ]           │  ← auto-suggested from cat+gvw
│ Driver endorsements  [☐ ADR ☐ HIAB ☐ Moffett ☐ Tanker…]    │  ← MultiCheck of DRIVER_ENDORSEMENTS
│                                                             │
│ ▸ Optional restrictions (height/weight/length/access notes)│
└─────────────────────────────────────────────────────────────┘
```

Implementation:

```tsx
// State
const [reqBodyCategory, setReqBodyCategory] = useState<BodyCategory | "">("");
const [reqGvwMin,        setReqGvwMin]       = useState<GvwClass | "">("");
const [reqBodyType,      setReqBodyType]     = useState<BodyType | "">("");
const [reqEquipment,     setReqEquipment]    = useState<OnboardEquipment[]>([]);
const [reqLicenceClass,  setReqLicenceClass] = useState<DriverLicenceClass | "">("");
const [reqEndorsements,  setReqEndorsements] = useState<DriverEndorsement[]>([]);
// Existing trailerTypesAllowed kept — its value space is now BodyType[].

// Auto-suggest minimum licence whenever category or gvw changes
useEffect(() => {
  if (!reqBodyCategory) return;
  const candidates = licencesThatCanDrive(reqBodyCategory);
  if (candidates.length > 0 && !reqLicenceClass) {
    setReqLicenceClass(candidates[0].value);  // smallest licence that covers it
  }
}, [reqBodyCategory, reqGvwMin]);

// Reset GVW if user changes category and old value is no longer applicable
useEffect(() => {
  if (!reqBodyCategory) return;
  const allowed = gvwForCategory(reqBodyCategory).map(g => g.value);
  if (reqGvwMin && !allowed.includes(reqGvwMin as GvwClass)) setReqGvwMin("");
}, [reqBodyCategory]);

// Completion gate replaces the old vehicleComplete logic:
const vehicleComplete =
  !!reqBodyCategory &&
  (!bodyCategoryNeedsTrailer(reqBodyCategory) || trailersAllowed.length > 0) &&
  (reqBodyCategory === "tractor" || !!reqBodyType);
```

### 0.6.3 Fleet UI — `web/src/modules/fleet/fleetConstants.ts`

Delete it entirely. Replace all imports with `import { BODY_CATEGORIES, BODY_TYPES, ONBOARD_EQUIPMENT } from "../../constants/vehicleTaxonomy"`.

In the Add Unit form, present the same cascading picker (body category → GVW → body type → equipment).

In the Add Trailer form, present body type (BODY_TYPES) → length → decks → compartments (only if body type is tanker) → equipment.

### 0.6.4 Driver form — `web/src/modules/drivers/DriverForm.tsx`

Replace the free-text `<Input label="Licence class" placeholder="Class 1 / CE" />` with:

```tsx
<label className="block text-sm font-semibold">
  Licence class
  <select className="input mt-1 w-full" value={form.licenceClass} onChange={set("licenceClass")}>
    <option value="">Select…</option>
    {DRIVER_LICENCE_CLASSES.map(l => (
      <option key={l.value} value={l.value}>{l.label}</option>
    ))}
  </select>
</label>

<div className="mt-3">
  <div className="text-sm font-semibold mb-2">Endorsements</div>
  <MultiCheck
    options={DRIVER_ENDORSEMENTS.map(e => [e.value, e.label] as [string, string])}
    selected={form.endorsements ?? []}
    onChange={list => set("endorsements")(list)}
  />
</div>
```

Replace `defaultTruckClass` and `defaultTrailerClass` (currently free-text) with the same pickers.

### 0.6.5 Mobile (`mobile/src/utils/trailerStorage.ts` and any registration screens)

Audit `mobile/src/screens/JobDetail/` and `mobile/src/constants/jobStatuses.ts` for any reference to `vehicleClass`, `trailerType`, or `licenceClass`. Replace all imports with the shared taxonomy file.

## 0.7 Backfill of existing data

Write a one-shot migration script `api/scripts/backfill_vocab_v1.ts` that runs after `pnpm prisma migrate deploy`:

```ts
// 1. FleetUnit — read vehicleClassLegacy, derive bodyCategory + gvwClass + bodyType
const unitMap: Record<string, { bodyCategory: string; gvwClass: string; bodyType: string }> = {
  "van":          { bodyCategory: "van",     gvwClass: "3.5t", bodyType: "panel" },
  "Van":          { bodyCategory: "van",     gvwClass: "3.5t", bodyType: "panel" },
  "rigid":        { bodyCategory: "rigid",   gvwClass: "",     bodyType: "" },
  "Rigid":        { bodyCategory: "rigid",   gvwClass: "",     bodyType: "" },
  "artic":        { bodyCategory: "tractor", gvwClass: "44t",  bodyType: "" },
  "Artic unit":   { bodyCategory: "tractor", gvwClass: "44t",  bodyType: "" },
  "class1":       { bodyCategory: "tractor", gvwClass: "44t",  bodyType: "" },
  "class2":       { bodyCategory: "rigid",   gvwClass: "",     bodyType: "" },
  "tipper":       { bodyCategory: "rigid",   gvwClass: "",     bodyType: "tipper" },
  "Tipper":       { bodyCategory: "rigid",   gvwClass: "",     bodyType: "tipper" },
  "grab":         { bodyCategory: "rigid",   gvwClass: "",     bodyType: "tipper" },  // + add hiab_crane to equipment
  "Grab":         { bodyCategory: "rigid",   gvwClass: "",     bodyType: "tipper" },
  "mixer":        { bodyCategory: "rigid",   gvwClass: "",     bodyType: "mixer" },
  "Mixer":        { bodyCategory: "rigid",   gvwClass: "",     bodyType: "mixer" },
  "hiab":         { bodyCategory: "rigid",   gvwClass: "",     bodyType: "flatbed" },  // + add hiab_crane
  "HIAB":         { bodyCategory: "rigid",   gvwClass: "",     bodyType: "flatbed" },
  "refrigerated": { bodyCategory: "rigid",   gvwClass: "",     bodyType: "fridge" },
  "Refrigerated": { bodyCategory: "rigid",   gvwClass: "",     bodyType: "fridge" },
  "other":        { bodyCategory: "rigid",   gvwClass: "",     bodyType: "other" },
  "Other":        { bodyCategory: "rigid",   gvwClass: "",     bodyType: "other" },
};

// For "grab" and "hiab" rows, also push "hiab_crane" into onboardEquipment.

// 2. FleetTrailer — old trailerType -> bodyType (lower_snake)
const trailerMap: Record<string, string> = {
  "Curtain sider": "curtain_sider",
  "curtain_sider": "curtain_sider",
  "Flatbed": "flatbed", "flatbed": "flatbed",
  "Box": "box", "box": "box",
  "Tipper": "tipper", "tipper": "tipper",
  "Tanker": "tanker", "tanker": "tanker",
  "Low loader": "low_loader", "low_loader": "low_loader",
  "Skeletal": "skeletal", "skeletal": "skeletal",
  "Refrigerated trailer": "fridge", "refrigerated_trailer": "fridge", "fridge": "fridge",
  "Walking floor": "walking_floor", "walking_floor": "walking_floor",
  "Container": "skeletal", "container": "skeletal",
  "Other": "other", "other": "other",
};

// 3. DriverProfile.licenceClass — normalise to enum
const licenceMap: Record<string, string> = {
  "Class 1": "CE", "class 1": "CE", "Class1": "CE", "CE": "CE", "C+E": "CE",
  "Class 2": "C",  "class 2": "C",  "C": "C",
  "C1": "C1", "C1+E": "C1E", "C1E": "C1E",
  "B": "B", "Car": "B", "": "",
};
// Anything not in the map -> log and leave blank for manual cleanup.

// 4. PlannedJob — copy vehicleClassRequired into reqBodyCategory using same unitMap.
//    Also promote trailerTypesAllowed via trailerMap.
//    Also derive reqLicenceClass from reqBodyCategory using the smallest covering licence.
```

Run order:
1. `pnpm prisma migrate deploy` (adds new columns, keeps legacy ones).
2. `pnpm tsx api/scripts/backfill_vocab_v1.ts` (populates new columns from legacy).
3. Verify with a SQL query that `bodyCategory != ""` for >99% of rows; manually fix the rest.
4. Deploy new API code that READS new columns first, falls back to legacy on miss.
5. Deploy new web that WRITES new columns only.
6. Wait 14 days. Run a "any rows still using legacy?" query — should be zero.
7. Phase 0.8 below.

## 0.8 Drop legacy columns (after 14-day soak)

Once telemetry confirms no clients are writing the legacy fields:

```prisma
// FleetUnit: drop vehicleClassLegacy
// PlannedJob: drop vehicleClassRequired, vehicleClass
// (keep trailerTypesAllowed/Forbidden — values now canonical)
```

Migration: `pnpm prisma migrate dev --name drop_vocab_legacy`.

## 0.9 Auto-capitalisation of text inputs (UX polish, applies system-wide)

The user has requested that text inputs auto-capitalise the first letter of each word for fields where capitalisation is expected (names, towns, sites, customer names, etc.). This must be applied **consistently across all forms** (job, fleet unit, fleet trailer, driver, customer, saved location) so the data looks the same everywhere.

### 0.9.1 Rule per field type

| Field role           | Transform rule                              | Examples                            |
|----------------------|---------------------------------------------|-------------------------------------|
| `proper_name`        | Capitalise first letter of each word        | Customer name, contact name, site name, town, county, country, job title, sub-contractor name |
| `address_line`       | Capitalise first letter of each word        | Street, address line 2, building/unit, alt-address fields |
| `sentence`           | Capitalise first letter only                | Notes, instructions, billing notes, driver notes, navigation notes |
| `upper`              | Force UPPERCASE                             | Postcodes, vehicle / trailer registrations, MRN, EORI, container numbers |
| `lower`              | Force lowercase                             | Email addresses |
| `none`               | No transform                                | Phone numbers, references, PO numbers, codes, free-form numeric fields |

### 0.9.2 Implementation — single shared helper

Create `web/src/lib/textCase.ts` (and mirror in `mobile/src/lib/textCase.ts`):

```ts
export type CaseRule = "proper_name" | "address_line" | "sentence" | "upper" | "lower" | "none";

const SMALL_WORDS = new Set(["of","the","and","or","de","la","le","du","des","von","van","der"]);
const ACRONYMS    = new Set(["UK","EU","USA","DPD","DHL","ASDA","B&Q","M&S","NHS","HGV","LGV","ADR","CMR","EORI","MRN","VAT"]);

function capWord(w: string): string {
  if (!w) return w;
  if (ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
  if (SMALL_WORDS.has(w.toLowerCase())) return w.toLowerCase();
  // Handle hyphens (Stoke-on-Trent), apostrophes (O'Brien), and Mc/Mac
  return w
    .split(/(['-])/)
    .map((part, idx) => idx % 2 === 0 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part)
    .join("");
}

export function applyCase(value: string, rule: CaseRule): string {
  if (!value) return value;
  switch (rule) {
    case "upper":         return value.toUpperCase();
    case "lower":         return value.toLowerCase();
    case "sentence":      return value.charAt(0).toUpperCase() + value.slice(1);
    case "proper_name":
    case "address_line":  {
      // Preserve the user's spaces but capitalise each token; first word never gets the SMALL_WORDS rule.
      return value.split(/(\s+)/).map((tok, i) => {
        if (/^\s+$/.test(tok)) return tok;
        const cap = capWord(tok);
        return i === 0 ? cap.charAt(0).toUpperCase() + cap.slice(1) : cap;
      }).join("");
    }
    case "none":
    default:              return value;
  }
}
```

### 0.9.3 Apply on blur, not on every keystroke

If the transform runs on every `onChange`, the cursor jumps and feels broken when the user backspaces. Apply on `onBlur` so the field is normalised once the user moves on.

Extend the existing form helpers in `web/src/modules/jobs/CreateJobFormComponents.tsx` (and the `Input` helper in `web/src/modules/drivers/DriverForm.tsx` — refactor both to use one shared `<TextField>`):

```tsx
import { applyCase, type CaseRule } from "../../lib/textCase";

export function TextField({
  label, value, onChange, caseRule = "none", required, hint, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  caseRule?: CaseRule;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "number" | "date" | "time";
}) {
  return (
    <label className="block">
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        className="input mt-1 w-full"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onBlur={e => {
          const next = applyCase(e.target.value, caseRule);
          if (next !== value) onChange(next);
        }}
        autoCapitalize={
          caseRule === "proper_name" || caseRule === "address_line" ? "words" :
          caseRule === "sentence" ? "sentences" :
          caseRule === "upper" ? "characters" :
          "off"
        }
      />
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </label>
  );
}
```

The `autoCapitalize` HTML attribute helps mobile keyboards do the same thing natively, so on iOS/Android the keyboard already capitalises and the blur-transform mostly becomes a no-op.

### 0.9.4 Migration of existing fields

Each form currently uses raw `<input>` or a local `Input` helper. The agent must replace those with `<TextField>` and pass the right `caseRule`:

In `CreateJobPage.tsx`:
- `customerName`, `contactName`, `jobTitle`, `subcontractorName`, `consignorName`, `consigneeName` → `caseRule="proper_name"`
- `customerAddress`, all stop `street/town/countyRegion/country/siteName/unitBuilding/addressLine2` → `proper_name`
- All `*Notes`, `*Instructions`, `assistanceNote`, `driverNotes`, `navigationInstructions`, `billingNotes` → `sentence`
- All postcodes, MRN, EORI, container numbers → `upper`
- `contactEmail`, `bookingContactEmail`, alt-address email → `lower`
- Phone numbers, reference numbers, PO numbers, customer ref → `none`
- Vehicle / trailer registrations on fleet forms → `upper` (already done in Zod, but apply on UI for instant feedback)

In `StopCard.tsx`: same rules for the stop's address and contact fields.

In `DriverForm.tsx`: `displayName` → `proper_name`, `phoneNumber` → `none`, `email` → `lower`.

In fleet forms: `registration` → `upper`, `notes` → `sentence`, `yardLocation` → `proper_name`.

### 0.9.5 Server-side normalisation (defence in depth)

Do not rely on the UI alone — a sloppy mobile client or API import could submit raw text. Add a small middleware in `api/src/middleware.ts` that, before persisting, runs the same `applyCase` over a known-good list of fields:

```ts
const FIELD_CASE: Record<string, CaseRule> = {
  customerName:       "proper_name",
  jobTitle:           "proper_name",
  bookingContactName: "proper_name",
  // …all others from 0.9.4
  bookingContactEmail:"lower",
  altPostcode:        "upper",
  registration:       "upper",
};
```

Apply selectively in the `routes/jobs.ts` handler before write. This is optional but recommended.

### 0.9.6 Out of scope

- Do NOT auto-capitalise free-form fields where the user genuinely needs control (e.g. password fields, secrets, machine-readable codes the agent can't classify). Default rule for unknown fields is `none`.
- Do NOT auto-capitalise inside `<textarea>` — multi-line fields should accept user keystrokes verbatim except for `sentence` rule on first character.

### 0.9.7 Test plan

Add `web/src/lib/textCase.test.ts` covering:
- `"john smith"` → `"John Smith"`
- `"O'BRIEN"` → `"O'Brien"`
- `"stoke-on-trent"` → `"Stoke-on-Trent"`
- `"hgv depot"` → `"HGV Depot"`
- `"the queen of england"` → `"The Queen of England"` (small words lowercased except first)
- `"sw1a 1aa"` with rule `upper` → `"SW1A 1AA"`
- `"DRIVER@COMPANY.COM"` with rule `lower` → `"driver@company.com"`

---

## 0.10 Dropdown-first input policy (less manual entry = cleaner data)

**Principle:** every field whose valid values come from a finite list, OR that references an existing record in the database (driver, unit, trailer, customer, saved location, carrier, country), MUST be a picker — never a free-text input. Free text is allowed only for genuinely unique content: notes, instructions, names of brand-new entities being entered for the very first time, and reference numbers issued by external parties.

The agent must work through the audit table below and convert every input that is currently free-text but listed as `dropdown`, `multi-select`, `entity-picker`, `address-autocomplete`, or `typeahead-from-list` in the **Required** column.

### 0.10.1 Audit — every form input across the system

Format: `field` → current mode → required mode → source

#### Job creation form (`CreateJobPage.tsx`, `StopCard.tsx`)

| Field                          | Currently        | Required mode             | Source                            |
|--------------------------------|------------------|---------------------------|-----------------------------------|
| customerName                   | typeahead        | entity-picker             | `Customer` table                  |
| jobTitle                       | free text        | free text                 | (genuinely unique) — keep         |
| serviceType                    | dropdown         | dropdown                  | `SERVICE_TYPES` constant          |
| jobType                        | dropdown         | dropdown                  | `JOB_TYPES` constant              |
| priority                       | dropdown         | dropdown                  | `PRIORITY_OPTS` constant          |
| referenceNumber, customerRef, purchaseOrderNumber | free text | free text       | (external refs) — keep            |
| contactName                    | free text        | free text                 | (free) — but pre-fill from customer |
| contactPhone                   | free text        | free text (validated)     | keep                              |
| contactEmail                   | free text        | free text (validated)     | keep                              |
| stops[].stopType               | pill picker      | pill picker               | `["collection","delivery"]`       |
| stops[].locationQuery          | typeahead        | entity-picker             | `SavedLocation` table             |
| stops[].siteName               | free text        | proper-name (free)        | (free if new location)            |
| stops[].street                 | free text        | **address-autocomplete**  | Postcoder / Google Places / Mapbox |
| stops[].town                   | free text        | autocompleted by address  | derived from autocomplete         |
| stops[].postcode               | free text        | autocompleted + validated | derived from autocomplete         |
| stops[].country                | free text        | **dropdown**              | `COUNTRIES` constant              |
| stops[].countyRegion           | free text        | **dropdown** (UK only)    | `UK_COUNTIES` constant            |
| stops[].locationType           | dropdown         | dropdown                  | `LOCATION_TYPES`                  |
| stops[].timeType               | pill picker      | pill picker               | `["exact","window","anytime"]`    |
| stops[].date / time fields     | native picker    | native picker             | keep                              |
| stops[].numPallets             | numeric          | numeric                   | keep                              |
| materialDesc                   | free text        | **typeahead-from-list**   | `COMMODITIES_COMMON` + free fallback |
| qtyUnit                        | dropdown         | dropdown                  | `LOAD_UNITS`                      |
| qtyUnitOther                   | free text        | only when unit=`other`    | keep                              |
| adrClass                       | free text        | **dropdown**              | `ADR_CLASSES`                     |
| tempRange                      | free text        | **dropdown + custom**     | `TEMP_BANDS` (chilled, ambient, frozen, deep frozen, custom) |
| loadingMethod, unloadingMethod | dropdown         | dropdown                  | `HANDLING_METHODS`                |
| reqBodyCategory (Phase 0)      | (Phase 0)        | dropdown                  | `BODY_CATEGORIES`                 |
| reqGvwMin                      | (Phase 0)        | dropdown                  | `GVW_CLASSES` filtered by category|
| reqBodyType                    | (Phase 0)        | dropdown                  | `BODY_TYPES` filtered by category |
| trailersAllowed/Forbidden      | multi-check      | multi-check               | `BODY_TYPES`                      |
| reqEquipment                   | multi-check      | multi-check               | `ONBOARD_EQUIPMENT`               |
| reqLicenceClass                | (Phase 0)        | dropdown                  | `DRIVER_LICENCE_CLASSES`          |
| driverQuals (legacy)           | multi-check      | multi-check               | `DRIVER_ENDORSEMENTS`             |
| assignedTruck                  | free text        | **entity-picker**         | `FleetUnit` table                 |
| assignedTrailer                | free text        | **entity-picker**         | `FleetTrailer` table              |
| assignedDriverId               | (already number) | entity-picker             | `DriverProfile` table             |
| failureAction                  | dropdown         | dropdown                  | `FAILURE_ACTIONS`                 |
| returnDestination              | dropdown         | dropdown                  | `RETURN_DESTINATIONS`             |
| altSavedLocationId             | typeahead        | entity-picker             | `SavedLocation` table             |
| altCountry                     | free text        | **dropdown**              | `COUNTRIES`                       |
| rateCurrency (Phase 1)         | dropdown         | dropdown                  | `CURRENCIES`                      |
| rateType (Phase 1)             | dropdown         | dropdown                  | `RATE_TYPES`                      |
| paymentTerms (Phase 1)         | free text        | **dropdown + custom**     | `PAYMENT_TERMS`                   |
| isSubcontracted (Phase 1)      | toggle           | toggle                    | keep                              |
| subcontractorName (Phase 1)    | free text        | **entity-picker**         | new `Carrier` table (see 0.10.5)  |
| consignorCountry / consigneeCountry (Phase 2) | (new) | dropdown                | `COUNTRIES`                       |
| consignorEori / consigneeEori (Phase 2) | (new)   | upper-case validated text | keep                              |
| originCountry / destinationCountry (Phase 4)  | (new) | dropdown                | `COUNTRIES`                       |
| incoterms (Phase 4)            | (new)            | dropdown                  | `INCOTERMS`                       |
| customsProcedure (Phase 4)     | (new)            | dropdown                  | `CUSTOMS_PROCEDURES`              |
| commercialInvoiceCurrency      | (new)            | dropdown                  | `CURRENCIES`                      |
| commodityCodes[].code          | (new)            | **typeahead-from-list**   | `HS_CODES` (lazy-loaded)          |
| countryOfOrigin                | (new)            | dropdown                  | `COUNTRIES`                       |
| ferryRouting                   | (new)            | dropdown                  | `FERRY_ROUTES`                    |
| adrItems[].unNumber (Phase 5)  | (new)            | **typeahead-from-list**   | `UN_NUMBERS` (~3500 entries, lazy)|
| adrItems[].properShipping      | (new)            | auto-filled from UN       | derived from UN selection         |
| adrItems[].hazardClass         | (new)            | dropdown                  | `ADR_CLASSES`                     |
| adrItems[].packingGroup        | (new)            | dropdown                  | `["I","II","III"]`                |
| adrItems[].tunnelCategory      | (new)            | dropdown                  | `["B","C","D","E"]`               |
| adrItems[].packageType         | (new)            | dropdown                  | `ADR_PACKAGE_TYPES`               |
| palletExchangeType (Phase 6)   | (new)            | dropdown                  | `PALLET_TYPES`                    |
| stops[].ppeRequired (Phase 7)  | (new)            | multi-check               | `PPE_OPTS`                        |
| documentsRequired (Phase 8)    | (new)            | multi-check               | `DOC_REQUIRED_OPTS`               |
| bookingSource (Phase 9)        | (new)            | dropdown                  | `BOOKING_SOURCES`                 |

#### Driver registration form (`DriverForm.tsx`)

| Field                  | Currently  | Required mode    | Source                          |
|------------------------|------------|------------------|---------------------------------|
| driverType             | dropdown   | dropdown         | `["permanent","agency","subcontractor"]` |
| licenceClass           | free text  | **dropdown**     | `DRIVER_LICENCE_CLASSES` (Phase 0) |
| trailerTypesAllowed    | (any)      | multi-check      | `BODY_TYPES`                    |
| endorsements           | (Phase 0)  | multi-check      | `DRIVER_ENDORSEMENTS`           |
| baseLocation           | free text  | **entity-picker**| `SavedLocation` (depots) or new `Yard` table |
| operatingArea          | free text  | **multi-check**  | `UK_REGIONS`                    |
| avoidAreas             | free text  | **multi-check**  | `UK_REGIONS`                    |
| normalWorkingDays      | multi-check| multi-check      | `["Mon".."Sun"]`                |
| defaultTruckReg        | free text  | **entity-picker**| `FleetUnit`                     |
| defaultTrailerReg      | free text  | **entity-picker**| `FleetTrailer`                  |
| defaultTruckClass / defaultTrailerClass | free text | derive from picked unit/trailer | (no input — read-only display) |
| holidayRequests[].reason | free text| dropdown         | `HOLIDAY_REASONS`               |

#### Fleet unit form (`fleet/CreateUnit*.tsx`)

| Field                | Currently | Required mode | Source                          |
|----------------------|-----------|---------------|---------------------------------|
| registration         | free text | upper-case validated | keep — externally issued    |
| bodyCategory (Phase 0) | dropdown | dropdown    | `BODY_CATEGORIES`               |
| gvwClass (Phase 0)   | dropdown  | dropdown      | `GVW_CLASSES` filtered          |
| bodyType (Phase 0)   | dropdown  | dropdown      | `BODY_TYPES` filtered           |
| onboardEquipment     | multi-check | multi-check | `ONBOARD_EQUIPMENT`             |
| status               | dropdown  | dropdown      | `UNIT_STATUSES`                 |
| assignedDriverId     | (id)      | entity-picker | `DriverProfile`                 |
| currentTrailerId     | (id)      | entity-picker | `FleetTrailer`                  |
| yardLocation         | free text | **entity-picker** | `SavedLocation` (depots/yards) |
| notes                | free text | sentence-case (free) | keep                     |

#### Fleet trailer form

| Field            | Currently | Required mode | Source                          |
|------------------|-----------|---------------|---------------------------------|
| registration     | free text | upper validated | keep                          |
| bodyType         | dropdown  | dropdown      | `BODY_TYPES`                    |
| trailerLength    | dropdown  | dropdown      | `TRAILER_LENGTHS`               |
| decks            | numeric   | dropdown      | `[1, 2]`                        |
| compartments     | numeric   | numeric (only if tanker) | keep                  |
| onboardEquipment | multi-check | multi-check | `ONBOARD_EQUIPMENT`             |
| status           | dropdown  | dropdown      | `TRAILER_STATUSES`              |
| attachedUnitId   | (id)      | entity-picker | `FleetUnit`                     |
| linkedJobId      | (id)      | entity-picker | `PlannedJob`                    |
| yardLocation     | free text | **entity-picker** | `SavedLocation`             |
| notes            | free text | sentence (free) | keep                          |

#### Customer form (assumed exists or to be created — adjust to match real file)

| Field           | Required mode    | Source              |
|-----------------|------------------|---------------------|
| name            | proper-name (free) | (genuinely unique) |
| billingCountry  | **dropdown**     | `COUNTRIES`         |
| invoiceCurrency | **dropdown**     | `CURRENCIES`        |
| paymentTerms    | **dropdown + custom** | `PAYMENT_TERMS` |
| creditLimit     | numeric          | keep                |
| creditOnStop    | toggle           | keep                |
| address* fields | **address-autocomplete** | external service |

### 0.10.2 New constants files

Create:

```
web/src/constants/
├── countries.ts             // ISO-3166 alpha-2 list, common haulage destinations promoted to top
├── ukCounties.ts            // England + Scotland + Wales + NI counties
├── ukRegions.ts             // North-West, South-East, Midlands, Scotland, etc. (driver operating areas)
├── commoditiesCommon.ts     // ~150 most common cargo descriptions for typeahead
├── adrClasses.ts            // ADR classes 1-9 + sub-classes (1.1, 1.2, 5.1, 6.1 etc.)
├── adrPackageTypes.ts       // drum, jerrycan, IBC, bulk, fibreboard, etc.
├── tempBands.ts             // chilled (+2/+8), ambient (+15/+25), frozen (-18), deep-frozen (-25), custom
├── paymentTerms.ts          // 7d, 14d, 30d, 30 EOM, 45d, 60d, 60 EOM, custom
├── ferryRoutes.ts           // Dover-Calais, Hull-Rotterdam, Holyhead-Dublin, Heysham-Belfast, etc.
├── failureActions.ts        // call_assistance, finish_then_return, deliver_alternative, abort
├── returnDestinations.ts    // base, alternative, customer
├── holidayReasons.ts        // annual, sick, training, family, other
└── hsCodes.ts               // (large) — lazy-loaded for international jobs only
```

`api/src/constants/` mirrors the same files for server-side validation.

These are **plain TypeScript exports**, not database tables, because the values are stable global vocabulary. The only ones that go in DB are `Carrier` (sub-contractors — see below) and customer-specific lookups.

### 0.10.3 New picker components

Build five reusable pickers in `web/src/components/pickers/`:

1. **`<EnumPicker options={...} value onChange placeholder>`** — replaces every native `<select>` in the codebase. Renders a styled dropdown. For lists ≤ 30 items show as a normal select; for > 30 items, render as a popover with built-in search input filtering on label.

2. **`<EntityPicker entityType="driver|unit|trailer|customer|location|carrier" value onChange allowCreate>`** — typeahead that hits the relevant API endpoint, displays a paged result list, and (if `allowCreate`) shows `"+ Add new <entityType>"` at the bottom which opens a modal with the create form. On creation, the new entity is selected automatically. This is the killer pattern that prevents free-text `assignedTruck = "ab12 cde"` while still letting the user add a unit they haven't registered yet.

3. **`<AddressAutocomplete value onChange country?>`** — wraps Postcoder / Google Places / Mapbox / Loqate. Returns a structured `{ street, town, postcode, county, country, lat, lng }` so all five fields fill at once. Provider chosen via env var; default to **Postcoder** (cheapest UK-only) and fall back to manual entry if the user types but no match selected.

4. **`<TypeaheadFromList list={...} value onChange allowOther>`** — for medium-sized fixed lists (~50–500 items): commodities, ADR UN numbers, HS codes. Renders as text input with filtered dropdown below. If `allowOther` is true and the user's text doesn't match, a final option `Use "<typed>" as a custom value` appears.

5. **`<MultiSelect options={...} value={[]} onChange grouped?>`** — multi-check with optional grouping (driven by the `group` key on `BODY_TYPES`, `ONBOARD_EQUIPMENT` etc.). Replaces the existing `MultiCheck` and supersedes it.

The agent should refactor all existing `<select>` instances to use `<EnumPicker>`. Existing `<MultiCheck>` becomes `<MultiSelect>`. Existing free-text inputs in the audit table above with required mode `entity-picker` become `<EntityPicker>` instances.

### 0.10.4 Other → free-text fallback (the escape hatch)

Every dropdown that has a long tail of edge cases (`BODY_TYPES`, `ONBOARD_EQUIPMENT`, `TEMP_BANDS`, `PAYMENT_TERMS`, `LOAD_UNITS`, `HANDLING_METHODS`, etc.) MUST include an `"other"` option. When `"other"` is selected, an inline free-text input appears below labelled "Specify". The persisted value is stored in TWO fields:

- The original code field stays `"other"`
- A sibling `<field>Other` field stores the free text

This pattern already exists for `qtyUnit` + `qtyUnitOther` and `vehicleType` + `vehicleTypeOther`. Apply it everywhere. Reporting then uses `field === "other" ? fieldOther : labelOf(field)` for display.

### 0.10.5 New entity tables (so pickers have something to pick from)

Three new tables:

#### `model Carrier` — sub-contractors

```prisma
model Carrier {
  id                Int      @id @default(autoincrement())
  companyId         Int
  name              String
  contactName       String   @default("")
  contactPhone      String   @default("")
  contactEmail      String   @default("")
  address           String   @default("")
  country           String   @default("")
  vatNumber         String   @default("")
  insurancePolicyRef String  @default("")
  insuranceExpiry   DateTime?
  cmrPolicyRef      String   @default("")
  goodsInTransitMax Decimal? @db.Decimal(12, 2)
  paymentTerms      String   @default("")
  status            String   @default("active")
  notes             String   @default("")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  company  Company @relation(fields: [companyId], references: [id])
  jobs     PlannedJob[]

  @@index([companyId, status])
  @@index([companyId, name])
}
```

Replace `subcontractorName` (free string) on `PlannedJob` with `carrierId Int?` plus a `Carrier` relation. Keep the free-text version as a fallback for one-off carriers but strongly prefer the picker.

#### `model Yard` (optional — only if SavedLocation isn't already serving this)

If `SavedLocation` already has a `kind` or `accessType` field that can encode `"yard"` / `"depot"`, use that. Otherwise add a `kind` column to `SavedLocation`:

```prisma
model SavedLocation {
  // ... existing ...
  kind String @default("customer")  // "customer" | "yard" | "depot" | "supplier" | "port" | "other"
}
```

Then any picker that says "yard" filters `SavedLocation.where({ kind: "yard" })`.

#### `model Commodity` (optional — only if you want per-customer commodity history)

Skip in v1. Use the static `COMMODITIES_COMMON` constant with a typeahead. If a customer keeps using the same custom value, the agent can later promote frequent custom values into a real table.

### 0.10.6 API endpoints to back the pickers

For each entity-picker, an endpoint must exist or be added:

```
GET /api/drivers?q=<search>&limit=20
GET /api/fleet/units?q=<search>&status=available&limit=20
GET /api/fleet/trailers?q=<search>&bodyType=<...>&limit=20
GET /api/customers?q=<search>&limit=20
GET /api/locations?q=<search>&kind=<...>&limit=20
GET /api/carriers?q=<search>&status=active&limit=20
POST /api/carriers   // new — used by EntityPicker "Add new" flow
```

Many of these likely already exist (the audit at start of project found `jobsApi.locations()`, customer typeahead, etc.). The agent must verify and only add what's missing.

### 0.10.7 Migration strategy for free-text values already in DB

Because real installations have months of free-text data already entered:

1. For each field promoted from free-text to dropdown, the agent must write a one-off normalisation script (similar to the Phase 0.7 backfill) that maps existing values to canonical codes.
2. Unmappable values default to `"other"` and the original text moves into the `<field>Other` sibling.
3. Display layer reads both — no data is lost.
4. After a 14-day soak, generate a "values still in `other`" report so an operator can clean them up manually.

### 0.10.8 Acceptance criteria for 0.10

- [ ] No `<input type="text">` in any form file where the audit table specifies a dropdown / picker / multi-select.
- [ ] grep for `placeholder="Class 1` returns zero hits (driver licence is now a real `<EnumPicker>`).
- [ ] grep for `placeholder=".*Reg"` in fleet forms returns zero free-text registration pickers — they are entity pickers.
- [ ] `assignedTruck` and `assignedTrailer` on the job form are entity-picked. Saving a job stores the FleetUnit/FleetTrailer **id** as well as the registration string for back-compat display.
- [ ] Country fields everywhere (stop, alt-address, consignor, consignee, customs origin/destination, customer billing) are `<EnumPicker options={COUNTRIES}>`.
- [ ] All "Other" fallbacks store the free-text value in a `<field>Other` sibling and are validated server-side: if `field === "other"`, `fieldOther` must be non-empty.
- [ ] One-off normalisation scripts run and the "values still in `other` after backfill" report is < 5% of rows for any given field.

---

## 0.11 CI guardrail

Add `scripts/check-vocab-sync.ts`:

```ts
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const paths = [
  "api/src/constants/vehicleTaxonomy.ts",
  "web/src/constants/vehicleTaxonomy.ts",
  "mobile/src/constants/vehicleTaxonomy.ts",
];
const hashes = paths.map(p => ({ p, h: createHash("sha256").update(readFileSync(p)).digest("hex") }));
if (new Set(hashes.map(x => x.h)).size > 1) {
  console.error("Vocabulary files have drifted:");
  hashes.forEach(x => console.error(`  ${x.h}  ${x.p}`));
  process.exit(1);
}
```

Wire into CI before tests. The build fails if any agent edits one file without the others.

## 0.12 Acceptance for Phase 0

- [ ] `shared/vehicleTaxonomy.ts` exists and is duplicated to api/web/mobile (or shared via workspace).
- [ ] CI guard script passes.
- [ ] Job form Section 5 uses cascading category → GVW → body-type → equipment → licence picker.
- [ ] Fleet Add-Unit and Add-Trailer forms use the same pickers.
- [ ] Driver form `licenceClass` is a `<select>` with the 5 canonical options, and endorsements are a `MultiCheck`.
- [ ] Backfill script run; spot check 10 random rows in `FleetUnit`, `FleetTrailer`, `DriverProfile`, `PlannedJob` show canonical values.
- [ ] Allocation query (any code that does `if driver.licenceClass === unit.vehicleClass`) updated to: `licencesThatCanDrive(unit.bodyCategory).map(l => l.value).includes(driver.licenceClass)`.
- [ ] Job validation: a `ready_to_plan` job with `reqBodyCategory = "tractor"` and zero `trailerTypesAllowed` is rejected with `"Tractor unit requires at least one trailer body type"`.
- [ ] No code anywhere still reads `class1` / `class2` / `Artic unit` (case sensitive grep clean).
- [ ] Auto-capitalise applied: every text input in jobs / fleet / drivers / customers uses the `<TextField caseRule={...}>` wrapper (Phase 0.9). Postcodes uppercase, emails lowercase, names/addresses proper-case on blur.
- [ ] Dropdown-first audit (Phase 0.10) complete: every field in the audit table renders as the prescribed picker; one-off normalisation scripts run; `<EntityPicker>` / `<EnumPicker>` / `<AddressAutocomplete>` / `<TypeaheadFromList>` / `<MultiSelect>` exist in `web/src/components/pickers/` and are used everywhere.
- [ ] `Carrier` table created and `subcontractorName` is now an entity-picker; legacy free-text only as fallback.
- [ ] All "Other" options on every dropdown have a paired `<field>Other` free-text field and server-side validation that requires it when value is `"other"`.

---

## ⚠ Phases 1–12 below assume Phase 0 is merged

Specifically, references to `vehicleClassRequired` should be read as `reqBodyCategory`, references to `MIN_SIZES` should be read as `reqGvwMin` driven by `GVW_CLASSES`, and references to `equipmentRequired` / `driverQualificationsReq` should be read as `reqEquipment` / `reqEndorsements` using the canonical lists.

If you start a later phase before Phase 0 is merged, **stop and finish Phase 0 first** — the schema names will not match.

---

## Phase 1 — Commercial / Pricing block (highest priority)

**Why first:** Without pricing on the job, the TMS cannot produce invoices. Every real haulier needs this on day 1.

### 1.1 Prisma model — extend `PlannedJob`

Add to `model PlannedJob` in `api/prisma/schema.prisma`:

```prisma
  // Commercial
  rateAmount          Decimal? @db.Decimal(10, 2)
  rateCurrency        String   @default("GBP")
  rateType            String   @default("fixed")   // fixed | per_mile | per_km | per_pallet | per_tonne | per_hour
  rateUnitsExpected   Decimal? @db.Decimal(10, 2)  // for non-fixed rates
  fuelSurcharge       Decimal? @db.Decimal(10, 2)
  tollsEstimate       Decimal? @db.Decimal(10, 2)
  ferryEstimate       Decimal? @db.Decimal(10, 2)
  congestionEstimate  Decimal? @db.Decimal(10, 2)
  vatRate             Decimal? @db.Decimal(5, 2)   // percent, e.g. 20.00
  costCode            String   @default("")
  nominalCode         String   @default("")
  paymentTerms        String   @default("")        // free text e.g. "30 days end of month"
  // Sub-contracting
  isSubcontracted     Boolean  @default(false)
  subcontractorName   String   @default("")
  subcontractorRef    String   @default("")
  subcontractorRate   Decimal? @db.Decimal(10, 2)
```

> **NB:** if the project is on SQLite locally, `Decimal` becomes `String` in SQLite. Keep `@db.Decimal(...)` — it is correct for Postgres and is harmless for SQLite. If `pnpm prisma migrate dev` fails on `Decimal` for SQLite, fall back to `Float?`. Do NOT use `Float` for production money — leave a `// TODO: migrate to Decimal on Postgres` comment.

Run: `pnpm --filter api prisma migrate dev --name add_commercial_fields`

### 1.2 Zod schema — `api/src/schemas/jobs.ts`

Inside `JobCommonFields = z.object({ ... })`, add at the end:

```ts
  rateAmount:          z.union([z.number(), z.string(), z.null()]).optional(),
  rateCurrency:        z.string().optional(),
  rateType:            z.enum(["fixed","per_mile","per_km","per_pallet","per_tonne","per_hour"]).optional(),
  rateUnitsExpected:   z.union([z.number(), z.string(), z.null()]).optional(),
  fuelSurcharge:       z.union([z.number(), z.string(), z.null()]).optional(),
  tollsEstimate:       z.union([z.number(), z.string(), z.null()]).optional(),
  ferryEstimate:       z.union([z.number(), z.string(), z.null()]).optional(),
  congestionEstimate:  z.union([z.number(), z.string(), z.null()]).optional(),
  vatRate:             z.union([z.number(), z.string(), z.null()]).optional(),
  costCode:            z.string().optional(),
  nominalCode:         z.string().optional(),
  paymentTerms:        z.string().optional(),
  isSubcontracted:     z.boolean().optional(),
  subcontractorName:   z.string().optional(),
  subcontractorRef:    z.string().optional(),
  subcontractorRate:   z.union([z.number(), z.string(), z.null()]).optional(),
```

### 1.3 Server validation — `api/src/services/jobValidation.ts`

Inside the `if (saveMode === "ready_to_plan")` block, add:

```ts
    if (input.rateAmount === undefined || input.rateAmount === null || input.rateAmount === "") {
      errors.push("Rate is required");
    }
    if (!hasText(input.rateCurrency)) errors.push("Currency is required");
    if (input.isSubcontracted) {
      if (!hasText(input.subcontractorName)) errors.push("Sub-contractor name is required when sub-contracted");
      if (input.subcontractorRate === undefined || input.subcontractorRate === null || input.subcontractorRate === "") {
        errors.push("Sub-contractor buy-rate is required when sub-contracted");
      }
    }
```

Also extend `StructuredJobValidationInput` interface with these fields.

### 1.4 UI constants — `web/src/modules/jobs/createJobConstants.ts`

```ts
export const RATE_TYPES: [string, string][] = [
  ["fixed",      "Fixed price"],
  ["per_mile",   "Per mile"],
  ["per_km",     "Per km"],
  ["per_pallet", "Per pallet"],
  ["per_tonne",  "Per tonne"],
  ["per_hour",   "Per hour"],
];

export const CURRENCIES: [string, string][] = [
  ["GBP", "GBP — £"],
  ["EUR", "EUR — €"],
  ["USD", "USD — $"],
  ["PLN", "PLN — zł"],
  ["CHF", "CHF"],
  ["NOK", "NOK"],
  ["SEK", "SEK"],
  ["DKK", "DKK"],
];
```

### 1.5 UI Section — add to `CreateJobPage.tsx`

Insert a new section between the existing **Section 02 — Customer Details** and **Section 03 — Stops**, renumbered so it becomes **Section 03 — Pricing & Commercial** (and bump Stops → 04, Load → 05, Vehicle → 06, Return → 07).

> If renumbering all six sections is too invasive, instead append it at the end as **Section 07 — Pricing & Commercial** and live with the out-of-order section numbers. Renumbering is cleaner; appending is faster. Decide based on how much the user cares about visual order — default to **append at end**.

State block to add near the other section state blocks:

```tsx
  // ── Section — Pricing & Commercial ──────────────────────────────────────
  const [secPriceCollapsed, setSecPriceCollapsed] = useState(true);
  const [showPriceOpts, setShowPriceOpts] = useState(false);
  const [rateAmount,         setRateAmount]         = useState("");
  const [rateCurrency,       setRateCurrency]       = useState("GBP");
  const [rateType,           setRateType]           = useState<"fixed"|"per_mile"|"per_km"|"per_pallet"|"per_tonne"|"per_hour">("fixed");
  const [rateUnitsExpected,  setRateUnitsExpected]  = useState("");
  const [fuelSurcharge,      setFuelSurcharge]      = useState("");
  const [tollsEstimate,      setTollsEstimate]      = useState("");
  const [ferryEstimate,      setFerryEstimate]      = useState("");
  const [congestionEstimate, setCongestionEstimate] = useState("");
  const [vatRate,            setVatRate]            = useState("20");
  const [costCode,           setCostCode]           = useState("");
  const [nominalCode,        setNominalCode]        = useState("");
  const [paymentTerms,       setPaymentTerms]       = useState("");
  const [isSubcontracted,    setIsSubcontracted]    = useState(false);
  const [subcontractorName,  setSubcontractorName]  = useState("");
  const [subcontractorRef,   setSubcontractorRef]   = useState("");
  const [subcontractorRate,  setSubcontractorRate]  = useState("");

  const priceComplete = !!rateAmount.trim() && !!rateCurrency &&
    (!isSubcontracted || (subcontractorName.trim() && subcontractorRate.trim()));
  const priceStarted = !!rateAmount;
```

Render (within the JSX section list, follow the SectionHeader pattern of the existing sections):

```tsx
  <SectionHeader
    number="07"
    title="Pricing & Commercial"
    started={priceStarted}
    complete={priceComplete}
    collapsed={secPriceCollapsed}
    onToggle={() => setSecPriceCollapsed(c => !c)}
  />
  {!secPriceCollapsed && (
    <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <FieldLabel required>Rate</FieldLabel>
        <input className="input" type="number" step="0.01" min="0"
          value={rateAmount} onChange={e => setRateAmount(e.target.value)} />
      </div>
      <div>
        <FieldLabel required>Currency</FieldLabel>
        <select className="input" value={rateCurrency} onChange={e => setRateCurrency(e.target.value)}>
          {CURRENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <FieldLabel>Rate type</FieldLabel>
        <select className="input" value={rateType} onChange={e => setRateType(e.target.value as typeof rateType)}>
          {RATE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {rateType !== "fixed" && (
        <div>
          <FieldLabel>Expected units ({rateType.replace("per_", "")})</FieldLabel>
          <input className="input" type="number" step="0.01" min="0"
            value={rateUnitsExpected} onChange={e => setRateUnitsExpected(e.target.value)} />
        </div>
      )}
      <Toggle label="Sub-contracted out" value={isSubcontracted} onChange={setIsSubcontracted} />
      {isSubcontracted && (
        <>
          <div>
            <FieldLabel required>Sub-contractor name</FieldLabel>
            <input className="input" value={subcontractorName} onChange={e => setSubcontractorName(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Sub-contractor reference</FieldLabel>
            <input className="input" value={subcontractorRef} onChange={e => setSubcontractorRef(e.target.value)} />
          </div>
          <div>
            <FieldLabel required>Buy rate</FieldLabel>
            <input className="input" type="number" step="0.01" min="0"
              value={subcontractorRate} onChange={e => setSubcontractorRate(e.target.value)} />
          </div>
        </>
      )}
      <OptionalToggle open={showPriceOpts} onToggle={() => setShowPriceOpts(o => !o)} />
      {showPriceOpts && (
        <>
          <div><FieldLabel>Fuel surcharge</FieldLabel><input className="input" type="number" step="0.01" value={fuelSurcharge} onChange={e => setFuelSurcharge(e.target.value)} /></div>
          <div><FieldLabel>Tolls estimate</FieldLabel><input className="input" type="number" step="0.01" value={tollsEstimate} onChange={e => setTollsEstimate(e.target.value)} /></div>
          <div><FieldLabel>Ferry estimate</FieldLabel><input className="input" type="number" step="0.01" value={ferryEstimate} onChange={e => setFerryEstimate(e.target.value)} /></div>
          <div><FieldLabel>Congestion estimate</FieldLabel><input className="input" type="number" step="0.01" value={congestionEstimate} onChange={e => setCongestionEstimate(e.target.value)} /></div>
          <div><FieldLabel>VAT %</FieldLabel><input className="input" type="number" step="0.01" value={vatRate} onChange={e => setVatRate(e.target.value)} /></div>
          <div><FieldLabel>Cost code</FieldLabel><input className="input" value={costCode} onChange={e => setCostCode(e.target.value)} /></div>
          <div><FieldLabel>Nominal code</FieldLabel><input className="input" value={nominalCode} onChange={e => setNominalCode(e.target.value)} /></div>
          <div><FieldLabel>Payment terms</FieldLabel><input className="input" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days end of month" /></div>
        </>
      )}
    </div>
  )}
```

### 1.6 Payload — `web/src/modules/jobs/createJobPayload.ts`

Extend the params interface and the `buildBody` mapping with all 17 commercial fields. Numbers go in as `parseFloat(x) || null`. Booleans pass through. Strings pass through.

### 1.7 Edit-mode load + template apply

In `CreateJobPage.tsx`:
- The `useEffect` that loads an existing job (`jobsApi.get(editJobId)`) must `setRateAmount(job.rateAmount?.toString() || "")` etc. for every field.
- The `applyTemplate(t)` function must read these fields off `t.defaultJobData` and call setters.

### 1.8 Done-criteria for Phase 1

- A `ready_to_plan` save with no rate is rejected by the server with `"Rate is required"`.
- A draft save with no rate succeeds.
- Loading an existing job with a rate displays it.
- A template with rate metadata applies cleanly.

---

## Phase 2 — Consignor / Consignee separation (CMR Article 6)

**Why:** CMR convention requires sender, receiver, and carrier to be three distinct parties on the consignment note. The current "customer" is the booking party — that is not necessarily either the consignor or the consignee.

### 2.1 Prisma model

Add to `PlannedJob`:

```prisma
  // Consignor (sender of goods)
  consignorName     String  @default("")
  consignorAddress  String  @default("")
  consignorCountry  String  @default("")
  consignorEori     String  @default("")
  consignorContact  String  @default("")
  consignorPhone    String  @default("")
  consignorRef      String  @default("")
  // Consignee (receiver of goods)
  consigneeName     String  @default("")
  consigneeAddress  String  @default("")
  consigneeCountry  String  @default("")
  consigneeEori     String  @default("")
  consigneeContact  String  @default("")
  consigneePhone    String  @default("")
  consigneeRef      String  @default("")
  // Allow same as customer to skip the section
  consignorSameAsCustomer Boolean @default(true)
  consigneeSameAsCustomer Boolean @default(false)
```

### 2.2 Zod, validation, UI

- Add all fields to `JobCommonFields` as `z.string().optional()` and the two booleans as `z.boolean().optional()`.
- In `jobValidation.ts`, when `saveMode === "ready_to_plan"`:
  - If `consignorSameAsCustomer === false`: require `consignorName`, `consignorAddress`, `consignorCountry`.
  - Always require `consigneeName` and `consigneeAddress` (the receiver of goods is always needed).
- New UI section "Consignor & Consignee" with two collapsed sub-blocks. Default `consignorSameAsCustomer = true` to avoid friction.

### 2.3 Done-criteria

- Cross-border or 3-party jobs can record sender ≠ receiver ≠ payer.
- Default behaviour for domestic same-party jobs is unchanged (one click and you're past the section).

---

## Phase 3 — Declared value & insurance

**Why:** CMR liability is capped at ~8.33 SDR/kg. For valuable goods this is far below replacement cost. Operators must capture declared value to price gap insurance.

### 3.1 Prisma — extend `LoadDetails` (NOT `PlannedJob` — value belongs to goods)

```prisma
  declaredValue       Decimal? @db.Decimal(12, 2)
  declaredCurrency    String   @default("GBP")
  insuranceRequired   Boolean  @default(false)
  insurancePolicyRef  String   @default("")
  insuranceProvider   String   @default("")
```

### 3.2 Zod — extend `LoadDetailsSchema`

```ts
  declaredValue:      z.union([z.number(), z.string(), z.null()]).optional(),
  declaredCurrency:   z.string().optional(),
  insuranceRequired:  z.boolean().optional(),
  insurancePolicyRef: z.string().optional(),
  insuranceProvider:  z.string().optional(),
```

### 3.3 Validation rule

If `loadDetails.insuranceRequired === true`, require `insurancePolicyRef`.

### 3.4 UI — extend Section 04 (Load Details)

Add three optional fields under a new "Value & Insurance" subgroup inside the existing load section. Use the existing optional toggle pattern.

---

## Phase 4 — International / Customs

**Why:** Post-Brexit, every cross-border move into/out of the UK requires customs declarations. Without these fields the planner cannot brief the driver or pre-lodge.

### 4.1 Prisma — extend `PlannedJob`

```prisma
  // International
  isCrossBorder       Boolean  @default(false)
  originCountry       String   @default("")
  destinationCountry  String   @default("")
  incoterms           String   @default("")        // EXW | FCA | FAS | FOB | CFR | CIF | CPT | CIP | DAP | DPU | DDP
  incotermsLocation   String   @default("")
  customsProcedure    String   @default("")        // export | import | t1 | t2 | atacarnet | tirCarnet
  mrnNumber           String   @default("")
  tadNumber           String   @default("")
  commercialInvoiceNo String   @default("")
  commercialInvoiceValue Decimal? @db.Decimal(12, 2)
  commercialInvoiceCurrency String @default("")
  commodityCodes      Json?                        // [{ code, description, value, weight }]
  countryOfOrigin     String   @default("")
  // Ferry / chunnel
  ferryRouting        String   @default("")
  ferryBookingRef     String   @default("")
```

### 4.2 Constants — `createJobConstants.ts`

```ts
export const INCOTERMS: [string, string][] = [
  ["EXW", "EXW — Ex Works"],
  ["FCA", "FCA — Free Carrier"],
  ["FAS", "FAS — Free Alongside Ship"],
  ["FOB", "FOB — Free on Board"],
  ["CFR", "CFR — Cost & Freight"],
  ["CIF", "CIF — Cost, Insurance & Freight"],
  ["CPT", "CPT — Carriage Paid To"],
  ["CIP", "CIP — Carriage & Insurance Paid"],
  ["DAP", "DAP — Delivered at Place"],
  ["DPU", "DPU — Delivered at Place Unloaded"],
  ["DDP", "DDP — Delivered Duty Paid"],
];

export const CUSTOMS_PROCEDURES: [string, string][] = [
  ["export",     "Export declaration"],
  ["import",     "Import declaration"],
  ["t1",         "T1 — External Union Transit"],
  ["t2",         "T2 — Internal Union Transit"],
  ["ataCarnet",  "ATA Carnet"],
  ["tirCarnet",  "TIR Carnet"],
];
```

### 4.3 Validation

When `isCrossBorder === true` AND `saveMode === "ready_to_plan"`:
- Require `originCountry`, `destinationCountry`, `incoterms`, `customsProcedure`.
- If `customsProcedure` ∈ {`export`, `import`, `t1`, `t2`}: require `mrnNumber`.

### 4.4 UI — new section "International & Customs"

Collapsed by default. Hidden behind the `isCrossBorder` toggle so domestic users never see the customs fields. The commodity codes UI is a small repeating row (code | description | value | weight) — implement as `useState<{code:string;description:string;value:string;weight:string}[]>([])` with add/remove buttons.

---

## Phase 5 — ADR / Dangerous goods detail

**Why:** ADR legally requires UN number, proper shipping name, packing group, tunnel category, packages count, total quantity per UN, and 24/7 emergency contact on the transport document. Today the form has only `hazardClass` and a `hazardous` boolean — that is not legally sufficient.

### 5.1 Prisma — new model

```prisma
model JobAdrItem {
  id              Int     @id @default(autoincrement())
  companyId       Int
  jobId           Int
  unNumber        String                          // e.g. "1203"
  properShipping  String                          // e.g. "Petrol"
  hazardClass     String                          // "3" | "8" | "6.1" etc.
  packingGroup    String                          // "I" | "II" | "III"
  tunnelCategory  String                          // "B" | "C" | "D" | "E"
  packagesCount   Int
  packageType     String                          // drum | jerrycan | IBC | bulk | etc.
  netQuantity     Decimal @db.Decimal(10, 2)
  netUnit         String                          // kg | l | tonnes
  createdAt       DateTime @default(now())

  company Company    @relation(fields: [companyId], references: [id])
  job     PlannedJob @relation(fields: [jobId], references: [id])

  @@index([companyId, jobId])
}
```

Add to `PlannedJob`:
```prisma
  adrItems       JobAdrItem[]
  adrEmergencyPhone   String  @default("")
  adrInstructionsRef  String  @default("")   // written instruction reference per ADR 5.4.3
```

### 5.2 Zod, UI

- New Zod array schema `JobAdrItemSchema` and add `adrItems: z.array(JobAdrItemSchema).optional()` to `JobCommonFields`.
- UI: when the existing `hazardous` toggle in Section 04 is on, render a "Dangerous goods detail" sub-block with an add-row table (UN, name, class, PG, tunnel cat, package count, package type, qty, unit) plus emergency phone + instructions ref.
- Validation: when `hazardous === true` AND `saveMode === ready_to_plan`: require `adrEmergencyPhone` and at least one `adrItems` row with all fields populated.

---

## Phase 6 — Pallet exchange

**Why:** UK/EU pallet networks (Palletline, Palletways, etc.) and CHEP/LPR exchange flows require this on every job. Currently absent.

### 6.1 Prisma — extend `PlannedJob`

```prisma
  palletExchange      Boolean @default(false)
  palletExchangeType  String  @default("")    // chep | lpr | euro | white | other
  palletExchangeIn    Int     @default(0)
  palletExchangeOut   Int     @default(0)
  palletExchangeNotes String  @default("")
```

### 6.2 UI

Add a small toggle inside Section 04 (Load Details) under the existing optional toggles. When on, expose 4 fields. No new section — this is part of load detail.

### 6.3 Validation

If `palletExchange === true` AND `ready_to_plan`: require `palletExchangeType`.

---

## Phase 7 — Site H&S per stop

**Why:** Many sites require PPE, induction, RAMS, banksman, or permit-to-work. Today this is buried in `accessNotes` free text. Drivers turn up unprepared.

### 7.1 Prisma — extend `JobStop`

```prisma
  inductionRequired   Boolean  @default(false)
  ppeRequired         Json?                       // ["hi_vis","hard_hat","steel_toe","gloves","eye","ear","fr_clothing"]
  ramsRequired        Boolean  @default(false)
  ramsDocumentRef     String   @default("")
  banksmanRequired    Boolean  @default(false)
  permitToWork        Boolean  @default(false)
  permitToWorkRef     String   @default("")
```

### 7.2 Constants

```ts
// createJobConstants.ts
export const PPE_OPTS: [string, string][] = [
  ["hi_vis",       "Hi-vis"],
  ["hard_hat",     "Hard hat"],
  ["steel_toe",    "Steel-toe boots"],
  ["gloves",       "Gloves"],
  ["eye",          "Eye protection"],
  ["ear",          "Ear protection"],
  ["fr_clothing",  "Flame-retardant clothing"],
  ["respirator",   "Respirator / mask"],
];
```

### 7.3 UI

Inside `StopCard.tsx`, in the "Optional" pane that the user can toggle open per-stop, add a "Site Health & Safety" subgroup with: induction toggle, PPE multi-check (use existing `MultiCheck` helper), RAMS toggle + ref, banksman toggle, permit-to-work toggle + ref.

### 7.4 Type — extend `StopState` in `createJobTypes.ts`

```ts
  inductionRequired: boolean;
  ppeRequired: string[];
  ramsRequired: boolean;
  ramsDocumentRef: string;
  banksmanRequired: boolean;
  permitToWork: boolean;
  permitToWorkRef: string;
```

Update `makeStop()` defaults, `jobStopToStopState()` reader, and the payload mapper.

---

## Phase 8 — Documentation checklist

**Why:** Drivers need a clear list of paperwork to carry. Currently buried in notes.

### 8.1 Prisma — extend `PlannedJob`

```prisma
  documentsRequired   Json?     // ["delivery_note","packing_list","cmr","t1","msds","adr_instructions","photo_id","permits"]
  customerDocsRef     String  @default("")
  returnableDocs      Boolean @default(false)
```

### 8.2 Constants

```ts
export const DOC_REQUIRED_OPTS: [string, string][] = [
  ["delivery_note",     "Delivery note"],
  ["packing_list",      "Packing list"],
  ["cmr",               "CMR"],
  ["t1",                "T1 transit document"],
  ["msds",              "MSDS / safety data sheet"],
  ["adr_instructions",  "ADR written instructions"],
  ["photo_id",          "Photo ID"],
  ["permits",           "Movement permits"],
  ["weighbridge_ticket","Weighbridge ticket"],
];
```

### 8.3 UI

Place inside the existing load-details section as a collapsible "Driver documentation" sub-group with `MultiCheck`.

---

## Phase 9 — Audit & source fields

**Why:** Operators need to know how a job arrived, who took it, and when. Useful for SLA reporting and disputes.

### 9.1 Prisma — extend `PlannedJob`

```prisma
  bookingSource       String  @default("")    // phone | email | edi | portal | web_form | walk_in | repeat
  bookingReceivedAt   DateTime?
  customerSlaTime     DateTime?               // when goods must be delivered by
  bookedByUserId      Int?                    // a user ID — defaults to createdByUserId on insert
```

### 9.2 Constants

```ts
export const BOOKING_SOURCES: [string, string][] = [
  ["phone",     "Phone"],
  ["email",     "Email"],
  ["edi",       "EDI"],
  ["portal",    "Customer portal"],
  ["web_form",  "Web form"],
  ["walk_in",   "Walk-in"],
  ["repeat",    "Repeat / standing order"],
];
```

### 9.3 UI

Add three small fields to **Section 02 — Customer Details** (booking source, received-at, SLA-by-time).

---

## Phase 10 — Validation tightening

These are hardening rules to apply across the codebase. Each is independent — apply all of them in `api/src/services/jobValidation.ts`:

1. **Artic without trailer.** Currently a warning. Convert to error:
   ```ts
   if (input.vehicleClassRequired === "artic" && saveMode === "ready_to_plan" && trailerTypes.length === 0) {
     errors.push("Artic vehicle requires at least one trailer type");
   }
   ```
2. **Time-critical service types must have booked time.** When `serviceType` ∈ `{delivery, collection_delivery}` AND `saveMode === ready_to_plan`, every dropoff stop must have `bookedTime` OR (`timeWindowStart` AND `timeWindowEnd`). Currently a warning — make an error.
3. **Postcode regex.** Add a UK postcode regex (`^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i`) for stops where `country === "United Kingdom"`. Warn (not error) if it fails — many users type lowercase or miss the space.
4. **Phone E.164 sanity.** Reject phones containing letters or fewer than 7 digits. Warn only (people use extensions).
5. **Hazardous load consistency.** If `loadDetails.hazardClass` is non-empty OR `hazardous` toggle on, require `adrItems.length >= 1` and `adrEmergencyPhone` (after Phase 5).
6. **Temp-controlled consistency.** If `loadDetails.tempControlled === true`, require `loadDetails.tempRange` to be non-empty.
7. **Customer credit on stop.** When loading customer in `routes/jobs.ts` POST handler, if `customer.creditOnStop === true` (assumes Customer has this flag — add it via a separate migration if not), block `ready_to_plan` save with `"Customer is on credit hold"`. Allow draft.
8. **Sub-contracted requires carrier on file.** If `isSubcontracted`, the agent should look up the subcontractor in a Carriers table — if no Carriers table exists yet, skip this rule (free text is acceptable v1).

---

## Phase 11 — Migration safety & rollout

**Order of operations for production rollout:**

1. Deploy DB migrations (additive — no destructive changes).
2. Deploy API with new Zod fields **as optional** — old clients keep working.
3. Deploy web with the new UI sections.
4. After 7 days of dual-running, flip server validation rules from optional to required (Phases 1, 2, 3, 4, 5, 6 hard rules).
5. Monitor `validationStatus` distribution for spikes in `needs_info`.

**Backfill plan for existing rows:** none required — every new column has a sane default. Decimals are `null`, booleans are `false`, strings are `""`, JSON is `null`. Existing read paths continue to work.

---

## Phase 12 — Test plan

Add or extend tests in `api/src/tests/`:

1. **Schema round-trip** — for each new field, create a job via `POST /jobs`, GET it back, assert the value is preserved.
2. **Validation** — for each new hard rule, assert `ready_to_plan` save fails with the exact error message and that `draft` save succeeds.
3. **Edit-mode load** — populate every new field on a job, fetch via the edit-mode loader path, assert the form state has the right value (component test).
4. **Template apply** — save a template containing every new field, apply it to a fresh job, assert all setters fired.
5. **Backwards compat** — load an existing pre-migration job (one with all-default new columns) and assert no exceptions.

---

## Acceptance checklist (deliver this back)

When done, post a short summary:

- [ ] All 9 feature phases merged
- [ ] All 8 validation hardening rules merged
- [ ] Prisma migrations: 1 per phase, named clearly
- [ ] No `any` introduced; all Zod inferred types match Prisma types
- [ ] `pnpm typecheck` passes in both `api/` and `web/`
- [ ] `pnpm test` passes
- [ ] CreateJobPage.tsx has not exceeded ~3000 lines (if it does, extract sections into their own files following the existing `StopCard.tsx` pattern)
- [ ] An existing job from before the change still loads and saves without error
- [ ] A new job with every field populated saves and reloads identically

---

## Out-of-scope for this brief

The following were considered and intentionally deferred to a later iteration:

- Driver-hours / EU 561 estimation (requires routing engine integration)
- Abnormal load STGO Cat 1/2/3 + VR1 notification (specialist subset; less than 1% of jobs)
- Waste / EWC code capture (relevant only to waste hauliers; add when a customer asks)
- Photo-POD vs signature-POD split (current `requirePOD` boolean acceptable v1)
- Carriers master table for sub-contractors (free text acceptable v1)
- Multi-currency invoicing pipeline (out of scope — only capture currency on the job)

If a phase reveals a dependency on one of these, surface it and ask before expanding scope.

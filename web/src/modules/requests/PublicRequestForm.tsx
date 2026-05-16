/**
 * Public transport request form.
 * Design: identical visual language to CreateJobPage.
 * Structure: requester → stops → load → special requirements → transport → billing → notes
 */

import { useState, useEffect } from "react";
import {
  BODY_CATEGORIES,
  BODY_TYPES,
  BODY_TYPES_BY_CATEGORY,
  TRAILER_BODY_TYPE_VALUES,
} from "../../constants/vehicleTaxonomy";
import { useParams } from "react-router-dom";
import {
  jobRequestsPublicApi,
  type PublicLinkInfo,
  type SubmitRequestBody,
  type RequestStop,
} from "../../api/jobRequests";
import {
  FieldLabel,
  TextField,
  SectionHeader,
  SectionFooter,
  OptionalToggle,
  Toggle,
  MultiCheck,
  StatusDot,
} from "../jobs/CreateJobFormComponents";

// ── Vehicle taxonomy helpers ──────────────────────────────────────────────────
// For tractor / drawbar the body type lives on the trailer, so show all trailer
// body types. Heavy haulage → only heavy-group types.
const REQ_BODY_TYPES_BY_CATEGORY: Record<string, readonly string[]> = {
  van:          BODY_TYPES_BY_CATEGORY.van,
  luton_van:    BODY_TYPES_BY_CATEGORY.luton_van,
  pickup:       BODY_TYPES_BY_CATEGORY.pickup,
  rigid:        BODY_TYPES_BY_CATEGORY.rigid,
  tractor:      TRAILER_BODY_TYPE_VALUES,
  drawbar:      TRAILER_BODY_TYPE_VALUES,
  heavy_haulage:["low_loader", "low_loader_extending", "modular_heavy", "girder_frame", "other"],
  spmt:         BODY_TYPES_BY_CATEGORY.spmt,
  plant:        ["other"],
};

const BODY_TYPE_GROUP_LABELS: Record<string, string> = {
  general:   "General / enclosed",
  flat:      "Flat / open",
  bulk:      "Bulk & tipping",
  tanker:    "Tanker",
  temp:      "Temperature controlled",
  container: "Container / skeletal",
  heavy:     "Heavy haulage",
  specialist:"Specialist",
  other:     "Other",
};

// ── Constants ─────────────────────────────────────────────────────────────────

// Public form: only Collection and Delivery shown.
// Reload, Return, Waypoint, Other are planner-only and hidden from the public form.
const STOP_TYPES: [string, string][] = [
  ["collection", "Collection"],
  ["delivery",   "Delivery"],
];

const SERVICE_TIMES: [string, string][] = [
  ["15", "15 min"],
  ["30", "30 min"],
  ["45", "45 min"],
  ["60", "1 hr"],
  ["90", "1.5 hr"],
  ["120", "2 hr"],
  ["180", "3 hr"],
  ["custom", "Custom"],
];

const LOAD_TYPES: [string, string][] = [
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

const BUILDING_MATERIAL_TYPES: [string, string][] = [
  ["bricks_blocks",  "Bricks / blocks"],
  ["timber",         "Timber"],
  ["aggregates",     "Aggregates / gravel / sand"],
  ["plasterboard",   "Plasterboard / drywall"],
  ["roofing",        "Roofing materials"],
  ["glass",          "Glass / glazing"],
  ["insulation",     "Insulation"],
  ["pipes_ducting",  "Pipes / ducting"],
  ["other",          "Other"],
];

const GENERAL_PACKAGING: [string, string][] = [
  ["palletised",    "Palletised"],
  ["boxed",         "Boxed / cartons"],
  ["loose",         "Loose"],
  ["shrink_wrapped","Shrink-wrapped"],
  ["other",         "Other"],
];

const LOAD_UNITS: [string, string][] = [
  ["pallets",     "Pallets"],
  ["roll_cages",  "Roll cages"],
  ["tonnes",      "Tonnes"],
  ["kg",          "Kilograms"],
  ["bags",        "Bags"],
  ["items",       "Items"],
  ["loads",       "Loads"],
  ["litres",      "Litres"],
  ["cubic_metres","Cubic metres"],
  ["other",       "Other"],
];

// Units that can be exchanged per stop
const EXCHANGE_UNITS: [string, string][] = [
  ["pallets",    "Pallets"],
  ["roll_cages", "Roll cages / yorks"],
  ["stillages",  "Stillages"],
  ["ibc_tanks",  "IBC tanks"],
  ["other",      "Other"],
];

const HANDLING_METHODS: [string, string][] = [
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

const ACCESS_REQUIREMENTS: [string, string][] = [
  ["narrow_road",          "Narrow road"],
  ["height_restriction",   "Height restriction"],
  ["weight_restriction",   "Weight restriction"],
  ["length_restriction",   "Length restriction"],
  ["no_artic_access",      "No artic access"],
  ["no_trailer_access",    "No trailer access"],
  ["residential_area",     "Residential area"],
  ["security_checkin",     "Security check-in"],
  ["driver_id_required",   "Driver ID required"],
  ["do_not_arrive_early",  "Do not arrive early"],
  ["holding_area_required","Holding area required"],
  ["port_access",          "Port access"],
  ["airport_access",       "Airport access"],
];

const PPE_ITEMS: [string, string][] = [
  ["ppe_safety_boots", "Safety boots"],
  ["ppe_hi_vis",       "Hi-vis vest"],
  ["ppe_hard_hat",     "Hard hat"],
  ["ppe_gloves",       "Gloves"],
  ["ppe_glasses",      "Safety glasses"],
];

const SPECIAL_REQUIREMENTS: [string, string][] = [
  ["dangerous_goods",           "Dangerous goods (ADR)"],
  ["fragile",                   "Fragile / handle with care"],
  ["high_value",                "High value goods"],
  ["oversized",                 "Oversized load"],
  ["secure_transport_required", "Secure transport"],
  ["escort_required",           "Police escort required"],
];



const PROOF_REQUIREMENTS: [string, string][] = [
  ["signature_required",         "Signature required"],
  ["photos_required",            "Photos required"],
  ["pod_required",               "POD document"],
  ["weighbridge_ticket_required", "Weighbridge ticket"],
  ["seal_number_required",       "Seal number"],
  ["name_required",              "Printed name"],
];

const LOAD_READINESS: [string, string][] = [
  ["ready_now",            "Ready now"],
  ["ready_at_booked_time", "Ready at booked time"],
  ["still_being_prepared", "Still being prepared"],
  ["unsure",               "Unsure"],
];


const SPLIT_OPTIONS: [string, string][] = [
  ["must_stay_together",  "Must stay together"],
  ["can_split_partially", "Can split partially"],
  ["can_split_freely",    "Can split freely"],
];

const SECURING_REQUIREMENTS: [string, string][] = [
  ["straps_required",                "Straps required"],
  ["chains_required",                "Chains required"],
  ["edge_protection_required",       "Edge protection"],
  ["sheets_required",                "Sheets"],
  ["curtains_must_not_touch_load",   "Curtains must not touch load"],
  ["stanchions_required",            "Stanchions / stake poles (flatbed)"],
  ["temperature_monitoring_required","Temperature monitoring"],
];

const TEMP_TYPE_OPTIONS: [string, string][] = [
  ["chilled", "Chilled"],
  ["frozen",  "Frozen"],
  ["ambient", "Ambient"],
];

const WET_DRY_OPTIONS: [string, string][] = [
  ["dry", "Dry"],
  ["wet", "Wet"],
];

const LOADED_EMPTY_OPTIONS: [string, string][] = [
  ["loaded", "Loaded"],
  ["empty",  "Empty"],
];

const REJECTION_ACTIONS: [string, string][] = [
  ["call_office_before_leaving",     "Call office before leaving"],
  ["return_to_collection_point",     "Return to collection point"],
  ["deliver_to_alternative_address", "Deliver to alternative address"],
  ["other",                          "Other"],
];

// ── Country list (ISO 3166-1 alpha-2) ─────────────────────────────────────────
// GB first (primary market), then EU-27 alphabetically.
const COUNTRIES: [string, string][] = [
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

// ── Postcode metadata by country ──────────────────────────────────────────────
// label  = what to show as the field label
// placeholder = example postcode for that country
const POSTCODE_META: Record<string, { label: string; placeholder: string }> = {
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

// ── Stop state ────────────────────────────────────────────────────────────────

interface StopState {
  id: string;
  type: string;
  collapsed: boolean;
  showOptional: boolean;
  // Required
  siteName: string;
  street: string;
  town: string;
  postcode: string;
  country: string;
  lat: string;
  lng: string;
  navigationInstructions: string;
  referenceNumber: string;
  date: string;
  earliestArrivalTime: string;
  latestArrivalTime: string;
  serviceTime: string;
  serviceTimeCustom: string;
  stopQuantity: string;
  stopQuantityUnit: string;
  stopNotes: string;
  // Equipment exchange
  exchangeDropQty: string;
  exchangeCollectQty: string;
  exchangeUnit: string;
  handlingMethods: string[];
  handlingMethodOther: string;
  accessRequirements: string[];
  ppeItems: string[];
  // Restriction values
  heightRestrictionValue: string;
  weightRestrictionValue: string;
  lengthRestrictionValue: string;
  // Optional
  unitName: string;
  addressLine2: string;
  countyRegion: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  bookingRequired: boolean;
  bookingRef: string;
  openingHours: string;
  bookedTime: string;
  proofRequirements: string[];
  loadReadiness: string;
}

let _uid = 0;
function uid() { return `s${++_uid}`; }

function blankStop(type: string): StopState {
  return {
    id: uid(), type, collapsed: false, showOptional: false,
    siteName: "", street: "", town: "", postcode: "",
    country: "GB",
    lat: "", lng: "", navigationInstructions: "",
    referenceNumber: "",
    date: "", earliestArrivalTime: "", latestArrivalTime: "",
    serviceTime: "30", serviceTimeCustom: "0",
    stopQuantity: "", stopQuantityUnit: "pallets", stopNotes: "",
    exchangeDropQty: "", exchangeCollectQty: "", exchangeUnit: "pallets",
    handlingMethods: [], handlingMethodOther: "", accessRequirements: [], ppeItems: [],
    heightRestrictionValue: "", weightRestrictionValue: "", lengthRestrictionValue: "",
    unitName: "", addressLine2: "", countyRegion: "",
    contactName: "", contactPhone: "", contactEmail: "",
    bookingRequired: false, bookingRef: "", openingHours: "",
    bookedTime: "",
    proofRequirements: [],
    loadReadiness: "",
  };
}

function stopComplete(s: StopState): boolean {
  const needsRef = s.type === "collection" || s.type === "delivery";
  return !!(
    s.siteName.trim() && s.street.trim() &&
    s.town.trim() && s.postcode.trim() && s.country.trim() &&
    s.lat && s.lng &&
    s.navigationInstructions.trim() &&
    s.date && s.earliestArrivalTime && s.latestArrivalTime &&
    s.serviceTime &&
    (!needsRef || s.referenceNumber.trim())
  );
}

function stopStarted(s: StopState): boolean {
  return !!(s.siteName || s.street || s.referenceNumber);
}

function stopToRequestStop(s: StopState, seq: number): RequestStop {
  const customMin = Math.max(0, parseInt(s.serviceTimeCustom, 10) || 0);
  const svcMin = s.serviceTime === "custom" ? (customMin > 0 ? customMin : 30) : parseInt(s.serviceTime, 10);
  return {
    type:           s.type as RequestStop["type"],
    sequence:       seq,
    siteName:            s.siteName.trim(),
    street:              s.street.trim(),
    addressLine2:        s.addressLine2.trim() || undefined,
    town:                s.town.trim(),
    countyRegion:        s.countyRegion.trim() || undefined,
    postcode:            s.postcode.trim(),
    country:             s.country.trim() || undefined,
    lat:                 parseFloat(s.lat),
    lng:                 parseFloat(s.lng),
    navigationInstructions: s.navigationInstructions.trim(),
    referenceNumber:     s.referenceNumber.trim() || undefined,
    contactName:         s.contactName.trim()  || undefined,
    contactPhone:        s.contactPhone.trim() || undefined,
    contactEmail:        s.contactEmail.trim() || undefined,
    bookingRequired:     s.bookingRequired || undefined,
    bookingRef:          s.bookingRef.trim() || undefined,
    openingHours:        s.openingHours.trim() || undefined,
    date:                s.date,
    earliestArrivalTime: s.earliestArrivalTime,
    latestArrivalTime:   s.latestArrivalTime,
    bookedTime:          s.bookedTime || undefined,
    unloadingAllowanceMinutes: svcMin,
    stopQuantity:        s.stopQuantity ? parseFloat(s.stopQuantity) : undefined,
    stopQuantityUnit:    s.stopQuantity ? s.stopQuantityUnit : undefined,
    stopNotes:           s.stopNotes.trim() || undefined,
    exchangeDropQty:     s.exchangeDropQty     ? parseFloat(s.exchangeDropQty)     : undefined,
    exchangeCollectQty:  s.exchangeCollectQty  ? parseFloat(s.exchangeCollectQty)  : undefined,
    exchangeUnit:        (s.exchangeDropQty || s.exchangeCollectQty) ? s.exchangeUnit : undefined,
    handlingMethods:     s.handlingMethods.length
      ? s.handlingMethods.map(m => m === "other" && s.handlingMethodOther.trim() ? `other: ${s.handlingMethodOther.trim()}` : m)
      : undefined,
    accessRequirements:  [...s.accessRequirements, ...s.ppeItems].length
      ? [...s.accessRequirements, ...s.ppeItems]
      : undefined,
    proofRequirements:   s.proofRequirements.length ? s.proofRequirements : undefined,
    loadReadiness:       s.loadReadiness || undefined,
    heightRestrictionValue: s.heightRestrictionValue || undefined,
    weightRestrictionValue: s.weightRestrictionValue || undefined,
    lengthRestrictionValue: s.lengthRestrictionValue || undefined,
  };
}

// ── Inline chip-button (single-select) ────────────────────────────────────────

function Chips({ options, value, onChange }: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(value === v ? "" : v)}
          className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors min-h-[40px] " +
            (value === v
              ? "bg-accent text-white border-accent"
              : "bg-white text-muted border-border hover:border-gray-400")}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ── Service time chips ────────────────────────────────────────────────────────

function ServiceTimeChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1.5 mt-1">
      {SERVICE_TIMES.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={"py-2 rounded-lg border text-xs font-semibold text-center transition-colors " +
            (value === v ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ── Stop card ─────────────────────────────────────────────────────────────────

function StopCard({
  stop, index, total,
  onChange, onRemove,
}: {
  stop: StopState;
  index: number;
  total: number;
  onChange: (patch: Partial<StopState>) => void;
  onRemove: () => void;
}) {
  const [showCoordHelp, setShowCoordHelp] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState<Array<{
    label: string; street: string; town: string;
    county: string; postcode: string; country: string;
    lat: number; lng: number;
  }>>([]);
  const [showLookup, setShowLookup] = useState(false);

  async function handlePostcodeLookup() {
    const q = stop.postcode.trim();
    if (!q) return;
    setLookupLoading(true);
    setShowLookup(false);
    try {
      const res = await jobRequestsPublicApi.geocode(q, stop.country);
      setLookupResults(res.features);
      setShowLookup(res.features.length > 0);
    } catch {
      setLookupResults([]);
    } finally {
      setLookupLoading(false);
    }
  }

  function applyLookupResult(r: typeof lookupResults[0]) {
    onChange({
      street:      r.street  || stop.street,
      town:        r.town    || stop.town,
      countyRegion:r.county  || stop.countyRegion,
      postcode:    r.postcode || stop.postcode,
      country:     r.country || stop.country,
      lat:         String(r.lat),
      lng:         String(r.lng),
    });
    setShowLookup(false);
    setLookupResults([]);
  }
  const complete = stopComplete(stop);
  const started  = stopStarted(stop);
  const typeLabel = STOP_TYPES.find(([v]) => v === stop.type)?.[1] ?? stop.type;
  const needsRef = stop.type === "collection" || stop.type === "delivery";
  const loadingLabel = stop.type === "collection" ? "How will this be loaded?" : stop.type === "delivery" ? "How will this be unloaded?" : "Handling method";

  const accent =
    complete ? "border-l-green-500" :
    started  ? "border-l-blue-400"  : "border-l-transparent";
  const headerBg =
    complete && stop.collapsed  ? "bg-green-50/60" :
    !stop.collapsed             ? "bg-white"        : "bg-slate-50/70";

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Stop header */}
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none border-l-4 ${accent} ${headerBg} transition-colors`}
        onClick={() => onChange({ collapsed: !stop.collapsed })}
      >
        <StatusDot complete={complete} started={started} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase tracking-widest ${complete ? "text-green-600" : started ? "text-blue-500" : "text-muted"}`}>
              {typeLabel.replace(/^.+ /, "")}
            </span>
            {total > 1 && (
              <span className="text-xs text-muted">#{index + 1}</span>
            )}
          </div>
          {stop.collapsed && stop.siteName
            ? <p className="text-xs text-accent font-semibold truncate">{stop.siteName}{stop.date ? ` · ${stop.date}` : ""}</p>
            : stop.collapsed
            ? <p className="text-xs text-muted">Fill in stop details</p>
            : null
          }
        </div>
        {total > 1 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 rounded flex-shrink-0">
            Remove
          </button>
        )}
        <span className={`text-xl font-bold flex-shrink-0 ml-1 ${stop.collapsed ? "text-muted" : "text-accent"}`}>
          {stop.collapsed ? "›" : "⌄"}
        </span>
      </div>

      {/* Stop body */}
      {!stop.collapsed && (
        <div className="px-4 py-5 space-y-5 border-t border-border">

          {/* Stop type selector */}
          <div>
            <FieldLabel required>Stop type</FieldLabel>
            <div className="flex gap-3 mt-1">
              {STOP_TYPES.map(([v, l]) => (
                <button key={v} type="button" onClick={() => onChange({ type: v })}
                  className={
                    "flex-1 py-3 min-h-[48px] rounded-lg border text-sm font-semibold transition-colors " +
                    (stop.type === v
                      ? v === "collection"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-green-600 text-white border-green-600"
                      : "bg-white text-muted border-border hover:border-gray-400")
                  }>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Reference number — required for collection/delivery */}
          {needsRef && (
            <TextField
              label={stop.type === "collection" ? "Collection reference" : "Delivery reference"}
              required
              value={stop.referenceNumber}
              onChange={v => onChange({ referenceNumber: v })}
              placeholder={stop.type === "collection" ? "COL-2026-001" : "DEL-2026-001"}
              hint={stop.type === "collection"
                ? "Warehouse release number or booking ref. Driver shows this on arrival."
                : "Goods-in booking number or PO. Driver shows this to unload."} />
          )}

          {/* Quantity at this stop */}
          <div>
            <FieldLabel>Quantity at this stop</FieldLabel>
            <div className="flex gap-2 mt-1">
              <input
                className="input flex-1 font-mono"
                type="number" min="0" step="1"
                placeholder="0"
                value={stop.stopQuantity}
                onKeyDown={e => { if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === ".") e.preventDefault(); }}
                onChange={e => onChange({ stopQuantity: e.target.value })} />
              <div className="relative min-w-[11rem]">
                <select
                  className="input w-full appearance-none pr-8"
                  value={stop.stopQuantityUnit}
                  onChange={e => onChange({ stopQuantityUnit: e.target.value })}>
                  {LOAD_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="text-xs text-muted mt-1">How many items are being {stop.type === "collection" ? "collected" : "delivered"} at this stop specifically.</div>
          </div>

          {/* Equipment exchange / asset return */}
          <div>
            <FieldLabel>
              {stop.type === "collection" ? "Returning assets / empties at this stop" : "Equipment exchange at this stop"}
            </FieldLabel>
            <div className="text-xs text-muted mb-2">
              {stop.type === "collection"
                ? "E.g. empty pallets, cages or hired equipment being returned here — leave blank if nothing to return."
                : "Drop full units, collect empties — leave blank if no exchange."}
            </div>
            <div className="flex gap-2 items-end">
              {stop.type === "delivery" && (
                <div className="flex-1">
                  <FieldLabel>Drop (full)</FieldLabel>
                  <input
                    className="input w-full font-mono"
                    type="number" min="0" step="1"
                    placeholder="0"
                    value={stop.exchangeDropQty}
                    onKeyDown={e => { if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === ".") e.preventDefault(); }}
                    onChange={e => onChange({ exchangeDropQty: e.target.value })} />
                </div>
              )}
              <div className="flex-1">
                <FieldLabel>{stop.type === "collection" ? "Returning (qty)" : "Collect empties"}</FieldLabel>
                <input
                  className="input w-full font-mono"
                  type="number" min="0" step="1"
                  placeholder="0"
                  value={stop.exchangeCollectQty}
                  onKeyDown={e => { if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === ".") e.preventDefault(); }}
                  onChange={e => onChange({ exchangeCollectQty: e.target.value })} />
              </div>
              <div className="relative min-w-[10rem]">
                <FieldLabel>Unit</FieldLabel>
                <select
                  className="input w-full appearance-none pr-8"
                  value={stop.exchangeUnit}
                  onChange={e => onChange({ exchangeUnit: e.target.value })}>
                  {EXCHANGE_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <div className="pointer-events-none absolute bottom-0 right-3 flex items-center h-[42px]">
                  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Site name */}
          <TextField label="Site name" required
            value={stop.siteName} onChange={v => onChange({ siteName: v })}
            placeholder="Acme Warehouse — Unit 5" caseRule="proper_name" />

          {/* Address */}
          <TextField label="Address line 1" required
            value={stop.street} onChange={v => onChange({ street: v })}
            placeholder="Industrial Estate Road" caseRule="proper_name" />
          <TextField label="Address line 2"
            value={stop.addressLine2} onChange={v => onChange({ addressLine2: v })}
            placeholder="Business Park" caseRule="proper_name" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <TextField label="Town / city" required
                value={stop.town} onChange={v => onChange({ town: v })}
                placeholder="Birmingham" caseRule="proper_name" />
            </div>
            <div className="block">
              <FieldLabel required>{POSTCODE_META[stop.country]?.label ?? "Postcode"}</FieldLabel>
              <div className="flex gap-2 mt-1">
                <input
                  className="input flex-1"
                  type="text"
                  value={stop.postcode}
                  placeholder={POSTCODE_META[stop.country]?.placeholder ?? "Postcode"}
                  onChange={e => { onChange({ postcode: e.target.value.toUpperCase() }); setShowLookup(false); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handlePostcodeLookup(); } }}
                />
                <button
                  type="button"
                  onClick={handlePostcodeLookup}
                  disabled={lookupLoading || !stop.postcode.trim()}
                  className="btn btn-secondary px-3 text-xs font-semibold flex-shrink-0 disabled:opacity-40">
                  {lookupLoading ? "…" : "Find"}
                </button>
              </div>
              {showLookup && lookupResults.length > 0 && (
                <div className="mt-1 border border-border rounded-xl overflow-hidden shadow-md bg-white z-10 relative">
                  {lookupResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyLookupResult(r)}
                      className="w-full text-left px-3 py-2.5 text-xs hover:bg-blue-50 border-b border-border last:border-0 transition-colors">
                      <div className="font-semibold text-slate-800 truncate">{r.street || r.label}</div>
                      <div className="text-slate-400 truncate">{[r.town, r.county, r.postcode].filter(Boolean).join(", ")}</div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowLookup(false)}
                    className="w-full text-center px-3 py-2 text-xs text-slate-400 hover:bg-slate-50 transition-colors">
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField label="County / region"
              value={stop.countyRegion} onChange={v => onChange({ countyRegion: v })}
              placeholder="West Midlands" caseRule="proper_name" />
            <label className="block">
              <FieldLabel required>Country</FieldLabel>
              <div className="relative mt-1">
                <select
                  className="input w-full appearance-none pr-9"
                  value={stop.country}
                  onChange={e => onChange({ country: e.target.value })}>
                  {COUNTRIES.map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </label>
          </div>

          {/* Entrance pin */}
          <div>
            <FieldLabel required>Exact entrance pin — latitude / longitude</FieldLabel>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <FieldLabel>Latitude</FieldLabel>
                <input className="input font-mono" type="number" step="0.000001"
                  placeholder="e.g. 53.483959"
                  value={stop.lat}
                  onChange={e => onChange({ lat: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Longitude</FieldLabel>
                <input className="input font-mono" type="number" step="0.000001"
                  placeholder="e.g. -2.244644"
                  value={stop.lng}
                  onChange={e => onChange({ lng: e.target.value })} />
              </div>
            </div>

            {/* Always-visible operational warning */}
            <div className="flex items-start gap-2 mt-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300">
              <span className="text-amber-500 text-base leading-none mt-px flex-shrink-0">⚠</span>
              <p className="text-xs font-semibold text-amber-800 leading-snug">
                Must be the truck gate, not the building centre.
              </p>
            </div>

            {/* Expandable how-to */}
            <button
              type="button"
              onClick={() => setShowCoordHelp(o => !o)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors flex items-center gap-1">
              <span>{showCoordHelp ? "▾" : "▸"}</span>
              How to find coordinates
            </button>

            {showCoordHelp && (
              <ol className="mt-2 space-y-1 text-xs text-slate-600 border border-slate-200 rounded-lg px-4 py-3 bg-slate-50 list-decimal list-inside leading-relaxed">
                <li>Open{" "}
                  <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 underline hover:text-blue-800 font-semibold">
                    Google Maps ↗
                  </a>
                </li>
                <li>Find the collection or delivery site</li>
                <li>Zoom in to the <strong>exact truck entrance or gate</strong></li>
                <li>Right-click the entrance point</li>
                <li>Click the coordinates shown at the top of the menu — they will be copied automatically</li>
                <li>Paste them into the fields above</li>
              </ol>
            )}
          </div>

          {/* Entrance instructions */}
          <div>
            <FieldLabel required>Entrance instructions</FieldLabel>
            <textarea className="input mt-1 w-full" rows={3}
              placeholder={stop.type === "collection"
                ? "Enter via Gate B on the left. Intercom code 1234. Ask for goods-in."
                : "Goods-in via roller shutters at rear. Report to warehouse office first."}
              value={stop.navigationInstructions}
              onChange={e => onChange({ navigationInstructions: e.target.value })} />
            <div className="text-xs text-muted mt-1">Gate code, security procedure, which entrance to use.</div>
          </div>

          {/* Date + time window */}
          <TextField label={stop.type === "collection" ? "Collection date" : "Delivery date"} required
            type="date" value={stop.date} onChange={v => onChange({ date: v })} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TextField label="Earliest arrival" required
              type="time" value={stop.earliestArrivalTime} onChange={v => onChange({ earliestArrivalTime: v })} />
            <div>
              <TextField
                label={stop.type === "collection" ? "Collection time" : "Delivery time"}
                type="time"
                value={stop.bookedTime}
                onChange={v => onChange({ bookedTime: v })} />
              <div className="text-xs text-muted mt-1">Fixed appointment only — leave blank if open window.</div>
            </div>
            <TextField label="Latest arrival" required
              type="time" value={stop.latestArrivalTime} onChange={v => onChange({ latestArrivalTime: v })} />
          </div>

          {/* Service time */}
          <div>
            <FieldLabel required>Estimated {stop.type === "collection" ? "loading" : "unloading"} time</FieldLabel>
            <ServiceTimeChips value={stop.serviceTime} onChange={v => onChange({ serviceTime: v })} />
            {stop.serviceTime === "custom" && (() => {
              const totalMin = Math.max(0, parseInt(stop.serviceTimeCustom, 10) || 0);
              const hrs = Math.floor(totalMin / 60);
              const mins = totalMin % 60;
              return (
                <div className="flex items-end gap-3 mt-3">
                  <div>
                    <FieldLabel>Hours</FieldLabel>
                    <input
                      className="input w-24 text-center font-mono"
                      type="number" min="0" step="1"
                      value={hrs}
                      onKeyDown={e => { if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === ".") e.preventDefault(); }}
                      onChange={e => {
                        const h = Math.max(0, Math.floor(parseInt(e.target.value, 10) || 0));
                        onChange({ serviceTimeCustom: String(h * 60 + mins) });
                      }} />
                  </div>
                  <span className="text-sm text-muted pb-2.5 flex-shrink-0">hr</span>
                  <div>
                    <FieldLabel>Minutes</FieldLabel>
                    <input
                      className="input w-24 text-center font-mono"
                      type="number" min="0" max="59" step="1"
                      value={mins}
                      onKeyDown={e => { if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === ".") e.preventDefault(); }}
                      onChange={e => {
                        const m = Math.min(59, Math.max(0, Math.floor(parseInt(e.target.value, 10) || 0)));
                        onChange({ serviceTimeCustom: String(hrs * 60 + m) });
                      }} />
                  </div>
                  <span className="text-sm text-muted pb-2.5 flex-shrink-0">min</span>
                </div>
              );
            })()}
          </div>

          {/* Handling methods — per stop */}
          <div>
            <FieldLabel>{loadingLabel}</FieldLabel>
            <div className="mt-1">
              <MultiCheck options={HANDLING_METHODS} value={stop.handlingMethods}
                onChange={v => onChange({ handlingMethods: v })} />
            </div>
            {stop.handlingMethods.includes("other") && (
              <input
                className="input mt-2 w-full"
                type="text"
                placeholder="Describe the loading / unloading method"
                value={stop.handlingMethodOther}
                onChange={e => onChange({ handlingMethodOther: e.target.value })}
              />
            )}
          </div>

          {/* Access requirements — per stop */}
          <div>
            <FieldLabel>Site access requirements</FieldLabel>
            <div className="mt-1">
              <MultiCheck options={ACCESS_REQUIREMENTS} value={stop.accessRequirements}
                onChange={v => onChange({ accessRequirements: v })} />
            </div>
            {stop.accessRequirements.includes("height_restriction") && (
              <input className="input mt-2 max-w-xs" type="text" placeholder="Height restriction (e.g. 4.2m)"
                value={stop.heightRestrictionValue}
                onChange={e => onChange({ heightRestrictionValue: e.target.value })} />
            )}
            {stop.accessRequirements.includes("weight_restriction") && (
              <input className="input mt-2 max-w-xs" type="text" placeholder="Weight restriction (e.g. 7.5t)"
                value={stop.weightRestrictionValue}
                onChange={e => onChange({ weightRestrictionValue: e.target.value })} />
            )}
            {stop.accessRequirements.includes("length_restriction") && (
              <input className="input mt-2 max-w-xs" type="text" placeholder="Length restriction (e.g. 18m)"
                value={stop.lengthRestrictionValue}
                onChange={e => onChange({ lengthRestrictionValue: e.target.value })} />
            )}
          </div>

          {/* PPE requirements — per stop */}
          <div>
            <FieldLabel>PPE required at this site</FieldLabel>
            <div className="text-xs text-muted mb-2">Select everything the driver must wear on site.</div>
            <MultiCheck options={PPE_ITEMS} value={stop.ppeItems}
              onChange={v => onChange({ ppeItems: v })} />
          </div>

          {/* Load readiness — collection stops only */}
          {stop.type === "collection" && (
            <div>
              <FieldLabel>Will the load be ready?</FieldLabel>
              <div className="mt-1">
                <Chips options={LOAD_READINESS} value={stop.loadReadiness}
                  onChange={v => onChange({ loadReadiness: v })} />
              </div>
            </div>
          )}

          {/* Stop notes */}
          <div>
            <FieldLabel>Stop notes</FieldLabel>
            <textarea className="input mt-1 w-full" rows={2}
              placeholder={stop.type === "collection"
                ? "Only load the first 10 pallets — remaining 3 continue to next stop. Wait in cab until called."
                : "Offload to bay 4 only. Do not park in front of the red roller door — different tenant."}
              value={stop.stopNotes}
              onChange={e => onChange({ stopNotes: e.target.value })} />
            <div className="text-xs text-muted mt-1">Anything specific to this stop not covered by the fields above.</div>
          </div>

          {/* Optional fields */}
          {/* Booking required — always visible for delivery stops, hidden in optional for collection */}
          {stop.type === "delivery" && (
            <div className="space-y-3">
              <Toggle value={stop.bookingRequired} onChange={v => onChange({ bookingRequired: v })}
                label="Booking / goods-in slot required before arrival" />
              {stop.bookingRequired && (
                <TextField label="Booking reference" value={stop.bookingRef}
                  onChange={v => onChange({ bookingRef: v })} placeholder="BKG-2026-5678" />
              )}
            </div>
          )}

          <OptionalToggle open={stop.showOptional}
            onToggle={() => onChange({ showOptional: !stop.showOptional })}
            label={stop.type === "delivery" ? "site contact, opening hours & proof" : "site contact, opening hours, booking & proof"} />

          {stop.showOptional && (
            <div className="space-y-4 border-l-2 border-blue-100 pl-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextField label="Site contact name"  value={stop.contactName}
                  onChange={v => onChange({ contactName: v })} />
                <TextField label="Site contact phone" type="tel" value={stop.contactPhone}
                  onChange={v => onChange({ contactPhone: v })} />
                <TextField label="Site contact email" type="email" value={stop.contactEmail}
                  onChange={v => onChange({ contactEmail: v })} />
              </div>
              {/* Booking for collection stops stays in optional */}
              {stop.type === "collection" && (
                <>
                  <Toggle value={stop.bookingRequired} onChange={v => onChange({ bookingRequired: v })}
                    label="Booking required before arrival" />
                  {stop.bookingRequired && (
                    <TextField label="Booking reference" value={stop.bookingRef}
                      onChange={v => onChange({ bookingRef: v })} placeholder="BKG-2026-5678" />
                  )}
                </>
              )}
              <TextField label="Opening hours" value={stop.openingHours}
                onChange={v => onChange({ openingHours: v })} placeholder="Mon–Fri 06:00–18:00" />

              {/* Proof requirements */}
              <div>
                <FieldLabel>Proof required at this stop</FieldLabel>
                <div className="mt-1">
                  <MultiCheck options={PROOF_REQUIREMENTS} value={stop.proofRequirements}
                    onChange={v => onChange({ proofRequirements: v })} />
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PublicRequestForm() {
  const { token } = useParams<{ token: string }>();
  const [linkInfo,   setLinkInfo]   = useState<PublicLinkInfo | null>(null);
  const [linkError,  setLinkError]  = useState("");
  const [submitted,  setSubmitted]  = useState(false);
  const [warnings,   setWarnings]   = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors,     setErrors]     = useState<string[]>([]);

  // Section collapse
  const [s1, setS1] = useState(true);
  const [s2, setS2] = useState(true);
  const [s3, setS3] = useState(true);
  const [s4, setS4] = useState(true);
  const [s5, setS5] = useState(true);
  const [s6, setS6] = useState(true);

  // ── Sec 1: Requester ──────────────────────────────────────────────────────
  const [customerCompanyName, setCustomerCompanyName] = useState("");
  const [contactName,  setContactName]  = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [showRequesterOpts, setShowRequesterOpts] = useState(false);
  const [customerRef, setCustomerRef] = useState("");

  // ── Sec 2: Stops ──────────────────────────────────────────────────────────
  // Start with one blank collection stop; user adds more via "+ Add stop"
  const [stops, setStops] = useState<StopState[]>([
    blankStop("collection"),
  ]);
  const updStop = (id: string, patch: Partial<StopState>) =>
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeStop = (id: string) =>
    setStops(prev => prev.filter(s => s.id !== id));

  // ── Declaration ───────────────────────────────────────────────────────────
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  // ── Sec 3: Load ───────────────────────────────────────────────────────────
  const [goodsType,               setGoodsType]               = useState("");
  const [goodsTypeOther,          setGoodsTypeOther]          = useState("");
  const [goodsDesc,               setGoodsDesc]               = useState("");
  const [quantity,                setQuantity]                = useState("");
  const [unit,                    setUnit]                    = useState("pallets");
  const [otherUnit,               setOtherUnit]               = useState("");
  const [estWeight,               setEstWeight]               = useState("");
  // Pallets
  const [palletCount,             setPalletCount]             = useState("");
  const [palletType,              setPalletType]              = useState("");
  const [palletTypeOther,         setPalletTypeOther]         = useState("");
  const [stackable,               setStackable]               = useState(false);
  // Roll cages / yorks
  const [cageCount,               setCageCount]               = useState("");
  const [cageFolded,              setCageFolded]              = useState(false);
  // Building materials
  const [buildingMaterialType,          setBuildingMaterialType]          = useState("");
  const [buildingMaterialPalletised,    setBuildingMaterialPalletised]    = useState(false);
  const [buildingMaterialLongestItem,   setBuildingMaterialLongestItem]   = useState("");
  const [buildingMaterialWeatherSensitive, setBuildingMaterialWeatherSensitive] = useState(false);
  // Liquid / tanker
  const [liquidProductType,       setLiquidProductType]       = useState("");
  const [liquidVolumeLitres,      setLiquidVolumeLitres]      = useState("");
  const [liquidFoodGrade,         setLiquidFoodGrade]         = useState(false);
  // General
  const [generalPackagingType,    setGeneralPackagingType]    = useState("");
  const [generalPieceCount,       setGeneralPieceCount]       = useState("");
  // All types — load height
  const [loadHeight,              setLoadHeight]              = useState("");
  // Machinery
  const [dimensions,              setDimensions]              = useState("");
  const [machineryPieceWeight,    setMachineryPieceWeight]    = useState("");
  const [machineryLiftingPoints,  setMachineryLiftingPoints]  = useState(false);
  const [machinerySkidMounted,    setMachinerySkidMounted]    = useState(false);
  const [craneRequired,           setCraneRequired]           = useState(false);
  // Steel
  const [steelPieceCount,         setSteelPieceCount]         = useState("");
  const [steelWidth,              setSteelWidth]              = useState("");
  // Bulk
  const [tippingReq,              setTippingReq]              = useState(false);
  const [tempType,                setTempType]                = useState("");
  // Food
  const [tempRange,               setTempRange]               = useState("");
  const [foodPreCooled,           setFoodPreCooled]           = useState(false);
  // Vehicles
  const [vehicleCount,            setVehicleCount]            = useState("");
  const [vehicleMakeModel,        setVehicleMakeModel]        = useState("");
  const [vehicleKeysWithVehicle,  setVehicleKeysWithVehicle]  = useState(false);
  const [driveable,               setDriveable]               = useState(false);
  // Containers
  const [containerSize,           setContainerSize]           = useState("");
  const [containerSizeOther,      setContainerSizeOther]      = useState("");
  const [loadedOrEmpty,           setLoadedOrEmpty]           = useState("");
  const [containerNum,            setContainerNum]            = useState("");
  // General
  const [loadNotes,               setLoadNotes]               = useState("");
  const [canSplitShipment,        setCanSplitShipment]        = useState("must_stay_together");
  const [securingRequirements,    setSecuringRequirements]    = useState<string[]>([]);

  // ── Sec 4: Special requirements ───────────────────────────────────────────
  const [specialItems,                 setSpecialItems]                 = useState<string[]>([]);
  const [adrClass,                     setAdrClass]                     = useState("");
  const [unNumber,                     setUnNumber]                     = useState("");
  const [packingGroup,                 setPackingGroup]                 = useState("");
  const [hazardousQuantityKg,          setHazardousQuantityKg]          = useState("");
  const [hazardousPaperworkAvailable,  setHazardousPaperworkAvailable]  = useState(false);
  const [oversizedWidth,               setOversizedWidth]               = useState("");
  const [oversizedHeight,              setOversizedHeight]              = useState("");
  const [oversizedLength,              setOversizedLength]              = useState("");

  // ── Sec 5: Transport ──────────────────────────────────────────────────────
  const [plannerDecides,  setPlannerDecides]  = useState(true);
  // Advanced transport (only when plannerDecides=false)
  const [reqBodyCategory,     setReqBodyCategory]     = useState("");
  const [reqBodyTypes,        setReqBodyTypes]        = useState<string[]>([]);
  const [reqEquipment,        setReqEquipment]        = useState<string[]>([]);
  const [trailerTypesAllowed, setTrailerTypesAllowed] = useState<string[]>([]);

  // ── Sec 6: Billing ────────────────────────────────────────────────────────
  const [declaredValue,   setDeclaredValue]   = useState("");
  const [poNumber,        setPoNumber]        = useState("");
  const [billingRef,      setBillingRef]      = useState("");

  // ── Notes for planner (in Section 1 optional) ────────────────────────────
  const [customerNotes,       setCustomerNotes]       = useState("");

  // ── Return / exception policy ─────────────────────────────────────────────
  const [showExceptionPolicy, setShowExceptionPolicy] = useState(false);

  // Exception policy state
  const [rejectionAction,                setRejectionAction]                = useState("");
  const [alternativeReturnSiteName,      setAlternativeReturnSiteName]      = useState("");
  const [alternativeReturnAddress,       setAlternativeReturnAddress]       = useState("");
  const [alternativeReturnAddressLine2,  setAlternativeReturnAddressLine2]  = useState("");
  const [alternativeReturnTown,          setAlternativeReturnTown]          = useState("");
  const [alternativeReturnCounty,        setAlternativeReturnCounty]        = useState("");
  const [alternativeReturnPostcode,      setAlternativeReturnPostcode]      = useState("");
  const [alternativeReturnCountry,       setAlternativeReturnCountry]       = useState("GB");
  const [alternativeReturnLat,           setAlternativeReturnLat]           = useState("");
  const [alternativeReturnLng,           setAlternativeReturnLng]           = useState("");
  const [alternativeReturnNavInstructions, setAlternativeReturnNavInstructions] = useState("");
  const [alternativeReturnContactName,   setAlternativeReturnContactName]   = useState("");
  const [alternativeReturnContactPhone,  setAlternativeReturnContactPhone]  = useState("");
  const [approvalContactName,            setApprovalContactName]            = useState("");
  const [approvalContactPhone,           setApprovalContactPhone]           = useState("");
  const [photosRequiredOnRejection,      setPhotosRequiredOnRejection]      = useState(false);
  const [rejectionSignatureRequired,     setRejectionSignatureRequired]     = useState(false);
  const [rejectionNotes,                 setRejectionNotes]                 = useState("");

  // ── Completeness ──────────────────────────────────────────────────────────
  const sec1Complete = !!(customerCompanyName.trim() && contactName.trim() && contactPhone.trim() && contactEmail.trim());
  const sec2Complete = stops.length > 0 && stops.every(stopComplete) &&
    stops.some(s => s.type === "collection") && stops.some(s => s.type === "delivery");
  const sec3Complete = !!(goodsType && goodsDesc.trim().length >= 15 && quantity && unit && parseFloat(estWeight) > 0);
  const sec4Complete = true; // optional section
  const sec5Complete = true; // optional
  const sec6Complete = !!(parseFloat(declaredValue) > 0);

  const sec1Started = !!(customerCompanyName || contactName);
  const sec2Started = stops.some(stopStarted);
  const sec3Started = !!(goodsType || goodsDesc);

  const collectionCount = stops.filter(s => s.type === "collection").length;
  const deliveryCount   = stops.filter(s => s.type === "delivery").length;
  const sec2Summary = [
    collectionCount > 0 && `${collectionCount} collection${collectionCount > 1 ? "s" : ""}`,
    deliveryCount   > 0 && `${deliveryCount} deliver${deliveryCount > 1 ? "ies" : "y"}`,
  ].filter(Boolean).join(", ");

  const requiredSectionsComplete = [sec1Complete, sec2Complete, sec3Complete, sec6Complete].filter(Boolean).length;
  const allRequiredComplete = requiredSectionsComplete === 4 && declarationAccepted;

  // ── Link load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    jobRequestsPublicApi.getLinkInfo(token)
      .then(info => {
        setLinkInfo(info);
        if (info.customerName)  setCustomerCompanyName(info.customerName);
        if (info.contactName)   setContactName(info.contactName);
        if (info.contactEmail)  setContactEmail(info.contactEmail);
        if (info.contactPhone)  setContactPhone(info.contactPhone);
      })
      .catch(() => setLinkError("This request link is not valid or has expired."));
  }, [token]);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);

    // Build exception policy data if section is open or has any values
    const hasExceptionPolicy = !!(
      rejectionAction || alternativeReturnAddress || approvalContactName ||
      photosRequiredOnRejection || rejectionSignatureRequired || rejectionNotes
    );

    const body: SubmitRequestBody = {
      requesterData: {
        customerCompanyName: customerCompanyName.trim(),
        contactName:         contactName.trim(),
        contactPhone:        contactPhone.trim(),
        contactEmail:        contactEmail.trim(),
        customerRef:         customerRef.trim() || undefined,
      },
      stops: stops.map((s, i) => stopToRequestStop(s, i + 1)),
      loadData: {
        goodsType:            goodsType === "other" ? "other" : goodsType,
        goodsTypeOther:       goodsType === "other" ? goodsTypeOther.trim() || undefined : undefined,
        goodsDescription:     goodsDesc.trim(),
        quantity:             parseFloat(quantity),
        unit:                 unit === "other" ? (otherUnit.trim() || "other") : unit,
        estimatedWeight:      estWeight     ? parseFloat(estWeight)     : undefined,
        palletCount:          palletCount   ? parseInt(palletCount, 10) : undefined,
        palletType:           palletType    || undefined,
        palletTypeOther:      palletType === "other" ? palletTypeOther.trim() || undefined : undefined,
        stackable:            stackable     || undefined,
        cageCount:            cageCount     ? parseInt(cageCount, 10)  : undefined,
        cageFolded:           cageFolded    || undefined,
        buildingMaterialType:            buildingMaterialType            || undefined,
        buildingMaterialPalletised:      buildingMaterialPalletised      || undefined,
        buildingMaterialLongestItem:     buildingMaterialLongestItem.trim() || undefined,
        buildingMaterialWeatherSensitive: buildingMaterialWeatherSensitive || undefined,
        liquidProductType:    liquidProductType.trim() || undefined,
        liquidVolumeLitres:   liquidVolumeLitres ? parseFloat(liquidVolumeLitres) : undefined,
        liquidFoodGrade:      liquidFoodGrade           || undefined,
        generalPackagingType: generalPackagingType      || undefined,
        generalPieceCount:    generalPieceCount ? parseInt(generalPieceCount, 10) : undefined,
        loadHeight:           loadHeight.trim()          || undefined,
        dimensions:           dimensions.trim()    || undefined,
        machineryPieceWeight: machineryPieceWeight ? parseFloat(machineryPieceWeight) : undefined,
        machineryLiftingPoints: machineryLiftingPoints || undefined,
        machinerySkidMounted: machinerySkidMounted  || undefined,
        craneRequired:        craneRequired  || undefined,
        steelPieceCount:      steelPieceCount ? parseInt(steelPieceCount, 10) : undefined,
        steelWidth:           steelWidth.trim()    || undefined,
        tippingRequired:      tippingReq     || undefined,
        temperatureRange:     tempRange.trim()     || undefined,
        chilledFrozenAmbient: tempType        || undefined,
        foodPreCooled:        foodPreCooled   || undefined,
        vehicleCount:         vehicleCount  ? parseInt(vehicleCount, 10)  : undefined,
        vehicleMakeModel:     vehicleMakeModel.trim()  || undefined,
        vehicleKeysWithVehicle: vehicleKeysWithVehicle || undefined,
        driveable:            driveable      || undefined,
        containerSize:        containerSize  || undefined,
        containerSizeOther:   containerSize === "other" ? containerSizeOther.trim() || undefined : undefined,
        loadedOrEmpty:        loadedOrEmpty  || undefined,
        containerNumber:      containerNum.trim()   || undefined,
        loadNotes:            loadNotes.trim()      || undefined,
        canSplitShipment:     canSplitShipment      || undefined,
        securingRequirements: securingRequirements.length ? securingRequirements : undefined,
      },
      specialRequirementsData: specialItems.length ? {
        items:                      specialItems,
        adrClass:                   adrClass.trim()       || undefined,
        unNumber:                   unNumber.trim()        || undefined,
        packingGroup:               packingGroup.trim()    || undefined,
        hazardousQuantityKg:        hazardousQuantityKg ? parseFloat(hazardousQuantityKg) : undefined,
        hazardousPaperworkAvailable: hazardousPaperworkAvailable || undefined,
        oversizedWidth:             oversizedWidth.trim()  || undefined,
        oversizedHeight:            oversizedHeight.trim() || undefined,
        oversizedLength:            oversizedLength.trim() || undefined,
      } : undefined,
      transportRequirementsData: {
        plannerDecides,
        reqBodyCategory:     plannerDecides ? undefined : reqBodyCategory || undefined,
        reqBodyTypes:        plannerDecides ? undefined : reqBodyTypes.length ? reqBodyTypes : undefined,
        reqEquipment:        plannerDecides ? undefined : reqEquipment.length ? reqEquipment : undefined,
        trailerTypesAllowed: plannerDecides ? undefined : trailerTypesAllowed.length ? trailerTypesAllowed : undefined,
      },
      billingData: {
        declaredGoodsValue:  declaredValue ? parseFloat(declaredValue) : undefined,
        purchaseOrderNumber: poNumber.trim()   || undefined,
        billingReference:    billingRef.trim() || undefined,
      },
      notesData: customerNotes.trim() ? {
        customerNotes: customerNotes.trim(),
      } : undefined,
      exceptionPolicyData: hasExceptionPolicy ? {
        rejectionAction:               rejectionAction               || undefined,
        alternativeReturnSiteName:     alternativeReturnSiteName.trim()     || undefined,
        alternativeReturnAddress:      alternativeReturnAddress.trim()      || undefined,
        alternativeReturnAddressLine2: alternativeReturnAddressLine2.trim() || undefined,
        alternativeReturnTown:         alternativeReturnTown.trim()         || undefined,
        alternativeReturnCounty:       alternativeReturnCounty.trim()       || undefined,
        alternativeReturnPostcode:     alternativeReturnPostcode.trim()     || undefined,
        alternativeReturnCountry:      alternativeReturnCountry             || undefined,
        alternativeReturnLat:          alternativeReturnLat  ? parseFloat(alternativeReturnLat)  : undefined,
        alternativeReturnLng:          alternativeReturnLng  ? parseFloat(alternativeReturnLng)  : undefined,
        alternativeReturnNavigationInstructions: alternativeReturnNavInstructions.trim() || undefined,
        alternativeReturnContactName:  alternativeReturnContactName.trim()  || undefined,
        alternativeReturnContactPhone: alternativeReturnContactPhone.trim() || undefined,
        approvalContactName:           approvalContactName.trim()           || undefined,
        approvalContactPhone:          approvalContactPhone.trim()          || undefined,
        photosRequiredOnRejection:     photosRequiredOnRejection            || undefined,
        rejectionSignatureRequired:    rejectionSignatureRequired           || undefined,
        rejectionNotes:                rejectionNotes.trim()                || undefined,
      } : undefined,
    };

    setSubmitting(true);
    try {
      const result = await jobRequestsPublicApi.submit(token!, body);
      setWarnings(result.warnings ?? []);
      setSubmitted(true);
    } catch (err: any) {
      setErrors(err.errors ?? [err.message ?? "Submission failed. Please try again."]);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Special states ────────────────────────────────────────────────────────

  if (linkError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
        <div className="card p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-black text-primary mb-2">Link not available</h1>
          <p className="text-sm text-muted">{linkError}</p>
        </div>
      </div>
    );
  }
  if (!linkInfo) {
    return <div className="min-h-screen flex items-center justify-center bg-surface"><div className="text-sm text-muted animate-pulse">Loading…</div></div>;
  }
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
        <div className="card p-8 text-center max-w-lg">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-black text-primary mb-3">Request submitted</h1>
          <p className="text-base text-secondary mb-4">
            Your transport request has been submitted to <strong>{linkInfo.companyName}</strong>.
            The team will review it and be in touch if anything is needed.
          </p>
          {warnings.length > 0 && (
            <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-left text-sm space-y-1">
              <div className="font-semibold text-amber-800 mb-1">⚠ Notes on your submission:</div>
              {warnings.map((w, i) => <div key={i} className="text-amber-700">• {w}</div>)}
            </div>
          )}
          <button type="button" className="btn btn-primary mt-6"
            onClick={() => { setSubmitted(false); setErrors([]); }}>
            Submit another request
          </button>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface">

      {/* Page header */}
      <div className="bg-white border-b border-border px-4 py-5 text-center shadow-sm">
        <div className="text-xs font-bold uppercase tracking-widest text-accent mb-1">Transport Request</div>
        <h1 className="text-xl font-black text-primary">{linkInfo.companyName}</h1>
        <p className="text-sm text-muted mt-1">Fill in the required sections then submit.</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {errors.length > 0 && (
          <div className="card border-red-200 p-4">
            <div className="font-semibold text-red-800 mb-2 text-sm">Please fix the following before submitting:</div>
            {errors.map((e, i) => <div key={i} className="text-sm text-red-700">• {e}</div>)}
          </div>
        )}

        {/* ── Declaration ─────────────────────────────────────────────────── */}
        <div className={`card p-5 border-2 transition-colors ${declarationAccepted ? "border-green-400 bg-green-50/30" : "border-amber-300 bg-amber-50/40"}`}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 w-5 h-5 flex-shrink-0 cursor-pointer accent-blue-600"
              checked={declarationAccepted}
              onChange={e => setDeclarationAccepted(e.target.checked)} />
            <div>
              <p className="text-sm font-semibold text-primary leading-snug">
                I confirm the goods description is accurate and complete.
              </p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Providing false or incomplete information may result in the job being refused, vehicle damage, or legal liability.
              </p>
            </div>
          </label>
        </div>

        {/* ── Sec 1: Your details ──────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={1} icon="👤" title="Your details" subtitle="Company and contact information"
            active collapsed={s1} onToggle={() => setS1(o => !o)}
            complete={sec1Complete} started={sec1Started}
            summary={customerCompanyName || contactName} />
          {!s1 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <TextField label="Company / organisation name" required
                value={customerCompanyName} onChange={setCustomerCompanyName}
                placeholder="Acme Distribution Ltd" caseRule="proper_name" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="Contact name" required
                  value={contactName} onChange={setContactName}
                  placeholder="Jane Smith" caseRule="proper_name" />
                <TextField label="Contact phone" required type="tel"
                  value={contactPhone} onChange={setContactPhone}
                  placeholder="+44 7700 900123" />
              </div>
              <TextField label="Contact email" required type="email"
                value={contactEmail} onChange={setContactEmail}
                placeholder="jane@acme.com" />

              <OptionalToggle open={showRequesterOpts} onToggle={() => setShowRequesterOpts(o => !o)}
                label="reference & notes for the planner" />
              {showRequesterOpts && (
                <div className="space-y-4 border-l-2 border-blue-100 pl-4">
                  <TextField label="Your internal reference / order number" value={customerRef}
                    onChange={setCustomerRef} placeholder="ORD-2026-1234"
                    hint="Your own reference number for this job, if you have one." />
                  <div>
                    <FieldLabel>Notes for the planner</FieldLabel>
                    <textarea className="input mt-1 w-full" rows={3}
                      value={customerNotes} onChange={e => setCustomerNotes(e.target.value)}
                      placeholder="Please confirm the delivery window the day before. Contact Jane if anything changes — not the warehouse." />
                    <div className="text-xs text-muted mt-1">Anything the planner needs to know that isn't covered by the form above.</div>
                  </div>
                </div>
              )}
              <SectionFooter complete={sec1Complete} label="Your details" onCollapse={() => setS1(true)} />
            </div>
          )}
        </div>

        {/* ── Sec 2: Collection & delivery stops ───────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={2} icon="🗺️"
            title={sec2Summary ? `Stops — ${sec2Summary}` : "Collection & delivery stops"}
            subtitle="Where to collect from and deliver to"
            active collapsed={s2} onToggle={() => setS2(o => !o)}
            complete={sec2Complete} started={sec2Started}
            summary={sec2Summary || undefined} />
          {!s2 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              {stops.map((stop, idx) => (
                <StopCard key={stop.id} stop={stop} index={idx} total={stops.length}
                  onChange={patch => updStop(stop.id, patch)}
                  onRemove={() => removeStop(stop.id)} />
              ))}

              {/* Add stop — user picks type in the new card */}
              <button type="button"
                onClick={() => setStops(prev => [...prev, blankStop("collection")])}
                className="w-full py-3 border-2 border-dashed border-border rounded-xl text-sm font-semibold text-muted hover:border-accent hover:text-accent transition-colors">
                + Add another stop
              </button>

              {!sec2Complete && sec2Started && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {!stops.some(s => s.type === "collection") && "⚠ Add at least one collection stop. "}
                  {!stops.some(s => s.type === "delivery")   && "⚠ Add at least one delivery stop."}
                </div>
              )}

              <SectionFooter complete={sec2Complete} label="Stops" onCollapse={() => setS2(true)} />
            </div>
          )}
        </div>

        {/* ── Sec 3: Load ──────────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={3} icon="🏗️" title="Load details" subtitle="What is being transported"
            active collapsed={s3} onToggle={() => setS3(o => !o)}
            complete={sec3Complete} started={sec3Started}
            summary={goodsType
              ? `${LOAD_TYPES.find(([v]) => v === goodsType)?.[1] ?? goodsType}${goodsDesc ? ` · ${goodsDesc.slice(0, 30)}` : ""}`
              : undefined} />
          {!s3 && (
            <div className="px-5 pt-5 pb-4 space-y-5">

              {/* What are you moving? */}
              <div>
                <FieldLabel required>What are you moving?</FieldLabel>
                <div className="mt-1">
                  <Chips options={LOAD_TYPES} value={goodsType} onChange={setGoodsType} />
                </div>
                {goodsType === "other" && (
                  <input className="input mt-2 w-full" type="text"
                    placeholder="Describe what you are moving"
                    value={goodsTypeOther} onChange={e => setGoodsTypeOther(e.target.value)} />
                )}
              </div>

              {/* Description */}
              <div>
                <FieldLabel required>Description of goods</FieldLabel>
                <textarea className="input mt-1 w-full" rows={2}
                  value={goodsDesc} onChange={e => setGoodsDesc(e.target.value)}
                  placeholder={goodsType === "pallets"       ? "Engine parts on euro pallets, double-stacked" :
                                goodsType === "bulk_material" ? "Type 1 MOT crushed limestone, dry, loose" :
                                goodsType === "steel_long"    ? "25m galvanised RSJ beams, 6 pieces, 3.8t each" :
                                goodsType === "machinery"     ? "CNC milling machine, 4.2t, skid-mounted, no lifting points" :
                                goodsType === "vehicles"      ? "2019 Ford Transit Custom, white, running, keys with vehicle" :
                                "Describe exactly what is being transported — be specific"} />
                <div className={`text-xs mt-1 ${goodsDesc.trim().length >= 15 ? "text-muted" : "text-amber-600 font-medium"}`}>
                  {goodsDesc.trim().length} / 15 characters minimum
                </div>
              </div>

              {/* Quantity + unit */}
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Quantity" required type="number" min="0" step="1" value={quantity}
                  onChange={setQuantity} placeholder="24" />
                <div>
                  <FieldLabel required>Unit</FieldLabel>
                  <select className="input mt-1 w-full" value={unit} onChange={e => setUnit(e.target.value)}>
                    {LOAD_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              {unit === "other" && (
                <TextField label="Describe unit" value={otherUnit} onChange={setOtherUnit} placeholder="e.g. rolls" />
              )}

              {/* Estimated weight — required */}
              <TextField label="Estimated total weight (kg)" required type="number" min="0" step="1"
                value={estWeight} onChange={setEstWeight} placeholder="14000"
                hint="Approximate is fine, but do not leave blank." />

              {/* Overall load height — all types */}
              <TextField label="Overall load height (m)" type="number" min="0"
                value={loadHeight} onChange={setLoadHeight} placeholder="2.4"
                hint="Helps the planner choose the right trailer. Leave blank if unsure." />

              {/* ── Conditional: Pallets ── */}
              {goodsType === "pallets" && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Pallet count" type="number" min="0" step="1" value={palletCount}
                      onChange={setPalletCount} placeholder="24" />
                    <div>
                      <FieldLabel>Pallet type</FieldLabel>
                      <select className="input mt-1 w-full" value={palletType} onChange={e => setPalletType(e.target.value)}>
                        <option value="">Not specified</option>
                        <option value="euro">Euro pallets (800×1200mm)</option>
                        <option value="uk">UK pallets (1000×1200mm)</option>
                        <option value="half">Half pallets</option>
                        <option value="chep">CHEP pallets</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  {palletType === "other" && (
                    <input className="input w-full" type="text"
                      placeholder="Describe pallet type"
                      value={palletTypeOther} onChange={e => setPalletTypeOther(e.target.value)} />
                  )}
                  <Toggle value={stackable} onChange={setStackable} label="Pallets are stackable" />
                </div>
              )}

              {/* ── Conditional: Roll cages / yorks ── */}
              {goodsType === "roll_cages" && (
                <div className="space-y-4 pt-1">
                  <TextField label="Number of cages" type="number" min="0" step="1"
                    value={cageCount} onChange={setCageCount} placeholder="48"
                    hint="If different from the total quantity above." />
                  <Toggle value={cageFolded} onChange={setCageFolded}
                    label="Cages are folded / nested (not assembled)" />
                </div>
              )}

              {/* ── Conditional: Building materials ── */}
              {goodsType === "building_materials" && (
                <div className="space-y-4 pt-1">
                  <div>
                    <FieldLabel>Material type</FieldLabel>
                    <div className="mt-1">
                      <Chips options={BUILDING_MATERIAL_TYPES} value={buildingMaterialType}
                        onChange={setBuildingMaterialType} />
                    </div>
                  </div>
                  <Toggle value={buildingMaterialPalletised} onChange={setBuildingMaterialPalletised}
                    label="Load is palletised (not loose)" />
                  <TextField label="Longest single item (m)" type="number" min="0"
                    value={buildingMaterialLongestItem} onChange={setBuildingMaterialLongestItem}
                    placeholder="6"
                    hint="Timber, pipes and sheet materials may overhang — enter the longest piece." />
                  <Toggle value={buildingMaterialWeatherSensitive} onChange={setBuildingMaterialWeatherSensitive}
                    label="Load is weather sensitive (needs sheeting / covered vehicle)" />
                </div>
              )}

              {/* ── Conditional: Liquid / tanker ── */}
              {goodsType === "liquid_bulk" && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <TextField label="Product" value={liquidProductType} onChange={setLiquidProductType}
                        placeholder="Vegetable oil, diesel, milk, wastewater…"
                        hint="Be specific — determines tanker certification and any ADR requirements." />
                    </div>
                    <TextField label="Volume (litres)" type="number" min="0" step="1"
                      value={liquidVolumeLitres} onChange={setLiquidVolumeLitres}
                      placeholder="24000"
                      hint="Total litres to load." />
                  </div>
                  <Toggle value={liquidFoodGrade} onChange={setLiquidFoodGrade}
                    label="Food-grade product (requires food-safe tanker)" />
                  <div className="text-xs text-muted bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    If the product is hazardous (fuel, chemicals, acids etc.) also complete Section 4 — Special requirements.
                  </div>
                </div>
              )}

              {/* ── Conditional: Machinery ── */}
              {goodsType === "machinery" && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TextField label="Dimensions (L × W × H)" value={dimensions}
                      onChange={setDimensions} placeholder="4.5m × 2.2m × 3.1m" />
                    <TextField label="Piece weight (kg)" type="number" min="0" step="1"
                      value={machineryPieceWeight} onChange={setMachineryPieceWeight}
                      placeholder="4200"
                      hint="Weight of one item — for crane and HIAB planning." />
                  </div>
                  <Toggle value={machineryLiftingPoints} onChange={setMachineryLiftingPoints}
                    label="Machine has lifting points / lifting eyes" />
                  <Toggle value={machinerySkidMounted} onChange={setMachinerySkidMounted}
                    label="Machine is skid-mounted" />
                  <Toggle value={craneRequired} onChange={setCraneRequired} label="Crane required on site" />
                </div>
              )}

              {/* ── Conditional: Bulk material ── */}
              {goodsType === "bulk_material" && (
                <div className="space-y-4 pt-1">
                  <Toggle value={tippingReq} onChange={setTippingReq} label="Tipping required at delivery" />
                  <div>
                    <FieldLabel>Wet or dry</FieldLabel>
                    <div className="mt-1">
                      <Chips options={WET_DRY_OPTIONS} value={tempType} onChange={setTempType} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Conditional: Steel/long loads ── */}
              {goodsType === "steel_long" && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Longest item (m)" type="number" min="0"
                      value={dimensions} onChange={setDimensions} placeholder="25" />
                    <TextField label="Number of pieces" type="number" min="0" step="1"
                      value={steelPieceCount} onChange={setSteelPieceCount} placeholder="6" />
                  </div>
                  <div>
                    <TextField label="Width of widest piece (m)"
                      value={steelWidth} onChange={setSteelWidth} placeholder="2.4" />
                    {steelWidth && parseFloat(steelWidth) > 2.9 && (
                      <div className="flex items-start gap-2 mt-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300">
                        <span className="text-amber-500 flex-shrink-0">⚠</span>
                        <p className="text-xs font-semibold text-amber-800">Over 2.9m — this may require an abnormal load permit. The planner will advise.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Conditional: Food/refrigerated ── */}
              {goodsType === "food_refrigerated" && (
                <div className="space-y-4 pt-1">
                  <div>
                    <FieldLabel>Chilled, frozen or ambient?</FieldLabel>
                    <div className="mt-1">
                      <Chips options={TEMP_TYPE_OPTIONS} value={tempType} onChange={setTempType} />
                    </div>
                  </div>
                  <TextField label="Required temperature range" value={tempRange}
                    onChange={setTempRange} placeholder="2°C – 8°C" />
                  <Toggle value={foodPreCooled} onChange={setFoodPreCooled}
                    label="Vehicle must be pre-cooled before arrival at collection" />
                  {foodPreCooled && (
                    <div className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      Pre-cooling takes 2–4 hours to arrange — we'll factor this into the plan.
                    </div>
                  )}
                </div>
              )}

              {/* ── Conditional: Vehicles ── */}
              {goodsType === "vehicles" && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <TextField label="Number of vehicles" type="number" min="0" step="1"
                      value={vehicleCount} onChange={setVehicleCount} placeholder="2" />
                    <div className="sm:col-span-2">
                      <TextField label="Make and model" value={vehicleMakeModel}
                        onChange={setVehicleMakeModel} placeholder="2019 Ford Transit Custom"
                        hint="Year, make and model helps us select the right transporter." />
                    </div>
                  </div>
                  <Toggle value={driveable} onChange={setDriveable} label="Vehicles are driveable (RORO)" />
                  <Toggle value={vehicleKeysWithVehicle} onChange={setVehicleKeysWithVehicle}
                    label="Keys will be with the vehicle" />
                </div>
              )}

              {/* ── Conditional: Containers ── */}
              {goodsType === "containers" && (
                <div className="space-y-4 pt-1">
                  <div>
                    <FieldLabel>Container size</FieldLabel>
                    <div className="flex gap-2 mt-1">
                      {[["20ft","20ft"],["40ft","40ft"],["45ft","45ft"],["other","Other"]].map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setContainerSize(v)}
                          className={"px-3 py-2 rounded-full border text-sm font-medium transition-colors " +
                            (containerSize === v ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
                          {l}
                        </button>
                      ))}
                    </div>
                    {containerSize === "other" && (
                      <input className="input mt-2 w-full" type="text"
                        placeholder="Describe container size"
                        value={containerSizeOther} onChange={e => setContainerSizeOther(e.target.value)} />
                    )}
                  </div>
                  <div>
                    <FieldLabel>Loaded or empty?</FieldLabel>
                    <div className="mt-1">
                      <Chips options={LOADED_EMPTY_OPTIONS} value={loadedOrEmpty} onChange={setLoadedOrEmpty} />
                    </div>
                  </div>
                  <TextField label="Container number (optional)" value={containerNum}
                    onChange={setContainerNum} placeholder="MSCU1234567" />
                </div>
              )}

              {/* ── Conditional: General goods ── */}
              {goodsType === "general" && (
                <div className="space-y-4 pt-1">
                  <div>
                    <FieldLabel>Packaging type</FieldLabel>
                    <div className="mt-1">
                      <Chips options={GENERAL_PACKAGING} value={generalPackagingType}
                        onChange={setGeneralPackagingType} />
                    </div>
                  </div>
                  <TextField label="Total number of pieces" type="number" min="0" step="1"
                    value={generalPieceCount} onChange={setGeneralPieceCount} placeholder="48"
                    hint="Used for manifest and driver count verification on delivery." />
                </div>
              )}

              {/* Can shipment be split */}
              <div>
                <FieldLabel>Can this shipment be split between vehicles?</FieldLabel>
                <div className="mt-1">
                  <Chips options={SPLIT_OPTIONS} value={canSplitShipment} onChange={setCanSplitShipment} />
                </div>
              </div>

              {/* Load securing requirements */}
              <div>
                <FieldLabel>Load securing requirements</FieldLabel>
                <div className="mt-1">
                  <MultiCheck options={SECURING_REQUIREMENTS} value={securingRequirements}
                    onChange={setSecuringRequirements} />
                </div>
              </div>

              {/* Load notes */}
              <div>
                <FieldLabel>Additional load notes</FieldLabel>
                <textarea className="input mt-1 w-full" rows={2}
                  value={loadNotes} onChange={e => setLoadNotes(e.target.value)}
                  placeholder="Stacked 3 high. Do not tip. Handle with care near top." />
              </div>

              <SectionFooter complete={sec3Complete} label="Load details" onCollapse={() => setS3(true)} />
            </div>
          )}
        </div>

        {/* ── Sec 4: Special requirements ──────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={4} icon="⚠️" title="Special requirements" subtitle="ADR, fragile, high value, oversized, secure transport"
            active collapsed={s4} onToggle={() => setS4(o => !o)}
            complete optional
            summary={specialItems.length > 0
              ? specialItems.map(i => SPECIAL_REQUIREMENTS.find(([v]) => v === i)?.[1]?.replace(/^.+\s/, "") ?? i).join(", ")
              : undefined} />
          {!s4 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <MultiCheck options={SPECIAL_REQUIREMENTS} value={specialItems} onChange={setSpecialItems} />

              {/* Conditional: dangerous goods */}
              {specialItems.includes("dangerous_goods") && (
                <div className="space-y-3 border-l-2 border-red-200 pl-4">
                  <TextField label="ADR class" value={adrClass} onChange={setAdrClass}
                    placeholder="Class 3 — Flammable liquids" />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="UN number" value={unNumber} onChange={setUnNumber}
                      placeholder="UN 1993" />
                    <TextField label="Packing group" value={packingGroup}
                      onChange={setPackingGroup} placeholder="I, II or III" />
                  </div>
                  <TextField label="Total hazardous quantity (kg or litres)" type="number" min="0"
                    value={hazardousQuantityKg} onChange={setHazardousQuantityKg}
                    placeholder="500"
                    hint="Used to determine LQ / EQ exemption thresholds." />
                  <Toggle value={hazardousPaperworkAvailable} onChange={setHazardousPaperworkAvailable}
                    label="Hazardous paperwork available / will be provided" />
                </div>
              )}

              {/* Conditional: oversized */}
              {specialItems.includes("oversized") && (
                <div className="space-y-3 border-l-2 border-amber-300 pl-4">
                  <div className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Overall dimensions including the load on the vehicle — not just the item itself. Width determines whether a permit is needed.
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <TextField label="Overall width (m)" type="number" min="0"
                      value={oversizedWidth} onChange={setOversizedWidth} placeholder="3.2" />
                    <TextField label="Overall height (m)" type="number" min="0"
                      value={oversizedHeight} onChange={setOversizedHeight} placeholder="4.8" />
                    <TextField label="Overall length (m)" type="number" min="0"
                      value={oversizedLength} onChange={setOversizedLength} placeholder="18.5" />
                  </div>
                  {oversizedWidth && parseFloat(oversizedWidth) > 2.5 && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300">
                      <span className="text-amber-500 flex-shrink-0">⚠</span>
                      <p className="text-xs font-semibold text-amber-800">Over 2.5m wide — likely requires an abnormal load permit. The planner will advise on routing and escort requirements.</p>
                    </div>
                  )}
                  {oversizedHeight && parseFloat(oversizedHeight) > 4.65 && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300">
                      <span className="text-amber-500 flex-shrink-0">⚠</span>
                      <p className="text-xs font-semibold text-amber-800">Over 4.65m high — route survey may be required for bridge and power line clearances.</p>
                    </div>
                  )}
                </div>
              )}

              <SectionFooter complete label="Special requirements" onCollapse={() => setS4(true)} />
            </div>
          )}
        </div>

        {/* ── Sec 5: Transport requirements ────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={5} icon="🚛" title="Transport requirements" subtitle="Vehicle and trailer preferences"
            active collapsed={s5} onToggle={() => setS5(o => !o)}
            complete optional
            summary={plannerDecides ? "Planner will decide" : (
              [
                BODY_CATEGORIES.find(c => c.value === reqBodyCategory)?.label,
                reqBodyTypes.map(t => BODY_TYPES.find(b => b.value === t)?.label).filter(Boolean).join(", "),
              ].filter(Boolean).join(" · ") || undefined
            )} />
          {!s5 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <Toggle value={plannerDecides} onChange={setPlannerDecides}
                label="Let the planner choose the best transport for this load" />
              {!plannerDecides && (
                <div className="space-y-4 border-l-2 border-blue-100 pl-4">
                  <div className="text-xs text-muted bg-blue-50 rounded-lg px-3 py-2">
                    Only fill this in if you know exactly what transport you need. Leave blank if unsure — the planner will decide.
                  </div>
                  <div>
                    <FieldLabel>Vehicle body category</FieldLabel>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {BODY_CATEGORIES.map(({ value, label }) => (
                        <button key={value} type="button"
                          onClick={() => { setReqBodyCategory(value); setReqBodyTypes([]); }}
                          className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors min-h-[40px] " +
                            (reqBodyCategory === value
                              ? "bg-accent text-white border-accent"
                              : "bg-white text-muted border-border hover:border-gray-400")}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {reqBodyCategory && (() => {
                    const allowed = new Set(REQ_BODY_TYPES_BY_CATEGORY[reqBodyCategory] ?? []);
                    const grouped: Record<string, { value: string; label: string }[]> = {};
                    BODY_TYPES.forEach(bt => {
                      if (!allowed.has(bt.value)) return;
                      if (!grouped[bt.group]) grouped[bt.group] = [];
                      grouped[bt.group].push({ value: bt.value, label: bt.label });
                    });
                    const groups = Object.keys(grouped);
                    function toggleType(v: string) {
                      setReqBodyTypes(prev =>
                        prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
                      );
                    }
                    return (
                      <div className="space-y-3">
                        <FieldLabel>Body type — select all that work</FieldLabel>
                        {groups.map(g => (
                          <div key={g}>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                              {BODY_TYPE_GROUP_LABELS[g] ?? g}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {grouped[g].map(bt => {
                                const on = reqBodyTypes.includes(bt.value);
                                return (
                                  <button key={bt.value} type="button" onClick={() => toggleType(bt.value)}
                                    className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors min-h-[40px] " +
                                      (on ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
                                    {bt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
              <SectionFooter complete label="Transport requirements" onCollapse={() => setS5(true)} />
            </div>
          )}
        </div>

        {/* ── Sec 6: Billing & insurance ───────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={6} icon="📄" title="Billing" subtitle="Declared goods value and reference numbers"
            active collapsed={s6} onToggle={() => setS6(o => !o)}
            complete={sec6Complete} started={!!declaredValue || !!poNumber}
            summary={declaredValue ? `£${declaredValue}${poNumber ? ` · PO: ${poNumber}` : ""}` : undefined} />
          {!s6 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <TextField label="Declared value of goods (£)" required type="number" min="0"
                value={declaredValue} onChange={setDeclaredValue} placeholder="0.00"
                hint="For insurance and liability purposes — not the transport price." />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="Purchase order number" value={poNumber}
                  onChange={setPoNumber} placeholder="PO-2026-12345"
                  hint="Required on your invoice by your finance team." />
                <TextField label="Billing reference / cost code" value={billingRef}
                  onChange={setBillingRef} placeholder="COST-CENTRE-123" />
              </div>
              <SectionFooter complete={sec6Complete} label="Billing" onCollapse={() => setS6(true)} />
            </div>
          )}
        </div>

        {/* ── Exception / return policy card ──────────────────────────────── */}
        <div className="card overflow-hidden">
          {/* Card header — always visible, click to expand/collapse */}
          <button
            type="button"
            onClick={() => setShowExceptionPolicy(o => !o)}
            className="w-full flex items-center gap-3 px-5 py-4 border-b border-border text-left hover:bg-slate-50/60 transition-colors">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 border ${showExceptionPolicy ? "bg-orange-50 border-orange-200" : "bg-white border-slate-200 shadow-sm"}`}>
              🔄
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-primary">Rejection &amp; return policy</h2>
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">optional</span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                {rejectionAction
                  ? REJECTION_ACTIONS.find(([v]) => v === rejectionAction)?.[1] ?? rejectionAction
                  : "What should the driver do if goods are refused or damaged?"}
              </p>
            </div>
            <span className={`text-xl font-bold flex-shrink-0 ml-1 transition-transform duration-200 ${showExceptionPolicy ? "text-accent" : "text-muted"}`}>
              {showExceptionPolicy ? "⌄" : "›"}
            </span>
          </button>

          {showExceptionPolicy && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <div className="text-xs text-slate-500 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 leading-relaxed">
                Fill this in so the planner and driver know exactly what to do without having to call you — saves time on the day.
              </div>

              <div>
                <FieldLabel>If delivery is rejected at the door, what should the driver do?</FieldLabel>
                <div className="mt-1">
                  <Chips options={REJECTION_ACTIONS} value={rejectionAction} onChange={setRejectionAction} />
                </div>
              </div>

              {rejectionAction === "deliver_to_alternative_address" && (
                <div className="space-y-3 border-l-2 border-orange-200 pl-4">
                  <TextField label="Site name" value={alternativeReturnSiteName}
                    onChange={setAlternativeReturnSiteName}
                    placeholder="Acme Returns Depot — Unit 3" caseRule="proper_name" />
                  <TextField label="Address line 1" value={alternativeReturnAddress}
                    onChange={setAlternativeReturnAddress}
                    placeholder="12 Warehouse Lane" caseRule="proper_name" />
                  <TextField label="Address line 2" value={alternativeReturnAddressLine2}
                    onChange={setAlternativeReturnAddressLine2}
                    placeholder="Industrial Estate" caseRule="proper_name" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <TextField label="Town / city" value={alternativeReturnTown}
                        onChange={setAlternativeReturnTown}
                        placeholder="Manchester" caseRule="proper_name" />
                    </div>
                    <label className="block">
                      <FieldLabel>{POSTCODE_META[alternativeReturnCountry]?.label ?? "Postcode"}</FieldLabel>
                      <input
                        className="input mt-1 w-full"
                        type="text"
                        value={alternativeReturnPostcode}
                        placeholder={POSTCODE_META[alternativeReturnCountry]?.placeholder ?? "Postcode"}
                        onChange={e => setAlternativeReturnPostcode(e.target.value.toUpperCase())}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TextField label="County / region" value={alternativeReturnCounty}
                      onChange={setAlternativeReturnCounty}
                      placeholder="Greater Manchester" caseRule="proper_name" />
                    <label className="block">
                      <FieldLabel>Country</FieldLabel>
                      <div className="relative mt-1">
                        <select
                          className="input w-full appearance-none pr-9"
                          value={alternativeReturnCountry}
                          onChange={e => setAlternativeReturnCountry(e.target.value)}>
                          {COUNTRIES.map(([code, name]) => (
                            <option key={code} value={code}>{name}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                          <svg className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </label>
                  </div>
                  {/* Entrance pin */}
                  <div>
                    <FieldLabel>Exact entrance pin — latitude / longitude</FieldLabel>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      <div>
                        <FieldLabel>Latitude</FieldLabel>
                        <input className="input font-mono" type="number" step="0.000001"
                          placeholder="e.g. 53.483959"
                          value={alternativeReturnLat}
                          onChange={e => setAlternativeReturnLat(e.target.value)} />
                      </div>
                      <div>
                        <FieldLabel>Longitude</FieldLabel>
                        <input className="input font-mono" type="number" step="0.000001"
                          placeholder="e.g. -2.244644"
                          value={alternativeReturnLng}
                          onChange={e => setAlternativeReturnLng(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex items-start gap-2 mt-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300">
                      <span className="text-amber-500 text-base leading-none mt-px flex-shrink-0">⚠</span>
                      <p className="text-xs font-semibold text-amber-800 leading-snug">Must be the truck gate, not the building centre.</p>
                    </div>
                  </div>

                  {/* Entrance instructions */}
                  <div>
                    <FieldLabel>Entrance instructions</FieldLabel>
                    <textarea className="input mt-1 w-full" rows={2}
                      placeholder="Enter via Gate B on the left. Intercom code 1234. Ask for goods-in."
                      value={alternativeReturnNavInstructions}
                      onChange={e => setAlternativeReturnNavInstructions(e.target.value)} />
                    <div className="text-xs text-muted mt-1">Gate code, security procedure, which entrance to use.</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TextField label="Contact name" value={alternativeReturnContactName}
                      onChange={setAlternativeReturnContactName} placeholder="Jane Smith" caseRule="proper_name" />
                    <TextField label="Contact phone" type="tel" value={alternativeReturnContactPhone}
                      onChange={setAlternativeReturnContactPhone} placeholder="+44 7700 900123" />
                  </div>
                </div>
              )}

              {rejectionAction === "call_office_before_leaving" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-l-2 border-orange-200 pl-4">
                  <TextField label="Approval contact name" value={approvalContactName}
                    onChange={setApprovalContactName} placeholder="Jane Smith" />
                  <TextField label="Approval contact phone" type="tel" value={approvalContactPhone}
                    onChange={setApprovalContactPhone} placeholder="+44 7700 900123" />
                </div>
              )}

              <Toggle value={photosRequiredOnRejection} onChange={setPhotosRequiredOnRejection}
                label="Photos required on rejection" />
              <Toggle value={rejectionSignatureRequired} onChange={setRejectionSignatureRequired}
                label="Rejection signature required" />

              <div>
                <FieldLabel>Additional rejection / return notes</FieldLabel>
                <textarea className="input mt-1 w-full" rows={2}
                  value={rejectionNotes} onChange={e => setRejectionNotes(e.target.value)}
                  placeholder="Do not leave goods unattended. Call depot before returning." />
              </div>
            </div>
          )}
        </div>

        {/* ── Submit bar ──────────────────────────────────────────────────── */}
        <div className="card px-5 py-4 flex items-center justify-between gap-4">
          <div className="text-sm text-muted">
            {requiredSectionsComplete} / 4 required sections complete
          </div>
          <button type="submit" disabled={submitting || !allRequiredComplete} className="btn btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? "Submitting…" : "Submit transport request →"}
          </button>
        </div>

      </form>
    </div>
  );
}

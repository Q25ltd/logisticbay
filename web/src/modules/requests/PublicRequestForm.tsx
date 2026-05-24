/**
 * Public transport request form.
 * Design: identical visual language to CreateJobPage.
 * Structure: requester → stops → load → special requirements → transport → billing → notes
 */

import { useState, useEffect }              from "react";
import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
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
import { LatLngInput } from "../jobs/SharedStopCard";

// ── Vehicle taxonomy helpers ──────────────────────────────────────────────────
// For tractor / drawbar the body type lives on the trailer, so show all trailer
// ── Validation helpers ────────────────────────────────────────────────────────

function validatePhone(value: string, country = "GB"): string {
  const v = value.trim();
  if (!v) return "";
  try {
    // International format (starts with +) — validate globally, ignore country
    if (v.startsWith("+")) {
      return isValidPhoneNumber(v) ? "" : "Phone number doesn't look valid — check the number and country code";
    }
    return isValidPhoneNumber(v, country as CountryCode)
      ? ""
      : "Phone number doesn't look valid for this country — include country code (+44…) if calling from abroad";
  } catch {
    return "Phone number doesn't look valid";
  }
}

function validateEmail(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "Email address doesn't look valid";
}

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
  ["pallets",      "Pallets"],
  ["roll_cages",   "Roll cages / yorks"],
  ["ldm",          "Loading metres (ldm)"],
  ["tonnes",       "Tonnes"],
  ["kg",           "Kilograms"],
  ["bags",         "Bags"],
  ["items",        "Items"],
  ["loads",        "Loads"],
  ["litres",       "Litres"],
  ["cubic_metres", "Cubic metres"],
  ["other",        "Other"],
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
  ["ppe_required",         "PPE required"],
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

const CONTAINER_ISO_TYPES: [string, string][] = [
  ["gp",    "GP — General purpose (dry)"],
  ["hc",    "HC — High cube"],
  ["rf",    "RF — Reefer / refrigerated"],
  ["ot",    "OT — Open top"],
  ["fr",    "FR — Flat rack"],
  ["tk",    "TK — Tank container"],
  ["other", "Other"],
];

const STGO_CATEGORIES: [string, string][] = [
  ["cat1", "Category 1 (up to 44t)"],
  ["cat2", "Category 2 (up to 80t)"],
  ["cat3", "Category 3 (up to 150t)"],
  ["so",   "Special Order (SO — over 150t or non-standard)"],
];

const INCOTERMS: [string, string][] = [
  ["exw", "EXW — Ex Works"],
  ["fca", "FCA — Free Carrier"],
  ["cpt", "CPT — Carriage Paid To"],
  ["cip", "CIP — Carriage & Insurance Paid"],
  ["dap", "DAP — Delivered at Place"],
  ["dpu", "DPU — Delivered at Place Unloaded"],
  ["ddp", "DDP — Delivered Duty Paid"],
  ["fas", "FAS — Free Alongside Ship"],
  ["fob", "FOB — Free on Board"],
  ["cfr", "CFR — Cost & Freight"],
  ["cif", "CIF — Cost, Insurance & Freight"],
];

const CUSTOMS_MOVEMENT_TYPES: [string, string][] = [
  ["t1",       "T1 — External Community Transit"],
  ["t2",       "T2 — Internal Community Transit"],
  ["t2f",      "T2F — Internal Transit (special territories)"],
  ["national", "National movement only"],
  ["unsure",   "Not sure — planner to advise"],
];

const CROSSING_TYPES: [string, string][] = [
  ["eurotunnel",       "Channel Tunnel (Eurotunnel Le Shuttle)"],
  ["dover_calais",     "Dover–Calais ferry"],
  ["dover_dunkirk",    "Dover–Dunkirk (DFDS)"],
  ["harwich_hook",     "Harwich–Hook of Holland"],
  ["hull_rotterdam",   "Hull–Rotterdam / Zeebrugge"],
  ["roscoff_plymouth", "Plymouth–Roscoff"],
  ["other",            "Other ferry / RoRo route"],
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
  ["wait_for_further_instruction",   "Wait for further instruction"],
  ["do_not_return_without_approval", "Do not return without approval"],
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
  quantityRequired: string;
  quantityUnit: string;
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
  heightRestriction: string;
  weightRestriction: string;
  lengthRestriction: string;
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankStop(type: string): StopState {
  return {
    id: uid(), type, collapsed: false, showOptional: false,
    siteName: "", street: "", town: "", postcode: "",
    country: "GB",
    lat: "", lng: "", navigationInstructions: "",
    referenceNumber: "",
    date: today(), earliestArrivalTime: "", latestArrivalTime: "",
    serviceTime: "30", serviceTimeCustom: "0",
    quantityRequired: "", quantityUnit: "pallets", stopNotes: "",
    exchangeDropQty: "", exchangeCollectQty: "", exchangeUnit: "pallets",
    handlingMethods: [], handlingMethodOther: "", accessRequirements: [], ppeItems: [],
    heightRestriction: "", weightRestriction: "", lengthRestriction: "",
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
    true /* reference optional */
  );
}

function stopStarted(s: StopState): boolean {
  return !!(s.siteName || s.street || s.referenceNumber);
}

function stopMissingFields(s: StopState): string[] {
  const needsRef = s.type === "collection" || s.type === "delivery";
  const missing: string[] = [];
  if (!s.siteName.trim())               missing.push("site name");
  if (!s.street.trim())                 missing.push("address line 1");
  if (!s.town.trim())                   missing.push("town / city");
  if (!s.postcode.trim())               missing.push("postcode");
  if (!s.lat || !s.lng)                 missing.push("entrance pin (lat / lng)");
  if (!s.navigationInstructions.trim()) missing.push("entrance instructions");
  if (!s.date)                          missing.push("date");
  if (!s.earliestArrivalTime)           missing.push("earliest arrival time");
  if (!s.latestArrivalTime)             missing.push("latest arrival time");
  if (!s.serviceTime)                   missing.push("loading / unloading time");
  return missing;
}

function stopToRequestStop(s: StopState, seq: number): RequestStop {
  const customMin = Math.max(0, parseInt(s.serviceTimeCustom, 10) || 0);
  const svcMin = s.serviceTime === "custom" ? (customMin > 0 ? customMin : 30) : parseInt(s.serviceTime, 10);
  return {
    type:           s.type as RequestStop["type"],
    sequenceNumber: seq,
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
    timeWindowStart: (s.date && s.earliestArrivalTime) ? `${s.date}T${s.earliestArrivalTime}:00.000Z` : undefined,
    timeWindowEnd:   (s.date && s.latestArrivalTime)   ? `${s.date}T${s.latestArrivalTime}:00.000Z`   : undefined,
    bookedTime:      (s.date && s.bookedTime)           ? `${s.date}T${s.bookedTime}:00.000Z`           : undefined,
    unloadingAllowanceMinutes: svcMin,
    quantityRequired:    s.quantityRequired ? parseFloat(s.quantityRequired) : undefined,
    quantityUnit:        s.quantityRequired ? s.quantityUnit : undefined,
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
    heightRestriction:   s.heightRestriction || undefined,
    weightRestriction:   s.weightRestriction || undefined,
    lengthRestriction:   s.lengthRestriction || undefined,
  };
}

// ── LogisticBay branding badge ────────────────────────────────────────────────

function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://logisticbay.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`flex flex-col items-end gap-0.5 group no-underline ${className}`}
    >
      <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-500 transition-colors leading-none">
        Powered by
      </span>
      <span className="flex items-center gap-1">
        <img src="/favicon.svg" alt="LogisticBay logo" className="w-3.5 h-3.5" />
        <span className="text-xs font-black text-slate-600 group-hover:text-[#863bff] transition-colors tracking-tight">
          LogisticBay
        </span>
      </span>
    </a>
  );
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

function MultiChips({ options, value, onChange, error }: {
  options: [string, string][];
  value: string[];
  onChange: (v: string[]) => void;
  error?: boolean;
}) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  }
  return (
    <div className={`flex flex-wrap gap-2 ${error ? "rounded-lg outline outline-2 outline-red-400 p-1" : ""}`}>
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => toggle(v)}
          className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors min-h-[40px] " +
            (value.includes(v)
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
    <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 mt-1">
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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function StopCard({
  stop, index, total,
  onChange, onRemove, highlightErrors,
}: {
  stop: StopState;
  index: number;
  total: number;
  onChange: (patch: Partial<StopState>) => void;
  onRemove?: () => void;
  highlightErrors?: boolean;
}) {
  const [showCoordHelp, setShowCoordHelp] = useState(false);
  const [stopPhoneError, setStopPhoneError] = useState("");
  const [stopEmailError, setStopEmailError] = useState("");
  const [distanceWarn, setDistanceWarn] = useState<{ km: number; level: "warn" | "danger" } | null>(null);
  const [checkingDist, setCheckingDist] = useState(false);

  useEffect(() => {
    setDistanceWarn(null);
    const lat = parseFloat(stop.lat);
    const lng = parseFloat(stop.lng);
    const pc  = stop.postcode.trim().replace(/\s+/g, "");
    if (!pc || isNaN(lat) || isNaN(lng) || stop.country !== "GB") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setCheckingDist(true);
      try {
        const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { result?: { latitude: number; longitude: number } };
        if (cancelled) return;
        const pcLat = data.result?.latitude;
        const pcLng = data.result?.longitude;
        if (pcLat == null || pcLng == null) return;
        const km = haversineKm(lat, lng, pcLat, pcLng);
        setDistanceWarn(km < 2 ? null : { km: Math.round(km * 10) / 10, level: km >= 8 ? "danger" : "warn" });
      } catch { /* network error — skip silently */ }
      finally { if (!cancelled) setCheckingDist(false); }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [stop.lat, stop.lng, stop.postcode, stop.country]);
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
        {onRemove && (
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
      {(!stop.collapsed || (!!highlightErrors && !complete)) && (
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

          {/* Reference number — optional */}
          {needsRef && (
            <TextField
              label={stop.type === "collection" ? "Collection reference" : "Delivery reference"}
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
                value={stop.quantityRequired}
                onKeyDown={e => { if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === ".") e.preventDefault(); }}
                onChange={e => onChange({ quantityRequired: e.target.value })} />
              <div className="relative min-w-[11rem]">
                <select
                  className="input w-full appearance-none pr-8"
                  value={stop.quantityUnit}
                  onChange={e => onChange({ quantityUnit: e.target.value })}>
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
            placeholder="Acme Warehouse — Unit 5" caseRule="proper_name"
            error={highlightErrors && !stop.siteName.trim() ? "Required" : undefined} />

          {/* Address */}
          <TextField label="Address line 1" required
            value={stop.street} onChange={v => onChange({ street: v })}
            placeholder="Industrial Estate Road" caseRule="proper_name"
            error={highlightErrors && !stop.street.trim() ? "Required" : undefined} />
          <TextField label="Address line 2"
            value={stop.addressLine2} onChange={v => onChange({ addressLine2: v })}
            placeholder="Business Park" caseRule="proper_name" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <TextField label="Town / city" required
                value={stop.town} onChange={v => onChange({ town: v })}
                placeholder="Birmingham" caseRule="proper_name"
                error={highlightErrors && !stop.town.trim() ? "Required" : undefined} />
            </div>
            <div className="block">
              <FieldLabel required>{POSTCODE_META[stop.country]?.label ?? "Postcode"}</FieldLabel>
              <input
                className={`input mt-1 ${highlightErrors && !stop.postcode.trim() ? "border-red-400 focus:border-red-500" : stop.postcode.trim() ? "border-green-400 focus:border-green-500" : ""}`}
                type="text"
                value={stop.postcode}
                placeholder={POSTCODE_META[stop.country]?.placeholder ?? "Postcode"}
                onChange={e => onChange({ postcode: e.target.value.toUpperCase() })}
              />
              {highlightErrors && !stop.postcode.trim() && (
                <p className="text-xs text-red-600 mt-1">Required</p>
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
            <LatLngInput
              lat={stop.lat} lng={stop.lng}
              onChange={(lat, lng) => onChange({ lat, lng })}
              highlightErrors={highlightErrors}
              required
            />

            {/* Distance-from-postcode warning */}
            {checkingDist && (
              <p className="text-xs text-slate-400 mt-1">Checking postcode…</p>
            )}
            {distanceWarn && !checkingDist && (() => {
              const useMiles = stop.country === "GB";
              const dist = useMiles
                ? `${Math.round(distanceWarn.km * 0.621371 * 10) / 10} miles`
                : `${distanceWarn.km} km`;
              return (
                <div className={"flex items-start gap-2 mt-2 px-3 py-2.5 rounded-lg text-xs " +
                  (distanceWarn.level === "danger"
                    ? "bg-red-50 border border-red-300 text-red-800"
                    : "bg-amber-50 border border-amber-200 text-amber-800")}>
                  <span className="shrink-0 font-bold">⚠</span>
                  <span>
                    Pin is <strong>{dist}</strong> from the centre of postcode <strong>{stop.postcode}</strong>.
                    {" "}{distanceWarn.level === "danger"
                      ? "This looks like the wrong location — please re-check."
                      : "Double-check this is the correct site entrance."}
                  </span>
                </div>
              );
            })()}

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
            <textarea className={`input mt-1 w-full ${highlightErrors && !stop.navigationInstructions.trim() ? "border-red-400 focus:border-red-500" : stop.navigationInstructions.trim() ? "border-green-400 focus:border-green-500" : ""}`} rows={3}
              placeholder={stop.type === "collection"
                ? "Enter via Gate B on the left. Intercom code 1234. Ask for goods-in."
                : "Goods-in via roller shutters at rear. Report to warehouse office first."}
              value={stop.navigationInstructions}
              onChange={e => onChange({ navigationInstructions: e.target.value })} />
            {highlightErrors && !stop.navigationInstructions.trim()
              ? <p className="text-xs text-red-600 mt-1">Required — enter gate code, security procedure, which entrance to use.</p>
              : <div className="text-xs text-muted mt-1">Gate code, security procedure, which entrance to use.</div>
            }
          </div>

          {/* Date + time window */}
          <TextField label={stop.type === "collection" ? "Collection date" : "Delivery date"} required
            type="date" value={stop.date} onChange={v => onChange({ date: v })}
            error={highlightErrors && !stop.date ? "Required" : undefined} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TextField label="Earliest arrival" required
              type="time" value={stop.earliestArrivalTime} onChange={v => onChange({ earliestArrivalTime: v })}
              error={highlightErrors && !stop.earliestArrivalTime ? "Required" : undefined} />
            <div>
              <TextField
                label={stop.type === "collection" ? "Collection time" : "Delivery time"}
                type="time"
                value={stop.bookedTime}
                onChange={v => onChange({ bookedTime: v })} />
              <div className="text-xs text-muted mt-1">Fixed appointment only — leave blank if open window.</div>
            </div>
            <TextField label="Latest arrival" required
              type="time" value={stop.latestArrivalTime} onChange={v => onChange({ latestArrivalTime: v })}
              error={highlightErrors && !stop.latestArrivalTime ? "Required" : undefined} />
          </div>

          {/* Service time */}
          <div>
            <FieldLabel required>Estimated {stop.type === "collection" ? "loading" : "unloading"} time</FieldLabel>
            <ServiceTimeChips value={stop.serviceTime} onChange={v => onChange({ serviceTime: v })} />
            {highlightErrors && !stop.serviceTime && (
              <p className="text-xs text-red-600 mt-1">Required — select a loading / unloading time</p>
            )}
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
                value={stop.heightRestriction}
                onChange={e => onChange({ heightRestriction: e.target.value })} />
            )}
            {stop.accessRequirements.includes("weight_restriction") && (
              <input className="input mt-2 max-w-xs" type="text" placeholder="Weight restriction (e.g. 7.5t)"
                value={stop.weightRestriction}
                onChange={e => onChange({ weightRestriction: e.target.value })} />
            )}
            {stop.accessRequirements.includes("length_restriction") && (
              <input className="input mt-2 max-w-xs" type="text" placeholder="Length restriction (e.g. 18m)"
                value={stop.lengthRestriction}
                onChange={e => onChange({ lengthRestriction: e.target.value })} />
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
          {/* Booking required — always visible for both stop types */}
          <div className="space-y-3">
            <Toggle value={stop.bookingRequired} onChange={v => onChange({ bookingRequired: v })}
              label="Booking / goods-in slot required before arrival" />
            {stop.bookingRequired && (
              <TextField label="Booking reference" value={stop.bookingRef}
                onChange={v => onChange({ bookingRef: v })} placeholder="BKG-2026-5678" />
            )}
          </div>

          <OptionalToggle open={stop.showOptional}
            onToggle={() => onChange({ showOptional: !stop.showOptional })}
            label="site contact, opening hours & proof" />

          {stop.showOptional && (
            <div className="space-y-4 border-l-2 border-blue-100 pl-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextField label="Site contact name"  value={stop.contactName}
                  onChange={v => onChange({ contactName: v })} />
                <TextField label="Site contact phone" type="tel" value={stop.contactPhone}
                  error={stopPhoneError}
                  onChange={v => { onChange({ contactPhone: v }); setStopPhoneError(""); }}
                  onBlur={v => setStopPhoneError(validatePhone(v, stop.country))} />
                <TextField label="Site contact email" type="email" value={stop.contactEmail}
                  error={stopEmailError}
                  onChange={v => { onChange({ contactEmail: v }); setStopEmailError(""); }}
                  onBlur={v => setStopEmailError(validateEmail(v))} />
              </div>
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
  const [linkInfo,       setLinkInfo]       = useState<PublicLinkInfo | null>(null);
  const [linkError,      setLinkError]      = useState("");
  const [submitted,      setSubmitted]      = useState(false);
  const [warnings,       setWarnings]       = useState<string[]>([]);
  const [submitting,     setSubmitting]     = useState(false);
  const [errors,         setErrors]         = useState<string[]>([]);
  const [showStopErrors, setShowStopErrors] = useState(false);
  const [s1Attempted,    setS1Attempted]    = useState(false);
  const [s2Attempted,    setS2Attempted]    = useState(false);
  const [s3Attempted,    setS3Attempted]    = useState(false);
  const [s6Attempted,    setS6Attempted]    = useState(false);

  // Section collapse
  const [s1, setS1] = useState(true);
  const [s2, setS2] = useState(true);
  const [s3, setS3] = useState(true);
  const [s4, setS4] = useState(true);
  const [s5, setS5] = useState(true);
  const [s6, setS6] = useState(true);

  // ── Sec 1: Requester ──────────────────────────────────────────────────────
  const [customerName, setCustomerName] = useState("");
  const [contactName,  setContactName]  = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhoneError, setContactPhoneError] = useState("");
  const [contactEmailError, setContactEmailError] = useState("");
  const [showRequesterOpts, setShowRequesterOpts] = useState(false);
  const [customerRef, setCustomerRef] = useState("");

  // ── Sec 2: Stops ──────────────────────────────────────────────────────────
  const [stops, setStops] = useState<StopState[]>([
    blankStop("collection"),
    blankStop("delivery"),
  ]);
  const updStop = (id: string, patch: Partial<StopState>) =>
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeStop = (id: string) =>
    setStops(prev => prev.filter(s => s.id !== id));

  const hasInternationalStop = stops.some(s => s.country && s.country !== "GB");

  useEffect(() => {
    if (hasInternationalStop) setSIntl(false);
  }, [hasInternationalStop]);

  // ── Declaration ───────────────────────────────────────────────────────────
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  // ── Sec 3: Load ───────────────────────────────────────────────────────────
  const [goodsTypes,              setGoodsTypes]              = useState<string[]>([]);
  const [goodsTypeOther,          setGoodsTypeOther]          = useState("");
  const [goodsDesc,               setGoodsDesc]               = useState("");
  const [quantity,                setQuantity]                = useState("");
  const [unit,                    setUnit]                    = useState("pallets");
  const [otherUnit,               setOtherUnit]               = useState("");
  const [estWeight,               setEstWeight]               = useState("");
  // Pallets — multi-type repeater
  interface PalletLine { id: string; type: string; typeOther: string; count: string; dimL: string; dimW: string; }
  const blankPalletLine = (): PalletLine => ({ id: `pl${Date.now()}${Math.random()}`, type: "", typeOther: "", count: "", dimL: "", dimW: "" });
  const [palletLines,             setPalletLines]             = useState<PalletLine[]>([blankPalletLine()]);
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
  const [wetDry,                  setWetDry]                  = useState("");
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

  // Pallets extra (palletDimL/W now live inside palletLines entries)
  const [weightPerUnit,    setWeightPerUnit]    = useState("");
  const [ispm15Required,   setIspm15Required]   = useState(false);
  // Waste
  const [isWaste,          setIsWaste]          = useState(false);
  const [ewcCode,          setEwcCode]          = useState("");
  const [wasteTrnNumber,   setWasteTrnNumber]   = useState("");
  // Container extras
  const [containerIsoType,     setContainerIsoType]     = useState("");
  const [containerBookingRef,  setContainerBookingRef]  = useState("");
  const [containerTerminal,    setContainerTerminal]    = useState("");
  const [containerCutOff,      setContainerCutOff]      = useState("");
  const [containerSealNumber,  setContainerSealNumber]  = useState("");
  // Food extras
  const [foodCleanVehicle,   setFoodCleanVehicle]   = useState(false);
  const [foodHaccp,          setFoodHaccp]          = useState(false);
  const [foodAllergenFree,   setFoodAllergenFree]   = useState(false);
  const [foodTempLogger,     setFoodTempLogger]     = useState(false);

  // ── Sec 4: Special requirements ───────────────────────────────────────────
  const [specialItems,                 setSpecialItems]                 = useState<string[]>([]);
  const [hazardClass,                     setHazardClass]                     = useState("");
  const [tunnelCode,                    setTunnelCode]                    = useState("");
  const [unNumber,                     setUnNumber]                     = useState("");
  const [packingGroup,                 setPackingGroup]                 = useState("");
  const [hazardousQuantityKg,          setHazardousQuantityKg]          = useState("");
  const [hazardousPaperworkAvailable,  setHazardousPaperworkAvailable]  = useState(false);
  const [oversizedWidth,               setOversizedWidth]               = useState("");
  const [oversizedHeight,              setOversizedHeight]              = useState("");
  const [oversizedLength,              setOversizedLength]              = useState("");
  // ADR extras
  const [adrSubsidiaryRisk,      setAdrSubsidiaryRisk]      = useState("");
  const [adrProperShippingName,  setAdrProperShippingName]  = useState("");
  const [adrFlashPoint,          setAdrFlashPoint]          = useState("");
  const [adrEmsCode,             setAdrEmsCode]             = useState("");
  const [adrEmergencyContact,    setAdrEmergencyContact]    = useState("");
  // Oversized extras
  const [stgoCategory,         setStgoCategory]         = useState("");
  const [movementOrderNumber,  setMovementOrderNumber]  = useState("");

  // ── Sec 5: Transport ──────────────────────────────────────────────────────
  const [plannerDecides,  setPlannerDecides]  = useState(true);
  // Advanced transport (only when plannerDecides=false)
  const [vehicleCategory,     setVehicleCategory]     = useState("");
  const [bodyTypes,        setBodyTypes]        = useState<string[]>([]);
  const [equipment,        setEquipment]        = useState<string[]>([]);
  const [trailersAllowed, setTrailersAllowed] = useState<string[]>([]);

  // Transport extras
  const [subcontractingAllowed, setSubcontractingAllowed] = useState("");
  const [cscsRequired,          setCscsRequired]          = useState(false);
  const [bs7858Required,        setBs7858Required]        = useState(false);
  const [dbsLevel,              setDbsLevel]              = useState("");
  // Cross-border / international
  const [sIntl, setSIntl] = useState(true);
  const [shipperEori,         setShipperEori]         = useState("");
  const [consigneeEori,       setConsigneeEori]       = useState("");
  const [hsCode,              setHsCode]              = useState("");
  const [customsMovementType, setCustomsMovementType] = useState("");
  const [incoterms,           setIncoterms]           = useState("");
  const [crossingRequired,    setCrossingRequired]    = useState(false);
  const [crossingType,        setCrossingType]        = useState("");
  const [crossingBookingRef,  setCrossingBookingRef]  = useState("");

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
  const [alternativeReturnContactPhoneError, setAlternativeReturnContactPhoneError] = useState("");
  const [approvalContactName,            setApprovalContactName]            = useState("");
  const [approvalContactPhone,           setApprovalContactPhone]           = useState("");
  const [approvalContactPhoneError,      setApprovalContactPhoneError]      = useState("");
  const [photosRequiredOnRejection,      setPhotosRequiredOnRejection]      = useState(false);
  const [rejectionSignatureRequired,     setRejectionSignatureRequired]     = useState(false);
  const [rejectionNotes,                 setRejectionNotes]                 = useState("");

  // ── Completeness ──────────────────────────────────────────────────────────
  const sec1Complete = !!(customerName.trim() && contactName.trim() && contactPhone.trim() && contactEmail.trim() && !contactPhoneError && !contactEmailError);
  const sec2Complete = stops.length > 0 && stops.every(stopComplete) &&
    stops.some(s => s.type === "collection") && stops.some(s => s.type === "delivery");
  const sec3Complete = !!(goodsTypes.length > 0 && goodsDesc.trim().length >= 15 && quantity && unit && parseFloat(estWeight) > 0);
  const sec4Complete = true; // optional section
  const sec5Complete = true; // optional
  const sec6Complete = !!(parseFloat(declaredValue) > 0);

  const sec1Started = !!(customerName || contactName);
  const sec2Started = stops.some(stopStarted);
  const sec3Started = !!(goodsTypes.length > 0 || goodsDesc);

  // ── Human-readable missing field lists (shown in SectionFooter) ──────────────
  const sec1Missing: string[] = [
    !customerName.trim() ? "company / organisation name"  : "",
    !contactName.trim()         ? "contact name"                 : "",
    !contactPhone.trim()        ? "contact phone"                : "",
    !contactEmail.trim()        ? "contact email"                : "",
    contactPhoneError           ? `phone: ${contactPhoneError}`  : "",
    contactEmailError           ? `email: ${contactEmailError}`  : "",
  ].filter(Boolean) as string[];

  const sec2Missing: string[] = [
    ...stops.flatMap((s, i) =>
      stopMissingFields(s).map(f => `Stop ${i + 1} — ${s.type}: ${f}`)
    ),
    ...(!stops.some(s => s.type === "collection") ? ["at least one collection stop required"] : []),
    ...(!stops.some(s => s.type === "delivery")   ? ["at least one delivery stop required"]   : []),
  ];

  const sec3Missing: string[] = [
    !goodsTypes.length                  ? "goods type"                                    : "",
    goodsDesc.trim().length < 15       ? "goods description (min 15 characters)"         : "",
    !quantity                          ? "quantity"                                       : "",
    !unit                              ? "unit"                                           : "",
    !(parseFloat(estWeight) > 0)       ? "estimated weight"                               : "",
  ].filter(Boolean) as string[];

  const sec6Missing: string[] = [
    !(parseFloat(declaredValue) > 0) ? "declared goods value" : "",
  ].filter(Boolean) as string[];

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
        // Customer details pre-fill (from linked Customer record)
        if (info.customerName)  setCustomerName(info.customerName);
        if (info.contactName)   setContactName(info.contactName);
        if (info.contactEmail)  setContactEmail(info.contactEmail);
        if (info.contactPhone)  setContactPhone(info.contactPhone);
        // Template data pre-fill (from link templateData blob)
        const t = info.templateData;
        if (t && typeof t === "object") {
          if (t.customerRef)       setCustomerRef(String(t.customerRef));
          if (t.goodsType)         setGoodsTypes([String(t.goodsType)]);
          if (t.goodsDescription)  setGoodsDesc(String(t.goodsDescription));
          if (t.unit)              setUnit(String(t.unit));
          if (t.quantity)          setQuantity(String(t.quantity));
          if (t.estimatedWeight)   setEstWeight(String(t.estimatedWeight));
          if (t.declaredGoodsValue) setDeclaredValue(String(t.declaredGoodsValue));
        }
      })
      .catch(() => setLinkError("This request link is not valid or has expired."));
  }, [token]);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);

    // ── Final validation sweep — collect every problem across all sections ─────
    const phoneErr = validatePhone(contactPhone, stops[0]?.country ?? "GB");
    const emailErr = validateEmail(contactEmail);
    if (phoneErr) setContactPhoneError(phoneErr);
    if (emailErr) setContactEmailError(emailErr);

    const allProblems: string[] = [];

    // Section 1
    const s1Problems = [
      !customerName.trim() ? "Company / organisation name is required"        : "",
      !contactName.trim()         ? "Contact name is required"                        : "",
      !contactPhone.trim()        ? "Contact phone is required"                       : "",
      phoneErr                    ? `Contact phone: ${phoneErr}`                      : "",
      !contactEmail.trim()        ? "Contact email is required"                       : "",
      emailErr                    ? `Contact email: ${emailErr}`                      : "",
    ].filter(Boolean) as string[];

    if (s1Problems.length) { setS1(false); allProblems.push(...s1Problems.map(p => `Your details — ${p}`)); }

    // Section 2 — stops
    const s2Problems: string[] = [
      ...stops.flatMap((s, i) =>
        stopMissingFields(s).map(f => `Stop ${i + 1} (${s.type}): ${f}`)
      ),
      ...(!stops.some(s => s.type === "collection") ? ["At least one collection stop is required"] : []),
      ...(!stops.some(s => s.type === "delivery")   ? ["At least one delivery stop is required"]   : []),
    ];
    if (s2Problems.length) { setS2(false); allProblems.push(...s2Problems); }

    // Section 3 — load
    const s3Problems = [
      !goodsTypes.length           ? "Goods type is required"                              : "",
      goodsDesc.trim().length < 15 ? "Goods description must be at least 15 characters"   : "",
      !quantity                    ? "Quantity is required"                                : "",
      !unit                        ? "Unit is required"                                    : "",
      !(parseFloat(estWeight) > 0) ? "Estimated weight is required"                       : "",
    ].filter(Boolean) as string[];
    if (s3Problems.length) { setS3(false); allProblems.push(...s3Problems.map(p => `Load details — ${p}`)); }

    // Section 6 — billing
    const s6Problems = [
      !(parseFloat(declaredValue) > 0) ? "Declared goods value is required" : "",
    ].filter(Boolean) as string[];
    if (s6Problems.length) { setS6(false); allProblems.push(...s6Problems.map(p => `Billing — ${p}`)); }

    // Declaration
    if (!declarationAccepted) allProblems.push("You must accept the declaration before submitting");

    if (allProblems.length > 0) {
      setErrors(allProblems);
      setShowStopErrors(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Build exception policy data if section is open or has any values
    const hasExceptionPolicy = !!(
      rejectionAction || alternativeReturnAddress || approvalContactName ||
      photosRequiredOnRejection || rejectionSignatureRequired || rejectionNotes
    );

    // Derive boolean / computed fields before building the flat payload
    const resolvedTempRange    = tempRange.trim() || (goodsTypes.includes("bulk_material") ? wetDry : tempType) || undefined;
    const isTempControlled     = !!(resolvedTempRange);
    const isFragile            = specialItems.includes("fragile");

    // Build goods sub-type details blob
    const loadDataBlob: Record<string, unknown> = {
      loadHeight:             loadHeight.trim() || undefined,
      loadNotes:              loadNotes.trim()  || undefined,
      // pallets — multi-type
      palletLines: (() => {
        const lines = palletLines.filter(l => l.type || l.count).map(l => ({
          type:      l.type      || undefined,
          typeOther: l.type === "other" ? (l.typeOther.trim() || undefined) : undefined,
          count:     l.count ? parseInt(l.count, 10) : undefined,
          dimL:      l.type === "other" && l.dimL ? parseInt(l.dimL, 10) : undefined,
          dimW:      l.type === "other" && l.dimW ? parseInt(l.dimW, 10) : undefined,
        }));
        return lines.length > 0 ? lines : undefined;
      })(),
      stackable:              stackable    || undefined,
      // roll cages
      cageCount:              cageCount    ? parseInt(cageCount, 10)    : undefined,
      cageFolded:             cageFolded   || undefined,
      // machinery
      machineryPieceWeight:   machineryPieceWeight ? parseFloat(machineryPieceWeight) : undefined,
      liftingPoints:          machineryLiftingPoints || undefined,
      skidMounted:            machinerySkidMounted   || undefined,
      craneRequired:          craneRequired          || undefined,
      // building materials
      buildingMaterialType:   buildingMaterialType           || undefined,
      buildingPalletised:     buildingMaterialPalletised     || undefined,
      longestItem:            buildingMaterialLongestItem    || undefined,
      weatherSensitive:       buildingMaterialWeatherSensitive || undefined,
      // food / refrigerated
      chilledFrozenAmbient:   tempType    || undefined,
      temperatureRange:       tempRange   || undefined,
      foodPreCooled:          foodPreCooled || undefined,
      // bulk material
      tippingRequired:        tippingReq  || undefined,
      wetDry:                 wetDry      || undefined,
      // liquid bulk
      liquidProductType:      liquidProductType  || undefined,
      liquidVolumeLitres:     liquidVolumeLitres ? parseFloat(liquidVolumeLitres) : undefined,
      // steel / long
      steelPieceCount:        steelPieceCount ? parseInt(steelPieceCount, 10) : undefined,
      steelWidth:             steelWidth || undefined,
      // vehicles
      vehicleCount:           vehicleCount ? parseInt(vehicleCount, 10) : undefined,
      vehicleMakeModel:       vehicleMakeModel || undefined,
      vehicleKeysWithVehicle: vehicleKeysWithVehicle || undefined,
      vehicleDriveable:       driveable   || undefined,
      // containers
      containerSize:          containerSize     || undefined,
      containerSizeOther:     containerSize === "other" ? (containerSizeOther || undefined) : undefined,
      loadedOrEmpty:          loadedOrEmpty     || undefined,
      containerNum:           containerNum      || undefined,
      // general goods
      generalPackagingType:   generalPackagingType || undefined,
      generalPieceCount:      generalPieceCount ? parseInt(generalPieceCount, 10) : undefined,
      // hazmat / ADR
      unNumber:               unNumber.trim()     || undefined,
      packingGroup:           packingGroup.trim() || undefined,
      hazardousQuantityKg:    hazardousQuantityKg ? parseFloat(hazardousQuantityKg) : undefined,
      hazardousPaperworkAvailable: hazardousPaperworkAvailable || undefined,
      // oversized
      oversizedWidth:         oversizedWidth.trim()  || undefined,
      oversizedHeight:        oversizedHeight.trim() || undefined,
      oversizedLength:        oversizedLength.trim() || undefined,
      // ADR extras
      adrProperShippingName: adrProperShippingName.trim() || undefined,
      adrSubsidiaryRisk:     adrSubsidiaryRisk.trim()     || undefined,
      adrFlashPoint:         adrFlashPoint.trim()         || undefined,
      adrEmsCode:            adrEmsCode.trim()            || undefined,
      adrEmergencyContact:   adrEmergencyContact.trim()   || undefined,
      // Oversized / STGO
      stgoCategory:          stgoCategory        || undefined,
      movementOrderNumber:   movementOrderNumber.trim() || undefined,
      // Pallets extra (dims are now inside palletLines entries)
      weightPerUnit:         weightPerUnit ? parseFloat(weightPerUnit) : undefined,
      ispm15Required:        ispm15Required || undefined,
      // Waste
      isWaste:               isWaste || undefined,
      ewcCode:               isWaste ? (ewcCode.trim() || undefined) : undefined,
      wasteTrnNumber:        isWaste ? (wasteTrnNumber.trim() || undefined) : undefined,
      // Container extras
      containerIsoType:      containerIsoType     || undefined,
      containerBookingRef:   containerBookingRef.trim() || undefined,
      containerTerminal:     containerTerminal.trim()   || undefined,
      containerCutOff:       containerCutOff      || undefined,
      containerSealNumber:   containerSealNumber.trim() || undefined,
      // Food extras
      foodCleanVehicle:      foodCleanVehicle  || undefined,
      foodHaccp:             foodHaccp         || undefined,
      foodAllergenFree:      foodAllergenFree  || undefined,
      foodTempLogger:        foodTempLogger    || undefined,
      // Transport extras
      subcontractingAllowed: subcontractingAllowed || undefined,
      driverQualifications:  (cscsRequired || bs7858Required || dbsLevel) ? {
        cscsRequired:   cscsRequired   || undefined,
        bs7858Required: bs7858Required || undefined,
        dbsLevel:       dbsLevel       || undefined,
      } : undefined,
      // Cross-border
      crossBorderData: hasInternationalStop ? {
        shipperEori:         shipperEori.trim()   || undefined,
        consigneeEori:       consigneeEori.trim() || undefined,
        hsCode:              hsCode.trim()        || undefined,
        customsMovementType: customsMovementType  || undefined,
        incoterms:           incoterms            || undefined,
        crossingRequired:    crossingRequired     || undefined,
        crossingType:        crossingType         || undefined,
        crossingBookingRef:  crossingBookingRef.trim() || undefined,
      } : undefined,
    };
    // Remove keys with undefined values
    Object.keys(loadDataBlob).forEach(k => loadDataBlob[k] === undefined && delete loadDataBlob[k]);

    const body: SubmitRequestBody = {
      // Customer
      customerName:         customerName.trim(),
      bookingContactName:   contactName.trim()  || undefined,
      bookingContactPhone:  contactPhone.trim() || undefined,
      bookingContactEmail:  contactEmail.trim() || undefined,
      customerRef:          customerRef.trim()  || undefined,

      // Stops
      stops: stops.map((s, i) => stopToRequestStop(s, i + 1)),

      // Load
      goodsType:            goodsTypes[0] || undefined,
      goodsDescription:     goodsDesc.trim() || undefined,
      quantity:             quantity ? parseFloat(quantity) : undefined,
      quantityUnit:         unit === "other" ? (otherUnit.trim() || "other") : unit || undefined,
      weight:               estWeight ? parseFloat(estWeight) : undefined,
      stackable:            stackable || undefined,
      tempControlled:       isTempControlled || undefined,
      tempRange:            resolvedTempRange,
      fragile:              isFragile || undefined,
      hazardClass:          hazardClass.trim()  || undefined,
      tunnelCode:           tunnelCode.trim()   || undefined,
      securingRequirements: securingRequirements.length ? securingRequirements : undefined,
      specialRequirements:  specialItems.length ? specialItems : undefined,
      dimensions:           dimensions.trim() || undefined,
      canSplitShipment:     canSplitShipment || undefined,

      // Vehicle requirements
      vehicleCategory:      plannerDecides ? undefined : vehicleCategory || undefined,
      bodyTypes:            plannerDecides ? undefined : bodyTypes.length ? bodyTypes : undefined,
      equipment:            plannerDecides ? undefined : equipment.length ? equipment : undefined,
      trailersAllowed:      plannerDecides ? undefined : trailersAllowed.length ? trailersAllowed : undefined,

      // Billing
      declaredGoodsValue:   declaredValue ? String(parseFloat(declaredValue)) : undefined,
      purchaseOrderNumber:  poNumber.trim()   || undefined,
      billingReference:     billingRef.trim() || undefined,

      // Notes
      driverVisibleNotes:   customerNotes.trim() || undefined,
      driverNoteChips:      undefined,
      safetyInstructions:   undefined,

      // Exception policy
      failureAction:                    hasExceptionPolicy ? (rejectionAction || undefined) : undefined,
      approvalContactName:              approvalContactName.trim()           || undefined,
      approvalContactPhone:             approvalContactPhone.trim()          || undefined,
      alternativeReturnAddress:         alternativeReturnAddress.trim()      || undefined,
      alternativeReturnPostcode:        alternativeReturnPostcode.trim()     || undefined,
      alternativeReturnContactName:     alternativeReturnContactName.trim()  || undefined,
      alternativeReturnContactPhone:    alternativeReturnContactPhone.trim() || undefined,
      // Extended alternative return address
      alternativeReturnSiteName:        alternativeReturnSiteName.trim()        || undefined,
      alternativeReturnAddressLine2:    alternativeReturnAddressLine2.trim()    || undefined,
      alternativeReturnTown:            alternativeReturnTown.trim()            || undefined,
      alternativeReturnCounty:          alternativeReturnCounty.trim()          || undefined,
      alternativeReturnCountry:         alternativeReturnCountry !== "GB" ? alternativeReturnCountry : undefined,
      alternativeReturnLat:             alternativeReturnLat ? parseFloat(alternativeReturnLat) : undefined,
      alternativeReturnLng:             alternativeReturnLng ? parseFloat(alternativeReturnLng) : undefined,
      alternativeReturnNavigationInstructions: alternativeReturnNavInstructions.trim() || undefined,
      // Rejection policy
      photosRequiredOnRejection:        photosRequiredOnRejection || undefined,
      rejectionSignatureRequired:       rejectionSignatureRequired || undefined,
      rejectionNotes:                   rejectionNotes.trim() || undefined,
      // Goods sub-type details
      loadData: Object.keys(loadDataBlob).length > 0 ? loadDataBlob : undefined,
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
          <div className="mt-6 pt-5 border-t border-slate-100 flex justify-center">
            <PoweredBy />
          </div>
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
            onClick={() => window.location.reload()}>
            Submit another request
          </button>
          <div className="mt-6 pt-5 border-t border-slate-100 flex justify-center">
            <PoweredBy />
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface">

      {/* Page header */}
      <div className="bg-white border-b border-border px-4 py-5 text-center shadow-sm relative">
        <div className="text-xs font-bold uppercase tracking-widest text-accent mb-1">Transport Request</div>
        <h1 className="text-xl font-black text-primary">{linkInfo.companyName}</h1>
        <p className="text-sm text-muted mt-1">Fill in the required sections then submit.</p>
        <PoweredBy className="absolute top-1/2 -translate-y-1/2 right-4" />
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {errors.length > 0 && (
          <div className="card border-red-300 bg-red-50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-black">!</span>
              <span className="font-bold text-red-800 text-sm">
                {errors.length} thing{errors.length !== 1 ? "s" : ""} still need{errors.length === 1 ? "s" : ""} attention before you can submit:
              </span>
            </div>
            <ul className="ml-7 space-y-1">
              {errors.map((e, i) => (
                <li key={i} className="text-sm text-red-700 flex items-start gap-1.5">
                  <span className="flex-shrink-0 mt-0.5">•</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
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
            active collapsed={s1} onToggle={() => { if (!s1 && !sec1Complete) setS1Attempted(true); setS1(o => !o); }}
            complete={sec1Complete} started={sec1Started}
            summary={customerName || contactName}
            missingCount={sec1Missing.length} />
          {!s1 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <TextField label="Company / organisation name" required
                value={customerName} onChange={setCustomerName}
                placeholder="Acme Distribution Ltd" caseRule="proper_name"
                error={s1Attempted && !customerName.trim() ? "Required" : undefined} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="Contact name" required
                  value={contactName} onChange={setContactName}
                  placeholder="Jane Smith" caseRule="proper_name"
                  error={s1Attempted && !contactName.trim() ? "Required" : undefined} />
                <TextField label="Contact phone" required type="tel"
                  value={contactPhone}
                  error={contactPhoneError || (s1Attempted && !contactPhone.trim() ? "Required" : undefined)}
                  onChange={v => { setContactPhone(v); setContactPhoneError(""); }}
                  onBlur={v => setContactPhoneError(validatePhone(v, stops[0]?.country ?? "GB"))}
                  placeholder="+44 7700 900123" />
              </div>
              <TextField label="Contact email" required type="email"
                value={contactEmail}
                error={contactEmailError || (s1Attempted && !contactEmail.trim() ? "Required" : undefined)}
                onChange={v => { setContactEmail(v); setContactEmailError(""); }}
                onBlur={v => setContactEmailError(validateEmail(v))}
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
              <SectionFooter complete={sec1Complete} label="Your details" onCollapse={() => { if (!sec1Complete) setS1Attempted(true); setS1(true); }} missing={sec1Missing} />
            </div>
          )}
        </div>

        {/* ── Sec 2: Collection & delivery stops ───────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={2} icon="🗺️"
            title={sec2Summary ? `Stops — ${sec2Summary}` : "Collection & delivery stops"}
            subtitle="Where to collect from and deliver to"
            active collapsed={s2} onToggle={() => { if (!s2 && !sec2Complete) setS2Attempted(true); setS2(o => !o); }}
            complete={sec2Complete} started={sec2Started}
            summary={sec2Summary || undefined}
            missingCount={sec2Missing.length} />
          {!s2 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              {stops.map((stop, idx) => {
                const typeCount = stops.filter(s => s.type === stop.type).length;
                return (
                  <StopCard key={stop.id} stop={stop} index={idx} total={stops.length}
                    onChange={patch => updStop(stop.id, patch)}
                    onRemove={typeCount > 1 ? () => removeStop(stop.id) : undefined}
                    highlightErrors={s2Attempted || showStopErrors} />
                );
              })}

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

              <SectionFooter complete={sec2Complete} label="Stops" onCollapse={() => { if (!sec2Complete) setS2Attempted(true); setS2(true); }} missing={sec2Missing} />
            </div>
          )}
        </div>

        {/* ── Sec 3: Load ──────────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={3} icon="🏗️" title="Load details" subtitle="What is being transported"
            active collapsed={s3} onToggle={() => { if (!s3 && !sec3Complete) setS3Attempted(true); setS3(o => !o); }}
            complete={sec3Complete} started={sec3Started}
            summary={goodsTypes.length > 0
              ? `${goodsTypes.map(t => LOAD_TYPES.find(([v]) => v === t)?.[1] ?? t).join(" + ")}${goodsDesc ? ` · ${goodsDesc.slice(0, 30)}` : ""}`
              : undefined}
            missingCount={sec3Missing.length} />
          {!s3 && (
            <div className="px-5 pt-5 pb-4 space-y-5">

              {/* What are you moving? */}
              <div>
                <FieldLabel required>What are you moving? <span className="font-normal text-muted">(select all that apply)</span></FieldLabel>
                <div className="mt-1">
                  <MultiChips options={LOAD_TYPES} value={goodsTypes} onChange={setGoodsTypes} error={s3Attempted && !goodsTypes.length} />
                </div>
                {s3Attempted && !goodsTypes.length && (
                  <p className="text-xs text-red-600 mt-1">Select at least one goods type</p>
                )}
                {goodsTypes.includes("other") && (
                  <input className="input mt-2 w-full" type="text"
                    placeholder="Describe what you are moving"
                    value={goodsTypeOther} onChange={e => setGoodsTypeOther(e.target.value)} />
                )}
              </div>

              {/* Description */}
              <div>
                <FieldLabel required>Description of goods</FieldLabel>
                <textarea className={`input mt-1 w-full ${s3Attempted && goodsDesc.trim().length < 15 ? "border-red-400 focus:border-red-500" : ""}`} rows={2}
                  value={goodsDesc} onChange={e => setGoodsDesc(e.target.value)}
                  placeholder={goodsTypes.includes("pallets")       ? "Engine parts on euro pallets, double-stacked" :
                                goodsTypes.includes("bulk_material") ? "Type 1 MOT crushed limestone, dry, loose" :
                                goodsTypes.includes("steel_long")    ? "25m galvanised RSJ beams, 6 pieces, 3.8t each" :
                                goodsTypes.includes("machinery")     ? "CNC milling machine, 4.2t, skid-mounted, no lifting points" :
                                goodsTypes.includes("vehicles")      ? "2019 Ford Transit Custom, white, running, keys with vehicle" :
                                "Describe exactly what is being transported — be specific"} />
                <div className={`text-xs mt-1 ${goodsDesc.trim().length >= 15 ? "text-muted" : "text-amber-600 font-medium"}`}>
                  {goodsDesc.trim().length} / 15 characters minimum
                </div>
              </div>

              {/* Quantity + unit */}
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Quantity" required type="number" min="0" step="1" value={quantity}
                  onChange={setQuantity} placeholder="24"
                  error={s3Attempted && !quantity ? "Required" : undefined} />
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
                error={s3Attempted && !(parseFloat(estWeight) > 0) ? "Required" : undefined}
                hint="Approximate is fine, but do not leave blank." />

              {/* Overall load height — all types */}
              <TextField label="Overall load height (m)" type="number" min="0"
                value={loadHeight} onChange={setLoadHeight} placeholder="2.4"
                hint="Helps the planner choose the right trailer. Leave blank if unsure." />

              {/* ── Conditional: Pallets ── */}
              {(goodsTypes.includes("pallets") || unit === "pallets") && (
                <div className="space-y-4 pt-1">
                  <div>
                    <FieldLabel>Pallet types on this load</FieldLabel>
                    <div className="text-xs text-muted mb-2">Add a line for each different pallet type — e.g. 10 Euro + 5 UK.</div>
                    <div className="space-y-2">
                      {palletLines.map((line, idx) => (
                        <div key={line.id} className="space-y-2">
                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              {idx === 0 && <FieldLabel>Type</FieldLabel>}
                              <select className="input w-full mt-1" value={line.type}
                                onChange={e => setPalletLines(prev => prev.map(l => l.id === line.id ? { ...l, type: e.target.value, typeOther: "", dimL: "", dimW: "" } : l))}>
                                <option value="">Not specified</option>
                                <option value="euro">Euro (800×1200mm)</option>
                                <option value="uk">UK (1000×1200mm)</option>
                                <option value="half">Half pallets</option>
                                <option value="chep">CHEP</option>
                                <option value="other">Other / custom</option>
                              </select>
                            </div>
                            <div className="w-28 flex-shrink-0">
                              {idx === 0 && <FieldLabel>Count</FieldLabel>}
                              <input className="input w-full mt-1 font-mono" type="number" min="0" step="1"
                                placeholder="0" value={line.count}
                                onKeyDown={e => { if (["e","E","-","."].includes(e.key)) e.preventDefault(); }}
                                onChange={e => setPalletLines(prev => prev.map(l => l.id === line.id ? { ...l, count: e.target.value } : l))} />
                            </div>
                            {palletLines.length > 1 && (
                              <button type="button"
                                className="text-xs text-red-400 hover:text-red-600 transition-colors pb-2 flex-shrink-0"
                                onClick={() => setPalletLines(prev => prev.filter(l => l.id !== line.id))}>
                                Remove
                              </button>
                            )}
                          </div>
                          {line.type === "other" && (
                            <div className="pl-2 border-l-2 border-slate-200 space-y-2">
                              <input className="input w-full" type="text"
                                placeholder="Describe pallet type (e.g. custom timber pallet)"
                                value={line.typeOther}
                                onChange={e => setPalletLines(prev => prev.map(l => l.id === line.id ? { ...l, typeOther: e.target.value } : l))} />
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <FieldLabel>Length (mm)</FieldLabel>
                                  <input className="input mt-1 w-full font-mono" type="number" min="0" step="1"
                                    placeholder="1200" value={line.dimL}
                                    onChange={e => setPalletLines(prev => prev.map(l => l.id === line.id ? { ...l, dimL: e.target.value } : l))} />
                                </div>
                                <div>
                                  <FieldLabel>Width (mm)</FieldLabel>
                                  <input className="input mt-1 w-full font-mono" type="number" min="0" step="1"
                                    placeholder="800" value={line.dimW}
                                    onChange={e => setPalletLines(prev => prev.map(l => l.id === line.id ? { ...l, dimW: e.target.value } : l))} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <button type="button"
                      className="mt-2 text-xs font-semibold text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
                      onClick={() => setPalletLines(prev => [...prev, blankPalletLine()])}>
                      + Add another pallet type
                    </button>
                  </div>
                  <Toggle value={stackable} onChange={setStackable} label="Pallets are stackable" />
                  <TextField label="Weight per pallet (kg)" type="number" min="0" step="1"
                    value={weightPerUnit} onChange={setWeightPerUnit} placeholder="500"
                    hint="Gross weight per individual pallet including packaging. Needed for tail lift and fork truck safety." />
                  {hasInternationalStop && (
                    <Toggle value={ispm15Required} onChange={setIspm15Required}
                      label="ISPM-15 certified wood packaging required (international moves)" />
                  )}
                </div>
              )}

              {/* ── Conditional: Roll cages / yorks ── */}
              {goodsTypes.includes("roll_cages") && (
                <div className="space-y-4 pt-1">
                  <TextField label="Number of cages" type="number" min="0" step="1"
                    value={cageCount} onChange={setCageCount} placeholder="48"
                    hint="If different from the total quantity above." />
                  <Toggle value={cageFolded} onChange={setCageFolded}
                    label="Cages are folded / nested (not assembled)" />
                </div>
              )}

              {/* ── Conditional: Building materials ── */}
              {goodsTypes.includes("building_materials") && (
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
              {goodsTypes.includes("liquid_bulk") && (
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
              {goodsTypes.includes("machinery") && (
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
              {goodsTypes.includes("bulk_material") && (
                <div className="space-y-4 pt-1">
                  <Toggle value={tippingReq} onChange={setTippingReq} label="Tipping required at delivery" />
                  <div>
                    <FieldLabel>Wet or dry</FieldLabel>
                    <div className="mt-1">
                      <Chips options={WET_DRY_OPTIONS} value={wetDry} onChange={setWetDry} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Conditional: Steel/long loads ── */}
              {goodsTypes.includes("steel_long") && (
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
              {goodsTypes.includes("food_refrigerated") && (
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
                  <Toggle value={foodTempLogger} onChange={setFoodTempLogger}
                    label="Temperature data logger required (continuous record)" />
                  <Toggle value={foodCleanVehicle} onChange={setFoodCleanVehicle}
                    label="Clean vehicle declaration required" />
                  <Toggle value={foodHaccp} onChange={setFoodHaccp}
                    label="HACCP compliance required" />
                  <Toggle value={foodAllergenFree} onChange={setFoodAllergenFree}
                    label="Allergen cross-contamination concern — nut-free / allergen-free vehicle required" />
                </div>
              )}

              {/* ── Conditional: Vehicles ── */}
              {goodsTypes.includes("vehicles") && (
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
              {goodsTypes.includes("containers") && (
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
                  <div>
                    <FieldLabel>Container ISO type</FieldLabel>
                    <select className="input mt-1 w-full" value={containerIsoType} onChange={e => setContainerIsoType(e.target.value)}>
                      <option value="">Not specified</option>
                      {CONTAINER_ISO_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <TextField label="Port booking reference / release number" value={containerBookingRef}
                    onChange={setContainerBookingRef} placeholder="MSKU1234567"
                    hint="Required to collect the container from port. Without this the driver cannot uplift." />
                  <TextField label="Terminal / port name" value={containerTerminal}
                    onChange={setContainerTerminal} placeholder="DP World London Gateway — Berth 3" />
                  <div>
                    <FieldLabel>Port cut-off date &amp; time</FieldLabel>
                    <input className="input mt-1 w-full" type="datetime-local" value={containerCutOff}
                      onChange={e => setContainerCutOff(e.target.value)} />
                    <div className="text-xs text-muted mt-1">Container must arrive at port before this time or it misses the sailing.</div>
                  </div>
                  <TextField label="Seal number" value={containerSealNumber}
                    onChange={setContainerSealNumber} placeholder="ML-12345678"
                    hint="Seal attached at collection — recorded for customs." />
                </div>
              )}

              {/* ── Conditional: General goods ── */}
              {goodsTypes.includes("general") && (
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

              {/* Waste transport */}
              <div>
                <Toggle value={isWaste} onChange={v => { setIsWaste(v); if (!v) { setEwcCode(""); setWasteTrnNumber(""); } }}
                  label="These goods are classified as waste" />
                {isWaste && (
                  <div className="mt-3 space-y-3 border-l-2 border-orange-200 pl-4">
                    <div className="px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-800 font-medium">
                      ⚠ Carrying waste requires a valid Waste Carrier Licence. A Waste Transfer Note (WTN) must accompany the load.
                    </div>
                    <TextField label="EWC code (European Waste Catalogue)" value={ewcCode} onChange={setEwcCode}
                      placeholder="e.g. 15 01 01" hint="6-digit code identifying the waste type." />
                    <TextField label="Waste Transfer Note number" value={wasteTrnNumber} onChange={setWasteTrnNumber}
                      placeholder="WTN-2026-001" hint="Document reference — must travel with the load." />
                  </div>
                )}
              </div>

              {/* Load notes */}
              <div>
                <FieldLabel>Additional load notes</FieldLabel>
                <textarea className="input mt-1 w-full" rows={2}
                  value={loadNotes} onChange={e => setLoadNotes(e.target.value)}
                  placeholder="Stacked 3 high. Do not tip. Handle with care near top." />
              </div>

              <SectionFooter complete={sec3Complete} label="Load details" onCollapse={() => { if (!sec3Complete) setS3Attempted(true); setS3(true); }} missing={sec3Missing} />
            </div>
          )}
        </div>

        {/* ── Sec 4: Special requirements ──────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={4} icon="⚠️" iconTitle="Review carefully — select any that apply. Undeclared ADR or oversized loads can result in refused collection or legal liability." title="Special requirements" subtitle="ADR, fragile, high value, oversized, secure transport"
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
                  <TextField label="ADR class" value={hazardClass} onChange={setHazardClass}
                    placeholder="Class 3 — Flammable liquids" />
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-muted">ADR tunnel restriction code</label>
                    <select value={tunnelCode} onChange={e => setTunnelCode(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="">Not specified</option>
                      <option value="B">B — Most restricted (explosives etc.)</option>
                      <option value="C">C</option>
                      <option value="C/D">C/D</option>
                      <option value="C/E">C/E</option>
                      <option value="D">D</option>
                      <option value="D/E">D/E</option>
                      <option value="E">E — Least restricted</option>
                    </select>
                  </div>
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
                  <TextField label="Proper shipping name" value={adrProperShippingName}
                    onChange={setAdrProperShippingName}
                    placeholder="e.g. FLAMMABLE LIQUID, N.O.S."
                    hint="Official ADR proper shipping name as it must appear on documents." />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Subsidiary risk (if any)" value={adrSubsidiaryRisk}
                      onChange={setAdrSubsidiaryRisk} placeholder="e.g. 8" />
                    <TextField label="Flash point (°C)" type="number" value={adrFlashPoint}
                      onChange={setAdrFlashPoint} placeholder="e.g. 23"
                      hint="Required for Class 3 flammables." />
                  </div>
                  <TextField label="EMS code" value={adrEmsCode}
                    onChange={setAdrEmsCode} placeholder="e.g. F-E, S-E"
                    hint="Emergency Schedule code (required for sea/multimodal moves)." />
                  <TextField label="Emergency contact (24hr)" value={adrEmergencyContact}
                    onChange={setAdrEmergencyContact} placeholder="CHEMTREC: +1-800-424-9300"
                    hint="24-hour emergency response number to appear on transport documents." />
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
                  <div>
                    <FieldLabel>STGO category</FieldLabel>
                    <select className="input mt-1 w-full" value={stgoCategory} onChange={e => setStgoCategory(e.target.value)}>
                      <option value="">Not yet determined</option>
                      {STGO_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <div className="text-xs text-muted mt-1">Special Types General Order category — affects notifications and speed limits.</div>
                  </div>
                  <TextField label="Movement order number" value={movementOrderNumber}
                    onChange={setMovementOrderNumber} placeholder="MO-2026-00123"
                    hint="Issued by the relevant highways authority. Required before movement." />
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
                BODY_CATEGORIES.find(c => c.value === vehicleCategory)?.label,
                bodyTypes.map(t => BODY_TYPES.find(b => b.value === t)?.label).filter(Boolean).join(", "),
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
                          onClick={() => { setVehicleCategory(value); setBodyTypes([]); }}
                          className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors min-h-[40px] " +
                            (vehicleCategory === value
                              ? "bg-accent text-white border-accent"
                              : "bg-white text-muted border-border hover:border-gray-400")}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {vehicleCategory && (() => {
                    const allowed = new Set(REQ_BODY_TYPES_BY_CATEGORY[vehicleCategory] ?? []);
                    const grouped: Record<string, { value: string; label: string }[]> = {};
                    BODY_TYPES.forEach(bt => {
                      if (!allowed.has(bt.value)) return;
                      if (!grouped[bt.group]) grouped[bt.group] = [];
                      grouped[bt.group].push({ value: bt.value, label: bt.label });
                    });
                    const groups = Object.keys(grouped);
                    function toggleType(v: string) {
                      setBodyTypes(prev =>
                        prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
                      );
                    }
                    return (
                      <div className="space-y-3">
                        <FieldLabel>{["tractor", "drawbar", "heavy_haulage"].includes(vehicleCategory) ? "Trailer type — select all that work" : "Body type — select all that work"}</FieldLabel>
                        {groups.map(g => (
                          <div key={g}>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                              {BODY_TYPE_GROUP_LABELS[g] ?? g}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {grouped[g].map(bt => {
                                const on = bodyTypes.includes(bt.value);
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
              {/* Subcontracting */}
              <div>
                <FieldLabel>Can this job be subcontracted?</FieldLabel>
                <div className="text-xs text-muted mb-2">Whether the carrier can pass this job to another operator or use a spot market.</div>
                <Chips
                  options={[["yes","Yes — freely"],["with_approval","With prior approval only"],["no","No — must stay in-house"]]}
                  value={subcontractingAllowed}
                  onChange={setSubcontractingAllowed} />
              </div>

              {/* Driver qualifications */}
              <div>
                <FieldLabel>Additional driver requirements</FieldLabel>
                <div className="text-xs text-muted mb-2">Site access or customer requirements beyond standard licence and CPC.</div>
                <div className="space-y-2">
                  <Toggle value={cscsRequired} onChange={setCscsRequired}
                    label="CSCS card required (construction sites)" />
                  <Toggle value={bs7858Required} onChange={setBs7858Required}
                    label="BS7858 security vetting required (airports, data centres, MOD)" />
                  <div>
                    <FieldLabel>DBS check required</FieldLabel>
                    <select className="input mt-1 w-full max-w-xs" value={dbsLevel} onChange={e => setDbsLevel(e.target.value)}>
                      <option value="">Not required</option>
                      <option value="basic">Basic DBS check</option>
                      <option value="enhanced">Enhanced DBS check</option>
                    </select>
                  </div>
                </div>
              </div>

              <SectionFooter complete label="Transport requirements" onCollapse={() => setS5(true)} />
            </div>
          )}
        </div>

        {/* ── International / cross-border section ──────────────────────────── */}
        {hasInternationalStop && (
          <div className="card overflow-hidden">
            <SectionHeader num={7} icon="🌍" title="International / cross-border"
              subtitle="Customs, crossing and trade documents"
              active collapsed={sIntl} onToggle={() => setSIntl(o => !o)}
              complete={false} optional
              summary={customsMovementType ? CUSTOMS_MOVEMENT_TYPES.find(([v]) => v === customsMovementType)?.[1] : undefined} />
            {!sIntl && (
              <div className="px-5 pt-5 pb-4 space-y-5">
                <div className="px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 font-medium">
                  One or more stops are outside the UK. Please fill in the cross-border details below to avoid customs delays.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField label="Shipper EORI number" value={shipperEori} onChange={setShipperEori}
                    placeholder="GB123456789000" hint="Exporter's Economic Operator Registration number." />
                  <TextField label="Consignee EORI number" value={consigneeEori} onChange={setConsigneeEori}
                    placeholder="DE987654321000" hint="Importer's EORI number." />
                </div>

                <TextField label="Commodity / HS code" value={hsCode} onChange={setHsCode}
                  placeholder="8703 23 19 00" hint="Harmonised System tariff code. At least 6 digits. Used for customs declarations and tariff preference." />

                <div>
                  <FieldLabel>Customs movement type</FieldLabel>
                  <select className="input mt-1 w-full" value={customsMovementType} onChange={e => setCustomsMovementType(e.target.value)}>
                    <option value="">Not specified</option>
                    {CUSTOMS_MOVEMENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>

                <div>
                  <FieldLabel>Incoterms</FieldLabel>
                  <select className="input mt-1 w-full" value={incoterms} onChange={e => setIncoterms(e.target.value)}>
                    <option value="">Not specified</option>
                    {INCOTERMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <div className="text-xs text-muted mt-1">Trade term defining who pays for freight, insurance, and where risk transfers.</div>
                </div>

                {/* Crossing */}
                <div>
                  <Toggle value={crossingRequired} onChange={v => { setCrossingRequired(v); if (!v) { setCrossingType(""); setCrossingBookingRef(""); } }}
                    label="Sea or tunnel crossing required" />
                  {crossingRequired && (
                    <div className="mt-3 space-y-3 border-l-2 border-blue-100 pl-4">
                      <div>
                        <FieldLabel>Crossing route</FieldLabel>
                        <select className="input mt-1 w-full" value={crossingType} onChange={e => setCrossingType(e.target.value)}>
                          <option value="">Select route</option>
                          {CROSSING_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <TextField label="Crossing booking reference" value={crossingBookingRef}
                        onChange={setCrossingBookingRef} placeholder="EU123456789"
                        hint="If the crossing is pre-booked by the customer. Leave blank if the carrier books it." />
                    </div>
                  )}
                </div>

                <SectionFooter complete={false} label="International details" onCollapse={() => setSIntl(true)} missing={[]} />
              </div>
            )}
          </div>
        )}

        {/* ── Sec 6: Billing & insurance ───────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={6} icon="📄" title="Billing" subtitle="Declared goods value and reference numbers"
            active collapsed={s6} onToggle={() => { if (!s6 && !sec6Complete) setS6Attempted(true); setS6(o => !o); }}
            complete={sec6Complete} started={!!declaredValue || !!poNumber}
            summary={declaredValue ? `£${declaredValue}${poNumber ? ` · PO: ${poNumber}` : ""}` : undefined}
            missingCount={sec6Missing.length} />
          {!s6 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <TextField label="Declared value of goods (£)" required type="number" min="0"
                value={declaredValue} onChange={setDeclaredValue} placeholder="0.00"
                hint="For insurance and liability purposes — not the transport price."
                error={s6Attempted && !(parseFloat(declaredValue) > 0) ? "Required" : undefined} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="Purchase order number" value={poNumber}
                  onChange={setPoNumber} placeholder="PO-2026-12345"
                  hint="Your internal PO number if needed for invoicing." />
                <TextField label="Billing reference / cost code" value={billingRef}
                  onChange={setBillingRef} placeholder="COST-CENTRE-123" />
              </div>
              <SectionFooter complete={sec6Complete} label="Billing" onCollapse={() => { if (!sec6Complete) setS6Attempted(true); setS6(true); }} missing={sec6Missing} />
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
                    <LatLngInput
                      lat={alternativeReturnLat} lng={alternativeReturnLng}
                      onChange={(lat, lng) => { setAlternativeReturnLat(lat); setAlternativeReturnLng(lng); }}
                    />
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
                      error={alternativeReturnContactPhoneError}
                      onChange={v => { setAlternativeReturnContactPhone(v); setAlternativeReturnContactPhoneError(""); }}
                      onBlur={v => setAlternativeReturnContactPhoneError(validatePhone(v, alternativeReturnCountry))}
                      placeholder="+44 7700 900123" />
                  </div>
                </div>
              )}

              {rejectionAction === "call_office_before_leaving" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-l-2 border-orange-200 pl-4">
                  <TextField label="Approval contact name" value={approvalContactName}
                    onChange={setApprovalContactName} placeholder="Jane Smith" />
                  <TextField label="Approval contact phone" type="tel" value={approvalContactPhone}
                    error={approvalContactPhoneError}
                    onChange={v => { setApprovalContactPhone(v); setApprovalContactPhoneError(""); }}
                    onBlur={v => setApprovalContactPhoneError(validatePhone(v, stops[0]?.country ?? "GB"))}
                    placeholder="+44 7700 900123" />
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

/**
 * SharedStopCard — planner stop card for CreateJobPage.
 * Produces stop data in exactly the same format as PublicRequestForm.tsx (PRF).
 * PRF is the source of truth — this file must NOT modify PRF.
 *
 * The main stop body JSX is character-for-character identical to PRF's StopCard body.
 * Planner-only extras (LocationSearch, location type, instructions, internalNotes)
 * are appended inside the optional section.
 */

import { useState } from "react";
import type { SavedLocation, JobPart } from "../../types";
import type { RequestStop } from "../../api/jobRequests";
import {
  FieldLabel,
  Toggle,
  OptionalToggle,
  MultiCheck,
  TextField,
  StatusDot,
} from "./CreateJobFormComponents";

// ── Constants (copied verbatim from PRF lines 88–340) ─────────────────────────

// Public form: only Collection and Delivery shown.
// Reload, Return, Waypoint, Other are planner-only and hidden from the public form.
const STOP_TYPES: [string, string][] = [
  ["collection", "Collection"],
  ["delivery",   "Delivery"],
];

const SERVICE_TIMES: [string, string][] = [
  ["15",     "15 min"],
  ["30",     "30 min"],
  ["45",     "45 min"],
  ["60",     "1 hr"],
  ["90",     "1.5 hr"],
  ["120",    "2 hr"],
  ["180",    "3 hr"],
  ["custom", "Custom"],
];

const LOAD_UNITS: [string, string][] = [
  ["pallets",      "Pallets"],
  ["roll_cages",   "Roll cages / yorks"],
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

// ── Planner-only location types ───────────────────────────────────────────────

const LOCATION_TYPES: [string, string][] = [
  ["warehouse",           "Warehouse"],
  ["depot",               "Depot"],
  ["distribution_centre", "Distribution centre"],
  ["retail",              "Retail / shop"],
  ["industrial_site",     "Industrial site"],
  ["construction_site",   "Construction site"],
  ["port_terminal",       "Port / terminal"],
  ["other",               "Other"],
];

// ── Validation helpers ────────────────────────────────────────────────────────

function validatePhone(v: string, country: string): string {
  if (!v) return "";
  const digits = v.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "Enter a valid phone number";
  return "";
}

function validateEmail(v: string): string {
  if (!v) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Enter a valid email address";
}

// ── SharedStopState interface ─────────────────────────────────────────────────

export interface SharedStopState {
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
  // Planner-only extras
  savedLocationId: number | null;
  locationQuery: string;       // UI only — not sent to API
  locationType: string;
  instructions: string;        // additional driver instructions (separate from navigationInstructions)
  internalNotes: string;       // planner-only, not shown to driver
}

// ── UID generator ─────────────────────────────────────────────────────────────

let _uid = 0;
function uid() { return `ss${++_uid}`; }

// ── blankSharedStop ───────────────────────────────────────────────────────────

export function blankSharedStop(type: string): SharedStopState {
  return {
    id: uid(), type, collapsed: false, showOptional: false,
    siteName: "", street: "", town: "", postcode: "",
    country: "GB",
    lat: "", lng: "", navigationInstructions: "",
    referenceNumber: "",
    date: "", earliestArrivalTime: "", latestArrivalTime: "",
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
    // Planner extras
    savedLocationId: null,
    locationQuery: "",
    locationType: "",
    instructions: "",
    internalNotes: "",
  };
}

// ── sharedStopComplete ────────────────────────────────────────────────────────

export function sharedStopComplete(s: SharedStopState): boolean {
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

// ── sharedStopMissingFields ───────────────────────────────────────────────────

export function sharedStopMissingFields(s: SharedStopState): string[] {
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

// ── sharedStopToRequestStop ───────────────────────────────────────────────────

export function sharedStopToRequestStop(s: SharedStopState, seq: number): RequestStop {
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

// ── jobPartToSharedStopState ──────────────────────────────────────────────────

const SERVICE_TIME_CHIPS = [15, 30, 45, 60, 90, 120, 180];

export function jobPartToSharedStopState(stop: JobPart): SharedStopState {
  // Parse timeWindowStart → date + earliestArrivalTime
  let date = "";
  let earliestArrivalTime = "";
  if (stop.timeWindowStart) {
    const d = new Date(stop.timeWindowStart);
    date = d.toISOString().slice(0, 10);                         // YYYY-MM-DD
    earliestArrivalTime = d.toISOString().slice(11, 16);         // HH:MM
  }

  // Parse timeWindowEnd → latestArrivalTime
  let latestArrivalTime = "";
  if (stop.timeWindowEnd) {
    const d = new Date(stop.timeWindowEnd);
    latestArrivalTime = d.toISOString().slice(11, 16);           // HH:MM
  }

  // Parse bookedTime → HH:MM
  let bookedTime = "";
  if (stop.bookedTime) {
    const d = new Date(stop.bookedTime);
    bookedTime = d.toISOString().slice(11, 16);                  // HH:MM
  }

  // Convert unloadingAllowanceMinutes to serviceTime chip value
  let serviceTime = "30";
  let serviceTimeCustom = "0";
  if (stop.unloadingAllowanceMinutes != null) {
    const mins = stop.unloadingAllowanceMinutes;
    if (SERVICE_TIME_CHIPS.includes(mins)) {
      serviceTime = String(mins);
    } else {
      serviceTime = "custom";
      serviceTimeCustom = String(mins);
    }
  }

  return {
    id: uid(),
    type: stop.type,
    collapsed: false,
    showOptional: false,
    siteName:              stop.siteName              ?? "",
    street:                stop.street                ?? "",
    town:                  stop.town                  ?? "",
    postcode:              stop.postcode              ?? "",
    country:               stop.country               ?? "GB",
    lat:                   stop.lat  != null ? String(stop.lat)  : "",
    lng:                   stop.lng  != null ? String(stop.lng)  : "",
    navigationInstructions: stop.navigationInstructions ?? "",
    referenceNumber:       stop.referenceNumber        ?? "",
    date,
    earliestArrivalTime,
    latestArrivalTime,
    serviceTime,
    serviceTimeCustom,
    quantityRequired:      stop.quantityRequired != null ? String(stop.quantityRequired) : "",
    quantityUnit:          stop.quantityUnit     ?? "pallets",
    stopNotes:             stop.stopNotes        ?? "",
    exchangeDropQty:       stop.exchangeDropQty    != null ? String(stop.exchangeDropQty)    : "",
    exchangeCollectQty:    stop.exchangeCollectQty != null ? String(stop.exchangeCollectQty) : "",
    exchangeUnit:          stop.exchangeUnit     ?? "pallets",
    handlingMethods:       stop.handlingMethods  ?? [],
    handlingMethodOther:   "",
    accessRequirements:    stop.accessRequirements ?? [],
    ppeItems:              [],
    heightRestriction:     "",
    weightRestriction:     "",
    lengthRestriction:     "",
    unitName:              stop.unitName          ?? "",
    addressLine2:          stop.addressLine2      ?? "",
    countyRegion:          stop.countyRegion      ?? "",
    contactName:           stop.contactName       ?? "",
    contactPhone:          stop.contactPhone      ?? "",
    contactEmail:          stop.contactEmail      ?? "",
    bookingRequired:       stop.bookingRequired   ?? false,
    bookingRef:            stop.bookingRef        ?? "",
    openingHours:          stop.openingHours      ?? "",
    bookedTime,
    proofRequirements:     stop.proofRequirements ?? [],
    loadReadiness:         stop.loadReadiness     ?? "",
    // Planner extras
    savedLocationId:       stop.savedLocationId   ?? null,
    locationQuery:         "",
    locationType:          stop.locationType      ?? "",
    instructions:          stop.instructions      ?? "",
    internalNotes:         stop.internalNotes     ?? "",
  };
}

// ── LocationSearch (copied from StopCard.tsx) ─────────────────────────────────

export function LocationSearch({ value, linkedId, locations, onSelect, onClear }: {
  value: string;
  linkedId: number | null;
  locations: SavedLocation[];
  onSelect: (loc: SavedLocation) => void;
  onClear: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const q = value.toLowerCase().trim();
  const filtered = !q ? [] : locations.filter(l =>
    l.name.toLowerCase().includes(q) ||
    l.locationTextSnapshot.toLowerCase().includes(q) ||
    l.town.toLowerCase().includes(q) ||
    l.postcode.toLowerCase().includes(q)
  ).slice(0, 8);

  return (
    <div className="relative">
      <div className="relative">
        <input type="text" className="input pr-8"
          placeholder="Search saved locations or type address…"
          value={value}
          onChange={e => { onClear(e.target.value); setOpen(true); }}
          onFocus={() => filtered.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off" />
        {linkedId && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500 text-sm" title="Saved location linked">✓</span>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg overflow-hidden">
          {filtered.map(l => (
            <button key={l.id} type="button" onMouseDown={() => { onSelect(l); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-border last:border-0">
              <div className="font-semibold text-primary">{l.name}</div>
              <div className="text-xs text-muted">{[l.locationTextSnapshot || l.street, l.town, l.postcode].filter(Boolean).join(", ")}</div>
            </button>
          ))}
          <div className="px-4 py-2 text-xs text-muted bg-gray-50 border-t border-border">
            Not listed? Fill in the address fields below manually
          </div>
        </div>
      )}
    </div>
  );
}

// ── ServiceTimeChips (same as PRF) ────────────────────────────────────────────

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

// ── Chips (single-select, same as PRF) ───────────────────────────────────────

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

// ── SharedStopCard ────────────────────────────────────────────────────────────

export default function SharedStopCard({
  stop,
  index,
  total,
  onChange,
  onRemove,
  savedLocations,
  highlightErrors,
}: {
  stop: SharedStopState;
  index: number;
  total: number;
  onChange: (patch: Partial<SharedStopState>) => void;
  onRemove: () => void;
  savedLocations?: SavedLocation[];
  highlightErrors?: boolean;
}) {
  const [showCoordHelp, setShowCoordHelp] = useState(false);
  const [stopPhoneError, setStopPhoneError] = useState("");
  const [stopEmailError, setStopEmailError] = useState("");
  const complete = sharedStopComplete(stop);
  const started  = !!(stop.siteName || stop.street || stop.referenceNumber);
  const typeLabel = STOP_TYPES.find(([v]) => v === stop.type)?.[1] ?? stop.type;
  const needsRef = stop.type === "collection" || stop.type === "delivery";
  const loadingLabel = stop.type === "collection" ? "How will this be loaded?" : stop.type === "delivery" ? "How will this be unloaded?" : "Handling method";

  const accent =
    complete ? "border-l-green-500" :
    started  ? "border-l-blue-400"  : "border-l-transparent";
  const headerBg =
    complete && stop.collapsed  ? "bg-green-50/60" :
    !stop.collapsed             ? "bg-white"        : "bg-slate-50/70";

  function applyLocation(loc: SavedLocation) {
    onChange({
      locationQuery:   loc.name,
      savedLocationId: loc.id,
      siteName:        loc.siteName  || loc.name,
      street:          loc.street    || loc.locationTextSnapshot,
      town:            loc.town,
      postcode:        loc.postcode,
      country:         "GB",
      lat:             loc.lat  != null ? String(loc.lat)  : "",
      lng:             loc.lng  != null ? String(loc.lng)  : "",
      unitName:        loc.unitName    || "",
      contactName:     loc.contactName  || "",
      contactPhone:    loc.contactPhone || "",
      instructions:    loc.instructions || "",
      internalNotes:   loc.internalNotes || "",
    });
  }

  const hasSavedLocations = savedLocations && savedLocations.length > 0;

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

          {/* [PLANNER ONLY] Location search — above address section */}
          {hasSavedLocations && (
            <div>
              <FieldLabel>Saved location</FieldLabel>
              <LocationSearch
                value={stop.locationQuery}
                linkedId={stop.savedLocationId}
                locations={savedLocations!}
                onSelect={applyLocation}
                onClear={text => onChange({ locationQuery: text, savedLocationId: null })}
              />
              {stop.savedLocationId && (
                <button type="button" onClick={() => onChange({
                  locationQuery: "", savedLocationId: null,
                  siteName: "", street: "", town: "", postcode: "", country: "GB",
                  lat: "", lng: "",
                  unitName: "", contactName: "", contactPhone: "",
                  instructions: "", internalNotes: "",
                })}
                  className="text-xs text-muted hover:text-red-500 mt-1 transition-colors">
                  ✕ Clear saved location
                </button>
              )}
            </div>
          )}

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
                className={`input mt-1 ${highlightErrors && !stop.postcode.trim() ? "border-red-400 focus:border-red-500" : ""}`}
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
            <FieldLabel required>Exact entrance pin — latitude / longitude</FieldLabel>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <FieldLabel>Latitude</FieldLabel>
                <input className={`input font-mono ${highlightErrors && !stop.lat ? "border-red-400 focus:border-red-500" : ""}`} type="number" step="0.000001"
                  placeholder="e.g. 53.483959"
                  value={stop.lat}
                  onChange={e => onChange({ lat: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Longitude</FieldLabel>
                <input className={`input font-mono ${highlightErrors && !stop.lng ? "border-red-400 focus:border-red-500" : ""}`} type="number" step="0.000001"
                  placeholder="e.g. -2.244644"
                  value={stop.lng}
                  onChange={e => onChange({ lng: e.target.value })} />
              </div>
            </div>
            {highlightErrors && (!stop.lat || !stop.lng) && (
              <p className="text-xs text-red-600 mt-1">Entrance pin coordinates are required</p>
            )}

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
            <textarea className={`input mt-1 w-full ${highlightErrors && !stop.navigationInstructions.trim() ? "border-red-400 focus:border-red-500" : ""}`} rows={3}
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
                  error={stopPhoneError}
                  onChange={v => { onChange({ contactPhone: v }); setStopPhoneError(""); }}
                  onBlur={v => setStopPhoneError(validatePhone(v, stop.country))} />
                <TextField label="Site contact email" type="email" value={stop.contactEmail}
                  error={stopEmailError}
                  onChange={v => { onChange({ contactEmail: v }); setStopEmailError(""); }}
                  onBlur={v => setStopEmailError(validateEmail(v))} />
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

              {/* ── Planner-only extras ────────────────────────────────────────── */}

              {/* Location type */}
              <div>
                <FieldLabel>Location type</FieldLabel>
                <div className="relative mt-1">
                  <select
                    className="input w-full appearance-none pr-9"
                    value={stop.locationType}
                    onChange={e => onChange({ locationType: e.target.value })}>
                    <option value="">— Select —</option>
                    {LOCATION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Additional driver instructions */}
              <div>
                <FieldLabel>Additional driver instructions</FieldLabel>
                <textarea className="input mt-1 w-full" rows={2}
                  placeholder="Use gate 3, call ahead 30 min before arrival…"
                  value={stop.instructions}
                  onChange={e => onChange({ instructions: e.target.value })} />
                <div className="text-xs text-muted mt-1">Shown to the driver — additional to entrance instructions above.</div>
              </div>

              {/* Internal notes — planner only */}
              <div>
                <FieldLabel>Internal notes (planner only — not shown to driver)</FieldLabel>
                <textarea className="input mt-1 w-full" rows={2}
                  placeholder="Not shown to driver — planner only…"
                  value={stop.internalNotes}
                  onChange={e => onChange({ internalNotes: e.target.value })} />
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}

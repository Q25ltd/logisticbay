/**
 * Public transport request form.
 * Design: identical visual language to CreateJobPage.
 * Structure: requester → stops → load → special requirements → transport → billing → notes
 */

import { useState, useEffect } from "react";
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

// ── Constants ─────────────────────────────────────────────────────────────────

const STOP_TYPES: [string, string][] = [
  ["collection", "📦 Collection"],
  ["delivery",   "🏁 Delivery"],
  ["reload",     "🔄 Reload"],
  ["return",     "↩ Return"],
  ["waypoint",   "📍 Waypoint"],
  ["other",      "➕ Other"],
];

const SERVICE_TIMES: [string, string][] = [
  ["15", "15 min"], ["30", "30 min"], ["45", "45 min"],
  ["60", "1 hour"], ["90", "1.5 hrs"], ["120", "2 hrs"], ["180", "3 hrs"], ["custom", "Custom"],
];

const LOAD_TYPES: [string, string][] = [
  ["pallets",            "📦 Pallets"],
  ["machinery",          "⚙️ Machinery"],
  ["building_materials", "🧱 Building materials"],
  ["food_refrigerated",  "❄️ Food / refrigerated"],
  ["bulk_material",      "⛏️ Bulk material"],
  ["steel_long",         "🏗️ Steel / long loads"],
  ["vehicles",           "🚙 Vehicles"],
  ["containers",         "🚢 Containers"],
  ["general",            "📋 General goods"],
  ["other",              "📦 Other"],
];

const LOAD_UNITS: [string, string][] = [
  ["pallets", "Pallets"], ["tonnes", "Tonnes"], ["kg", "Kilograms"],
  ["bags", "Bags"], ["items", "Items"], ["loads", "Loads"],
  ["litres", "Litres"], ["cubic_metres", "Cubic metres"], ["other", "Other"],
];

const HANDLING_METHODS: [string, string][] = [
  ["forklift",          "🏭 Forklift"],
  ["loading_bay",       "🚪 Loading bay"],
  ["crane",             "🏗️ Crane"],
  ["handball",          "💪 Handball"],
  ["side_loading",      "↔ Side loading"],
  ["drive_on",          "🚙 Drive on"],
  ["drive_off",         "🚙 Drive off"],
  ["tail_lift_required","⬆ Tail lift"],
  ["tipper_loading",    "⬆ Tipper load"],
  ["tipper_unloading",  "⬇ Tipper discharge"],
  ["other",             "➕ Other"],
];

const ACCESS_REQUIREMENTS: [string, string][] = [
  ["narrow_road",          "🛣️ Narrow road"],
  ["height_restriction",   "📏 Height restriction"],
  ["weight_restriction",   "⚖️ Weight restriction"],
  ["no_artic_access",      "🚛 No artic access"],
  ["no_trailer_access",    "🚚 No trailer access"],
  ["residential_area",     "🏘️ Residential area"],
  ["security_checkin",     "🔐 Security check-in"],
  ["ppe_required",         "🦺 PPE required"],
  ["booking_required",     "📅 Booking required"],
  ["driver_id_required",   "🪪 Driver ID required"],
  ["do_not_arrive_early",  "⏰ Do not arrive early"],
  ["holding_area_required","🅿️ Holding area required"],
  ["port_access",          "⚓ Port access"],
  ["airport_access",       "✈️ Airport access"],
];

const SPECIAL_REQUIREMENTS: [string, string][] = [
  ["dangerous_goods",           "⚠️ Dangerous goods (ADR)"],
  ["temperature_controlled",    "❄️ Temperature controlled"],
  ["fragile",                   "⚠️ Fragile / handle with care"],
  ["high_value",                "💎 High value goods"],
  ["oversized",                 "📏 Oversized load"],
  ["secure_transport_required", "🔒 Secure transport"],
  ["escort_required",           "🚔 Police escort required"],
  ["temperature_monitored",     "🌡️ Temperature monitored"],
];

const PRICING_TYPES: [string, string][] = [
  ["quote_required",        "Request a quote"],
  ["agreed_rate_exists",    "We have an agreed rate"],
  ["contract_rate_exists",  "Contract rate applies"],
  ["to_be_confirmed",       "To be confirmed"],
];

const DRIVER_CHIPS: [string, string][] = [
  ["call_before_arrival",  "📞 Call before arrival"],
  ["report_to_security",   "🔐 Report to security"],
  ["use_rear_entrance",    "🚪 Use rear entrance"],
  ["ppe_required",         "🦺 PPE required"],
  ["bring_straps",         "🔗 Bring straps"],
  ["bring_pump_truck",     "🔧 Bring pump truck"],
  ["do_not_arrive_early",  "⏰ Do not arrive early"],
];

// ── Stop state ────────────────────────────────────────────────────────────────

interface StopState {
  id: string;
  type: string;
  collapsed: boolean;
  showOptional: boolean;
  // Required
  companySiteName: string;
  addressLine1: string;
  townCity: string;
  postcode: string;
  entranceLatitude: string;
  entranceLongitude: string;
  entranceInstructions: string;
  referenceNumber: string;
  date: string;
  earliestArrivalTime: string;
  latestArrivalTime: string;
  serviceTime: string;
  serviceTimeCustom: string;
  handlingMethods: string[];
  accessRequirements: string[];
  // Optional
  unitName: string;
  addressLine2: string;
  countyRegion: string;
  country: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  bookingRequired: boolean;
  bookingReference: string;
  openingHours: string;
  exactAppointmentTime: string;
}

let _uid = 0;
function uid() { return `s${++_uid}`; }

function blankStop(type: string): StopState {
  return {
    id: uid(), type, collapsed: false, showOptional: false,
    companySiteName: "", addressLine1: "", townCity: "", postcode: "",
    entranceLatitude: "", entranceLongitude: "", entranceInstructions: "",
    referenceNumber: "",
    date: "", earliestArrivalTime: "", latestArrivalTime: "",
    serviceTime: "30", serviceTimeCustom: "",
    handlingMethods: [], accessRequirements: [],
    unitName: "", addressLine2: "", countyRegion: "", country: "",
    contactName: "", contactPhone: "", contactEmail: "",
    bookingRequired: false, bookingReference: "", openingHours: "",
    exactAppointmentTime: "",
  };
}

function stopComplete(s: StopState): boolean {
  const needsRef = s.type === "collection" || s.type === "delivery";
  return !!(
    s.companySiteName.trim() && s.addressLine1.trim() &&
    s.townCity.trim() && s.postcode.trim() &&
    s.entranceLatitude && s.entranceLongitude &&
    s.entranceInstructions.trim() &&
    s.date && s.earliestArrivalTime && s.latestArrivalTime &&
    s.serviceTime &&
    (!needsRef || s.referenceNumber.trim())
  );
}

function stopStarted(s: StopState): boolean {
  return !!(s.companySiteName || s.addressLine1 || s.referenceNumber);
}

function stopToRequestStop(s: StopState, seq: number): RequestStop {
  const svcMin = s.serviceTime === "custom" ? parseInt(s.serviceTimeCustom, 10) || 30 : parseInt(s.serviceTime, 10);
  return {
    type:           s.type as RequestStop["type"],
    sequence:       seq,
    companySiteName:     s.companySiteName.trim(),
    addressLine1:        s.addressLine1.trim(),
    addressLine2:        s.addressLine2.trim() || undefined,
    townCity:            s.townCity.trim(),
    countyRegion:        s.countyRegion.trim() || undefined,
    postcode:            s.postcode.trim(),
    country:             s.country.trim() || undefined,
    entranceLatitude:    parseFloat(s.entranceLatitude),
    entranceLongitude:   parseFloat(s.entranceLongitude),
    entranceInstructions: s.entranceInstructions.trim(),
    referenceNumber:     s.referenceNumber.trim() || undefined,
    contactName:         s.contactName.trim()  || undefined,
    contactPhone:        s.contactPhone.trim() || undefined,
    contactEmail:        s.contactEmail.trim() || undefined,
    bookingRequired:     s.bookingRequired || undefined,
    bookingReference:    s.bookingReference.trim() || undefined,
    openingHours:        s.openingHours.trim() || undefined,
    date:                s.date,
    earliestArrivalTime: s.earliestArrivalTime,
    latestArrivalTime:   s.latestArrivalTime,
    exactAppointmentTime: s.exactAppointmentTime || undefined,
    estimatedServiceTimeMinutes: svcMin,
    handlingMethods:     s.handlingMethods.length ? s.handlingMethods : undefined,
    accessRequirements:  s.accessRequirements.length ? s.accessRequirements : undefined,
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
    <div className="flex flex-wrap gap-2">
      {SERVICE_TIMES.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={"px-3 py-2 rounded-xl border text-sm font-medium transition-colors " +
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
        <span className="text-base">{STOP_TYPES.find(([v]) => v === stop.type)?.[0] === stop.type ? (stop.type === "collection" ? "📦" : stop.type === "delivery" ? "🏁" : "📍") : "📍"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase tracking-widest ${complete ? "text-green-600" : started ? "text-blue-500" : "text-muted"}`}>
              {typeLabel.replace(/^.+ /, "")}
            </span>
            {total > 1 && (
              <span className="text-xs text-muted">#{index + 1}</span>
            )}
          </div>
          {stop.collapsed && stop.companySiteName
            ? <p className="text-xs text-accent font-semibold truncate">{stop.companySiteName}{stop.date ? ` · ${stop.date}` : ""}</p>
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
            <FieldLabel>Stop type</FieldLabel>
            <div className="flex flex-wrap gap-2 mt-1">
              {STOP_TYPES.map(([v, l]) => (
                <button key={v} type="button" onClick={() => onChange({ type: v })}
                  className={"px-3 py-1.5 rounded-full border text-xs font-medium transition-colors " +
                    (stop.type === v ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
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

          {/* Site name */}
          <TextField label="Site name" required
            value={stop.companySiteName} onChange={v => onChange({ companySiteName: v })}
            placeholder="Acme Warehouse — Unit 5" caseRule="proper_name" />

          {/* Address */}
          <TextField label="Address line 1" required
            value={stop.addressLine1} onChange={v => onChange({ addressLine1: v })}
            placeholder="Industrial Estate Road" caseRule="proper_name" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <TextField label="Town / city" required
                value={stop.townCity} onChange={v => onChange({ townCity: v })}
                placeholder="Birmingham" caseRule="proper_name" />
            </div>
            <TextField label="Postcode" required
              value={stop.postcode} onChange={v => onChange({ postcode: v.toUpperCase() })}
              placeholder="B1 1AA" />
          </div>

          {/* Date + time window */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TextField label={stop.type === "collection" ? "Collection date" : "Delivery date"} required
              type="date" value={stop.date} onChange={v => onChange({ date: v })} />
            <TextField label="Earliest arrival" required
              type="time" value={stop.earliestArrivalTime} onChange={v => onChange({ earliestArrivalTime: v })} />
            <TextField label="Latest arrival" required
              type="time" value={stop.latestArrivalTime} onChange={v => onChange({ latestArrivalTime: v })} />
          </div>

          {/* Service time */}
          <div>
            <FieldLabel required>Estimated {stop.type === "collection" ? "loading" : "unloading"} time</FieldLabel>
            <ServiceTimeChips value={stop.serviceTime} onChange={v => onChange({ serviceTime: v })} />
            {stop.serviceTime === "custom" && (
              <input className="input mt-2 max-w-xs" type="number" placeholder="Minutes"
                value={stop.serviceTimeCustom} onChange={e => onChange({ serviceTimeCustom: e.target.value })} />
            )}
          </div>

          {/* Entrance pin */}
          <div>
            <FieldLabel required>Exact entrance pin — latitude / longitude</FieldLabel>
            <div className="text-xs text-muted mb-2">
              The exact coordinates where the driver should enter: gate, yard entrance, goods-in door, or security barrier.
              <br />Google Maps → right-click the exact entrance point → copy the coordinates shown at the top of the menu.
              <strong className="text-primary"> Must be the truck gate, not the building centre.</strong>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Latitude</FieldLabel>
                <input className="input font-mono" type="number" step="0.000001"
                  placeholder="e.g. 53.483959"
                  value={stop.entranceLatitude}
                  onChange={e => onChange({ entranceLatitude: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Longitude</FieldLabel>
                <input className="input font-mono" type="number" step="0.000001"
                  placeholder="e.g. -2.244644"
                  value={stop.entranceLongitude}
                  onChange={e => onChange({ entranceLongitude: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Entrance instructions */}
          <div>
            <FieldLabel required>Entrance instructions</FieldLabel>
            <textarea className="input mt-1 w-full" rows={3}
              placeholder={stop.type === "collection"
                ? "Enter via Gate B on the left. Intercom code 1234. Ask for goods-in."
                : "Goods-in via roller shutters at rear. Report to warehouse office first."}
              value={stop.entranceInstructions}
              onChange={e => onChange({ entranceInstructions: e.target.value })} />
            <div className="text-xs text-muted mt-1">Gate code, security procedure, which entrance to use.</div>
          </div>

          {/* Handling methods — per stop */}
          <div>
            <FieldLabel>{loadingLabel}</FieldLabel>
            <div className="mt-1">
              <MultiCheck options={HANDLING_METHODS} value={stop.handlingMethods}
                onChange={v => onChange({ handlingMethods: v })} />
            </div>
          </div>

          {/* Access requirements — per stop */}
          <div>
            <FieldLabel>Site access requirements</FieldLabel>
            <div className="mt-1">
              <MultiCheck options={ACCESS_REQUIREMENTS} value={stop.accessRequirements}
                onChange={v => onChange({ accessRequirements: v })} />
            </div>
            {/* Conditional: height restriction value */}
            {stop.accessRequirements.includes("height_restriction") && (
              <input className="input mt-2 max-w-xs" type="text" placeholder="Max height (e.g. 4.0m)"
                value={""} onChange={() => {}} />
            )}
            {/* Conditional: booking required → show reference field */}
            {stop.accessRequirements.includes("booking_required") && !stop.bookingRequired && (
              <div className="mt-3">
                <Toggle value={stop.bookingRequired} onChange={v => onChange({ bookingRequired: v })}
                  label="I have a booking reference for this site" />
              </div>
            )}
          </div>

          {/* Optional fields */}
          <OptionalToggle open={stop.showOptional}
            onToggle={() => onChange({ showOptional: !stop.showOptional })}
            label="site contact, opening hours & booking" />

          {stop.showOptional && (
            <div className="space-y-4 border-l-2 border-blue-100 pl-4">
              <TextField label="Unit / building name" value={stop.unitName}
                onChange={v => onChange({ unitName: v })} placeholder="Unit 12B" />
              <TextField label="Address line 2" value={stop.addressLine2}
                onChange={v => onChange({ addressLine2: v })} placeholder="Business Park" />
              <TextField label="County / region" value={stop.countyRegion}
                onChange={v => onChange({ countyRegion: v })} placeholder="West Midlands" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextField label="Site contact name"  value={stop.contactName}
                  onChange={v => onChange({ contactName: v })} />
                <TextField label="Site contact phone" type="tel" value={stop.contactPhone}
                  onChange={v => onChange({ contactPhone: v })} />
                <TextField label="Site contact email" type="email" value={stop.contactEmail}
                  onChange={v => onChange({ contactEmail: v })} />
              </div>
              <Toggle value={stop.bookingRequired} onChange={v => onChange({ bookingRequired: v })}
                label="Booking required before arrival" />
              {stop.bookingRequired && (
                <TextField label="Booking reference" value={stop.bookingReference}
                  onChange={v => onChange({ bookingReference: v })} placeholder="BKG-2026-5678" />
              )}
              <TextField label="Opening hours" value={stop.openingHours}
                onChange={v => onChange({ openingHours: v })} placeholder="Mon–Fri 06:00–18:00" />
              <TextField label="Exact appointment time (if any)" type="time"
                value={stop.exactAppointmentTime}
                onChange={v => onChange({ exactAppointmentTime: v })} />
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
  const [s1, setS1] = useState(false);
  const [s2, setS2] = useState(false);
  const [s3, setS3] = useState(false);
  const [s4, setS4] = useState(false);
  const [s5, setS5] = useState(false);
  const [s6, setS6] = useState(false);
  const [s7, setS7] = useState(false);

  // ── Sec 1: Requester ──────────────────────────────────────────────────────
  const [customerCompanyName, setCustomerCompanyName] = useState("");
  const [contactName,  setContactName]  = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [showRequesterOpts, setShowRequesterOpts] = useState(false);
  const [customerReference, setCustomerReference] = useState("");

  // ── Sec 2: Stops ──────────────────────────────────────────────────────────
  const [stops, setStops] = useState<StopState[]>([
    blankStop("collection"),
    blankStop("delivery"),
  ]);
  const updStop = (id: string, patch: Partial<StopState>) =>
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeStop = (id: string) =>
    setStops(prev => prev.filter(s => s.id !== id));

  // ── Sec 3: Load ───────────────────────────────────────────────────────────
  const [goodsType,    setGoodsType]    = useState("");
  const [goodsDesc,    setGoodsDesc]    = useState("");
  const [quantity,     setQuantity]     = useState("");
  const [unit,         setUnit]         = useState("pallets");
  const [otherUnit,    setOtherUnit]    = useState("");
  const [estWeight,    setEstWeight]    = useState("");
  const [palletCount,  setPalletCount]  = useState("");
  const [palletType,   setPalletType]   = useState("");
  const [stackable,    setStackable]    = useState(false);
  const [dimensions,   setDimensions]   = useState("");
  const [craneReq,     setCraneReq]     = useState(false);
  const [tippingReq,   setTippingReq]   = useState(false);
  const [tempRange,    setTempRange]    = useState("");
  const [tempType,     setTempType]     = useState("");
  const [vehicleCount, setVehicleCount] = useState("");
  const [driveable,    setDriveable]    = useState(false);
  const [containerSize, setContainerSize] = useState("");
  const [loadedOrEmpty, setLoadedOrEmpty] = useState("");
  const [containerNum,  setContainerNum]  = useState("");
  const [loadNotes,     setLoadNotes]     = useState("");

  // ── Sec 4: Special requirements ───────────────────────────────────────────
  const [specialItems, setSpecialItems] = useState<string[]>([]);
  const [adrClass,     setAdrClass]     = useState("");
  const [unNumber,     setUnNumber]     = useState("");
  const [specTempRange, setSpecTempRange] = useState("");

  // ── Sec 5: Transport ──────────────────────────────────────────────────────
  const [plannerDecides,  setPlannerDecides]  = useState(true);
  const [showTransOpts,   setShowTransOpts]   = useState(false);
  // Advanced transport (only when plannerDecides=false)
  const [reqBodyCategory,     setReqBodyCategory]     = useState("");
  const [reqBodyType,         setReqBodyType]         = useState("");
  const [reqEquipment,        setReqEquipment]        = useState<string[]>([]);
  const [trailerTypesAllowed, setTrailerTypesAllowed] = useState<string[]>([]);

  // ── Sec 6: Billing ────────────────────────────────────────────────────────
  const [pricingType,     setPricingType]     = useState("quote_required");
  const [declaredValue,   setDeclaredValue]   = useState("");
  const [poNumber,        setPoNumber]        = useState("");
  const [billingRef,      setBillingRef]      = useState("");
  const [vatRegistered,   setVatRegistered]   = useState(false);
  const [vatNumber,       setVatNumber]       = useState("");

  // ── Sec 7: Notes ─────────────────────────────────────────────────────────
  const [driverChips,       setDriverChips]       = useState<string[]>([]);
  const [driverNotes,       setDriverNotes]       = useState("");
  const [showNotesOpts,     setShowNotesOpts]     = useState(false);
  const [safetyNotes,       setSafetyNotes]       = useState("");
  const [customerNotes,     setCustomerNotes]     = useState("");

  // ── Completeness ──────────────────────────────────────────────────────────
  const sec1Complete = !!(customerCompanyName.trim() && contactName.trim() && contactPhone.trim() && contactEmail.trim());
  const sec2Complete = stops.length > 0 && stops.every(stopComplete) &&
    stops.some(s => s.type === "collection") && stops.some(s => s.type === "delivery");
  const sec3Complete = !!(goodsType && goodsDesc.trim() && quantity && unit);
  const sec4Complete = true; // optional section
  const sec5Complete = true; // optional
  const sec6Complete = true; // optional
  const sec7Complete = true; // optional

  const sec1Started = !!(customerCompanyName || contactName);
  const sec2Started = stops.some(stopStarted);
  const sec3Started = !!(goodsType || goodsDesc);

  const collectionCount = stops.filter(s => s.type === "collection").length;
  const deliveryCount   = stops.filter(s => s.type === "delivery").length;
  const sec2Summary = [
    collectionCount > 0 && `${collectionCount} collection${collectionCount > 1 ? "s" : ""}`,
    deliveryCount   > 0 && `${deliveryCount} deliver${deliveryCount > 1 ? "ies" : "y"}`,
  ].filter(Boolean).join(", ");

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

    const body: SubmitRequestBody = {
      requesterData: {
        customerCompanyName: customerCompanyName.trim(),
        contactName:         contactName.trim(),
        contactPhone:        contactPhone.trim(),
        contactEmail:        contactEmail.trim(),
        customerReference:   customerReference.trim() || undefined,
      },
      stops: stops.map((s, i) => stopToRequestStop(s, i + 1)),
      loadData: {
        goodsType,
        goodsDescription: goodsDesc.trim(),
        quantity:         parseFloat(quantity),
        unit:             unit === "other" ? (otherUnit.trim() || "other") : unit,
        estimatedWeight:  estWeight    ? parseFloat(estWeight)    : undefined,
        palletCount:      palletCount  ? parseInt(palletCount, 10): undefined,
        palletType:       palletType   || undefined,
        stackable:        stackable    || undefined,
        dimensions:       dimensions.trim()   || undefined,
        craneRequired:    craneReq     || undefined,
        tippingRequired:  tippingReq   || undefined,
        temperatureRange: tempRange.trim() || undefined,
        chilledFrozenAmbient: tempType || undefined,
        vehicleCount:     vehicleCount ? parseInt(vehicleCount, 10) : undefined,
        driveable:        driveable    || undefined,
        containerSize:    containerSize || undefined,
        loadedOrEmpty:    loadedOrEmpty || undefined,
        containerNumber:  containerNum.trim() || undefined,
        loadNotes:        loadNotes.trim()    || undefined,
      },
      specialRequirementsData: specialItems.length ? {
        items:            specialItems,
        adrClass:         adrClass.trim()       || undefined,
        unNumber:         unNumber.trim()        || undefined,
        temperatureRange: specTempRange.trim()   || undefined,
      } : undefined,
      transportRequirementsData: {
        plannerDecides,
        reqBodyCategory:     plannerDecides ? undefined : reqBodyCategory || undefined,
        reqBodyType:         plannerDecides ? undefined : reqBodyType     || undefined,
        reqEquipment:        plannerDecides ? undefined : reqEquipment.length ? reqEquipment : undefined,
        trailerTypesAllowed: plannerDecides ? undefined : trailerTypesAllowed.length ? trailerTypesAllowed : undefined,
      },
      billingData: {
        pricingType,
        declaredGoodsValue:  declaredValue ? parseFloat(declaredValue) : undefined,
        purchaseOrderNumber: poNumber.trim()   || undefined,
        billingReference:    billingRef.trim() || undefined,
        vatRegistered:       vatRegistered     || undefined,
        vatNumber:           vatNumber.trim()  || undefined,
      },
      notesData: (driverChips.length || driverNotes.trim() || safetyNotes.trim() || customerNotes.trim()) ? {
        driverNoteChips:    driverChips.length ? driverChips : undefined,
        driverVisibleNotes: driverNotes.trim()   || undefined,
        safetyInstructions: safetyNotes.trim()   || undefined,
        customerNotes:      customerNotes.trim() || undefined,
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
                label="customer reference" />
              {showRequesterOpts && (
                <div className="border-l-2 border-blue-100 pl-4">
                  <TextField label="Your internal reference / order number" value={customerReference}
                    onChange={setCustomerReference} placeholder="ORD-2026-1234"
                    hint="Your own reference number for this job, if you have one." />
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

              {/* Add stop buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button"
                  onClick={() => setStops(prev => [...prev, blankStop("collection")])}
                  className="px-4 py-2 text-sm font-medium border-2 border-dashed border-blue-300 text-blue-600 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors">
                  + Add collection stop
                </button>
                <button type="button"
                  onClick={() => setStops(prev => [...prev, blankStop("delivery")])}
                  className="px-4 py-2 text-sm font-medium border-2 border-dashed border-green-300 text-green-700 rounded-xl hover:border-green-500 hover:bg-green-50 transition-colors">
                  + Add delivery stop
                </button>
                <button type="button"
                  onClick={() => setStops(prev => [...prev, blankStop("other")])}
                  className="px-4 py-2 text-sm font-medium border-2 border-dashed border-border text-muted rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-colors">
                  + Add stop
                </button>
              </div>

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
              </div>

              {/* Description */}
              <div>
                <FieldLabel required>Description of goods</FieldLabel>
                <textarea className="input mt-1 w-full" rows={2}
                  value={goodsDesc} onChange={e => setGoodsDesc(e.target.value)}
                  placeholder={goodsType === "pallets"  ? "Engine parts on euro pallets" :
                                goodsType === "bulk_material" ? "Type 1 MOT, dry" :
                                goodsType === "steel_long"    ? "25m RSJ beams, galvanised" :
                                "Describe exactly what is being transported"} />
              </div>

              {/* Quantity + unit */}
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Quantity" required type="number" value={quantity}
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

              {/* Estimated weight */}
              <TextField label="Estimated total weight (kg)" type="number"
                value={estWeight} onChange={setEstWeight} placeholder="14000"
                hint="Approximate — helps the planner choose the right vehicle." />

              {/* ── Conditional: Pallets ── */}
              {goodsType === "pallets" && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Pallet count" type="number" value={palletCount}
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
                  <Toggle value={stackable} onChange={setStackable} label="Pallets are stackable" />
                </div>
              )}

              {/* ── Conditional: Machinery ── */}
              {goodsType === "machinery" && (
                <div className="space-y-4 pt-1">
                  <TextField label="Dimensions (L × W × H)" value={dimensions}
                    onChange={setDimensions} placeholder="e.g. 4.5m × 2.2m × 3.1m" />
                  <Toggle value={craneReq} onChange={setCraneReq} label="Crane required on site" />
                </div>
              )}

              {/* ── Conditional: Bulk material ── */}
              {goodsType === "bulk_material" && (
                <div className="space-y-4 pt-1">
                  <Toggle value={tippingReq} onChange={setTippingReq} label="Tipping required at delivery" />
                  <div>
                    <FieldLabel>Wet or dry</FieldLabel>
                    <div className="flex gap-2 mt-1">
                      {[["dry","Dry"],["wet","Wet"]].map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setTempType(v)}
                          className={"px-4 py-2 rounded-full border text-sm font-medium transition-colors " +
                            (tempType === v ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Conditional: Steel/long loads ── */}
              {goodsType === "steel_long" && (
                <div className="space-y-4 pt-1">
                  <TextField label="Longest item length (m)" type="number"
                    value={dimensions} onChange={setDimensions} placeholder="25" />
                </div>
              )}

              {/* ── Conditional: Food/refrigerated ── */}
              {goodsType === "food_refrigerated" && (
                <div className="space-y-4 pt-1">
                  <div>
                    <FieldLabel>Chilled, frozen or ambient?</FieldLabel>
                    <div className="flex gap-2 mt-1">
                      {[["chilled","❄ Chilled"],["frozen","🧊 Frozen"],["ambient","🌡 Ambient"]].map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setTempType(v)}
                          className={"px-3 py-2 rounded-full border text-sm font-medium transition-colors " +
                            (tempType === v ? "bg-blue-500 text-white border-blue-500" : "bg-white text-muted border-border hover:border-gray-400")}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <TextField label="Required temperature range" value={tempRange}
                    onChange={setTempRange} placeholder="2°C – 8°C" />
                </div>
              )}

              {/* ── Conditional: Vehicles ── */}
              {goodsType === "vehicles" && (
                <div className="space-y-4 pt-1">
                  <TextField label="Number of vehicles" type="number"
                    value={vehicleCount} onChange={setVehicleCount} placeholder="2" />
                  <Toggle value={driveable} onChange={setDriveable} label="Vehicles are driveable (RORO)" />
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
                  </div>
                  <div>
                    <FieldLabel>Loaded or empty?</FieldLabel>
                    <div className="flex gap-2 mt-1">
                      {[["loaded","Loaded"],["empty","Empty"]].map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setLoadedOrEmpty(v)}
                          className={"px-3 py-2 rounded-full border text-sm font-medium transition-colors " +
                            (loadedOrEmpty === v ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <TextField label="Container number (optional)" value={containerNum}
                    onChange={setContainerNum} placeholder="MSCU1234567" />
                </div>
              )}

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
          <SectionHeader num={4} icon="⚠️" title="Special requirements" subtitle="ADR, temperature, fragile, high value, oversized"
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
                  <TextField label="UN number" value={unNumber} onChange={setUnNumber}
                    placeholder="UN 1993" />
                </div>
              )}

              {/* Conditional: temperature controlled */}
              {specialItems.includes("temperature_controlled") && (
                <div className="border-l-2 border-blue-200 pl-4">
                  <TextField label="Required temperature range" value={specTempRange}
                    onChange={setSpecTempRange} placeholder="2°C – 8°C" />
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
            summary={plannerDecides ? "Planner will decide" : (reqBodyCategory || undefined)} />
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
                    <Chips
                      options={[["tractor","Artic / tractor"],["rigid","Rigid"],["van","Van"],["other","Other"]]}
                      value={reqBodyCategory} onChange={setReqBodyCategory} />
                  </div>
                  {reqBodyCategory && (
                    <div>
                      <FieldLabel>Body type</FieldLabel>
                      <Chips
                        options={[["curtainsider","Curtainsider"],["flatbed","Flatbed"],["box","Box"],["tipper","Tipper"],["fridge","Fridge"],["tanker","Tanker"],["other","Other"]]}
                        value={reqBodyType} onChange={setReqBodyType} />
                    </div>
                  )}
                </div>
              )}
              <SectionFooter complete label="Transport requirements" onCollapse={() => setS5(true)} />
            </div>
          )}
        </div>

        {/* ── Sec 6: Billing & insurance ───────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={6} icon="📄" title="Billing & insurance" subtitle="Pricing, PO number, declared value"
            active collapsed={s6} onToggle={() => setS6(o => !o)}
            complete optional
            summary={PRICING_TYPES.find(([v]) => v === pricingType)?.[1] ?? pricingType} />
          {!s6 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <div>
                <FieldLabel>Pricing arrangement</FieldLabel>
                <div className="mt-1">
                  <Chips options={PRICING_TYPES} value={pricingType} onChange={setPricingType} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="Purchase order number" value={poNumber}
                  onChange={setPoNumber} placeholder="PO-2026-12345"
                  hint="Required on your invoice by your finance team." />
                <TextField label="Billing reference / cost code" value={billingRef}
                  onChange={setBillingRef} placeholder="COST-CENTRE-123" />
              </div>
              <TextField label="Declared value of goods (£)" type="number"
                value={declaredValue} onChange={setDeclaredValue} placeholder="0.00"
                hint="For insurance purposes only — not the transport charge." />
              <Toggle value={vatRegistered} onChange={setVatRegistered} label="We are VAT registered" />
              {vatRegistered && (
                <TextField label="VAT number" value={vatNumber} onChange={setVatNumber}
                  placeholder="GB 123 4567 89" />
              )}
              <SectionFooter complete label="Billing" onCollapse={() => setS6(true)} />
            </div>
          )}
        </div>

        {/* ── Sec 7: Notes for driver ───────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={7} icon="📝" title="Notes for driver" subtitle="Instructions the driver needs to know"
            active collapsed={s7} onToggle={() => setS7(o => !o)}
            complete optional
            summary={driverNotes ? driverNotes.slice(0, 40) + (driverNotes.length > 40 ? "…" : "") : undefined} />
          {!s7 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <div>
                <FieldLabel>Quick instructions</FieldLabel>
                <div className="mt-1">
                  <MultiCheck options={DRIVER_CHIPS} value={driverChips} onChange={setDriverChips} />
                </div>
              </div>
              <div>
                <FieldLabel>Additional driver notes</FieldLabel>
                <textarea className="input mt-1 w-full" rows={3}
                  value={driverNotes} onChange={e => setDriverNotes(e.target.value)}
                  placeholder="Ask for John at site office. Registration must be provided at barrier." />
                <div className="text-xs text-muted mt-1">
                  Anything the driver must know that isn't covered by the stop instructions above.
                </div>
              </div>
              <OptionalToggle open={showNotesOpts} onToggle={() => setShowNotesOpts(o => !o)} label="safety & office notes" />
              {showNotesOpts && (
                <div className="space-y-4 border-l-2 border-blue-100 pl-4">
                  <div>
                    <FieldLabel>Safety instructions</FieldLabel>
                    <textarea className="input mt-1 w-full" rows={2}
                      value={safetyNotes} onChange={e => setSafetyNotes(e.target.value)}
                      placeholder="COSHH data sheets provided. No open flames near load." />
                  </div>
                  <div>
                    <FieldLabel>Notes for the office</FieldLabel>
                    <textarea className="input mt-1 w-full" rows={2}
                      value={customerNotes} onChange={e => setCustomerNotes(e.target.value)}
                      placeholder="Please call to confirm delivery window the day before." />
                  </div>
                </div>
              )}
              <SectionFooter complete label="Notes" onCollapse={() => setS7(true)} />
            </div>
          )}
        </div>

        {/* ── Submit bar ──────────────────────────────────────────────────── */}
        <div className="card px-5 py-4 flex items-center justify-between gap-4">
          <div className="text-sm text-muted">
            {[sec1Complete, sec2Complete, sec3Complete].filter(Boolean).length} / 3 required sections complete
          </div>
          <button type="submit" disabled={submitting} className="btn btn-primary px-8">
            {submitting ? "Submitting…" : "Submit transport request →"}
          </button>
        </div>

      </form>
    </div>
  );
}

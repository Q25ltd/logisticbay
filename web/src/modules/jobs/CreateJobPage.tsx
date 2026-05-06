import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { customersApi } from "../../api/customers";
import { jobsApi } from "../../api/jobs";
import { useAuth } from "../../hooks/useAuth";
import type { Customer, JobStop, PlannedJob, SavedLocation } from "../../types";

// ── Options ───────────────────────────────────────────────────────────────────

const SERVICE_TYPES: [string, string][] = [
  ["delivery",            "Delivery"],
  ["collection",          "Collection"],
  ["transfer",            "Transfer / Trunking"],
  ["collection_delivery", "Collection & Delivery"],
  ["trunking",            "Linehaul / Trunking"],
];

const JOB_TYPES: [string, string][] = [
  ["full_load",   "Full Load (FTL)"],
  ["part_load",   "Part Load (LTL)"],
  ["multi_drop",  "Multi-Drop"],
  ["groupage",    "Groupage"],
  ["return_load", "Return Load"],
  ["trunking",    "Trunking / Linehaul"],
  ["abnormal",    "Abnormal / Specialist"],
];

const PRIORITY_OPTS: [string, string][] = [
  ["low",    "Low"],
  ["normal", "Normal"],
  ["high",   "High — Urgent"],
];

const LOCATION_TYPES: [string, string][] = [
  ["warehouse",   "Warehouse / RDC"],
  ["depot",       "Depot"],
  ["site",        "Construction site"],
  ["retail",      "Retail / store"],
  ["residential", "Residential"],
  ["port",        "Port / terminal"],
  ["airport",     "Airport"],
  ["other",       "Other"],
];

// ── Stop state ────────────────────────────────────────────────────────────────

interface StopState {
  id: string;
  collapsed: boolean;
  showOptional: boolean;
  stopType: "collection" | "delivery";
  locationQuery: string;
  savedLocationId: number | null;
  siteName: string;
  street: string;
  town: string;
  postcode: string;
  country: string;
  lat: string;
  lng: string;
  unitBuilding: string;
  addressLine2: string;
  countyRegion: string;
  date: string;
  timeType: "exact" | "window" | "anytime";
  exactTime: string;
  windowStart: string;
  windowEnd: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  refNumber: string;
  bookingRequired: boolean;
  bookingRef: string;
  openingHours: string;
  locationType: string;
  driverNotes: string;
  navigationInstructions: string;
  numPallets: string;
  quantity: string;
  earliestArrival: string;
  unloadingTime: string;
  internalNotes: string;
}

const today = () => new Date().toISOString().split("T")[0];
const nowDisplay = () =>
  new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function makeStop(): StopState {
  return {
    id: Math.random().toString(36).slice(2),
    collapsed: false,
    showOptional: false,
    stopType: "collection",
    locationQuery: "",
    savedLocationId: null,
    siteName: "",
    street: "",
    town: "",
    postcode: "",
    country: "United Kingdom",
    lat: "",
    lng: "",
    unitBuilding: "",
    addressLine2: "",
    countyRegion: "",
    date: today(),
    timeType: "anytime",
    exactTime: "",
    windowStart: "",
    windowEnd: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    refNumber: "",
    bookingRequired: false,
    bookingRef: "",
    openingHours: "",
    locationType: "",
    driverNotes: "",
    navigationInstructions: "",
    numPallets: "",
    quantity: "",
    earliestArrival: "",
    unloadingTime: "",
    internalNotes: "",
  };
}

// ── Edit-mode helpers ────────────────────────────────────────────────────────

function parseISOToDateAndTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: today(), time: "" };
  // Stored as "${date}T${time}:00.000Z" so extract the literal parts directly
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? { date: m[1], time: m[2] } : { date: today(), time: "" };
}

function jobStopToStopState(stop: JobStop): StopState {
  let timeType: StopState["timeType"] = "anytime";
  let date = today();
  let exactTime = "";
  let windowStart = "";
  let windowEnd = "";

  if (stop.bookedTime) {
    const p = parseISOToDateAndTime(stop.bookedTime);
    timeType = "exact";
    date = p.date;
    exactTime = p.time;
  } else if (stop.timeWindowStart) {
    const p = parseISOToDateAndTime(stop.timeWindowStart);
    timeType = "window";
    date = p.date;
    windowStart = p.time;
    windowEnd = stop.timeWindowEnd ? parseISOToDateAndTime(stop.timeWindowEnd).time : "";
  }

  function minsToHHMM(mins: number | null | undefined): string {
    if (mins == null) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return {
    id: Math.random().toString(36).slice(2),
    collapsed: true,
    showOptional: false,
    stopType: (stop.type === "pickup" || stop.type === "collection") ? "collection" : "delivery",
    locationQuery: stop.locationTextSnapshot || stop.siteName || "",
    savedLocationId: stop.savedLocationId ?? null,
    siteName: stop.siteName || "",
    street: stop.street || "",
    town: stop.town || "",
    postcode: stop.postcode || "",
    country: "United Kingdom",
    lat: stop.lat != null ? String(stop.lat) : "",
    lng: stop.lng != null ? String(stop.lng) : "",
    unitBuilding: stop.unitName || "",
    addressLine2: "",
    countyRegion: "",
    date,
    timeType,
    exactTime,
    windowStart,
    windowEnd,
    contactName: stop.contactName || "",
    contactPhone: stop.contactPhone || "",
    contactEmail: stop.contactEmail || "",
    refNumber: stop.referenceNumber || "",
    bookingRequired: stop.bookingRequired ?? false,
    bookingRef: stop.bookingRef || "",
    openingHours: stop.openingHours || "",
    locationType: stop.locationType || "",
    driverNotes: stop.instructions || "",
    navigationInstructions: stop.navigationInstructions || "",
    numPallets: stop.numPallets != null ? String(stop.numPallets) : "",
    quantity: "",
    earliestArrival: minsToHHMM(stop.earliestArrivalMinutes),
    unloadingTime: stop.unloadingAllowanceMinutes != null ? String(stop.unloadingAllowanceMinutes) : "",
    internalNotes: stop.internalNotes || "",
  };
}

function stopComplete(s: StopState) {
  const addr = s.siteName.trim() && s.street.trim() && s.town.trim() && s.postcode.trim();
  const time =
    s.timeType === "exact"  ? !!s.exactTime :
    s.timeType === "window" ? !!(s.windowStart && s.windowEnd) : true;
  return !!(addr && s.date && time);
}


const VEHICLE_TYPES: [string, string][] = [
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

const MIN_SIZES: [string, string][] = [
  ["3.5t",  "3.5t"],
  ["7.5t",  "7.5t"],
  ["18t",   "18t"],
  ["26t",   "26t"],
  ["44t",   "44t"],
];

const TRAILER_TYPES: [string, string][] = [
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

const EQUIPMENT_OPTS: [string, string][] = [
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

const DRIVER_QUALS: [string, string][] = [
  ["adr",      "ADR"],
  ["hiab",     "HIAB"],
  ["moffett",  "Moffett"],
  ["forklift", "Forklift"],
  ["tanker",   "Tanker"],
  ["other",    "Other"],
];

const LOAD_UNITS: [string, string][] = [
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

const HANDLING_METHODS: [string, string][] = [
  ["forklift",          "Forklift"],
  ["handball",          "Handball"],
  ["crane",             "Crane"],
  ["pump",              "Pump"],
  ["tip",               "Tip"],
  ["customer_loads",    "Customer loads / unloads"],
  ["driver_loads",      "Driver loads / unloads"],
  ["other",             "Other"],
];

// ── Shared sub-components ─────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-bold text-slate-600 mb-1.5 tracking-wide">
      {children}{required && <span className="text-blue-500 ml-0.5">*</span>}
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="input bg-gray-50 text-muted cursor-default select-none text-sm py-2.5">{value}</div>
    </div>
  );
}

function StatusDot({ complete, started }: { complete?: boolean; started?: boolean }) {
  if (complete) return (
    <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 shadow-sm">
      <svg viewBox="0 0 10 10" className="w-3 h-3" fill="none">
        <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
  if (started) return (
    <span className="w-5 h-5 rounded-full bg-blue-400 flex-shrink-0 shadow-sm animate-pulse" />
  );
  return <span className="w-5 h-5 rounded-full border-2 border-gray-300 bg-white flex-shrink-0" />;
}

function SectionHeader({ num, icon, title, subtitle, active, collapsed, summary, onToggle, complete, started, optional }: {
  num: number; icon: string; title: string; subtitle: string;
  active?: boolean; collapsed?: boolean; summary?: string; onToggle?: () => void;
  complete?: boolean; started?: boolean; optional?: boolean;
}) {
  const accent =
    complete ? "border-l-green-500" :
    started  ? "border-l-blue-400"  : "border-l-transparent";
  const bg =
    complete && collapsed ? "bg-green-50/60" :
    !collapsed            ? "bg-white"        : "bg-slate-50/70";

  return (
    <div
      className={`flex items-center gap-3 px-5 py-4 border-b border-border border-l-4 ${accent} ${bg} ${onToggle ? "cursor-pointer select-none" : ""} transition-colors duration-200`}
      onClick={onToggle}
    >
      <StatusDot complete={complete} started={started} />
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all duration-200 ${complete ? "bg-green-50 border border-green-200" : started ? "bg-blue-50 border border-blue-200" : "bg-white border border-slate-200 shadow-sm"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold uppercase tracking-widest ${complete ? "text-green-600" : started ? "text-blue-500" : "text-muted"}`}>
            {String(num).padStart(2, "0")}
          </span>
          <h2 className="text-sm font-black text-primary">{title}</h2>
          {optional && !complete && (
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">optional</span>
          )}
        </div>
        {collapsed && summary
          ? <p className="text-xs text-accent font-semibold mt-0.5 truncate">{summary}</p>
          : <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>
        }
      </div>
      {!active && <span className="text-xs text-slate-300 font-medium flex-shrink-0">Coming soon</span>}
      {onToggle && (
        <span className={`text-xl flex-shrink-0 ml-1 font-bold transition-transform duration-200 ${collapsed ? "text-muted" : "text-accent rotate-0"}`}>
          {collapsed ? "›" : "⌄"}
        </span>
      )}
    </div>
  );
}

function SectionFooter({ complete, label }: { complete: boolean; label: string }) {
  return (
    <div className={
      "px-5 py-3 border-t text-sm font-semibold flex items-center gap-2.5 " +
      (complete
        ? "text-green-700 bg-green-50/80 border-green-100"
        : "text-amber-700 bg-amber-50/80 border-amber-100")
    }>
      {complete ? (
        <>
          <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 10 10" className="w-3 h-3" fill="none">
              <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          {label} complete
        </>
      ) : (
        <>
          <span className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0 text-white text-xs font-black leading-none">!</span>
          Fill in the required fields above
        </>
      )}
    </div>
  );
}

function OptionalToggle({ open, onToggle, label = "optional details" }: {
  open: boolean; onToggle: () => void; label?: string;
}) {
  return (
    <div className="pt-1">
      <button type="button" onClick={onToggle}
        className={`text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
          open
            ? "text-slate-600 bg-slate-100 border-slate-200 hover:bg-slate-200"
            : "text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100"
        }`}>
        <span className="text-sm leading-none">{open ? "−" : "+"}</span>
        {open ? `Hide ${label}` : `Show ${label}`}
      </button>
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="flex items-center gap-3 group w-fit">
      <div className={"relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 " + (value ? "bg-blue-500" : "bg-slate-200")}>
        <span className={"absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 " + (value ? "translate-x-5" : "translate-x-0")} />
      </div>
      <span className={"text-sm font-medium transition-colors " + (value ? "text-slate-900" : "text-slate-500")}>{label}</span>
    </button>
  );
}

// ── Customer typeahead ────────────────────────────────────────────────────────

function CustomerSearch({ value, linkedId, onChange }: {
  value: string;
  linkedId: number | null;
  onChange: (name: string, id: number | null, customer?: Customer) => void;
}) {
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [open,        setOpen]        = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  function handleInput(text: string) {
    onChange(text, null);
    if (debounce.current) clearTimeout(debounce.current);
    if (!text.trim()) { setSuggestions([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      try {
        const res = await customersApi.list(text.trim());
        setSuggestions(res.data.slice(0, 8));
        setOpen(res.data.length > 0);
      } catch { setSuggestions([]); }
    }, 220);
  }

  function pick(c: Customer) {
    onChange(c.name, c.id, c);
    setSuggestions([]);
    setOpen(false);
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input type="text" className="input pr-8" placeholder="Start typing customer name…"
          value={value} onChange={e => handleInput(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)} autoComplete="off" />
        {linkedId && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500 text-sm" title="Linked to existing customer">✓</span>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(c => (
            <button key={c.id} type="button" onMouseDown={() => pick(c)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-border last:border-0">
              <span className="font-semibold text-primary">{c.name}</span>
              {c.contactName && <span className="text-muted ml-2 text-xs">· {c.contactName}</span>}
            </button>
          ))}
          <div className="px-4 py-2 text-xs text-muted bg-gray-50 border-t border-border">
            Not listed? Just keep typing — name will be saved as entered
          </div>
        </div>
      )}
    </div>
  );
}

// ── Location typeahead (per stop) ─────────────────────────────────────────────

function LocationSearch({ value, linkedId, locations, onSelect, onClear }: {
  value: string;
  linkedId: number | null;
  locations: SavedLocation[];
  onSelect: (loc: SavedLocation) => void;
  onClear: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = value.toLowerCase().trim();
  const filtered = !q ? [] : locations.filter(l =>
    l.name.toLowerCase().includes(q) ||
    l.addressText.toLowerCase().includes(q) ||
    l.town.toLowerCase().includes(q) ||
    l.postcode.toLowerCase().includes(q)
  ).slice(0, 8);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input type="text" className="input pr-8"
          placeholder="Search saved locations or type address…"
          value={value}
          onChange={e => { onClear(e.target.value); setOpen(true); }}
          onFocus={() => filtered.length > 0 && setOpen(true)}
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
              <div className="text-xs text-muted">{[l.addressText || l.street, l.town, l.postcode].filter(Boolean).join(", ")}</div>
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

// ── Coordinates help ─────────────────────────────────────────────────────────

function CoordsHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="text-muted hover:text-primary flex items-center gap-1 transition-colors">
        <span>{open ? "▾" : "▸"}</span>
        <span>How to find entrance coordinates in Google Maps</span>
      </button>
      {open && (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg space-y-3 leading-relaxed text-blue-900">
          <p><strong>1.</strong> Open <span className="font-mono">maps.google.com</span> and search for the site.</p>
          <p><strong>2.</strong> Navigate to the <strong>entrance gate or loading bay</strong> — not the building centre.</p>
          <p><strong>3.</strong> Right-click on the exact entrance point — a menu appears.</p>
          <p><strong>4.</strong> Click the coordinates at the <strong>top of the menu</strong> — they copy automatically.</p>
          <p><strong>5.</strong> Paste the first number into Latitude, the second into Longitude.</p>

          {/* SVG illustration of the Google Maps right-click menu */}
          <div className="rounded-xl overflow-hidden border border-blue-200 bg-white mt-2">
            <svg viewBox="0 0 340 210" xmlns="http://www.w3.org/2000/svg" className="w-full">
              {/* Map background */}
              <rect width="340" height="210" fill="#e8e0d5"/>
              {/* Roads */}
              <rect x="0" y="88" width="340" height="14" fill="#fff" opacity="0.7"/>
              <rect x="140" y="0" width="12" height="210" fill="#fff" opacity="0.7"/>
              <rect x="0" y="150" width="340" height="8" fill="#fff" opacity="0.5"/>
              <rect x="80" y="0" width="6" height="210" fill="#fff" opacity="0.4"/>
              <rect x="230" y="0" width="6" height="210" fill="#fff" opacity="0.4"/>
              {/* Buildings */}
              <rect x="20" y="30" width="50" height="48" rx="2" fill="#d4c9b8"/>
              <rect x="80" y="20" width="48" height="60" rx="2" fill="#c8bfb0"/>
              <rect x="162" y="20" width="55" height="58" rx="2" fill="#d4c9b8"/>
              <rect x="228" y="30" width="40" height="45" rx="2" fill="#c8bfb0"/>
              <rect x="280" y="20" width="48" height="60" rx="2" fill="#d4c9b8"/>
              <rect x="20" y="112" width="42" height="52" rx="2" fill="#c8bfb0"/>
              <rect x="74" y="108" width="54" height="52" rx="2" fill="#d4c9b8"/>
              <rect x="162" y="112" width="60" height="52" rx="2" fill="#c8bfb0"/>
              <rect x="234" y="108" width="88" height="52" rx="2" fill="#d4c9b8"/>
              <rect x="20" y="172" width="100" height="30" rx="2" fill="#c8bfb0"/>
              <rect x="162" y="172" width="70" height="30" rx="2" fill="#d4c9b8"/>
              <rect x="244" y="172" width="78" height="30" rx="2" fill="#c8bfb0"/>

              {/* Pin at entrance */}
              <circle cx="146" cy="93" r="7" fill="#EA4335"/>
              <path d="M146 100 L143 108 L146 106 L149 108 Z" fill="#EA4335"/>

              {/* Cursor / right-click indicator */}
              <polygon points="146,93 156,100 152,101 154,107 151,108 149,102 146,105" fill="#333" opacity="0.85"/>

              {/* Context menu */}
              <rect x="152" y="60" width="168" height="142" rx="4" fill="white"
                filter="url(#shadow)" stroke="#dadce0" strokeWidth="0.5"/>
              <defs>
                <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0003"/>
                </filter>
              </defs>

              {/* Coords row — highlighted, clickable */}
              <rect x="152" y="60" width="168" height="30" rx="4" fill="#e8f0fe"/>
              <rect x="152" y="76" width="168" height="14" fill="#e8f0fe"/>
              <text x="162" y="79" fontSize="9.5" fontFamily="monospace" fill="#1a73e8" fontWeight="bold">51.5074, -0.1278</text>
              <text x="162" y="89" fontSize="7.5" fontFamily="sans-serif" fill="#5f6368">Click to copy</text>

              {/* Divider */}
              <line x1="152" y1="90" x2="320" y2="90" stroke="#e0e0e0" strokeWidth="0.5"/>

              {/* Menu items */}
              {[
                { y: 105, label: "Directions to here" },
                { y: 120, label: "Directions from here" },
                { y: 135, label: "What's here?" },
                { y: 150, label: "Add a missing place" },
                { y: 165, label: "Save" },
                { y: 180, label: "Share" },
              ].map(item => (
                <text key={item.y} x="162" y={item.y} fontSize="9" fontFamily="sans-serif" fill="#3c4043">
                  {item.label}
                </text>
              ))}

              {/* Arrow pointing to coords row */}
              <line x1="108" y1="75" x2="148" y2="75" stroke="#1a73e8" strokeWidth="1.5" markerEnd="url(#arr)"/>
              <defs>
                <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#1a73e8"/>
                </marker>
              </defs>
              <text x="10" y="68" fontSize="8" fontFamily="sans-serif" fill="#1a73e8" fontWeight="bold">Click</text>
              <text x="10" y="78" fontSize="8" fontFamily="sans-serif" fill="#1a73e8" fontWeight="bold">coords</text>
              <text x="10" y="88" fontSize="8" fontFamily="sans-serif" fill="#1a73e8" fontWeight="bold">here</text>
            </svg>
          </div>

          <p className="text-blue-700">⚠ Always pin the <strong>entrance gate</strong>, not the postcode centre — drivers use this to navigate to the right gate.</p>
        </div>
      )}
    </div>
  );
}

// ── Stop quantities & timing block ───────────────────────────────────────────

function toMins(t: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return isNaN(h) || isNaN(m) ? null : h * 60 + m;
}

function fmtMins(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

function StopTimingBlock({ stop, onChange, set }: {
  stop: StopState;
  onChange: (patch: Partial<StopState>) => void;
  set: (f: keyof StopState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
}) {
  const earliest  = toMins(stop.earliestArrival);
  const unloading = stop.unloadingTime ? parseInt(stop.unloadingTime, 10) : null;
  const windowEnd = toMins(stop.windowEnd);
  const exactT    = toMins(stop.exactTime);
  const deadline  = stop.timeType === "exact" ? exactT : stop.timeType === "window" ? windowEnd : null;

  const warnings: string[] = [];
  if (earliest !== null && deadline !== null && earliest > deadline) {
    warnings.push(`Earliest arrival (${stop.earliestArrival}) is after the ${stop.timeType === "exact" ? "booked time" : "window end"} (${stop.timeType === "exact" ? stop.exactTime : stop.windowEnd}).`);
  }
  if (earliest !== null && unloading !== null && deadline !== null) {
    const finishAt = earliest + unloading;
    if (finishAt > deadline) {
      warnings.push(`Arrival + unloading (${fmtMins(unloading)}) finishes at ${fmtMins(finishAt % 1440).replace("h ", "h").replace("m", "")} — after the ${stop.timeType === "exact" ? "booked time" : "window end"}.`);
    }
  }

  return (
    <div>
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Quantities & Stop Timing</div>
      <div className="space-y-3">

        {/* Pallets + quantity */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Number of Pallets</FieldLabel>
            <input type="number" min="0" inputMode="numeric" className="input" placeholder="e.g. 26"
              value={stop.numPallets} onChange={set("numPallets")} />
            <p className="text-xs text-muted mt-1">Will total across all stops in Load Details</p>
          </div>
          <div>
            <FieldLabel>Quantity / Weight</FieldLabel>
            <input type="text" className="input" placeholder="e.g. 14.5t / 3 cages"
              value={stop.quantity} onChange={set("quantity")} />
          </div>
        </div>

        {/* Earliest arrival */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Earliest Arrival</FieldLabel>
            <input type="time" className="input" value={stop.earliestArrival} onChange={set("earliestArrival")} />
            <p className="text-xs text-muted mt-1">Do not arrive before this time</p>
          </div>
          <div>
            <FieldLabel>Loading / Unloading Time</FieldLabel>
            <div className="relative">
              <input type="number" min="0" inputMode="numeric" className="input pr-14" placeholder="45"
                value={stop.unloadingTime} onChange={set("unloadingTime")} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">mins</span>
            </div>
          </div>
        </div>

        {/* Timing conflict warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="flex-shrink-0 mt-0.5">⚠</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Stop card ─────────────────────────────────────────────────────────────────

function StopCard({ stop, index, total, locations, onChange, onRemove }: {
  stop: StopState;
  index: number;
  total: number;
  locations: SavedLocation[];
  onChange: (patch: Partial<StopState>) => void;
  onRemove: () => void;
}) {
  const set = (field: keyof StopState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ [field]: e.target.value });

  function applyLocation(loc: SavedLocation) {
    onChange({
      locationQuery:   loc.name,
      savedLocationId: loc.id,
      siteName:        loc.siteName  || loc.name,
      street:          loc.street    || loc.addressText,
      town:            loc.town,
      postcode:        loc.postcode,
      country:         "United Kingdom",
      lat:             loc.latitude  != null ? String(loc.latitude)  : "",
      lng:             loc.longitude != null ? String(loc.longitude) : "",
      unitBuilding:    loc.unitName  || "",
      contactName:     loc.contactName  || "",
      contactPhone:    loc.contactPhone || "",
      openingHours:    loc.instructions || "",
    });
  }

  const dateLabel = stop.stopType === "collection" ? "Collection Date" : "Delivery Date";
  const complete  = stopComplete(stop);

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden" style={{boxShadow: '0 1px 3px rgba(15,23,42,0.06)'}}>

      {/* Stop header — clickable to collapse */}
      <div className={`flex items-center justify-between px-4 py-3 border-b border-slate-100 cursor-pointer select-none transition-colors ${complete ? "bg-green-50/70" : "bg-slate-50/80"}`}
        onClick={() => onChange({ collapsed: !stop.collapsed })}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-black text-primary flex-shrink-0">Stop {index + 1}</span>
          {stop.stopType && (
            <span className={
              "text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 " +
              (stop.stopType === "collection" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700")
            }>
              {stop.stopType === "collection" ? "Collection" : "Delivery"}
            </span>
          )}
          {complete && <span className="text-xs text-green-600 font-semibold flex-shrink-0">✓</span>}
          {stop.collapsed && stop.siteName && (
            <span className="text-xs text-accent truncate ml-1">{[stop.siteName, stop.town].filter(Boolean).join(", ")}</span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {total > 1 && (
            <button type="button" onClick={e => { e.stopPropagation(); onRemove(); }}
              className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors">
              Remove
            </button>
          )}
          <span className="text-primary text-xl font-bold">{stop.collapsed ? "›" : "⌄"}</span>
        </div>
      </div>

      {!stop.collapsed && <div className="p-4 space-y-4">

        {/* Stop type */}
        <div>
          <FieldLabel required>Stop Type</FieldLabel>
          <div className="flex gap-3">
            {(["collection", "delivery"] as const).map(t => (
              <button key={t} type="button"
                onClick={() => onChange({ stopType: t })}
                className={
                  "flex-1 py-3 min-h-[48px] rounded-lg border text-sm font-semibold transition-colors " +
                  (stop.stopType === t
                    ? t === "collection"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-green-600 text-white border-green-600"
                    : "bg-white text-muted border-border hover:border-gray-400")
                }>
                {t === "collection" ? "📦 Collection" : "📍 Delivery"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Location ─────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-1 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Location</div>

          <div>
            <FieldLabel>Address / Saved Location</FieldLabel>
            <LocationSearch
              value={stop.locationQuery}
              linkedId={stop.savedLocationId}
              locations={locations}
              onSelect={applyLocation}
              onClear={text => onChange({ locationQuery: text, savedLocationId: null })}
            />
            {stop.savedLocationId && (
              <button type="button" onClick={() => onChange({ locationQuery: "", savedLocationId: null, siteName: "", street: "", town: "", postcode: "", lat: "", lng: "" })}
                className="text-xs text-muted hover:text-red-500 mt-1 transition-colors">
                ✕ Clear saved location
              </button>
            )}
          </div>

          <div>
            <FieldLabel required>Company / Site Name</FieldLabel>
            <input type="text" className="input" placeholder="Acme Distribution Centre"
              value={stop.siteName} onChange={set("siteName")} />
          </div>

          <div>
            <FieldLabel required>Address Line 1 / Street</FieldLabel>
            <input type="text" className="input" placeholder="1 Example Street"
              value={stop.street} onChange={set("street")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Town / City</FieldLabel>
              <input type="text" className="input" placeholder="Sampletown"
                value={stop.town} onChange={set("town")} />
            </div>
            <div>
              <FieldLabel required>Postcode</FieldLabel>
              <input type="text" className="input placeholder:uppercase" placeholder="EX1 1AA"
                value={stop.postcode} onChange={set("postcode")} />
            </div>
          </div>

          <div>
            <FieldLabel required>Country</FieldLabel>
            <input type="text" className="input" placeholder="United Kingdom"
              value={stop.country} onChange={set("country")} />
          </div>

          {/* Lat / Lng */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Latitude</FieldLabel>
              <input type="text" inputMode="decimal" className="input font-mono" placeholder="51.5074"
                value={stop.lat} onChange={set("lat")} />
            </div>
            <div>
              <FieldLabel>Longitude</FieldLabel>
              <input type="text" inputMode="decimal" className="input font-mono" placeholder="-0.1278"
                value={stop.lng} onChange={set("lng")} />
            </div>
          </div>
          <CoordsHelp />
        </div>

        {/* ── Timing ───────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-1 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Timing</div>

          <div>
            <FieldLabel required>{dateLabel}</FieldLabel>
            <input type="date" className="input" value={stop.date} onChange={set("date")} />
          </div>

          <div>
            <FieldLabel required>Time Type</FieldLabel>
            <div className="flex gap-2">
              {(["anytime", "exact", "window"] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => onChange({ timeType: t })}
                  className={
                    "flex-1 py-2.5 min-h-[44px] rounded-lg border text-xs font-semibold transition-colors " +
                    (stop.timeType === t
                      ? "bg-slate-700 text-white border-slate-700"
                      : "bg-white text-muted border-border hover:border-gray-400")
                  }>
                  {t === "anytime" ? "Any time" : t === "exact" ? "Exact time" : "Time window"}
                </button>
              ))}
            </div>
          </div>

          {stop.timeType === "exact" && (
            <div className="max-w-xs">
              <FieldLabel required>Time</FieldLabel>
              <input type="time" className="input" value={stop.exactTime} onChange={set("exactTime")} />
            </div>
          )}

          {stop.timeType === "window" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Start Time</FieldLabel>
                <input type="time" className="input" value={stop.windowStart} onChange={set("windowStart")} />
              </div>
              <div>
                <FieldLabel required>End Time</FieldLabel>
                <input type="time" className="input" value={stop.windowEnd} onChange={set("windowEnd")} />
              </div>
            </div>
          )}
        </div>

        {/* ── Optional toggle ───────────────────────────────────────────────── */}
        <OptionalToggle open={stop.showOptional} onToggle={() => onChange({ showOptional: !stop.showOptional })} label="stop details" />

        {stop.showOptional && (
          <div className="space-y-4 pt-1 border-t border-border">

            {/* Address clarity */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Address Clarity</div>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Unit / Building</FieldLabel>
                  <input type="text" className="input" placeholder="Unit 4 / Gatehouse"
                    value={stop.unitBuilding} onChange={set("unitBuilding")} />
                </div>
                <div>
                  <FieldLabel>Address Line 2</FieldLabel>
                  <input type="text" className="input" placeholder="Industrial estate, zone B"
                    value={stop.addressLine2} onChange={set("addressLine2")} />
                </div>
                <div>
                  <FieldLabel>County / Region</FieldLabel>
                  <input type="text" className="input" placeholder="Exampleshire"
                    value={stop.countyRegion} onChange={set("countyRegion")} />
                </div>
              </div>
            </div>

            {/* Quantities & stop timing */}
            <StopTimingBlock stop={stop} onChange={onChange} set={set} />

            {/* Contact */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Contact</div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Contact Name</FieldLabel>
                    <input type="text" className="input" placeholder="Goods In"
                      value={stop.contactName} onChange={set("contactName")} />
                  </div>
                  <div>
                    <FieldLabel>Contact Phone</FieldLabel>
                    <input type="tel" className="input" placeholder="07700 900123"
                      value={stop.contactPhone} onChange={set("contactPhone")} />
                  </div>
                </div>
                <div>
                  <FieldLabel>Contact Email</FieldLabel>
                  <input type="email" className="input" placeholder="goodsin@example.com"
                    value={stop.contactEmail} onChange={set("contactEmail")} />
                </div>
              </div>
            </div>

            {/* Reference / booking */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Reference / Booking</div>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Reference Number</FieldLabel>
                  <input type="text" className="input" placeholder="REF-00123"
                    value={stop.refNumber} onChange={set("refNumber")} />
                </div>
                <div>
                  <Toggle value={stop.bookingRequired} onChange={v => onChange({ bookingRequired: v })} label="Booking required" />
                </div>
                {stop.bookingRequired && (
                  <div>
                    <FieldLabel>Booking Reference</FieldLabel>
                    <input type="text" className="input" placeholder="BK-456789"
                      value={stop.bookingRef} onChange={set("bookingRef")} />
                  </div>
                )}
              </div>
            </div>

            {/* Location support */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Location Support</div>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Opening Hours</FieldLabel>
                  <input type="text" className="input" placeholder="Mon–Fri 06:00–18:00, Sat 07:00–13:00"
                    value={stop.openingHours} onChange={set("openingHours")} />
                </div>
                <div>
                  <FieldLabel>Location Type</FieldLabel>
                  <select className="input" value={stop.locationType} onChange={set("locationType")}>
                    <option value="">— Select —</option>
                    {LOCATION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Driver */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Driver</div>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Driver Notes / Instructions</FieldLabel>
                  <textarea className="input min-h-16 resize-none" placeholder="Use gate 3, call ahead 30 min before arrival…"
                    value={stop.driverNotes} onChange={set("driverNotes")} />
                </div>
                <div>
                  <FieldLabel>Navigation Instructions</FieldLabel>
                  <input type="text" className="input" placeholder="Paste Google Maps or Waze link…"
                    value={stop.navigationInstructions} onChange={set("navigationInstructions")} />
                </div>
              </div>
            </div>

            {/* Internal */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Internal</div>
              <div>
                <FieldLabel>Internal Notes</FieldLabel>
                <textarea className="input min-h-16 resize-none" placeholder="Not shown to driver — planner only…"
                  value={stop.internalNotes} onChange={set("internalNotes")} />
              </div>
            </div>

          </div>
        )}

      </div>}

      {/* Stop footer — always visible */}
      <div className={`px-4 py-2.5 border-t text-xs font-semibold flex items-center gap-2 ${complete ? "text-green-700 bg-green-50/80 border-green-100" : "text-amber-700 bg-amber-50/80 border-amber-100"}`}>
        {complete ? (
          <><span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"><svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span> Stop {index + 1} complete</>
        ) : (
          <><span className="w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0 text-white text-xs font-black leading-none">!</span> Fill in address and date above</>
        )}
      </div>

    </div>
  );
}

function MultiCheck({ options, value, onChange }: {
  options: [string, string][];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(key: string) {
    onChange(value.includes(key) ? value.filter(x => x !== key) : [...value, key]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([key, label]) => {
        const on = value.includes(key);
        return (
          <button key={key} type="button" onClick={() => toggle(key)}
            className={"text-sm px-4 py-2.5 min-h-[44px] rounded-full border font-medium transition-colors " +
              (on ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreateJobPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: jobIdParam } = useParams<{ id?: string }>();
  const editJobId = jobIdParam ? parseInt(jobIdParam, 10) : null;
  const isEditMode = !!editJobId;

  const [saving, setSaving] = useState<"draft" | "ready" | null>(null);
  const [error, setError] = useState("");
  const [loadingJob, setLoadingJob] = useState(isEditMode);
  const [lastAutoSaved, setLastAutoSaved] = useState<Date | null>(null);
  const [triedSave, setTriedSave] = useState(false);

  // Saved locations (loaded once)
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  useEffect(() => { jobsApi.locations().then(r => setLocations(r.data)).catch(() => {}); }, []);

  // ── Section collapse state ───────────────────────────────────────────────
  const [sec1Collapsed, setSec1Collapsed] = useState(true);
  const [sec2Collapsed, setSec2Collapsed] = useState(true);
  const [sec3Collapsed, setSec3Collapsed] = useState(true);
  const [sec4Collapsed, setSec4Collapsed] = useState(true);

  // ── Section 01 — Job Basics ──────────────────────────────────────────────
  const [showBasicsOpts,      setShowBasicsOpts]      = useState(false);
  const [customerName,        setCustomerName]        = useState("");
  const [customerId,          setCustomerId]          = useState<number | null>(null);
  const [plannedDate,         setPlannedDate]         = useState(today());
  const [serviceType,         setServiceType]         = useState("");
  const [jobType,             setJobType]             = useState("");
  const [jobTitle,            setJobTitle]            = useState("");
  const [referenceNumber,     setReferenceNumber]     = useState("");
  const [customerRef,         setCustomerRef]         = useState("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [priority,            setPriority]            = useState("normal");

  // ── Section 02 — Customer Details ───────────────────────────────────────
  const [showCustOpts,    setShowCustOpts]    = useState(false);
  const [contactName,     setContactName]     = useState("");
  const [contactPhone,    setContactPhone]    = useState("");
  const [contactEmail,    setContactEmail]    = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [billingNotes,    setBillingNotes]    = useState("");
  const [custInstructions,  setCustInstructions]  = useState("");
  const [custRefRequired,   setCustRefRequired]   = useState(false);
  const [poRequired,        setPoRequired]        = useState(false);

  function handleCustomerChange(name: string, id: number | null, customer?: Customer) {
    setCustomerName(name);
    setCustomerId(id);
    if (customer) {
      setContactName(customer.contactName   || "");
      setContactPhone(customer.contactPhone || "");
      setContactEmail(customer.contactEmail || "");
    }
  }

  // ── Section 03 — Stops ───────────────────────────────────────────────────
  const [stops, setStops] = useState<StopState[]>([makeStop()]);

  function updateStop(id: string, patch: Partial<StopState>) {
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }
  function addStop() { setStops(prev => [...prev, makeStop()]); }
  function removeStop(id: string) { setStops(prev => prev.filter(s => s.id !== id)); }

  // ── Section 04 — Load Details ────────────────────────────────────────────
  const [showLoadOpts,     setShowLoadOpts]     = useState(false);
  const [materialDesc,     setMaterialDesc]     = useState("");
  const [totalQty,         setTotalQty]         = useState("");
  const [qtyUnit,          setQtyUnit]          = useState("");
  const [qtyUnitOther,     setQtyUnitOther]     = useState("");
  const [totalWeight,      setTotalWeight]      = useState("");
  const [podRequired,      setPodRequired]      = useState(true);
  // Optional — physical
  const [volume,           setVolume]           = useState("");
  const [dimensions,       setDimensions]       = useState("");
  // Optional — conditions
  const [hazardous,        setHazardous]        = useState(false);
  const [adrClass,         setAdrClass]         = useState("");
  const [tempControlled,   setTempControlled]   = useState(false);
  const [tempRange,        setTempRange]        = useState("");
  const [fragile,          setFragile]          = useState(false);
  const [stackable,        setStackable]        = useState(false);
  // Optional — equipment
  const [forkliftReq,      setForkliftReq]      = useState(false);
  const [tailLiftReq,      setTailLiftReq]      = useState(false);
  const [craneReq,         setCraneReq]         = useState(false);
  // Optional — handling methods
  const [loadingMethod,    setLoadingMethod]    = useState("");
  const [unloadingMethod,  setUnloadingMethod]  = useState("");
  // Optional — extra
  const [loadNotes,        setLoadNotes]        = useState("");
  const [photosRequired,   setPhotosRequired]   = useState(false);
  const [weighbridgeReq,   setWeighbridgeReq]   = useState(false);

  // ── Section 05 — Vehicle Requirements ───────────────────────────────────
  const [sec5Collapsed,    setSec5Collapsed]    = useState(true);
  const [vehicleType,      setVehicleType]      = useState("");
  const [vehicleTypeOther, setVehicleTypeOther] = useState("");
  // Optional
  const [showVehicleOpts,  setShowVehicleOpts]  = useState(false);
  const [minSize,          setMinSize]          = useState("");
  const [trailersAllowed,  setTrailersAllowed]  = useState<string[]>([]);
  const [trailersForbidden,setTrailersForbidden]= useState<string[]>([]);
  const [equipmentReq,     setEquipmentReq]     = useState<string[]>([]);
  const [driverQuals,      setDriverQuals]      = useState<string[]>([]);
  const [heightRestriction,setHeightRestriction]= useState("");
  const [weightRestriction,setWeightRestriction]= useState("");
  const [lengthRestriction,setLengthRestriction]= useState("");
  const [accessNotes,      setAccessNotes]      = useState("");

  // ── Section 06 — Return Instructions ────────────────────────────────────
  const [sec6Collapsed,      setSec6Collapsed]      = useState(true);
  const [failureAction,      setFailureAction]      = useState("call_assistance");
  // call_assistance
  const [assistancePhone,    setAssistancePhone]    = useState("");
  const [assistanceNote,     setAssistanceNote]     = useState("");
  // finish_then_return
  const [returnDestination,  setReturnDestination]  = useState("");
  // alternative address (shared by deliver_alternative and finish_then_return→alternative)
  const [altSavedLocationId, setAltSavedLocationId] = useState<number | null>(null);
  const [altLocationQuery,   setAltLocationQuery]   = useState("");
  const [altCompanyName,     setAltCompanyName]     = useState("");
  const [altStreet,          setAltStreet]          = useState("");
  const [altTown,            setAltTown]            = useState("");
  const [altPostcode,        setAltPostcode]        = useState("");
  const [altCountry,         setAltCountry]         = useState("United Kingdom");
  const [altLat,             setAltLat]             = useState("");
  const [altLng,             setAltLng]             = useState("");
  const [altUnit,            setAltUnit]            = useState("");
  const [altAddressLine2,    setAltAddressLine2]    = useState("");
  const [altCounty,          setAltCounty]          = useState("");
  const [altContactName,     setAltContactName]     = useState("");
  const [altContactPhone,    setAltContactPhone]    = useState("");
  const [altContactEmail,    setAltContactEmail]    = useState("");
  const [altNavNotes,        setAltNavNotes]        = useState("");
  const [altDriverNotes,     setAltDriverNotes]     = useState("");
  const [showAltOpts,        setShowAltOpts]        = useState(false);

  const needsAltAddress =
    failureAction === "deliver_alternative" ||
    (failureAction === "finish_then_return" && returnDestination === "alternative");

  // ── Quality / missing fields ─────────────────────────────────────────────
  const basicsComplete   = !!(customerName.trim() && plannedDate && serviceType && jobType);
  const customerComplete = !!(contactName.trim() && contactPhone.trim());
  const stopsComplete    = stops.length > 0 && stops.every(stopComplete);
  const loadComplete     = !!(materialDesc.trim() && totalQty.trim() && qtyUnit && totalWeight.trim());
  const vehicleComplete  = !!vehicleType && (vehicleType !== "other" || !!vehicleTypeOther.trim());

  const altAddressComplete = !needsAltAddress || !!(
    altCompanyName.trim() && altStreet.trim() && altTown.trim() && altPostcode.trim() && altCountry.trim()
  );
  const returnComplete =
    failureAction !== "finish_then_return" || (
      !!returnDestination && altAddressComplete
    );
  const assistanceComplete =
    failureAction !== "call_assistance" || !!assistancePhone.trim();
  const sec6Complete = !!failureAction && assistanceComplete && returnComplete && altAddressComplete;

  // ── "Started" flags (for status dots) ───────────────────────────────────
  const sec1Started = !!(customerName || (serviceType || jobType));
  const sec2Started = !!(contactName || contactPhone);
  const sec3Started = stops.some(s => s.siteName || s.street);
  const sec4Started = !!(materialDesc || totalQty || totalWeight);
  const sec5Started = !!vehicleType;
  const sec6Started = failureAction !== "call_assistance" || !!assistancePhone;
  const hasStarted  = sec1Started || sec2Started || sec3Started || sec4Started || sec5Started;

  // ── Auto-collapse completed sections ─────────────────────────────────────
  const prevSec1 = useRef(false);
  const prevSec2 = useRef(false);
  const prevSec4 = useRef(false);
  const prevSec5 = useRef(false);
  const prevSec6 = useRef(false);
  useEffect(() => {
    if (basicsComplete && !prevSec1.current && !sec1Collapsed) {
      const t = setTimeout(() => setSec1Collapsed(true), 1400);
      return () => clearTimeout(t);
    }
    prevSec1.current = basicsComplete;
  }, [basicsComplete, sec1Collapsed]);
  useEffect(() => {
    if (customerComplete && !prevSec2.current && !sec2Collapsed) {
      const t = setTimeout(() => setSec2Collapsed(true), 1400);
      return () => clearTimeout(t);
    }
    prevSec2.current = customerComplete;
  }, [customerComplete, sec2Collapsed]);
  useEffect(() => {
    if (loadComplete && !prevSec4.current && !sec4Collapsed) {
      const t = setTimeout(() => setSec4Collapsed(true), 1400);
      return () => clearTimeout(t);
    }
    prevSec4.current = loadComplete;
  }, [loadComplete, sec4Collapsed]);
  useEffect(() => {
    if (vehicleComplete && !prevSec5.current && !sec5Collapsed) {
      const t = setTimeout(() => setSec5Collapsed(true), 1400);
      return () => clearTimeout(t);
    }
    prevSec5.current = vehicleComplete;
  }, [vehicleComplete, sec5Collapsed]);
  useEffect(() => {
    if (sec6Complete && !prevSec6.current && !sec6Collapsed) {
      const t = setTimeout(() => setSec6Collapsed(true), 1400);
      return () => clearTimeout(t);
    }
    prevSec6.current = sec6Complete;
  }, [sec6Complete, sec6Collapsed]);

  // ── Edit mode: load job and populate all state ───────────────────────────
  useEffect(() => {
    if (!editJobId) return;
    setLoadingJob(true);
    jobsApi.get(editJobId).then((job: PlannedJob) => {
      setCustomerName(job.customerName || job.customer?.name || "");
      setCustomerId(job.customerId ?? null);
      setPlannedDate(job.plannedDate ? job.plannedDate.slice(0, 10) : today());
      setServiceType(job.serviceType || "");
      setJobType(job.jobType || "");
      setJobTitle(job.jobTitle || "");
      setReferenceNumber(job.referenceNumber || "");
      setCustomerRef(job.customerRef || "");
      setPurchaseOrderNumber(job.purchaseOrderNumber || "");
      setPriority(job.priority || "normal");
      setContactName(job.bookingContactName || "");
      setContactPhone(job.bookingContactPhone || "");
      setContactEmail(job.bookingContactEmail || "");
      setCustInstructions(job.customerInstructions || "");
      if (job.stops && job.stops.length > 0) {
        setStops([...job.stops].sort((a, b) => a.sequenceNumber - b.sequenceNumber).map(jobStopToStopState));
      }
      const ld = job.loadDetails;
      setMaterialDesc(ld?.materialType || job.materialType || "");
      setTotalQty(ld?.quantity != null ? String(ld.quantity) : job.quantityExpected || "");
      setQtyUnit(ld?.unit || job.quantityUnit || "");
      setTotalWeight(ld?.weight != null ? String(ld.weight) : "");
      setVolume(ld?.volume != null ? String(ld.volume) : "");
      setDimensions(ld?.dimensions || "");
      setAdrClass(ld?.hazardClass || "");
      setTempControlled(ld?.tempControlled ?? false);
      setTempRange(ld?.tempRange || "");
      setFragile(ld?.fragile ?? false);
      setStackable(ld?.stackable ?? false);
      setForkliftReq(ld?.forkliftRequired ?? false);
      setTailLiftReq(ld?.tailLiftRequired ?? false);
      setCraneReq(ld?.craneRequired ?? false);
      setLoadingMethod(ld?.loadingMethod || "");
      setUnloadingMethod(ld?.unloadingMethod || "");
      setLoadNotes(ld?.notes || "");
      setPhotosRequired(ld?.photosRequired ?? false);
      setWeighbridgeReq(ld?.weighbridgeRequired ?? false);
      setPodRequired(job.requirePOD ?? true);
      const vClass = job.vehicleClassRequired || job.vehicleClass || "";
      if (vClass.startsWith("other:")) {
        setVehicleType("other");
        setVehicleTypeOther(vClass.replace("other:", "").trim());
      } else {
        setVehicleType(vClass);
      }
      setMinSize(job.minVehicleSize || "");
      setTrailersAllowed(Array.isArray(job.trailerTypesAllowed) ? job.trailerTypesAllowed : []);
      setTrailersForbidden(Array.isArray(job.trailerTypesForbidden) ? job.trailerTypesForbidden : []);
      setEquipmentReq(Array.isArray(job.equipmentRequired) ? job.equipmentRequired : []);
      setDriverQuals(Array.isArray(job.driverQualificationsReq) ? job.driverQualificationsReq : []);
      setHeightRestriction(job.heightRestriction || "");
      setWeightRestriction(job.weightRestriction || "");
      setLengthRestriction(job.lengthRestriction || "");
      setAccessNotes(job.vehicleAccessNotes || "");
      setFailureAction(job.failureAction || "call_assistance");
      setAssistancePhone(job.assistancePhone || "");
      setAssistanceNote(job.assistanceNote || "");
      setReturnDestination(job.returnDestination || "");
      // Expand all sections so the user sees filled data
      setSec1Collapsed(false);
      setSec2Collapsed(false);
      setSec3Collapsed(false);
      setSec4Collapsed(false);
      setSec5Collapsed(false);
      setSec6Collapsed(false);
    }).catch(() => {
      setError("Could not load job for editing.");
    }).finally(() => {
      setLoadingJob(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editJobId]);

  // ── Auto-save indicator (localStorage snapshot every 30 s) ────────────────
  useEffect(() => {
    const started = customerName || serviceType || stops[0].siteName || materialDesc;
    if (!started) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem("lb_job_draft_ts", new Date().toISOString());
      } catch {}
      setLastAutoSaved(new Date());
    }, 30_000);
    return () => clearTimeout(t);
  });

  const MISSING = [
    !customerName.trim()   && "Customer",
    !plannedDate           && "Planned date",
    !serviceType           && "Service type",
    !jobType               && "Job type",
    !contactName.trim()    && "Contact name",
    !contactPhone.trim()   && "Contact phone",
    !stopsComplete         && "Stop addresses / timing",
    !materialDesc.trim()   && "Goods description",
    !totalQty.trim()       && "Total quantity",
    !qtyUnit               && "Unit",
    !totalWeight.trim()    && "Total weight",
    !vehicleComplete       && "Vehicle type",
    !sec6Complete          && "Return / failure instruction",
  ].filter(Boolean) as string[];

  // ── Score calculation ────────────────────────────────────────────────────
  // Required fields scale to 65 pts; optional fields scale to 35 pts.
  // Points within each group are relative weights — totals are normalised.
  const SCORE_REQ = [
    { pts: 8,  ok: !!customerName.trim() },
    { pts: 5,  ok: !!plannedDate },
    { pts: 7,  ok: !!serviceType },
    { pts: 7,  ok: !!jobType },
    { pts: 6,  ok: !!contactName.trim() },
    { pts: 6,  ok: !!contactPhone.trim() },
    { pts: 12, ok: stopsComplete },
    { pts: 6,  ok: !!materialDesc.trim() },
    { pts: 4,  ok: !!(totalQty.trim() && qtyUnit) },
    { pts: 4,  ok: !!totalWeight.trim() },
    { pts: 7,  ok: vehicleComplete },
    { pts: 5,  ok: sec6Complete },
  ];
  const SCORE_OPT: { label: string; pts: number; ok: boolean }[] = [
    { label: "Reference number",      pts: 3, ok: !!referenceNumber.trim() },
    { label: "Customer / PO ref",     pts: 2, ok: !!(customerRef.trim() || purchaseOrderNumber.trim()) },
    { label: "Contact email",         pts: 2, ok: !!contactEmail.trim() },
    { label: "Stop contacts",         pts: 4, ok: stops.every(s => !!s.contactName.trim()) },
    { label: "Booking references",    pts: 2, ok: stops.some(s => s.bookingRequired && !!s.bookingRef.trim()) },
    { label: "Driver stop notes",     pts: 2, ok: stops.some(s => !!s.driverNotes.trim()) },
    { label: "Volume / dimensions",   pts: 2, ok: !!(volume.trim() || dimensions.trim()) },
    { label: "Equipment required",    pts: 4, ok: equipmentReq.length > 0 },
    { label: "Driver qualifications", pts: 4, ok: driverQuals.length > 0 },
    { label: "Trailer rules",         pts: 2, ok: trailersAllowed.length > 0 || trailersForbidden.length > 0 },
    { label: "Vehicle restrictions",  pts: 2, ok: !!(heightRestriction.trim() || weightRestriction.trim() || lengthRestriction.trim()) },
    { label: "Access notes",          pts: 3, ok: !!accessNotes.trim() },
    { label: "Min vehicle size",      pts: 2, ok: !!minSize },
    { label: "Load notes",            pts: 1, ok: !!loadNotes.trim() },
  ];

  const reqTotal   = SCORE_REQ.reduce((s, x) => s + x.pts, 0);
  const reqEarned  = SCORE_REQ.filter(x => x.ok).reduce((s, x) => s + x.pts, 0);
  const optTotal   = SCORE_OPT.reduce((s, x) => s + x.pts, 0);
  const optEarned  = SCORE_OPT.filter(x => x.ok).reduce((s, x) => s + x.pts, 0);
  const reqScore   = Math.round((reqEarned / reqTotal) * 65);
  const optScore   = Math.round((optEarned / optTotal) * 35);
  const totalScore = reqScore + optScore;

  const scoreColor =
    totalScore >= 80 ? "text-green-600" :
    totalScore >= 40 ? "text-amber-600" :
    totalScore >= 10 ? "text-red-500" : "text-slate-400";
  const barReqColor  = "bg-slate-600";
  const barOptColor  = "bg-green-500";
  const OPT_MISSING  = SCORE_OPT.filter(x => !x.ok).map(x => x.label);

  async function buildBody(saveMode: "draft" | "ready_to_plan") {
    const mappedStops = stops.map((stop, i) => {
      const type = stop.stopType === "collection" ? "pickup" : "dropoff";
      const locationTextSnapshot = [stop.siteName, stop.street, stop.town, stop.postcode].filter(Boolean).join(", ");

      const base: Record<string, unknown> = {
        sequenceNumber:        i + 1,
        type,
        savedLocationId:       stop.savedLocationId,
        siteName:              stop.siteName,
        unitName:              stop.unitBuilding,
        street:                stop.street,
        town:                  stop.town,
        postcode:              stop.postcode,
        country:               stop.country,
        addressLine2:          stop.addressLine2,
        countyRegion:          stop.countyRegion,
        locationTextSnapshot,
        lat:                   stop.lat ? parseFloat(stop.lat) : null,
        lng:                   stop.lng ? parseFloat(stop.lng) : null,
        contactName:           stop.contactName,
        contactPhone:          stop.contactPhone,
        contactEmail:          stop.contactEmail,
        referenceNumber:       stop.refNumber,
        instructions:          stop.driverNotes,
        bookingRequired:       stop.bookingRequired,
        bookingRef:            stop.bookingRef,
        openingHours:          stop.openingHours,
        locationType:          stop.locationType,
        navigationInstructions: stop.navigationInstructions,
        numPallets:            stop.numPallets ? parseInt(stop.numPallets, 10) : null,
        internalNotes:         stop.internalNotes,
        earliestArrivalMinutes: toMins(stop.earliestArrival),
        unloadingAllowanceMinutes: stop.unloadingTime ? parseInt(stop.unloadingTime, 10) : null,
      };

      if (stop.timeType === "exact" && stop.exactTime) {
        base.bookedTime = `${stop.date}T${stop.exactTime}:00.000Z`;
      } else if (stop.timeType === "window" && stop.windowStart && stop.windowEnd) {
        base.timeWindowStart = `${stop.date}T${stop.windowStart}:00.000Z`;
        base.timeWindowEnd   = `${stop.date}T${stop.windowEnd}:00.000Z`;
      }

      return base;
    });

    const effectiveUnit = qtyUnit === "other" ? qtyUnitOther : qtyUnit;
    const loadDetails = {
      materialType:       materialDesc,
      quantity:           totalQty ? parseFloat(totalQty) : null,
      unit:               effectiveUnit,
      weight:             totalWeight ? parseFloat(totalWeight) : null,
      volume:             volume ? parseFloat(volume) : null,
      hazardClass:        adrClass,
      notes:              loadNotes,
      dimensions,
      fragile,
      stackable,
      tempControlled,
      tempRange,
      photosRequired,
      weighbridgeRequired: weighbridgeReq,
      forkliftRequired:   forkliftReq,
      tailLiftRequired:   tailLiftReq,
      craneRequired:      craneReq,
      loadingMethod,
      unloadingMethod,
    };

    const vehicleClassRequired = vehicleType === "other"
      ? `other: ${vehicleTypeOther}`.trim()
      : vehicleType;

    return {
      saveMode,
      customerId:             customerId,
      customerName:           customerName,
      plannedDate,
      serviceType,
      jobType,
      jobTitle,
      referenceNumber,
      customerRef,
      purchaseOrderNumber,
      priority:               priority as "low" | "normal" | "high",
      bookingContactName:     contactName,
      bookingContactPhone:    contactPhone,
      bookingContactEmail:    contactEmail,
      billingNotes,
      customerInstructions:   custInstructions,
      custRefRequired,
      poRequired,
      vehicleClassRequired,
      minVehicleSize:         minSize,
      trailerTypesAllowed:    trailersAllowed,
      trailerTypesForbidden:  trailersForbidden,
      equipmentRequired:      equipmentReq,
      driverQualificationsReq: driverQuals,
      heightRestriction,
      weightRestriction,
      lengthRestriction,
      vehicleAccessNotes:     accessNotes,
      requirePOD:             podRequired,
      failureAction,
      assistancePhone:        failureAction === "call_assistance" ? assistancePhone : "",
      assistanceNote:         failureAction === "call_assistance" ? assistanceNote  : "",
      returnDestination:      failureAction === "finish_then_return" ? returnDestination : "",
      altAddress: needsAltAddress ? {
        savedLocationId: altSavedLocationId,
        companyName:     altCompanyName,
        street:          altStreet,
        town:            altTown,
        postcode:        altPostcode,
        country:         altCountry,
        lat:             altLat ? parseFloat(altLat) : null,
        lng:             altLng ? parseFloat(altLng) : null,
        unit:            altUnit,
        addressLine2:    altAddressLine2,
        county:          altCounty,
        contactName:     altContactName,
        contactPhone:    altContactPhone,
        contactEmail:    altContactEmail,
        navNotes:        altNavNotes,
        driverNotes:     altDriverNotes,
      } : null,
      stops:                  mappedStops,
      loadDetails,
    };
  }

  async function handleSaveDraft() {
    setSaving("draft");
    setError("");
    try {
      const body = await buildBody("draft");
      if (editJobId) {
        await jobsApi.update(editJobId, body);
      } else {
        await jobsApi.create(body);
      }
      navigate("/app/jobs");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveReady() {
    setTriedSave(true);
    // If required fields are missing, just reveal the pills — don't call API
    if (MISSING.length > 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving("ready");
    setError("");
    try {
      const body = await buildBody("ready_to_plan");
      if (editJobId) {
        await jobsApi.update(editJobId, body);
      } else {
        await jobsApi.create(body);
      }
      navigate("/app/jobs");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save job");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(null);
    }
  }

  if (loadingJob) {
    return <div className="flex h-64 items-center justify-center text-muted">Loading job...</div>;
  }

  return (
    <div className="min-h-screen bg-surface pb-40">

      {/* ── Page header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-5" style={{boxShadow: '0 1px 4px rgba(15,23,42,0.06)'}}>
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-muted hover:text-primary hover:border-slate-300 hover:bg-slate-50 transition-all flex-shrink-0" title="Back">←</button>
          <div>
            <h1 className="text-xl font-black text-primary">{isEditMode ? "Edit Job" : "New Job"}</h1>
            <p className="text-sm text-muted mt-0.5">
              {isEditMode ? "Update the fields below — changes won't be lost until you save" : "Fill in the sections below — save as draft any time"}
            </p>
          </div>
        </div>
      </div>

      {error && <div className="max-w-3xl mx-auto px-4 pt-4"><div className="bg-red-50 border border-red-300 text-red-800 rounded-xl px-4 py-3 text-sm font-medium">{error}</div></div>}

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-4">

        {/* ── Quality score ──────────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          {/* Gradient top bar */}
          <div className="h-1.5 w-full flex">
            <div className="h-full bg-slate-600 transition-all duration-700 ease-out" style={{ width: hasStarted ? `${reqScore}%` : "0%" }} />
            <div className="h-full bg-green-500 transition-all duration-700 ease-out" style={{ width: hasStarted ? `${optScore}%` : "0%" }} />
            <div className="h-full flex-1 bg-slate-100" />
          </div>
          <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-1">Job Completeness</div>
              <div className={"text-5xl font-black leading-none " + (hasStarted ? scoreColor : "text-slate-300")}>
                {hasStarted ? totalScore : "—"}<span className="text-2xl">{hasStarted ? "%" : ""}</span>
              </div>
              <div className="text-xs text-muted mt-1.5 flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600 inline-block" /> Required <strong className="text-slate-700">{hasStarted ? `${reqScore}/65` : "0/65"}</strong></span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Optional <strong className="text-green-700">{hasStarted ? `${optScore}/35` : "0/35"}</strong></span>
              </div>
            </div>
            <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center flex-shrink-0 ${
              !hasStarted ? "border-slate-100 bg-slate-50" :
              totalScore >= 80 ? "border-green-200 bg-green-50" : totalScore >= 40 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
              <span className={"text-xl font-black " + (hasStarted ? scoreColor : "text-slate-300")}>{hasStarted ? `${totalScore}%` : "—"}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-4 flex">
            <div className={"h-full bg-slate-600 transition-all duration-700 ease-out rounded-full"} style={{ width: hasStarted ? `${reqScore}%` : "0%" }} />
            <div className={"h-full bg-green-500 transition-all duration-700 ease-out"} style={{ width: hasStarted ? `${optScore}%` : "0%", borderRadius: reqScore > 0 ? "0 9999px 9999px 0" : "9999px" }} />
          </div>

          {/* Missing required */}
          {triedSave && MISSING.length > 0 && (
            <div className="border-t border-slate-100 pt-3 mb-3">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2.5">
                {MISSING.length} still needed
              </div>
              <div className="flex flex-wrap gap-2">
                {MISSING.map(f => (
                  <span key={f} className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-full font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" /> {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Optional fields to improve score */}
          {MISSING.length === 0 && OPT_MISSING.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-2.5">
                Add these to boost your score
              </div>
              <div className="flex flex-wrap gap-2">
                {OPT_MISSING.map(f => (
                  <span key={f} className="inline-flex items-center gap-1.5 text-xs bg-slate-50 text-slate-500 border border-slate-200 px-2.5 py-1 rounded-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors cursor-default">
                    + {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {MISSING.length === 0 && OPT_MISSING.length === 0 && (
            <div className="border-t border-green-200 pt-3 bg-green-50 -mx-5 px-5 -mb-5 pb-5 rounded-b-xl">
              <span className="text-sm text-green-700 font-semibold">✓ All fields complete — this job is ready to plan</span>
            </div>
          )}
          </div>{/* end p-5 */}
        </div>

        {/* ── Section 01 — Job Basics ────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={1} icon="📋" title="Job Basics" subtitle="Date, service type and job type" active
            collapsed={sec1Collapsed} onToggle={() => setSec1Collapsed(o => !o)}
            summary={[customerName, plannedDate, serviceType].filter(Boolean).join(" · ")}
            complete={basicsComplete} started={sec1Started} />
          {!sec1Collapsed && <div className="px-6 pt-5 pb-5 space-y-5">
            <div>
              <FieldLabel required>Customer</FieldLabel>
              <CustomerSearch value={customerName} linkedId={customerId} onChange={handleCustomerChange} />
            </div>
            <div>
              <FieldLabel required>Planned Date</FieldLabel>
              <input type="date" className="input" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} />
              <p className="text-xs text-muted mt-1.5">👉 When this job appears for planning</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Service Type</FieldLabel>
                <select className="input" value={serviceType} onChange={e => setServiceType(e.target.value)}>
                  <option value="">— Select —</option>
                  {SERVICE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel required>Job Type</FieldLabel>
                <select className="input" value={jobType} onChange={e => setJobType(e.target.value)}>
                  <option value="">— Select —</option>
                  {JOB_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <OptionalToggle open={showBasicsOpts} onToggle={() => setShowBasicsOpts(o => !o)} label="optional job details" />
            {showBasicsOpts && (
              <div className="space-y-4 pt-1 border-t border-border">
                <div>
                  <FieldLabel>Job Title / Short Description</FieldLabel>
                  <input type="text" className="input" placeholder="e.g. Overnight trunking — North to South depot"
                    value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <FieldLabel>Job Reference No.</FieldLabel>
                    <input type="text" className="input" placeholder="JB-00123"
                      value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Customer Reference No.</FieldLabel>
                    <input type="text" className="input" placeholder="CUST-REF-456"
                      value={customerRef} onChange={e => setCustomerRef(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Purchase Order No.</FieldLabel>
                    <input type="text" className="input" placeholder="PO-789"
                      value={purchaseOrderNumber} onChange={e => setPurchaseOrderNumber(e.target.value)} />
                  </div>
                </div>
                <div className="max-w-xs">
                  <FieldLabel>Priority</FieldLabel>
                  <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>
                    {PRIORITY_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ReadOnlyField label="Created By" value={user?.name ?? "—"} />
                  <ReadOnlyField label="Created At" value={nowDisplay()} />
                </div>
              </div>
            )}
          </div>}
          {!sec1Collapsed && <SectionFooter complete={basicsComplete} label="Job basics" />}
        </div>

        {/* ── Section 02 — Customer Details ──────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={2} icon="🏢" title="Customer Details" subtitle="Operational contact for this job" active
            collapsed={sec2Collapsed} onToggle={() => setSec2Collapsed(o => !o)}
            summary={[contactName, contactPhone].filter(Boolean).join(" · ")}
            complete={customerComplete} started={sec2Started} />
          {!sec2Collapsed && <div className="px-6 pt-5 pb-5 space-y-5">
            {customerId && (
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <span>✓</span>
                <span>Linked to <strong>{customerName}</strong> — contact details autofilled. Edit below if different for this job.</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Contact Name</FieldLabel>
                <input type="text" className="input" placeholder="Jane Smith"
                  value={contactName} onChange={e => setContactName(e.target.value)} />
              </div>
              <div>
                <FieldLabel required>Contact Phone</FieldLabel>
                <input type="tel" className="input" placeholder="07700 900123"
                  value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
              </div>
            </div>
            <OptionalToggle open={showCustOpts} onToggle={() => setShowCustOpts(o => !o)} label="customer details" />
            {showCustOpts && (
              <div className="space-y-4 pt-1 border-t border-border">
                <div>
                  <FieldLabel>Customer Address</FieldLabel>
                  <input type="text" className="input" placeholder="1 Example Road, Sampletown, EX1 1AA"
                    value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Contact Email</FieldLabel>
                  <input type="email" className="input" placeholder="jane@example.com"
                    value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Billing Notes</FieldLabel>
                  <textarea className="input min-h-16 resize-none" placeholder="e.g. Invoice to head office, attn: Accounts Payable…"
                    value={billingNotes} onChange={e => setBillingNotes(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Customer-Specific Instructions</FieldLabel>
                  <textarea className="input min-h-16 resize-none" placeholder="e.g. Always call 30 min before arrival, do not use rear entrance…"
                    value={custInstructions} onChange={e => setCustInstructions(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <Toggle value={custRefRequired} onChange={setCustRefRequired} label="Customer reference required" />
                    <p className="text-xs text-muted mt-1.5">Driver must enter customer ref before completing job</p>
                  </div>
                  <div>
                    <Toggle value={poRequired} onChange={setPoRequired} label="Purchase order required" />
                    <p className="text-xs text-muted mt-1.5">Driver must enter PO number before completing job</p>
                  </div>
                </div>
              </div>
            )}
          </div>}
          {!sec2Collapsed && <SectionFooter complete={customerComplete} label="Customer details" />}
        </div>

        {/* ── Section 03 — Collection / Delivery ─────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={3} icon="🔄" title="Collection / Delivery" subtitle="Add all pickup and dropoff stops for this job" active
            collapsed={sec3Collapsed} onToggle={() => setSec3Collapsed(o => !o)}
            summary={`${stops.length} stop${stops.length !== 1 ? "s" : ""} · ${stops.filter(stopComplete).length} complete`}
            complete={stopsComplete} started={sec3Started} />

          {!sec3Collapsed && <div className="p-4 space-y-3">
            {stops.map((stop, i) => (
              <StopCard
                key={stop.id}
                stop={stop}
                index={i}
                total={stops.length}
                locations={locations}
                onChange={patch => updateStop(stop.id, patch)}
                onRemove={() => removeStop(stop.id)}
              />
            ))}

            <button type="button" onClick={addStop}
              className="w-full py-3 border-2 border-dashed border-border rounded-xl text-sm font-semibold text-muted hover:border-accent hover:text-accent transition-colors">
              + Add another stop
            </button>
          </div>}

          {!sec3Collapsed && <SectionFooter complete={stopsComplete} label="All stops" />}
        </div>

        {/* ── Section 04 — Load Details ───────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={4} icon="⚖️" title="Load Details" subtitle="Total job load, weight, conditions and handling" active
            collapsed={sec4Collapsed} onToggle={() => setSec4Collapsed(o => !o)}
            summary={[materialDesc, totalWeight ? totalWeight + "t" : ""].filter(Boolean).join(" · ")}
            complete={loadComplete} started={sec4Started} />
          {!sec4Collapsed && <div className="px-6 pt-5 pb-5 space-y-5">

            {/* Goods description */}
            <div>
              <FieldLabel required>Goods / Material Description</FieldLabel>
              <input type="text" className="input" placeholder="e.g. Construction aggregate, frozen poultry, retail fixtures"
                value={materialDesc} onChange={e => setMaterialDesc(e.target.value)} />
            </div>

            {/* Qty + unit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Total Quantity</FieldLabel>
                <input type="text" inputMode="decimal" className="input" placeholder="e.g. 24"
                  value={totalQty} onChange={e => setTotalQty(e.target.value)} />
              </div>
              <div>
                <FieldLabel required>Unit</FieldLabel>
                <select className="input" value={qtyUnit} onChange={e => setQtyUnit(e.target.value)}>
                  <option value="">— Select unit —</option>
                  {LOAD_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            {qtyUnit === "other" && (
              <div>
                <FieldLabel required>Unit Description</FieldLabel>
                <input type="text" className="input" placeholder="e.g. Rolls, coils, drums…"
                  value={qtyUnitOther} onChange={e => setQtyUnitOther(e.target.value)} />
              </div>
            )}

            {/* Total weight */}
            <div className="max-w-xs">
              <FieldLabel required>Total Weight / Estimated Weight</FieldLabel>
              <div className="relative">
                <input type="text" inputMode="decimal" className="input pr-12" placeholder="e.g. 24.0"
                  value={totalWeight} onChange={e => setTotalWeight(e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">tonnes</span>
              </div>
            </div>

            {/* POD required */}
            <div>
              <Toggle value={podRequired} onChange={setPodRequired} label="Proof of delivery required" />
              <p className="text-xs text-muted mt-1.5">Driver must confirm delivery and capture POD before completing the job</p>
            </div>

            <OptionalToggle open={showLoadOpts} onToggle={() => setShowLoadOpts(o => !o)} label="load details" />

            {showLoadOpts && (
              <div className="space-y-5 pt-1 border-t border-border">

                {/* Physical */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Physical</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Volume</FieldLabel>
                      <div className="relative">
                        <input type="text" className="input pr-8" placeholder="e.g. 36"
                          value={volume} onChange={e => setVolume(e.target.value)} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">m³</span>
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Dimensions (L × W × H)</FieldLabel>
                      <input type="text" className="input" placeholder="e.g. 2.4 × 1.2 × 1.8 m"
                        value={dimensions} onChange={e => setDimensions(e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Conditions */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Conditions</div>
                  <div className="space-y-3">
                    <div>
                      <Toggle value={hazardous} onChange={setHazardous} label="Hazardous goods (ADR)" />
                      {hazardous && (
                        <div className="mt-2 max-w-xs">
                          <FieldLabel>ADR Class</FieldLabel>
                          <input type="text" className="input" placeholder="e.g. Class 3 — Flammable liquids"
                            value={adrClass} onChange={e => setAdrClass(e.target.value)} />
                        </div>
                      )}
                    </div>
                    <div>
                      <Toggle value={tempControlled} onChange={setTempControlled} label="Temperature controlled" />
                      {tempControlled && (
                        <div className="mt-2 max-w-xs">
                          <FieldLabel>Temperature Range</FieldLabel>
                          <input type="text" className="input" placeholder="e.g. 2°C – 8°C"
                            value={tempRange} onChange={e => setTempRange(e.target.value)} />
                        </div>
                      )}
                    </div>
                    <Toggle value={fragile}   onChange={setFragile}   label="Fragile" />
                    <Toggle value={stackable} onChange={setStackable} label="Stackable" />
                  </div>
                </div>

                {/* Handling / equipment */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Handling Equipment Required</div>
                  <div className="space-y-3">
                    <Toggle value={forkliftReq} onChange={setForkliftReq} label="Forklift required" />
                    <Toggle value={tailLiftReq} onChange={setTailLiftReq} label="Tail lift required" />
                    <Toggle value={craneReq}    onChange={setCraneReq}    label="Crane required" />
                  </div>
                </div>

                {/* Handling methods */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Handling Methods</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Loading Method</FieldLabel>
                      <select className="input" value={loadingMethod} onChange={e => setLoadingMethod(e.target.value)}>
                        <option value="">— Select —</option>
                        {HANDLING_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <FieldLabel>Unloading Method</FieldLabel>
                      <select className="input" value={unloadingMethod} onChange={e => setUnloadingMethod(e.target.value)}>
                        <option value="">— Select —</option>
                        {HANDLING_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Extra */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Extra</div>
                  <div className="space-y-3">
                    <div>
                      <FieldLabel>Load Notes</FieldLabel>
                      <textarea className="input min-h-16 resize-none" placeholder="Any additional load information for the driver or planner…"
                        value={loadNotes} onChange={e => setLoadNotes(e.target.value)} />
                    </div>
                    <Toggle value={photosRequired}  onChange={setPhotosRequired}  label="Photos / documents required" />
                    <Toggle value={weighbridgeReq}  onChange={setWeighbridgeReq}  label="Weighbridge ticket required" />
                  </div>
                </div>

              </div>
            )}
          </div>}
          {!sec4Collapsed && <SectionFooter complete={loadComplete} label="Load details" />}
        </div>

        {/* ── Section 05 — Vehicle Requirements ─────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={5} icon="🚛" title="Vehicle Requirements" subtitle="Vehicle class, trailer type and special equipment" active
            collapsed={sec5Collapsed} onToggle={() => setSec5Collapsed(o => !o)}
            summary={vehicleType ? VEHICLE_TYPES.find(([v]) => v === vehicleType)?.[1] ?? vehicleType : undefined}
            complete={vehicleComplete} started={sec5Started} />

          {!sec5Collapsed && <div className="px-6 pt-5 pb-5 space-y-5">

            {/* Vehicle type */}
            <div>
              <FieldLabel required>Vehicle Type Required</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {VEHICLE_TYPES.map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setVehicleType(key)}
                    className={"text-sm px-3 py-1.5 rounded-full border font-medium transition-colors " +
                      (vehicleType === key
                        ? "bg-slate-700 text-white border-slate-700"
                        : "bg-white text-muted border-border hover:border-gray-400")}>
                    {label}
                  </button>
                ))}
              </div>
              {vehicleType === "other" && (
                <div className="mt-3 max-w-xs">
                  <FieldLabel required>Vehicle Type Description</FieldLabel>
                  <input type="text" className="input" placeholder="e.g. Specialist tanker, car transporter…"
                    value={vehicleTypeOther} onChange={e => setVehicleTypeOther(e.target.value)} />
                </div>
              )}
            </div>

            <OptionalToggle open={showVehicleOpts} onToggle={() => setShowVehicleOpts(o => !o)} label="vehicle details" />

            {showVehicleOpts && (
              <div className="space-y-6 pt-1 border-t border-border">

                {/* Minimum size */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Size</div>
                  <div className="max-w-xs">
                    <FieldLabel>Minimum Vehicle Size</FieldLabel>
                    <select className="input" value={minSize} onChange={e => setMinSize(e.target.value)}>
                      <option value="">— No minimum —</option>
                      {MIN_SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>

                {/* Trailer rules */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Trailer Rules</div>
                  <div className="space-y-4">
                    <div>
                      <FieldLabel>Trailer Types Allowed</FieldLabel>
                      <MultiCheck options={TRAILER_TYPES} value={trailersAllowed} onChange={setTrailersAllowed} />
                    </div>
                    <div>
                      <FieldLabel>Trailer Types Forbidden</FieldLabel>
                      <MultiCheck options={TRAILER_TYPES} value={trailersForbidden} onChange={setTrailersForbidden} />
                    </div>
                  </div>
                </div>

                {/* Equipment */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Equipment Required</div>
                  <MultiCheck options={EQUIPMENT_OPTS} value={equipmentReq} onChange={setEquipmentReq} />
                </div>

                {/* Driver qualifications */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Driver Qualifications</div>
                  <MultiCheck options={DRIVER_QUALS} value={driverQuals} onChange={setDriverQuals} />
                </div>

                {/* Restrictions */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Restrictions</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <FieldLabel>Height</FieldLabel>
                      <div className="relative">
                        <input type="text" inputMode="decimal" className="input pr-6" placeholder="e.g. 4.0"
                          value={heightRestriction} onChange={e => setHeightRestriction(e.target.value)} />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">m</span>
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Weight</FieldLabel>
                      <div className="relative">
                        <input type="text" inputMode="decimal" className="input pr-6" placeholder="e.g. 7.5"
                          value={weightRestriction} onChange={e => setWeightRestriction(e.target.value)} />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">t</span>
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Length</FieldLabel>
                      <div className="relative">
                        <input type="text" inputMode="decimal" className="input pr-6" placeholder="e.g. 9.0"
                          value={lengthRestriction} onChange={e => setLengthRestriction(e.target.value)} />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">m</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Access notes */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Access / Vehicle Notes</div>
                  <textarea className="input min-h-16 resize-none"
                    placeholder="e.g. Tight access — no artic. Residential road. Low bridge at 3.8m on approach."
                    value={accessNotes} onChange={e => setAccessNotes(e.target.value)} />
                </div>

              </div>
            )}
          </div>}
          {!sec5Collapsed && <SectionFooter complete={vehicleComplete} label="Vehicle requirements" />}
        </div>

        {/* ── Section 06 — Return Instructions ───────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={6} icon="↩️" title="Return / Failure Instructions" subtitle="What the driver does if a delivery cannot be completed"
            active collapsed={sec6Collapsed} onToggle={() => setSec6Collapsed(o => !o)}
            complete={sec6Complete} started={sec6Started}            summary={failureAction ? (
              failureAction === "call_assistance"      ? `Call for assistance${assistancePhone ? ` · ${assistancePhone}` : ""}` :
              failureAction === "next_delivery"        ? "Proceed to next delivery" :
              failureAction === "return_depot"         ? "Return to depot" :
              failureAction === "return_collection"    ? "Return to collection address" :
              failureAction === "deliver_alternative"  ? "Deliver to alternative address" :
              failureAction === "finish_then_return"   ? `Finish deliveries, then return${returnDestination ? ` to ${returnDestination}` : ""}` : ""
            ) : undefined} />

          {!sec6Collapsed && <div className="px-6 pt-5 pb-5 space-y-5">

            {/* Main dropdown */}
            <div>
              <FieldLabel required>What should the driver do if delivery fails?</FieldLabel>
              <select className="input" value={failureAction} onChange={e => { setFailureAction(e.target.value); setReturnDestination(""); }}>
                <option value="call_assistance">Call for assistance</option>
                <option value="next_delivery">Proceed to next delivery</option>
                <option value="return_depot">Return to depot</option>
                <option value="return_collection">Return to collection address</option>
                <option value="deliver_alternative">Deliver to alternative address</option>
                <option value="finish_then_return">Finish remaining deliveries, then return</option>
              </select>
              <p className="text-xs text-muted mt-1.5">
                {failureAction === "next_delivery"     && "Driver will proceed to the next stop on the job."}
                {failureAction === "return_depot"      && "System uses the driver's assigned depot / yard. No address needed."}
                {failureAction === "return_collection" && "System uses the original collection stop address. No address needed."}
                {failureAction === "call_assistance"   && "Driver will call the number below before taking any other action."}
                {failureAction === "deliver_alternative" && "Driver will deliver to the alternative address below."}
                {failureAction === "finish_then_return"  && "Driver will complete any remaining stops, then return as specified."}
              </p>
            </div>

            {/* Call for assistance */}
            {failureAction === "call_assistance" && (
              <div className="space-y-3 pt-1 border-t border-border">
                <div>
                  <FieldLabel required>Assistance Phone Number</FieldLabel>
                  <input type="tel" className="input" placeholder="e.g. 07700 900123"
                    value={assistancePhone} onChange={e => setAssistancePhone(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Assistance Instruction / Note</FieldLabel>
                  <textarea className="input min-h-16 resize-none"
                    placeholder="e.g. Call dispatcher before returning. Quote job reference."
                    value={assistanceNote} onChange={e => setAssistanceNote(e.target.value)} />
                </div>
              </div>
            )}

            {/* Finish then return — destination picker */}
            {failureAction === "finish_then_return" && (
              <div className="pt-1 border-t border-border">
                <FieldLabel required>Return Destination</FieldLabel>
                <div className="flex gap-2 flex-wrap">
                  {[["depot","Depot"],["collection","Collection address"],["alternative","Alternative address"]].map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setReturnDestination(val)}
                      className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors " +
                        (returnDestination === val
                          ? "bg-slate-700 text-white border-slate-700"
                          : "bg-white text-muted border-border hover:border-gray-400")}>
                      {label}
                    </button>
                  ))}
                </div>
                {returnDestination === "depot"      && <p className="text-xs text-muted mt-2">Uses driver's assigned depot. No address needed.</p>}
                {returnDestination === "collection" && <p className="text-xs text-muted mt-2">Uses the original collection stop address. No address needed.</p>}
              </div>
            )}

            {/* Alternative address block — shared */}
            {needsAltAddress && (
              <div className="space-y-4 pt-1 border-t border-border">
                <div className="text-xs font-bold text-muted uppercase tracking-widest">Alternative Address</div>

                {/* Saved location search */}
                <div>
                  <FieldLabel>Search saved locations</FieldLabel>
                  <LocationSearch
                    value={altLocationQuery}
                    linkedId={altSavedLocationId}
                    locations={locations}
                    onSelect={loc => {
                      setAltSavedLocationId(loc.id);
                      setAltLocationQuery(loc.name);
                      setAltCompanyName(loc.siteName || loc.name);
                      setAltStreet(loc.street);
                      setAltTown(loc.town);
                      setAltPostcode(loc.postcode);
                      setAltLat(loc.latitude != null ? String(loc.latitude) : "");
                      setAltLng(loc.longitude != null ? String(loc.longitude) : "");
                      setAltContactName(loc.contactName || "");
                      setAltContactPhone(loc.contactPhone || "");
                    }}
                    onClear={() => {
                      setAltSavedLocationId(null);
                      setAltLocationQuery("");
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <FieldLabel required>Company / Site Name</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. Acme Logistics Ltd"
                      value={altCompanyName} onChange={e => setAltCompanyName(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel required>Street / Address Line 1</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. 12 Sample Road"
                      value={altStreet} onChange={e => setAltStreet(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel required>Town / City</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. Sampletown"
                      value={altTown} onChange={e => setAltTown(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel required>Postcode</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. EX1 1AA"
                      value={altPostcode} onChange={e => setAltPostcode(e.target.value.toUpperCase())} />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel required>Country</FieldLabel>
                    <input type="text" className="input" placeholder="United Kingdom"
                      value={altCountry} onChange={e => setAltCountry(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Latitude</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. 51.5074"
                      value={altLat} onChange={e => setAltLat(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Longitude</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. -0.1278"
                      value={altLng} onChange={e => setAltLng(e.target.value)} />
                  </div>
                </div>

                <OptionalToggle open={showAltOpts} onToggle={() => setShowAltOpts(o => !o)} label="optional address details" />

                {showAltOpts && <div className="space-y-3">
                  <div>
                    <FieldLabel>Unit / Building</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. Unit 4B"
                      value={altUnit} onChange={e => setAltUnit(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Address Line 2</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. Exampleshire Industrial Estate"
                      value={altAddressLine2} onChange={e => setAltAddressLine2(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>County / Region</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. Exampleshire"
                      value={altCounty} onChange={e => setAltCounty(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Contact Name</FieldLabel>
                      <input type="text" className="input" placeholder="e.g. J. Smith"
                        value={altContactName} onChange={e => setAltContactName(e.target.value)} />
                    </div>
                    <div>
                      <FieldLabel>Contact Phone</FieldLabel>
                      <input type="tel" className="input" placeholder="e.g. 07700 900456"
                        value={altContactPhone} onChange={e => setAltContactPhone(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Contact Email</FieldLabel>
                    <input type="email" className="input" placeholder="e.g. goods@example.com"
                      value={altContactEmail} onChange={e => setAltContactEmail(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Navigation Instructions</FieldLabel>
                    <textarea className="input min-h-16 resize-none"
                      placeholder="e.g. Enter via rear gate on Example Lane"
                      value={altNavNotes} onChange={e => setAltNavNotes(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Driver Notes</FieldLabel>
                    <textarea className="input min-h-16 resize-none"
                      placeholder="e.g. Call ahead 30 mins before arrival"
                      value={altDriverNotes} onChange={e => setAltDriverNotes(e.target.value)} />
                  </div>
                </div>}
              </div>
            )}

          </div>}
          {!sec6Collapsed && <SectionFooter complete={sec6Complete} label="Return instructions" />}
        </div>

      </div>

      {/* ── Sticky save bar ───────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40" style={{background: 'white', borderTop: '1px solid #e2e8f0', boxShadow: '0 -4px 24px rgba(15,23,42,0.08)'}}>
        {/* Progress strip */}
        <div className="w-full h-1 flex">
          <div className="h-full bg-slate-500 transition-all duration-700" style={{ width: `${reqScore}%` }} />
          <div className="h-full bg-green-500 transition-all duration-700" style={{ width: `${optScore}%` }} />
        </div>
        <div className="max-w-3xl mx-auto px-5 py-3">
          {/* Inline error / missing hint */}
          {triedSave && MISSING.length > 0 && (
            <div className="flex items-center gap-2 mb-2 text-xs text-red-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              {MISSING.length} required field{MISSING.length > 1 ? "s" : ""} still needed — scroll up to see
            </div>
          )}
          {error && (
            <div className="mb-2 text-xs text-red-600 font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            {/* Cancel — quiet, left */}
            <button onClick={() => navigate(-1)}
              className="text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors px-1 flex-shrink-0">
              Cancel
            </button>
            <div className="flex-1" />
            {/* Quality score — centre-right */}
            <div className={"hidden sm:flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border flex-shrink-0 " +
              (totalScore >= 80 ? "text-green-700 bg-green-50 border-green-200" :
               totalScore >= 40 ? "text-amber-700 bg-amber-50 border-amber-200" :
               "text-slate-400 bg-slate-50 border-slate-200")}>
              {hasStarted ? `${totalScore}%` : "—"}
            </div>
            {/* Save Draft */}
            <button onClick={handleSaveDraft} disabled={saving !== null}
              className="btn btn-outline text-sm px-5 py-2.5 flex-shrink-0">
              {saving === "draft" ? "Saving…" : isEditMode ? "Save as draft" : "Save Draft"}
            </button>
            {/* Save Ready */}
            <button onClick={handleSaveReady} disabled={saving !== null}
              className={"btn text-sm px-6 py-2.5 font-bold flex-shrink-0 " +
                (MISSING.length === 0
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "btn-primary")}>
              {saving === "ready" ? "Saving…" : isEditMode ? (MISSING.length === 0 ? "Update job" : "Update & mark ready") : (MISSING.length === 0 ? "Save & Plan" : "Ready for Planner")}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

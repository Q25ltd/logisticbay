import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { customersApi } from "../../api/customers";
import { jobsApi } from "../../api/jobs";
import { useAuth } from "../../hooks/useAuth";
import type { Customer, SavedLocation } from "../../types";

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
  estimatedServiceTime: string;
  internalNotes: string;
}

const today = () => new Date().toISOString().split("T")[0];
const nowDisplay = () =>
  new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function makeStop(): StopState {
  return {
    id: Math.random().toString(36).slice(2),
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
    estimatedServiceTime: "",
    internalNotes: "",
  };
}

function stopComplete(s: StopState) {
  const addr = s.siteName.trim() && s.street.trim() && s.town.trim() && s.postcode.trim();
  const time =
    s.timeType === "exact"  ? !!s.exactTime :
    s.timeType === "window" ? !!(s.windowStart && s.windowEnd) : true;
  return !!(addr && s.date && time);
}

// ── Empty shells for sections not yet built (04-06) ───────────────────────────

const SHELLS = [
  { id: "load",    icon: "⚖️", title: "Load Details",          subtitle: "Material type, quantity, weight and hazard class" },
  { id: "vehicle", icon: "🚛", title: "Vehicle Requirements",  subtitle: "Vehicle class, trailer type and special equipment" },
  { id: "notes",   icon: "📝", title: "Notes & Instructions",  subtitle: "Planner notes, driver instructions and internal comments" },
];

// ── Shared sub-components ─────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-primary mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
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

function SectionHeader({ num, icon, title, subtitle, active }: {
  num: number; icon: string; title: string; subtitle: string; active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gray-50/50">
      <div className="w-9 h-9 rounded-lg bg-white border border-border flex items-center justify-center text-lg shadow-sm flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted uppercase tracking-widest">
            {String(num).padStart(2, "0")}
          </span>
          <h2 className="text-sm font-black text-primary">{title}</h2>
        </div>
        <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>
      </div>
      {!active && <span className="text-xs text-gray-300 font-medium flex-shrink-0">Coming soon</span>}
    </div>
  );
}

function SectionFooter({ complete, label }: { complete: boolean; label: string }) {
  return (
    <div className={
      "px-5 py-2.5 border-t border-border text-xs font-semibold flex items-center gap-2 " +
      (complete ? "text-green-700 bg-green-50" : "text-muted bg-gray-50")
    }>
      {complete
        ? <><span>✓</span> {label} complete</>
        : <><span className="text-red-400">●</span> Fill in all required fields above</>
      }
    </div>
  );
}

function OptionalToggle({ open, onToggle, label = "optional details" }: {
  open: boolean; onToggle: () => void; label?: string;
}) {
  return (
    <div className="pt-1">
      <button type="button" onClick={onToggle}
        className="text-xs font-semibold text-accent hover:underline flex items-center gap-1.5">
        <span className="text-base leading-none">{open ? "▾" : "▸"}</span>
        {open ? `Hide ${label}` : `+ Add ${label}`}
      </button>
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="flex items-center gap-3 group w-fit">
      <div className={"relative w-10 h-5 rounded-full transition-colors flex-shrink-0 " + (value ? "bg-green-500" : "bg-red-400")}>
        <span className={"absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform " + (value ? "translate-x-5" : "translate-x-0")} />
      </div>
      <span className={"text-sm font-medium transition-colors " + (value ? "text-primary" : "text-muted")}>{label}</span>
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
    <div className="border border-border rounded-xl overflow-hidden">

      {/* Stop header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-primary">
            Stop {index + 1}
          </span>
          {stop.stopType && (
            <span className={
              "text-xs font-semibold px-2 py-0.5 rounded-full " +
              (stop.stopType === "collection" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700")
            }>
              {stop.stopType === "collection" ? "Collection" : "Delivery"}
            </span>
          )}
          {complete && <span className="text-xs text-green-600 font-semibold">✓</span>}
        </div>
        {total > 1 && (
          <button type="button" onClick={onRemove}
            className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors">
            Remove
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* Stop type */}
        <div>
          <FieldLabel required>Stop Type</FieldLabel>
          <div className="flex gap-3">
            {(["collection", "delivery"] as const).map(t => (
              <button key={t} type="button"
                onClick={() => onChange({ stopType: t })}
                className={
                  "flex-1 py-2.5 rounded-lg border text-sm font-semibold transition-colors " +
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
          <div className="text-xs font-bold text-muted uppercase tracking-widest pt-1">Location</div>

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

          {/* Hidden lat/lng — auto filled from saved location */}
          <input type="hidden" value={stop.lat} />
          <input type="hidden" value={stop.lng} />
        </div>

        {/* ── Timing ───────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-muted uppercase tracking-widest pt-1">Timing</div>

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
                    "flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors " +
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
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Address Clarity</div>
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

            {/* Contact */}
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Contact</div>
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
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Reference / Booking</div>
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
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Location Support</div>
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
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Driver</div>
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

            {/* Service time */}
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Service Time</div>
              <div className="max-w-xs">
                <FieldLabel>Estimated Service Time</FieldLabel>
                <input type="text" className="input" placeholder="e.g. 45 mins"
                  value={stop.estimatedServiceTime} onChange={set("estimatedServiceTime")} />
              </div>
            </div>

            {/* Internal */}
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Internal</div>
              <div>
                <FieldLabel>Internal Notes</FieldLabel>
                <textarea className="input min-h-16 resize-none" placeholder="Not shown to driver — planner only…"
                  value={stop.internalNotes} onChange={set("internalNotes")} />
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Stop footer */}
      <div className={
        "px-4 py-2 border-t border-border text-xs font-semibold flex items-center gap-2 " +
        (complete ? "text-green-700 bg-green-50" : "text-muted bg-gray-50")
      }>
        {complete
          ? <><span>✓</span> Stop {index + 1} complete</>
          : <><span className="text-red-400">●</span> Fill in required fields for this stop</>
        }
      </div>

    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreateJobPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saving, setSaving] = useState<"draft" | "ready" | null>(null);

  // Saved locations (loaded once)
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  useEffect(() => { jobsApi.locations().then(r => setLocations(r.data)).catch(() => {}); }, []);

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

  // ── Quality / missing fields ─────────────────────────────────────────────
  const basicsComplete   = !!(customerName.trim() && plannedDate && serviceType && jobType);
  const customerComplete = !!(contactName.trim() && contactPhone.trim());
  const stopsComplete    = stops.length > 0 && stops.every(stopComplete);

  const MISSING = [
    !customerName.trim()  && "Customer",
    !plannedDate          && "Planned date",
    !serviceType          && "Service type",
    !jobType              && "Job type",
    !contactName.trim()   && "Contact name",
    !contactPhone.trim()  && "Contact phone",
    !stopsComplete        && "Stop addresses / timing",
  ].filter(Boolean) as string[];

  function handleSaveDraft() { setSaving("draft"); setTimeout(() => setSaving(null), 1200); }
  function handleSaveReady() { setSaving("ready"); setTimeout(() => setSaving(null), 1200); }

  return (
    <div className="min-h-screen bg-surface pb-32">

      {/* ── Page header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-border px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)}
            className="text-muted hover:text-primary transition-colors text-xl leading-none" title="Back">←</button>
          <div>
            <h1 className="text-xl font-black text-primary">Create Job</h1>
            <p className="text-sm text-muted mt-0.5">
              Fill in the sections below — save as draft any time, mark ready when complete
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-4">

        {/* ── Quality score ──────────────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-1">Job Quality</div>
              <div className="text-3xl font-black text-primary">0%</div>
              <div className="text-xs text-muted mt-0.5">Live score — coming soon</div>
            </div>
            <div className="w-16 h-16 rounded-full border-4 border-gray-100 flex items-center justify-center">
              <span className="text-sm font-black text-gray-300">0%</span>
            </div>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div className="h-2 bg-gray-200 rounded-full" style={{ width: "0%" }} />
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-xs font-semibold text-muted mb-2">Missing required fields</div>
            <div className="flex flex-wrap gap-2">
              {MISSING.map(f => (
                <span key={f} className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-full">
                  <span className="text-red-400">●</span> {f}
                </span>
              ))}
              {MISSING.length === 0 && (
                <span className="text-xs text-green-700 font-semibold">✓ All required fields filled</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Template placeholder ───────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Start from Template</div>
          <div className="flex items-center gap-3 p-4 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl justify-center cursor-not-allowed opacity-50">
            <span className="text-2xl">📄</span>
            <div className="text-left">
              <div className="text-sm font-semibold text-primary">Select a template</div>
              <div className="text-xs text-muted">Autofill from a saved job template — coming soon</div>
            </div>
          </div>
        </div>

        {/* ── Section 01 — Job Basics ────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={1} icon="📋" title="Job Basics" subtitle="Date, service type and job type" active />
          <div className="px-5 pt-5 pb-4 space-y-4">
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
          </div>
          <SectionFooter complete={basicsComplete} label="Job basics" />
        </div>

        {/* ── Section 02 — Customer Details ──────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={2} icon="🏢" title="Customer Details" subtitle="Operational contact for this job" active />
          <div className="px-5 pt-5 pb-4 space-y-4">
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
          </div>
          <SectionFooter complete={customerComplete} label="Customer details" />
        </div>

        {/* ── Section 03 — Collection / Delivery ─────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={3} icon="🔄" title="Collection / Delivery" subtitle="Add all pickup and dropoff stops for this job" active />

          <div className="p-4 space-y-3">
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
          </div>

          <SectionFooter complete={stopsComplete} label="All stops" />
        </div>

        {/* ── Sections 04-06 — empty shells ──────────────────────────────────── */}
        {SHELLS.map((s, i) => (
          <div key={s.id} className="card overflow-hidden">
            <SectionHeader num={i + 4} icon={s.icon} title={s.title} subtitle={s.subtitle} />
            <div className="px-5 py-8 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl mb-2 opacity-10">{s.icon}</div>
                <div className="text-xs text-gray-300 font-medium">Fields for {s.title} will be added here</div>
              </div>
            </div>
          </div>
        ))}

      </div>

      {/* ── Sticky save bar ───────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-lg z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn btn-outline text-sm px-4 py-2.5">Cancel</button>
          <div className="flex-1" />
          <button onClick={handleSaveDraft} disabled={saving !== null}
            className="btn btn-outline text-sm px-5 py-2.5 font-semibold">
            {saving === "draft" ? "Saving…" : "Save Draft"}
          </button>
          <button onClick={handleSaveReady} disabled={saving !== null}
            className="btn btn-primary text-sm px-5 py-2.5 font-semibold">
            {saving === "ready" ? "Saving…" : "Save — Ready for Planner →"}
          </button>
        </div>
      </div>

    </div>
  );
}

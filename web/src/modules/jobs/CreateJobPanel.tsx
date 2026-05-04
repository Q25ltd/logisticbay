import { useState, useEffect } from "react";
import { jobsApi } from "../../api/jobs";
import { customersApi } from "../../api/customers";
import type { Driver, JobTemplate, SavedLocation, Customer } from "../../types";
import { Alert } from "../../components/Alert";

// ── Constants ─────────────────────────────────────────────────────────────────

const TRAILER_TYPES: [string, string][] = [
  ["curtain_sider", "Curtain sider"],
  ["box",           "Box"],
  ["fridge",        "Fridge"],
  ["flatbed",       "Flatbed"],
  ["low_loader",    "Low loader"],
  ["tanker",        "Tanker"],
  ["walking_floor", "Walking floor"],
  ["tipper",        "Tipper"],
  ["container",     "Container"],
  ["other",         "Other"],
];

const STOP_TYPES: [string, string][] = [
  ["pickup",   "Pickup"],
  ["dropoff",  "Dropoff"],
  ["handover", "Handover"],
  ["yard",     "Yard"],
  ["depot",    "Depot"],
];

const LOAD_UNITS: [string, string][] = [
  ["pallets", "Pallets"],
  ["tonnes",  "Tonnes"],
  ["kg",      "kg"],
  ["loads",   "Loads"],
  ["items",   "Items"],
  ["other",   "Other"],
];

const VEHICLE_CLASSES: [string, string][] = [
  ["class1", "Class 1 / Artic"],
  ["class2", "Class 2 / Rigid"],
  ["van",    "Van"],
];

const SERVICE_TYPES: [string, string][] = [
  ["delivery",   "Delivery"],
  ["collection", "Collection"],
  ["transfer",   "Transfer"],
];

const PRIORITIES: [string, string][] = [
  ["low",    "Low"],
  ["normal", "Normal"],
  ["high",   "High"],
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface StopState {
  sequenceNumber: number;
  type: string;
  siteName: string;
  unitName: string;
  street: string;
  town: string;
  postcode: string;
  locationTextSnapshot: string;
  lat: string;
  lng: string;
  savedLocationId: number | null;
  contactName: string;
  contactPhone: string;
  referenceNumber: string;
  instructions: string;
  bookedTime: string;
  earliestArrivalMinutes: string;
  unloadingAllowanceMinutes: string;
}

interface LoadState {
  quantity: string;
  unit: string;
  materialType: string;
  weight: string;
  volume: string;
  hazardClass: string;
  notes: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyStop(seq: number, type: string): StopState {
  return {
    sequenceNumber:            seq,
    type,
    siteName:                  "",
    unitName:                  "",
    street:                    "",
    town:                      "",
    postcode:                  "",
    locationTextSnapshot:      "",
    lat:                       "",
    lng:                       "",
    savedLocationId:           null,
    contactName:               "",
    contactPhone:              "",
    referenceNumber:           "",
    instructions:              "",
    bookedTime:                "",
    earliestArrivalMinutes:    "60",
    unloadingAllowanceMinutes: "60",
  };
}

function computeEarliestArrival(bookedTime: string, minutesBefore: string): string {
  if (!bookedTime || !minutesBefore || minutesBefore === "0") return "";
  const dt = new Date(bookedTime);
  if (isNaN(dt.getTime())) return "";
  dt.setMinutes(dt.getMinutes() - parseInt(minutesBefore));
  return dt.toISOString().slice(0, 16);
}

function resequence(stops: StopState[]): StopState[] {
  return stops.map((s, i) => ({ ...s, sequenceNumber: i + 1 }));
}

function buildLocationSnapshot(stop: StopState): string {
  return [stop.siteName, stop.street, stop.town, stop.postcode]
    .map(v => v.trim()).filter(Boolean).join(", ") || stop.locationTextSnapshot.trim();
}

function hasText(v: string): boolean { return v.trim().length > 0; }
function isValidCoord(v: string): boolean { const n = parseFloat(v); return !isNaN(n) && isFinite(n); }
function stopHasCoords(s: StopState): boolean { return isValidCoord(s.lat) && isValidCoord(s.lng); }
function stopHasAddress(s: StopState): boolean { return hasText(s.siteName) || hasText(s.locationTextSnapshot); }

// ── Quality score ─────────────────────────────────────────────────────────────

function liveQualityScore(stops: StopState[], load: LoadState): { score: number; missing: string[] } {
  const missing: string[] = [];
  let score = 0;

  if (stops.length > 0 && stops.every(stopHasAddress)) score += 30;
  else missing.push("All stops need a site name or address");

  if (stops.length > 0 && stops.every(s => hasText(s.contactName) || hasText(s.contactPhone))) score += 10;
  else missing.push("Missing contact info on stops");

  if (stops.length > 0 && stops.every(s => hasText(s.bookedTime))) score += 10;
  else missing.push("Missing confirmed time on stops");

  if (stops.length > 0 && stops.every(stopHasCoords)) score += 15;
  else missing.push("Missing coordinates (add for better driver navigation)");

  if (stops.length > 0 && stops.every(s => s.savedLocationId !== null)) score += 15;
  else missing.push("Stops not linked to saved locations");

  if (hasText(load.quantity) && hasText(load.unit) && hasText(load.materialType)) score += 10;
  else missing.push("Incomplete load details");

  if (stops.some(s => hasText(s.instructions) || hasText(s.referenceNumber))) score += 10;
  else missing.push("No instructions or references");

  return { score: Math.min(100, score), missing };
}

// ── Saved location picker ─────────────────────────────────────────────────────

function LocationPicker({
  stop,
  locations,
  onChange,
}: {
  stop: StopState;
  locations: SavedLocation[];
  onChange: (patch: Partial<StopState>) => void;
}) {
  const [showList, setShowList] = useState(false);
  const [search, setSearch]     = useState("");

  const filtered = locations.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.addressText.toLowerCase().includes(search.toLowerCase()) ||
    l.postcode.toLowerCase().includes(search.toLowerCase())
  );

  function applyLocation(loc: SavedLocation) {
    onChange({
      savedLocationId:      loc.id,
      siteName:             loc.siteName || loc.name,
      unitName:             loc.unitName || "",
      street:               loc.street   || "",
      town:                 loc.town     || "",
      postcode:             loc.postcode || "",
      locationTextSnapshot: loc.addressText || loc.name,
      contactName:          loc.contactName  || "",
      contactPhone:         loc.contactPhone || "",
      instructions:         loc.instructions || loc.internalNotes || "",
      lat:                  loc.latitude  != null ? String(loc.latitude)  : "",
      lng:                  loc.longitude != null ? String(loc.longitude) : "",
    });
    setShowList(false);
    setSearch("");
  }

  function clearLocation() {
    onChange({ savedLocationId: null, siteName: "", unitName: "", street: "", town: "",
      postcode: "", locationTextSnapshot: "", contactName: "", contactPhone: "",
      instructions: "", lat: "", lng: "" });
  }

  if (stop.savedLocationId) {
    const saved = locations.find(l => l.id === stop.savedLocationId);
    return (
      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-green-800 truncate">
            📍 {saved?.name ?? stop.siteName}
          </div>
          <div className="text-xs text-green-600 truncate">
            {[stop.street, stop.town, stop.postcode].filter(Boolean).join(", ") || stop.locationTextSnapshot}
          </div>
        </div>
        <button type="button" onClick={clearLocation}
          className="text-xs text-green-700 hover:text-red-600 font-medium whitespace-nowrap">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="w-full text-left px-3 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted hover:border-accent hover:text-accent transition-colors"
        onClick={() => setShowList(o => !o)}
      >
        {showList ? "▲ Hide saved locations" : "📂 Use a saved location (auto-fill all fields)"}
      </button>

      {showList && (
        <div className="border border-border rounded-xl bg-white shadow-lg p-2 space-y-1 max-h-52 overflow-y-auto">
          <input className="input text-sm" placeholder="Search by name, address, postcode..."
            value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          {filtered.length === 0 && <p className="text-xs text-muted px-2 py-1">No saved locations found</p>}
          {filtered.map(loc => (
            <button key={loc.id} type="button"
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm"
              onClick={() => applyLocation(loc)}>
              <div className="font-medium text-primary">{loc.name}</div>
              <div className="text-xs text-muted">
                {[loc.siteName, loc.street, loc.town, loc.postcode].filter(Boolean).join(", ") || loc.addressText}
              </div>
              {loc.latitude != null
                ? <div className="text-xs text-green-600">✓ Has coordinates</div>
                : <div className="text-xs text-yellow-600">⚠ No coordinates</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stop card ─────────────────────────────────────────────────────────────────

function StopCard({
  stop,
  index,
  locations,
  onUpdate,
  onRemove,
  onMove,
}: {
  stop: StopState;
  index: number;
  locations: SavedLocation[];
  onUpdate: (patch: Partial<StopState>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const [showCoords, setShowCoords] = useState(stopHasCoords(stop));

  const hasCoords = stopHasCoords(stop);
  const missingCoords = !hasCoords;

  return (
    <div className="border border-border rounded-2xl bg-gray-50 overflow-hidden">
      {/* Stop header bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-border flex-wrap">
        <span className="text-xs font-bold text-muted bg-gray-100 rounded-full px-2 py-0.5">#{index + 1}</span>
        <select className="input w-auto text-sm py-1" value={stop.type} onChange={e => onUpdate({ type: e.target.value })}>
          {STOP_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" className="btn btn-outline text-xs py-1" onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="btn btn-outline text-xs py-1" onClick={() => onMove(1)}>↓</button>
        <button type="button" className="btn btn-outline text-xs py-1 text-red-600 ml-auto" onClick={onRemove}>Remove</button>
      </div>

      <div className="p-4 space-y-3">

        {/* Saved location picker */}
        <LocationPicker stop={stop} locations={locations} onChange={onUpdate} />

        {/* Core fields: site name + postcode (always shown) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Company / site name *</label>
            <input className="input" value={stop.siteName}
              onChange={e => onUpdate({ siteName: e.target.value })}
              placeholder="e.g. Tesco RDC Luton" />
          </div>
          <div>
            <label className="label">Postcode *</label>
            <input className="input" value={stop.postcode}
              onChange={e => onUpdate({ postcode: e.target.value.toUpperCase() })}
              placeholder="LU2 7YE" />
          </div>
        </div>

        {/* Expandable: full address + contact */}
        <button type="button"
          className="text-xs text-blue-600 hover:underline"
          onClick={() => setShowMore(o => !o)}>
          {showMore ? "▲ Hide full address & contact" : "▼ Street, town, unit, contact details"}
        </button>

        {showMore && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Street / road</label>
                <input className="input" value={stop.street}
                  onChange={e => onUpdate({ street: e.target.value })}
                  placeholder="15 Arden Place" />
              </div>
              <div>
                <label className="label">Town / city</label>
                <input className="input" value={stop.town}
                  onChange={e => onUpdate({ town: e.target.value })}
                  placeholder="Luton" />
              </div>
              <div>
                <label className="label">Unit / building</label>
                <input className="input" value={stop.unitName}
                  onChange={e => onUpdate({ unitName: e.target.value })}
                  placeholder="Unit 4 / Gate B" />
              </div>
              <div>
                <label className="label">Stop reference</label>
                <input className="input" value={stop.referenceNumber}
                  onChange={e => onUpdate({ referenceNumber: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Contact name</label>
                <input className="input" value={stop.contactName}
                  onChange={e => onUpdate({ contactName: e.target.value })}
                  placeholder="Goods In" />
              </div>
              <div>
                <label className="label">Contact phone</label>
                <input className="input" value={stop.contactPhone}
                  onChange={e => onUpdate({ contactPhone: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {/* Confirmed time + arrival window */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Confirmed time</label>
            <input className="input" type="datetime-local" value={stop.bookedTime}
              onChange={e => onUpdate({ bookedTime: e.target.value })} />
          </div>
          <div>
            <label className="label">Earliest arrival</label>
            <select className="input" value={stop.earliestArrivalMinutes}
              onChange={e => onUpdate({ earliestArrivalMinutes: e.target.value })}>
              <option value="0">No restriction</option>
              <option value="15">15 min before</option>
              <option value="30">30 min before</option>
              <option value="45">45 min before</option>
              <option value="60">1 hour before</option>
              <option value="90">90 min before</option>
              <option value="120">2 hours before</option>
            </select>
            {stop.bookedTime && stop.earliestArrivalMinutes !== "0" && (
              <p className="text-xs text-muted mt-1">
                From: {new Date(computeEarliestArrival(stop.bookedTime, stop.earliestArrivalMinutes) || stop.bookedTime)
                  .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <div>
            <label className="label">Free unloading</label>
            <select className="input" value={stop.unloadingAllowanceMinutes}
              onChange={e => onUpdate({ unloadingAllowanceMinutes: e.target.value })}>
              <option value="0">Not agreed</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hour</option>
              <option value="90">90 min</option>
              <option value="120">2 hours</option>
              <option value="180">3 hours</option>
            </select>
          </div>
        </div>

        {/* Instructions */}
        <div>
          <label className="label">Access / delivery instructions</label>
          <textarea className="input min-h-14" value={stop.instructions}
            onChange={e => onUpdate({ instructions: e.target.value })}
            placeholder="Gate code, PPE required, call before arrival, tight access from east side..." />
        </div>

        {/* Coordinates — soft warning */}
        <div>
          <button type="button" className="text-xs text-blue-600 hover:underline"
            onClick={() => setShowCoords(o => !o)}>
            {showCoords ? "▲ Hide coordinates" : `▼ Coordinates ${hasCoords ? "✓ set" : "⚠ not set"}`}
          </button>

          {missingCoords && !showCoords && (
            <p className="text-xs text-yellow-600 mt-1">
              ⚠ No coordinates — driver navigation will be less accurate. Add if possible.
            </p>
          )}

          {showCoords && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="label">Latitude</label>
                <input className="input" type="number" step="any" value={stop.lat}
                  onChange={e => onUpdate({ lat: e.target.value })} placeholder="51.5074" />
              </div>
              <div>
                <label className="label">Longitude</label>
                <input className="input" type="number" step="any" value={stop.lng}
                  onChange={e => onUpdate({ lng: e.target.value })} placeholder="-0.1278" />
              </div>
              <div className="col-span-2 text-xs text-muted">
                Right-click the gate/entrance in Google Maps → click the coordinates shown at the top.
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Customer picker ───────────────────────────────────────────────────────────

function CustomerPicker({ customerId, customers, onChange, onCreated }: {
  customerId: number | null;
  customers: Customer[];
  onChange: (id: number | null) => void;
  onCreated: (c: Customer) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  async function create() {
    if (!newName.trim()) return;
    setSaving(true); setErr("");
    try {
      const c = await customersApi.create({ name: newName.trim() });
      onCreated(c); onChange(c.id); setCreating(false); setNewName("");
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select className="input flex-1" value={customerId ?? ""}
          onChange={e => onChange(e.target.value ? parseInt(e.target.value) : null)}>
          <option value="">— Select customer —</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" className="btn btn-outline text-xs whitespace-nowrap"
          onClick={() => setCreating(o => !o)}>+ New</button>
      </div>
      {creating && (
        <div className="flex gap-2 items-center">
          <input className="input flex-1" placeholder="Customer name" value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && create()} autoFocus />
          <button type="button" className="btn btn-primary text-xs" onClick={create} disabled={saving}>
            {saving ? "..." : "Save"}
          </button>
          <button type="button" className="btn btn-outline text-xs" onClick={() => setCreating(false)}>✕</button>
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

// ── Quality badge ─────────────────────────────────────────────────────────────

function QualityBadge({ score, missing }: { score: number; missing: string[] }) {
  const color =
    score >= 80 ? "bg-green-100 text-green-700 border-green-200" :
    score >= 50 ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                  "bg-red-100 text-red-600 border-red-200";
  return (
    <div className={`border rounded-xl p-3 ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-sm">Job Quality</span>
        <span className="font-black text-lg">{score}%</span>
      </div>
      <div className="w-full bg-white/50 rounded-full h-2 mb-2">
        <div className="h-2 rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626" }} />
      </div>
      {missing.length > 0 && (
        <ul className="text-xs space-y-0.5">{missing.map(m => <li key={m}>⚠ {m}</li>)}</ul>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function CreateJobPanel({ drivers, templates, date, initialDriverId, onClose, onCreated }: {
  drivers: Driver[];
  templates: JobTemplate[];
  date: string;
  initialDriverId?: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [f, setF] = useState({
    plannedDate:          date,
    templateId:           "",
    vehicleClassRequired: "class1",
    serviceType:          "delivery",
    priority:             "normal",
    // planner fields
    assignedDriverId:     initialDriverId ? String(initialDriverId) : "",
    assignedTruck:        "",
    assignedTrailer:      "",
    plannerNotes:         "",
    internalNotes:        "",
    saveAsTemplate:       false,
    templateName:         "",
  });

  const [customerId,          setCustomerId]          = useState<number | null>(null);
  const [trailerTypesAllowed, setTrailerTypesAllowed] = useState<string[]>(["curtain_sider"]);
  const [stops,               setStops]               = useState<StopState[]>([
    emptyStop(1, "pickup"),
    emptyStop(2, "dropoff"),
  ]);
  const [loadDetails, setLoadDetails] = useState<LoadState>({
    quantity: "", unit: "pallets", materialType: "", weight: "", volume: "", hazardClass: "", notes: "",
  });

  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [locations,  setLocations]  = useState<SavedLocation[]>([]);
  const [err,        setErr]        = useState("");
  const [hardErrors, setHardErrors] = useState<string[]>([]);
  const [warnings,   setWarnings]   = useState<string[]>([]);
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    customersApi.list().then(r => setCustomers(r.data)).catch(() => {});
    jobsApi.locations().then(r => setLocations(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!f.assignedDriverId) return;
    const driver = drivers.find(d => String(d.id) === f.assignedDriverId);
    if (driver?.defaultTruckReg) setF(p => ({ ...p, assignedTruck: driver.defaultTruckReg }));
  }, [f.assignedDriverId, drivers]);

  const quality = liveQualityScore(stops, loadDetails);

  function updateStop(index: number, patch: Partial<StopState>) {
    setStops(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  }
  function addStop(type: string) { setStops(prev => [...prev, emptyStop(prev.length + 1, type)]); }
  function removeStop(index: number) { setStops(prev => resequence(prev.filter((_, i) => i !== index))); }
  function moveStop(index: number, dir: -1 | 1) {
    setStops(prev => {
      const next = [...prev]; const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return resequence(next);
    });
  }
  function toggleTrailerType(value: string) {
    setTrailerTypesAllowed(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  }

  function applyTemplate(id: string) {
    const t = templates.find(t => String(t.id) === id);
    setF(p => ({ ...p, templateId: id }));
    if (!t) return;
    if (Array.isArray(t.defaultStops) && t.defaultStops.length > 0) {
      setStops(t.defaultStops.map((s, i) => ({
        sequenceNumber:            i + 1,
        type:                      s.type,
        siteName:                  s.siteName || "",
        unitName:                  s.unitName || "",
        street:                    s.street   || "",
        town:                      s.town     || "",
        postcode:                  s.postcode || "",
        locationTextSnapshot:      s.locationTextSnapshot || "",
        lat:                       s.lat != null ? String(s.lat) : "",
        lng:                       s.lng != null ? String(s.lng) : "",
        savedLocationId:           s.savedLocationId ?? null,
        contactName:               s.contactName  || "",
        contactPhone:              s.contactPhone || "",
        referenceNumber:           s.referenceNumber || "",
        instructions:              s.instructions   || "",
        bookedTime:                "",
        earliestArrivalMinutes:    "60",
        unloadingAllowanceMinutes: "60",
      })));
    } else {
      setStops([
        { ...emptyStop(1, "pickup"),  locationTextSnapshot: t.pickupTextSnapshot  || "" },
        { ...emptyStop(2, "dropoff"), locationTextSnapshot: t.dropoffTextSnapshot || "" },
      ]);
    }
    if (t.defaultLoadDetails) {
      setLoadDetails(p => ({
        ...p,
        quantity:     String(t.defaultLoadDetails?.quantity ?? ""),
        unit:         t.defaultLoadDetails?.unit         || p.unit,
        materialType: t.defaultLoadDetails?.materialType || t.defaultMaterialType || p.materialType,
        weight:       String(t.defaultLoadDetails?.weight ?? ""),
        volume:       String(t.defaultLoadDetails?.volume ?? ""),
        hazardClass:  t.defaultLoadDetails?.hazardClass  || "",
        notes:        t.defaultLoadDetails?.notes        || "",
      }));
    } else if (t.defaultMaterialType) {
      setLoadDetails(p => ({ ...p, materialType: t.defaultMaterialType }));
    }
    if (Array.isArray(t.trailerTypesAllowed) && t.trailerTypesAllowed.length > 0) {
      setTrailerTypesAllowed(t.trailerTypesAllowed);
    }
  }

  async function submit(e: React.FormEvent, saveMode: "draft" | "ready_to_plan") {
    e.preventDefault();
    setErr(""); setHardErrors([]); setWarnings([]);

    if (saveMode === "ready_to_plan") {
      const clientErrors: string[] = [];
      if (!customerId) clientErrors.push("Customer is required");
      if (!f.plannedDate) clientErrors.push("Work date is required");
      if (!f.vehicleClassRequired) clientErrors.push("Vehicle type is required");
      if (!stops.some(s => s.type === "pickup"))  clientErrors.push("At least one pickup stop required");
      if (!stops.some(s => s.type === "dropoff")) clientErrors.push("At least one dropoff stop required");
      stops.forEach(s => {
        if (!stopHasAddress(s)) clientErrors.push(`Stop #${s.sequenceNumber}: site name or address is required`);
      });
      if (!hasText(loadDetails.quantity))     clientErrors.push("Quantity is required");
      if (!hasText(loadDetails.unit))         clientErrors.push("Unit is required");
      if (!hasText(loadDetails.materialType)) clientErrors.push("Material is required");
      if (clientErrors.length > 0) { setHardErrors(clientErrors); return; }
    }

    setLoading(true);
    try {
      const cleanedStops = stops
        .map((s, i) => ({
          sequenceNumber:            i + 1,
          type:                      s.type,
          siteName:                  s.siteName.trim(),
          unitName:                  s.unitName.trim(),
          street:                    s.street.trim(),
          town:                      s.town.trim(),
          postcode:                  s.postcode.trim().toUpperCase(),
          locationTextSnapshot:      buildLocationSnapshot(s),
          savedLocationId:           s.savedLocationId ?? undefined,
          lat:                       s.lat ? parseFloat(s.lat) : null,
          lng:                       s.lng ? parseFloat(s.lng) : null,
          contactName:               s.contactName.trim(),
          contactPhone:              s.contactPhone.trim(),
          referenceNumber:           s.referenceNumber.trim(),
          instructions:              s.instructions.trim(),
          bookedTime:                s.bookedTime || null,
          earliestArrivalMinutes:    s.earliestArrivalMinutes && s.earliestArrivalMinutes !== "0"
                                       ? parseInt(s.earliestArrivalMinutes) : null,
          unloadingAllowanceMinutes: s.unloadingAllowanceMinutes && s.unloadingAllowanceMinutes !== "0"
                                       ? parseInt(s.unloadingAllowanceMinutes) : null,
          timeWindowStart:           computeEarliestArrival(s.bookedTime, s.earliestArrivalMinutes) || null,
          timeWindowEnd:             s.bookedTime || null,
        }))
        .filter(s => saveMode === "ready_to_plan" || hasText(s.locationTextSnapshot) || s.type);

      const result = await jobsApi.create({
        customerId:           customerId ?? undefined,
        templateId:           f.templateId ? parseInt(f.templateId) : null,
        assignedDriverId:     f.assignedDriverId ? parseInt(f.assignedDriverId) : undefined,
        plannedDate:          f.plannedDate || undefined,
        plannerNotes:         f.plannerNotes,
        vehicleClassRequired: f.vehicleClassRequired,
        trailerTypesAllowed,
        serviceType:          f.serviceType,
        internalNotes:        f.internalNotes,
        priority:             f.priority as "low" | "normal" | "high",
        assignedTruck:        f.assignedTruck,
        assignedTrailer:      f.assignedTrailer,
        stops:                cleanedStops,
        loadDetails: {
          quantity:     loadDetails.quantity     || null,
          unit:         loadDetails.unit,
          materialType: loadDetails.materialType,
          weight:       loadDetails.weight       || null,
          volume:       loadDetails.volume       || null,
          hazardClass:  loadDetails.hazardClass,
          notes:        loadDetails.notes,
        },
        saveMode,
        saveAsTemplate: f.saveAsTemplate,
        templateName:   f.templateName,
      }) as any;

      if (result?.validation?.warnings?.length) setWarnings(result.validation.warnings);
      onCreated();
      onClose();
    } catch (e: any) {
      const apiErrors = e?.response?.errors ?? e?.errors;
      if (Array.isArray(apiErrors)) setHardErrors(apiErrors);
      else setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-primary">Create Job</h2>
            <p className="text-xs text-muted">* required before marking Ready to Plan</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary text-xl">✕</button>
        </div>

        <form className="p-6 space-y-6 flex-1">

          {hardErrors.length > 0 && (
            <div className="border border-red-300 bg-red-50 rounded-xl p-4">
              <p className="font-semibold text-red-700 text-sm mb-2">Fix these before marking Ready to Plan:</p>
              <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
                {hardErrors.map(e => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}

          {err && <Alert type="error" message={err} />}

          {warnings.length > 0 && (
            <div className="border border-yellow-300 bg-yellow-50 rounded-xl p-3">
              <p className="font-semibold text-yellow-700 text-xs mb-1">Saved with warnings:</p>
              <ul className="text-xs text-yellow-700 space-y-0.5 list-disc list-inside">
                {warnings.map(w => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* ── Job details ───────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="font-bold text-primary text-sm border-b border-border pb-2">Job Details</h3>

            <div>
              <label className="label">Customer *</label>
              <CustomerPicker customerId={customerId} customers={customers}
                onChange={setCustomerId} onCreated={c => setCustomers(prev => [...prev, c])} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Work date *</label>
                <input className="input" type="date" value={f.plannedDate}
                  onChange={e => setF(p => ({ ...p, plannedDate: e.target.value }))} />
              </div>
              <div>
                <label className="label">Service type</label>
                <select className="input" value={f.serviceType}
                  onChange={e => setF(p => ({ ...p, serviceType: e.target.value }))}>
                  {SERVICE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Vehicle type *</label>
                <select className="input" value={f.vehicleClassRequired}
                  onChange={e => setF(p => ({ ...p, vehicleClassRequired: e.target.value }))}>
                  {VEHICLE_CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Priority</label>
                <select className="input" value={f.priority}
                  onChange={e => setF(p => ({ ...p, priority: e.target.value }))}>
                  {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Template</label>
                <select className="input" value={f.templateId} onChange={e => applyTemplate(e.target.value)}>
                  <option value="">— No template —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            {/* Trailer types */}
            {f.vehicleClassRequired === "class1" && (
              <div>
                <label className="label">Allowed trailer types *</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {TRAILER_TYPES.map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-sm border border-border rounded-xl px-3 py-2 cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={trailerTypesAllowed.includes(value)}
                        onChange={() => toggleTrailerType(value)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Stops ────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <h3 className="font-bold text-primary text-sm">Stops *</h3>
                <p className="text-xs text-muted">Execution order — first stop must be pickup</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {STOP_TYPES.map(([v, l]) => (
                  <button key={v} type="button" className="btn btn-outline text-xs" onClick={() => addStop(v)}>
                    + {l}
                  </button>
                ))}
              </div>
            </div>

            {stops.length === 0 ? (
              <p className="text-sm text-muted text-center py-6 border border-dashed border-border rounded-xl">
                Add at least one pickup and one dropoff stop.
              </p>
            ) : (
              stops.map((stop, index) => (
                <StopCard key={index} stop={stop} index={index} locations={locations}
                  onUpdate={patch => updateStop(index, patch)}
                  onRemove={() => removeStop(index)}
                  onMove={dir => moveStop(index, dir)} />
              ))
            )}
          </section>

          {/* ── Cargo / Load ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="font-bold text-primary text-sm border-b border-border pb-2">Cargo / Load *</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Quantity *</label>
                <input className="input" value={loadDetails.quantity}
                  onChange={e => setLoadDetails(p => ({ ...p, quantity: e.target.value }))}
                  placeholder="e.g. 26" />
              </div>
              <div>
                <label className="label">Unit *</label>
                <select className="input" value={loadDetails.unit}
                  onChange={e => setLoadDetails(p => ({ ...p, unit: e.target.value }))}>
                  {LOAD_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Material *</label>
                <input className="input" value={loadDetails.materialType}
                  onChange={e => setLoadDetails(p => ({ ...p, materialType: e.target.value }))}
                  placeholder="General freight, chilled goods, steel coils..." />
              </div>
              <div>
                <label className="label">Weight (tonnes)</label>
                <input className="input" value={loadDetails.weight}
                  onChange={e => setLoadDetails(p => ({ ...p, weight: e.target.value }))} />
              </div>
              <div>
                <label className="label">Volume (m³)</label>
                <input className="input" value={loadDetails.volume}
                  onChange={e => setLoadDetails(p => ({ ...p, volume: e.target.value }))} />
              </div>
              <div>
                <label className="label">Hazard class</label>
                <input className="input" value={loadDetails.hazardClass}
                  onChange={e => setLoadDetails(p => ({ ...p, hazardClass: e.target.value }))}
                  placeholder="ADR 3, Class 8..." />
              </div>
              <div>
                <label className="label">Cargo notes</label>
                <input className="input" value={loadDetails.notes}
                  onChange={e => setLoadDetails(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Fragile, temp controlled..." />
              </div>
            </div>
          </section>

          {/* ── Planner fields ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="font-bold text-primary text-sm border-b border-border pb-2">
              Planner Fields
              <span className="font-normal text-muted ml-2">— assign driver, vehicle, notes</span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Assign driver</label>
                <select className="input" value={f.assignedDriverId}
                  onChange={e => setF(p => ({ ...p, assignedDriverId: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.displayName}{d.defaultTruckReg ? ` — ${d.defaultTruckReg}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Truck reg</label>
                <input className="input" value={f.assignedTruck}
                  onChange={e => setF(p => ({ ...p, assignedTruck: e.target.value.toUpperCase() }))}
                  placeholder="AB12 CDE" />
              </div>
              <div>
                <label className="label">Trailer reg</label>
                <input className="input" value={f.assignedTrailer}
                  onChange={e => setF(p => ({ ...p, assignedTrailer: e.target.value.toUpperCase() }))}
                  placeholder="T123 XYZ" />
              </div>
            </div>

            <div>
              <label className="label">Planner notes</label>
              <textarea className="input min-h-14" value={f.plannerNotes}
                onChange={e => setF(p => ({ ...p, plannerNotes: e.target.value }))}
                placeholder="Operational instructions for the planner..." />
            </div>
            <div>
              <label className="label">Internal notes <span className="text-muted font-normal">(office only, never shown to driver)</span></label>
              <textarea className="input min-h-14" value={f.internalNotes}
                onChange={e => setF(p => ({ ...p, internalNotes: e.target.value }))} />
            </div>
          </section>

          {/* ── Save as template ──────────────────────────────────────────── */}
          <section className="space-y-2 border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={f.saveAsTemplate}
                onChange={e => setF(p => ({ ...p, saveAsTemplate: e.target.checked }))} />
              Save stops and load as a template for future jobs
            </label>
            {f.saveAsTemplate && (
              <input className="input" value={f.templateName}
                onChange={e => setF(p => ({ ...p, templateName: e.target.value }))}
                placeholder="Template name (required)" />
            )}
          </section>

          {/* ── Quality score ─────────────────────────────────────────────── */}
          <QualityBadge score={quality.score} missing={quality.missing} />

        </form>

        {/* Submit bar */}
        <div className="sticky bottom-0 bg-white border-t border-border px-6 py-4 flex gap-3">
          <button type="button" disabled={loading} onClick={e => submit(e, "draft")}
            className="btn btn-outline flex-1">
            {loading ? "Saving..." : "Save Draft"}
          </button>
          <button type="button" disabled={loading} onClick={e => submit(e, "ready_to_plan")}
            className="btn btn-primary flex-1">
            {loading ? "Saving..." : "Ready to Plan ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}

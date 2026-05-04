import { useState, useEffect, useRef } from "react";
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
    sequenceNumber:           seq,
    type,
    siteName:                 "",
    unitName:                 "",
    street:                   "",
    town:                     "",
    postcode:                 "",
    locationTextSnapshot:     "",
    lat:                      "",
    lng:                      "",
    savedLocationId:          null,
    contactName:              "",
    contactPhone:             "",
    referenceNumber:          "",
    instructions:             "",
    bookedTime:               "",
    earliestArrivalMinutes:   "60",
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
  return [
    stop.siteName,
    stop.unitName,
    stop.street,
    stop.town,
    stop.postcode,
  ].map(v => v.trim()).filter(Boolean).join(", ") || stop.locationTextSnapshot.trim();
}


function hasText(v: string): boolean {
  return v.trim().length > 0;
}

function isValidCoord(v: string): boolean {
  const n = parseFloat(v);
  return !isNaN(n) && isFinite(n);
}

function stopHasCoords(s: StopState): boolean {
  return isValidCoord(s.lat) && isValidCoord(s.lng);
}

// ── Quality score (mirrors server logic, computed live) ────────────────────

function liveQualityScore(stops: StopState[], load: LoadState): { score: number; missing: string[] } {
  const missing: string[] = [];
  let score = 0;

  if (stops.length > 0 && stops.every(s => hasText(s.locationTextSnapshot))) score += 30;
  else missing.push("All stops need addresses");

  if (stops.length > 0 && stops.every(s => hasText(s.contactName) || hasText(s.contactPhone))) score += 10;
  else missing.push("Missing contact info on stops");

  if (stops.length > 0 && stops.every(s => hasText(s.bookedTime))) score += 10;
  else missing.push("Missing confirmed time on stops");

  if (stops.length > 0 && stops.every(stopHasCoords)) score += 15;
  else missing.push("Missing coordinates on stops");

  if (stops.length > 0 && stops.every(s => s.savedLocationId !== null)) score += 15;
  else missing.push("Stops not linked to saved locations");

  if (hasText(load.quantity) && hasText(load.unit) && hasText(load.materialType)) score += 10;
  else missing.push("Incomplete load details");

  if (stops.some(s => hasText(s.instructions) || hasText(s.referenceNumber))) score += 10;
  else missing.push("No instructions or references");

  return { score: Math.min(100, score), missing };
}

// ── Coord helper tooltip ──────────────────────────────────────────────────────

function CoordHelper() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        className="text-xs text-blue-600 hover:underline"
        onClick={() => setOpen(o => !o)}
      >
        {open ? "▲ Hide" : "▼ How to find coordinates"}
      </button>
      {open && (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
          <p className="font-semibold">Find the exact truck gate / entrance:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Open Google Maps</li>
            <li>Search for the location</li>
            <li>Right-click the exact gate or entrance</li>
            <li>Click the coordinates that appear at the top</li>
            <li>Copy the numbers (e.g. 51.5074, -0.1278)</li>
            <li>Paste latitude in the first box, longitude in the second</li>
          </ol>
          <a
            href="https://maps.google.com"
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-2 px-3 py-1 bg-blue-600 text-white rounded-lg font-medium"
          >
            Open Google Maps →
          </a>
        </div>
      )}
    </div>
  );
}

// ── Location picker ───────────────────────────────────────────────────────────

function LocationPicker({
  value,
  lat,
  lng,
  savedId,
  locations,
  onChange,
}: {
  value: string;
  lat: string;
  lng: string;
  savedId: number | null;
  locations: SavedLocation[];
  onChange: (patch: Partial<StopState>) => void;
}) {
  const [showSaved, setShowSaved] = useState(false);
  const [search, setSearch]       = useState("");

  const filtered = locations.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.addressText.toLowerCase().includes(search.toLowerCase())
  );

  function applyLocation(loc: SavedLocation) {
    onChange({
      locationTextSnapshot: loc.addressText || loc.name,
      savedLocationId:      loc.id,

      // Company / site name
      siteName:             loc.siteName || loc.name,

      // Structured address
      unitName:             loc.unitName || "",
      street:               loc.street || loc.addressText || "",
      town:                 loc.town || "",
      postcode:             loc.postcode || "",

      // Contact / access details
      contactName:          loc.contactName || "",
      contactPhone:         loc.contactPhone || "",
      instructions:         loc.instructions || loc.internalNotes || "",

      // Coordinates
      lat:                  loc.latitude  != null ? String(loc.latitude)  : "",
      lng:                  loc.longitude != null ? String(loc.longitude) : "",
    });
    setShowSaved(false);
    setSearch("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={value}
          onChange={e => onChange({ locationTextSnapshot: e.target.value, savedLocationId: null })}
          placeholder="Address / saved location"
        />
        <button
          type="button"
          className="btn btn-outline text-xs whitespace-nowrap"
          onClick={() => setShowSaved(o => !o)}
          title="Use a saved location"
        >
          {savedId ? "✓ Saved" : "Saved locations"}
        </button>
      </div>

      {showSaved && (
        <div className="border border-border rounded-xl bg-white shadow-lg p-2 space-y-2 max-h-48 overflow-y-auto">
          <input
            className="input text-sm"
            placeholder="Search locations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {filtered.length === 0 && (
            <p className="text-xs text-muted px-2">No saved locations found</p>
          )}
          {filtered.map(loc => (
            <button
              key={loc.id}
              type="button"
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm"
              onClick={() => applyLocation(loc)}
            >
              <div className="font-medium text-primary">{loc.name}</div>
              <div className="text-xs text-muted">{loc.addressText}</div>
              {loc.latitude != null && (
                <div className="text-xs text-blue-600">📍 Has coordinates</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Customer picker ───────────────────────────────────────────────────────────

function CustomerPicker({
  customerId,
  customers,
  onChange,
  onCreated,
}: {
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
      onCreated(c);
      onChange(c.id);
      setCreating(false);
      setNewName("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          className="input flex-1"
          value={customerId ?? ""}
          onChange={e => onChange(e.target.value ? parseInt(e.target.value) : null)}
        >
          <option value="">— Select customer —</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-outline text-xs whitespace-nowrap"
          onClick={() => setCreating(o => !o)}
        >
          + New customer
        </button>
      </div>

      {creating && (
        <div className="flex gap-2 items-center">
          <input
            className="input flex-1"
            placeholder="Customer name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && create()}
            autoFocus
          />
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
        <span className="font-bold text-sm">Quality Score</span>
        <span className="font-black text-lg">{score}%</span>
      </div>
      <div className="w-full bg-white/50 rounded-full h-2 mb-2">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626" }}
        />
      </div>
      {missing.length > 0 && (
        <ul className="text-xs space-y-0.5">
          {missing.map(m => <li key={m}>⚠ {m}</li>)}
        </ul>
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
    assignedDriverId:     initialDriverId ? String(initialDriverId) : "",
    plannedDate:          date,
    templateId:           "",
    plannerNotes:         "",
    vehicleClassRequired: "class1",
    serviceType:          "delivery",
    internalNotes:        "",
    priority:             "normal",
    assignedTruck:        "",
    assignedTrailer:      "",
    saveAsTemplate:       false,
    templateName:         "",
  });

  const [customerId,         setCustomerId]         = useState<number | null>(null);
  const [trailerTypesAllowed, setTrailerTypesAllowed] = useState<string[]>(["curtain_sider"]);
  const [stops,              setStops]              = useState<StopState[]>([
    emptyStop(1, "pickup"),
    emptyStop(2, "dropoff"),
  ]);
  const [loadDetails, setLoadDetails] = useState<LoadState>({
    quantity:     "",
    unit:         "pallets",
    materialType: "",
    weight:       "",
    volume:       "",
    hazardClass:  "",
    notes:        "",
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
    if (driver?.defaultTruckReg) {
      setF(p => ({ ...p, assignedTruck: driver.defaultTruckReg }));
    }
  }, [f.assignedDriverId, drivers]);

  const quality = liveQualityScore(stops, loadDetails);

  function updateStop(index: number, patch: Partial<StopState>) {
    setStops(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  }

  function addStop(type: string) {
    setStops(prev => [...prev, emptyStop(prev.length + 1, type)]);
  }

  function removeStop(index: number) {
    setStops(prev => resequence(prev.filter((_, i) => i !== index)));
  }

  function moveStop(index: number, dir: -1 | 1) {
    setStops(prev => {
      const next   = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return resequence(next);
    });
  }

  function toggleTrailerType(value: string) {
    setTrailerTypesAllowed(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  }

  function applyTemplate(id: string) {
    const t = templates.find(t => String(t.id) === id);
    setF(p => ({ ...p, templateId: id }));
    if (!t) return;

    if (Array.isArray(t.defaultStops) && t.defaultStops.length > 0) {
      setStops(t.defaultStops.map((s, i) => ({
        sequenceNumber:       i + 1,
        type:                 s.type,
        siteName:             s.siteName || "",
        unitName:             s.unitName || "",
        street:               s.street || "",
        town:                 s.town || "",
        postcode:             s.postcode || "",
        locationTextSnapshot: s.locationTextSnapshot || "",
        lat:                  s.lat != null  ? String(s.lat)  : "",
        lng:                  s.lng != null  ? String(s.lng)  : "",
        savedLocationId:      s.savedLocationId ?? null,
        contactName:               s.contactName  || "",
        contactPhone:              s.contactPhone || "",
        referenceNumber:           s.referenceNumber || "",
        instructions:              s.instructions || "",
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

    // Client-side guard for ready_to_plan before hitting the API
    if (saveMode === "ready_to_plan") {
      const clientErrors: string[] = [];
      if (!customerId) clientErrors.push("Customer is required");
      if (!f.plannedDate) clientErrors.push("Work date is required");
      if (!f.vehicleClassRequired) clientErrors.push("Vehicle type is required");
      if (!stops.some(s => s.type === "pickup"))  clientErrors.push("At least one pickup stop is required");
      if (!stops.some(s => s.type === "dropoff")) clientErrors.push("At least one dropoff stop is required");
      stops.forEach(s => {
        if (!hasText(s.locationTextSnapshot)) clientErrors.push(`Stop #${s.sequenceNumber}: address is required`);
        if (!stopHasCoords(s)) clientErrors.push(`Stop #${s.sequenceNumber}: coordinates (lat/lng) are required`);
      });
      if (!hasText(loadDetails.quantity))     clientErrors.push("Quantity is required");
      if (!hasText(loadDetails.unit))         clientErrors.push("Unit is required");
      if (!hasText(loadDetails.materialType)) clientErrors.push("Material is required");

      if (clientErrors.length > 0) {
        setHardErrors(clientErrors);
        return;
      }
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
        priority:             f.priority as "low" | "normal" | "high" | undefined,
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

      if (result?.validation?.warnings?.length) {
        setWarnings(result.validation.warnings);
      }

      onCreated();
      onClose();
    } catch (e: any) {
      const apiErrors = e?.response?.errors ?? e?.errors;
      if (Array.isArray(apiErrors)) {
        setHardErrors(apiErrors);
      } else {
        setErr(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-3xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-primary">Create Job</h2>
            <p className="text-xs text-muted">All fields marked * are required before marking Ready to Plan</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary text-xl">✕</button>
        </div>

        <form className="p-6 space-y-6 flex-1">

          {/* Hard block errors */}
          {hardErrors.length > 0 && (
            <div className="border border-red-300 bg-red-50 rounded-xl p-4">
              <p className="font-semibold text-red-700 text-sm mb-2">Cannot mark Ready to Plan — fix these issues:</p>
              <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
                {hardErrors.map(e => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}

          {/* General error */}
          {err && <Alert type="error" message={err} />}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="border border-yellow-300 bg-yellow-50 rounded-xl p-3">
              <p className="font-semibold text-yellow-700 text-xs mb-1">Soft warnings (job saved, but review these):</p>
              <ul className="text-xs text-yellow-700 space-y-0.5 list-disc list-inside">
                {warnings.map(w => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* ── Job Header ──────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="font-bold text-primary text-sm">Job Header</h3>

            <div>
              <label className="label">Customer *</label>
              <CustomerPicker
                customerId={customerId}
                customers={customers}
                onChange={setCustomerId}
                onCreated={c => setCustomers(prev => [...prev, c])}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Work date *</label>
                <input className="input" type="date" value={f.plannedDate}
                  onChange={e => setF(p => ({ ...p, plannedDate: e.target.value }))} />
              </div>
              <div>
                <label className="label">Vehicle type *</label>
                <select className="input" value={f.vehicleClassRequired}
                  onChange={e => setF(p => ({ ...p, vehicleClassRequired: e.target.value }))}>
                  {VEHICLE_CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Service type</label>
                <select className="input" value={f.serviceType}
                  onChange={e => setF(p => ({ ...p, serviceType: e.target.value }))}>
                  {SERVICE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Priority</label>
                <select className="input" value={f.priority}
                  onChange={e => setF(p => ({ ...p, priority: e.target.value }))}>
                  {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Assign driver</label>
                <select className="input" value={f.assignedDriverId}
                  onChange={e => setF(p => ({ ...p, assignedDriverId: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.displayName}{d.defaultTruckReg ? ` — ${d.defaultTruckReg}` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Template</label>
                <select className="input" value={f.templateId} onChange={e => applyTemplate(e.target.value)}>
                  <option value="">— Manual —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Truck reg</label>
                <input className="input" value={f.assignedTruck}
                  onChange={e => setF(p => ({ ...p, assignedTruck: e.target.value.toUpperCase() }))}
                  placeholder="e.g. AB12 CDE" />
              </div>
              <div>
                <label className="label">Trailer reg <span className="text-muted font-normal">(driver can update if unknown)</span></label>
                <input className="input" value={f.assignedTrailer}
                  onChange={e => setF(p => ({ ...p, assignedTrailer: e.target.value.toUpperCase() }))}
                  placeholder="e.g. T123 XYZ or leave blank" />
              </div>
            </div>
          </section>

          {/* ── Trailer types ────────────────────────────────────────────────── */}
          {f.vehicleClassRequired === "class1" && (
            <section>
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
            </section>
          )}

          {/* ── Stops ────────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-primary text-sm">Stops *</h3>
                <p className="text-xs text-muted">Order = execution order. First stop cannot be dropoff.</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {STOP_TYPES.map(([v, l]) => (
                  <button key={v} type="button" className="btn btn-outline text-xs" onClick={() => addStop(v)}>
                    + {l}
                  </button>
                ))}
              </div>
            </div>

            {stops.map((stop, index) => (
              <div key={index} className="border border-border rounded-2xl p-4 space-y-3 bg-gray-50">
                {/* Stop header */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-muted bg-white border border-border rounded-full px-2 py-0.5">
                    #{index + 1}
                  </span>
                  <select className="input w-auto" value={stop.type}
                    onChange={e => updateStop(index, { type: e.target.value })}>
                    {STOP_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button type="button" className="btn btn-outline text-xs" onClick={() => moveStop(index, -1)}>↑</button>
                  <button type="button" className="btn btn-outline text-xs" onClick={() => moveStop(index, 1)}>↓</button>
                  <button type="button" className="btn btn-outline text-xs text-red-600" onClick={() => removeStop(index)}>Remove</button>
                  {stopHasCoords(stop) && (
                    <span className="text-xs text-green-600 font-medium">📍 Coordinates set</span>
                  )}
                </div>

                {/* Address */}
                <div className="space-y-3">
                  <label className="label">Structured address *</label>
                  <LocationPicker
                    value={stop.locationTextSnapshot}
                    lat={stop.lat}
                    lng={stop.lng}
                    savedId={stop.savedLocationId}
                    locations={locations}
                    onChange={patch => updateStop(index, patch)}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Company / site name</label>
                      <input className="input" value={stop.siteName}
                        onChange={e => updateStop(index, { siteName: e.target.value })} placeholder="e.g. ABC Distribution Yard" />
                    </div>
                    <div>
                      <label className="label">Unit / building</label>
                      <input className="input" value={stop.unitName}
                        onChange={e => updateStop(index, { unitName: e.target.value })} placeholder="e.g. Unit 4 / Gate B" />
                    </div>
                    <div>
                      <label className="label">Street / road *</label>
                      <input className="input" value={stop.street}
                        onChange={e => updateStop(index, { street: e.target.value })} placeholder="e.g. Main Road" />
                    </div>
                    <div>
                      <label className="label">Town / city</label>
                      <input className="input" value={stop.town}
                        onChange={e => updateStop(index, { town: e.target.value })} placeholder="e.g. Luton" />
                    </div>
                    <div>
                      <label className="label">Postcode *</label>
                      <input className="input" value={stop.postcode}
                        onChange={e => updateStop(index, { postcode: e.target.value.toUpperCase() })} placeholder="e.g. LU2 7YE" />
                    </div>
                    <div>
                      <label className="label">Generated address</label>
                      <input className="input bg-gray-50" value={buildLocationSnapshot(stop)} readOnly />
                    </div>
                  </div>
                </div>

                {/* Coordinates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Latitude * <span className="text-muted font-normal">(gate / entrance)</span></label>
                    <input
                      className={`input ${stop.lat && !isValidCoord(stop.lat) ? "border-red-400" : ""}`}
                      type="number"
                      step="any"
                      value={stop.lat}
                      onChange={e => updateStop(index, { lat: e.target.value })}
                      placeholder="e.g. 51.5074"
                    />
                  </div>
                  <div>
                    <label className="label">Longitude *</label>
                    <input
                      className={`input ${stop.lng && !isValidCoord(stop.lng) ? "border-red-400" : ""}`}
                      type="number"
                      step="any"
                      value={stop.lng}
                      onChange={e => updateStop(index, { lng: e.target.value })}
                      placeholder="e.g. -0.1278"
                    />
                  </div>
                </div>
                <CoordHelper />

                {/* Contact + Reference + Time window */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Contact name</label>
                    <input className="input" value={stop.contactName}
                      onChange={e => updateStop(index, { contactName: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Contact phone</label>
                    <input className="input" value={stop.contactPhone}
                      onChange={e => updateStop(index, { contactPhone: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Stop reference</label>
                    <input className="input" value={stop.referenceNumber}
                      onChange={e => updateStop(index, { referenceNumber: e.target.value })} />
                  </div>
                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <label className="label">Confirmed time</label>
                      <input className="input" type="datetime-local" value={stop.bookedTime}
                        onChange={e => updateStop(index, { bookedTime: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Earliest arrival</label>
                      <select className="input" value={stop.earliestArrivalMinutes}
                        onChange={e => updateStop(index, { earliestArrivalMinutes: e.target.value })}>
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
                          Arrive from: {new Date(computeEarliestArrival(stop.bookedTime, stop.earliestArrivalMinutes) || stop.bookedTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="label">Unloading allowance</label>
                      <select className="input" value={stop.unloadingAllowanceMinutes}
                        onChange={e => updateStop(index, { unloadingAllowanceMinutes: e.target.value })}>
                        <option value="0">Not agreed</option>
                        <option value="30">30 min free</option>
                        <option value="45">45 min free</option>
                        <option value="60">1 hour free</option>
                        <option value="90">90 min free</option>
                        <option value="120">2 hours free</option>
                        <option value="180">3 hours free</option>
                      </select>
                      {stop.unloadingAllowanceMinutes !== "0" && (
                        <p className="text-xs text-muted mt-1">Chargeable waiting starts after {stop.unloadingAllowanceMinutes} min</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div>
                  <label className="label">Instructions</label>
                  <textarea className="input min-h-16" value={stop.instructions}
                    onChange={e => updateStop(index, { instructions: e.target.value })}
                    placeholder="Gate code, PPE required, call before arrival, tight access from east side..." />
                </div>
              </div>
            ))}

            {stops.length === 0 && (
              <p className="text-sm text-muted text-center py-4 border border-dashed border-border rounded-xl">
                No stops added. Add a pickup and a dropoff.
              </p>
            )}
          </section>

          {/* ── Cargo / Load ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="font-bold text-primary text-sm">Cargo / Load *</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <div className="md:col-span-2">
                <label className="label">Material *</label>
                <input className="input" value={loadDetails.materialType}
                  onChange={e => setLoadDetails(p => ({ ...p, materialType: e.target.value }))}
                  placeholder="e.g. General freight, chilled goods, steel coils..." />
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
                  placeholder="e.g. ADR 3, Class 8..." />
              </div>
              <div>
                <label className="label">Cargo notes</label>
                <input className="input" value={loadDetails.notes}
                  onChange={e => setLoadDetails(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Fragile, temp controlled, stacking restrictions..." />
              </div>
            </div>
          </section>

          {/* ── Notes ───────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="font-bold text-primary text-sm">Notes</h3>
            <div>
              <label className="label">Planner notes</label>
              <textarea className="input min-h-16" value={f.plannerNotes}
                onChange={e => setF(p => ({ ...p, plannerNotes: e.target.value }))}
                placeholder="Operational instructions visible to planner..." />
            </div>
            <div>
              <label className="label">Internal notes <span className="text-muted font-normal">(office only, never shown to driver)</span></label>
              <textarea className="input min-h-16" value={f.internalNotes}
                onChange={e => setF(p => ({ ...p, internalNotes: e.target.value }))} />
            </div>
          </section>

          {/* ── Template save ───────────────────────────────────────────────── */}
          <section className="space-y-2 border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={f.saveAsTemplate}
                onChange={e => setF(p => ({ ...p, saveAsTemplate: e.target.checked }))} />
              Save as template for future jobs
            </label>
            {f.saveAsTemplate && (
              <input className="input" value={f.templateName}
                onChange={e => setF(p => ({ ...p, templateName: e.target.value }))}
                placeholder="Template name (required)" />
            )}
          </section>

          {/* ── Quality score ───────────────────────────────────────────────── */}
          <QualityBadge score={quality.score} missing={quality.missing} />

        </form>

        {/* ── Submit bar ──────────────────────────────────────────────────── */}
        <div className="sticky bottom-0 bg-white border-t border-border px-6 py-4 flex gap-3">
          <button type="button" disabled={loading} onClick={e => submit(e, "draft")}
            className="btn btn-outline flex-1">
            {loading ? "Saving..." : "Save Draft"}
          </button>
          <button type="button" disabled={loading} onClick={e => submit(e, "ready_to_plan")}
            className="btn btn-primary flex-1">
            {loading ? "Saving..." : "Mark Ready to Plan ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}

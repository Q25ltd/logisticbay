import { useState, useEffect } from "react";
import { fleetApi } from "../../api/fleet";
import type { FleetUnit, FleetTrailer } from "../../types";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";

// ── Constants ─────────────────────────────────────────────────────────────────

const VEHICLE_CLASSES = [
  "Van", "Rigid", "Artic unit", "Tipper", "Grab", "Mixer", "HIAB", "Refrigerated", "Other",
];

const TRAILER_TYPES = [
  "Curtain sider", "Flatbed", "Box", "Tipper", "Tanker", "Low loader", "Skeletal",
  "Refrigerated trailer", "Other",
];

const UNIT_STATUSES    = ["available", "assigned", "vor"] as const;
const TRAILER_STATUSES = ["available", "assigned", "loaded", "vor"] as const;

// ── Badge helper ─────────────────────────────────────────────────────────────

function statusBadgeClass(status: string): string {
  switch (status) {
    case "available": return "badge badge-active";
    case "assigned":  return "badge badge-accepted";
    case "loaded":    return "badge badge-in_progress";
    case "vor":       return "badge badge-cancelled";
    default:          return "badge badge-cancelled";
  }
}

function statusLabel(status: string): string {
  return status === "vor" ? "VOR" : status.charAt(0).toUpperCase() + status.slice(1);
}

// ── Unit Form ─────────────────────────────────────────────────────────────────

function UnitForm({ initial, onSave, onCancel }: {
  initial?: FleetUnit; onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    registration: initial?.registration ?? "",
    vehicleClass:  initial?.vehicleClass  ?? "",
    status:        initial?.status        ?? "available",
    notes:         initial?.notes         ?? "",
    yardLocation:  initial?.yardLocation  ?? "",
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        registration: form.registration.trim(),
        vehicleClass:  form.vehicleClass,
        status:        form.status,
        notes:         form.notes.trim()        || undefined,
        yardLocation:  form.yardLocation.trim() || undefined,
      };
      if (initial) {
        await fleetApi.units.update(initial.id, payload);
      } else {
        await fleetApi.units.create(payload);
      }
      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <Alert type="error" message={error} />}
      <Input
        label="Registration / Unit Number *"
        value={form.registration}
        onChange={set("registration")}
        placeholder="e.g. AB12 CDE"
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">
          Vehicle Class *
          <select className="input mt-1 w-full" value={form.vehicleClass} onChange={set("vehicleClass")} required>
            <option value="">Select class…</option>
            {VEHICLE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Status
          <select className="input mt-1 w-full" value={form.status} onChange={set("status")}>
            {UNIT_STATUSES.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </label>
      </div>
      <Input
        label="Yard Location"
        value={form.yardLocation}
        onChange={set("yardLocation")}
        placeholder="Bay 3, North yard…"
      />
      <label className="block text-sm font-semibold mt-3">
        Notes
        <textarea
          className="input w-full mt-1 min-h-[72px]"
          value={form.notes}
          onChange={set("notes")}
          placeholder="Any relevant notes for planners…"
        />
      </label>
      <div className="flex gap-3 mt-5">
        <Button type="submit" loading={loading} className="flex-1">
          {initial ? "Save Changes" : "Add Unit"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </form>
  );
}

// ── Trailer Form ──────────────────────────────────────────────────────────────

function TrailerForm({ initial, onSave, onCancel }: {
  initial?: FleetTrailer; onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    registration: initial?.registration ?? "",
    trailerType:   initial?.trailerType   ?? "",
    status:        initial?.status        ?? "available",
    notes:         initial?.notes         ?? "",
    yardLocation:  initial?.yardLocation  ?? "",
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        registration: form.registration.trim(),
        trailerType:   form.trailerType,
        status:        form.status,
        notes:         form.notes.trim()        || undefined,
        yardLocation:  form.yardLocation.trim() || undefined,
      };
      if (initial) {
        await fleetApi.trailers.update(initial.id, payload);
      } else {
        await fleetApi.trailers.create(payload);
      }
      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <Alert type="error" message={error} />}
      <Input
        label="Registration / Trailer Number *"
        value={form.registration}
        onChange={set("registration")}
        placeholder="e.g. TR-001 or XY63 FGH"
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">
          Trailer Type *
          <select className="input mt-1 w-full" value={form.trailerType} onChange={set("trailerType")} required>
            <option value="">Select type…</option>
            {TRAILER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Status
          <select className="input mt-1 w-full" value={form.status} onChange={set("status")}>
            {TRAILER_STATUSES.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </label>
      </div>
      <Input
        label="Yard Location"
        value={form.yardLocation}
        onChange={set("yardLocation")}
        placeholder="Bay 7, South yard…"
      />
      <label className="block text-sm font-semibold mt-3">
        Notes
        <textarea
          className="input w-full mt-1 min-h-[72px]"
          value={form.notes}
          onChange={set("notes")}
          placeholder="Any relevant notes for planners…"
        />
      </label>
      <div className="flex gap-3 mt-5">
        <Button type="submit" loading={loading} className="flex-1">
          {initial ? "Save Changes" : "Add Trailer"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </form>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "units" | "trailers";

export default function FleetPage() {
  const [tab,           setTab]           = useState<Tab>("units");
  const [units,         setUnits]         = useState<FleetUnit[]>([]);
  const [trailers,      setTrailers]      = useState<FleetTrailer[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [success,       setSuccess]       = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [showForm,      setShowForm]      = useState(false);
  const [editUnit,      setEditUnit]      = useState<FleetUnit | undefined>();
  const [editTrailer,   setEditTrailer]   = useState<FleetTrailer | undefined>();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [unitRes, trailerRes] = await Promise.all([
        fleetApi.units.list(),
        fleetApi.trailers.list(),
      ]);
      setUnits(unitRes.data);
      setTrailers(trailerRes.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // auto-clear success
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(t);
  }, [success]);

  async function handleDeleteUnit(unit: FleetUnit) {
    if (!confirm(`Archive unit ${unit.registration}? It will be hidden from planning but kept for audit/history.`)) return;
    try {
      await fleetApi.units.remove(unit.id);
      setSuccess("Unit archived");
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDeleteTrailer(trailer: FleetTrailer) {
    if (!confirm(`Archive trailer ${trailer.registration}? It will be hidden from planning but kept for audit/history.`)) return;
    try {
      await fleetApi.trailers.remove(trailer.id);
      setSuccess("Trailer archived");
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  function openAddForm() {
    setEditUnit(undefined);
    setEditTrailer(undefined);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditUnit(undefined);
    setEditTrailer(undefined);
  }

  function onSaved(msg: string) {
    closeForm();
    setSuccess(msg);
    load();
  }

  // ── Stat bar numbers ──────────────────────────────────────────────────────
  const unitAvailable = units.filter(u => u.status === "available").length;
  const unitVor       = units.filter(u => u.status === "vor").length;
  const trailerAvail  = trailers.filter(t => t.status === "available").length;
  const trailerVor    = trailers.filter(t => t.status === "vor").length;

  // ── Filtered lists ────────────────────────────────────────────────────────
  const filteredUnits = statusFilter === "all"
    ? units
    : units.filter(u => u.status === statusFilter);

  const filteredTrailers = statusFilter === "all"
    ? trailers
    : trailers.filter(t => t.status === statusFilter);

  const activeStatuses = tab === "units" ? UNIT_STATUSES : TRAILER_STATUSES;

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-primary">Fleet</h1>
          <p className="text-sm text-muted">Manage trucks, units, and trailers used for planning</p>
        </div>
        <Button onClick={openAddForm}>
          {tab === "units" ? "+ Add Unit" : "+ Add Trailer"}
        </Button>
      </div>

      {/* ── Alerts ─────────────────────────────────────────────────────────── */}
      {success && <Alert type="success" message={success} />}
      {error   && <Alert type="error"   message={error}   />}

      {/* ── Stat bar ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="card p-4 text-center">
          <div className="text-2xl font-black text-primary">{units.length}</div>
          <div className="text-xs text-muted mt-0.5">Total Units</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-black text-green-600">{unitAvailable}</div>
          <div className="text-xs text-muted mt-0.5">Units Available</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-black text-primary">{trailers.length}</div>
          <div className="text-xs text-muted mt-0.5">Total Trailers</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-black text-green-600">{trailerAvail}</div>
          <div className="text-xs text-muted mt-0.5">Trailers Available</div>
        </div>
      </div>

      {unitVor > 0 && (
        <div className="mb-4 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium">
          VOR: {unitVor} unit{unitVor > 1 ? "s" : ""}{trailerVor > 0 ? ` · ${trailerVor} trailer${trailerVor > 1 ? "s" : ""}` : ""}
        </div>
      )}

      {/* ── Add / Edit form ─────────────────────────────────────────────────── */}
      {showForm && (
        <div className="card p-6 mb-6">
          {tab === "units" ? (
            <>
              <h2 className="font-bold text-primary mb-4">{editUnit ? `Edit Unit — ${editUnit.registration}` : "Add New Unit"}</h2>
              <UnitForm
                initial={editUnit}
                onSave={() => onSaved(editUnit ? "Unit updated" : "Unit added")}
                onCancel={closeForm}
              />
            </>
          ) : (
            <>
              <h2 className="font-bold text-primary mb-4">{editTrailer ? `Edit Trailer — ${editTrailer.registration}` : "Add New Trailer"}</h2>
              <TrailerForm
                initial={editTrailer}
                onSave={() => onSaved(editTrailer ? "Trailer updated" : "Trailer added")}
                onCancel={closeForm}
              />
            </>
          )}
        </div>
      )}

      {/* ── Tab switcher ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {(["units", "trailers"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setStatusFilter("all"); setShowForm(false); setEditUnit(undefined); setEditTrailer(undefined); }}
              className={"px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors " +
                (tab === t ? "bg-white text-primary shadow-sm" : "text-muted hover:text-primary")}>
              {t === "units" ? "Units / Trucks" : "Trailers"}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <select
            className="input text-sm py-1.5"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            {activeStatuses.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-12 text-muted">Loading fleet…</div>
      ) : tab === "units" ? (
        <UnitsTable
          units={filteredUnits}
          allEmpty={units.length === 0}
          onEdit={(u) => { setEditUnit(u); setEditTrailer(undefined); setShowForm(true); }}
          onDelete={handleDeleteUnit}
          onAddFirst={openAddForm}
        />
      ) : (
        <TrailersTable
          trailers={filteredTrailers}
          allEmpty={trailers.length === 0}
          onEdit={(t) => { setEditTrailer(t); setEditUnit(undefined); setShowForm(true); }}
          onDelete={handleDeleteTrailer}
          onAddFirst={openAddForm}
        />
      )}
    </div>
  );
}

// ── Units Table / Cards ───────────────────────────────────────────────────────

function UnitsTable({ units, allEmpty, onEdit, onDelete, onAddFirst }: {
  units: FleetUnit[];
  allEmpty: boolean;
  onEdit: (u: FleetUnit) => void;
  onDelete: (u: FleetUnit) => void;
  onAddFirst: () => void;
}) {
  if (units.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🚛</div>
        <div className="font-bold text-primary mb-1">{allEmpty ? "No units yet" : "No units match"}</div>
        <div className="text-sm text-muted mb-4">{allEmpty ? "Add your first unit to get started" : "Try a different status filter"}</div>
        {allEmpty && <Button onClick={onAddFirst}>Add First Unit</Button>}
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left px-4 py-3 font-bold text-primary">Registration</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Class</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Status</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Yard Location</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Notes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {units.map((unit, i) => (
              <tr key={unit.id} className={"border-b border-border last:border-0 " + (i % 2 === 1 ? "bg-slate-50/50" : "")}>
                <td className="px-4 py-3 font-bold text-primary">{unit.registration}</td>
                <td className="px-4 py-3 text-muted">{unit.vehicleClass}</td>
                <td className="px-4 py-3">
                  <span className={statusBadgeClass(unit.status)}>{statusLabel(unit.status)}</span>
                </td>
                <td className="px-4 py-3 text-muted">{unit.yardLocation || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-muted max-w-[200px] truncate">{unit.notes || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(unit)} className="text-xs text-accent hover:underline font-semibold mr-3">Edit</button>
                  <button onClick={() => onDelete(unit)} className="text-xs text-red-500 hover:underline font-semibold">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {units.map(unit => (
          <div key={unit.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-primary">{unit.registration}</span>
                  <span className={statusBadgeClass(unit.status)}>{statusLabel(unit.status)}</span>
                </div>
                <div className="text-sm text-muted">{unit.vehicleClass}</div>
                {unit.yardLocation && <div className="text-xs text-muted mt-1">Yard: {unit.yardLocation}</div>}
                {unit.notes && <div className="text-xs text-muted mt-1 line-clamp-2">{unit.notes}</div>}
              </div>
              <div className="flex flex-col gap-2 ml-4 text-right">
                <button onClick={() => onEdit(unit)} className="text-xs text-accent hover:underline font-semibold min-h-[44px] flex items-center justify-end">Edit</button>
                <button onClick={() => onDelete(unit)} className="text-xs text-red-500 hover:underline font-semibold">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Trailers Table / Cards ────────────────────────────────────────────────────

function TrailersTable({ trailers, allEmpty, onEdit, onDelete, onAddFirst }: {
  trailers: FleetTrailer[];
  allEmpty: boolean;
  onEdit: (t: FleetTrailer) => void;
  onDelete: (t: FleetTrailer) => void;
  onAddFirst: () => void;
}) {
  if (trailers.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🚛</div>
        <div className="font-bold text-primary mb-1">{allEmpty ? "No trailers yet" : "No trailers match"}</div>
        <div className="text-sm text-muted mb-4">{allEmpty ? "Add your first trailer to get started" : "Try a different status filter"}</div>
        {allEmpty && <Button onClick={onAddFirst}>Add First Trailer</Button>}
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left px-4 py-3 font-bold text-primary">Registration</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Type</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Status</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Yard Location</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Notes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {trailers.map((trailer, i) => (
              <tr key={trailer.id} className={"border-b border-border last:border-0 " + (i % 2 === 1 ? "bg-slate-50/50" : "")}>
                <td className="px-4 py-3 font-bold text-primary">{trailer.registration}</td>
                <td className="px-4 py-3 text-muted">{trailer.trailerType}</td>
                <td className="px-4 py-3">
                  <span className={statusBadgeClass(trailer.status)}>{statusLabel(trailer.status)}</span>
                </td>
                <td className="px-4 py-3 text-muted">{trailer.yardLocation || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-muted max-w-[200px] truncate">{trailer.notes || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(trailer)} className="text-xs text-accent hover:underline font-semibold mr-3">Edit</button>
                  <button onClick={() => onDelete(trailer)} className="text-xs text-red-500 hover:underline font-semibold">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {trailers.map(trailer => (
          <div key={trailer.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-primary">{trailer.registration}</span>
                  <span className={statusBadgeClass(trailer.status)}>{statusLabel(trailer.status)}</span>
                </div>
                <div className="text-sm text-muted">{trailer.trailerType}</div>
                {trailer.yardLocation && <div className="text-xs text-muted mt-1">Yard: {trailer.yardLocation}</div>}
                {trailer.notes && <div className="text-xs text-muted mt-1 line-clamp-2">{trailer.notes}</div>}
              </div>
              <div className="flex flex-col gap-2 ml-4 text-right">
                <button onClick={() => onEdit(trailer)} className="text-xs text-accent hover:underline font-semibold min-h-[44px] flex items-center justify-end">Edit</button>
                <button onClick={() => onDelete(trailer)} className="text-xs text-red-500 hover:underline font-semibold">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

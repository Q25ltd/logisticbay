import { errorMessage } from "../../lib/errorMessage";
import { useState, useEffect } from "react";
import { fleetApi } from "../../api/fleet";
import type { FleetUnit, FleetTrailer } from "../../types";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { UNIT_STATUSES, TRAILER_STATUSES } from "./fleetConstants";
import { statusLabel } from "./fleetUtils";
import UnitForm from "./UnitForm";
import TrailerForm from "./TrailerForm";
import UnitsTable from "./UnitsTable";
import TrailersTable from "./TrailersTable";

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
    } catch (err) {
      setError(errorMessage(err));
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
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  async function handleDeleteTrailer(trailer: FleetTrailer) {
    if (!confirm(`Archive trailer ${trailer.registration}? It will be hidden from planning but kept for audit/history.`)) return;
    try {
      await fleetApi.trailers.remove(trailer.id);
      setSuccess("Trailer archived");
      load();
    } catch (err) {
      alert(errorMessage(err));
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
    <div className="p-4 sm:p-6">
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

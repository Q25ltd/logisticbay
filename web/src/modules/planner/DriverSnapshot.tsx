import { useState } from "react";
import { driversApi } from "../../api/drivers";
import type { Driver, FleetTrailer, FleetUnit } from "../../types";
import type { JobContext } from "./dashboardTypes";
import { isClosed } from "./dashboardUtils";
import { BODY_CATEGORIES, BODY_TYPES } from "../../constants/vehicleTaxonomy";

export default function DriverSnapshot({
  drivers,
  contexts,
  units,
  trailers,
  onAssignDriver,
  onPickJobForDriver,
  onViewMore,
  onMarkUnavailable,
  onUnitTrailerSaved,
}: {
  drivers: Driver[];
  contexts: JobContext[];
  units: FleetUnit[];
  trailers: FleetTrailer[];
  onAssignDriver: (driver: Driver) => void;
  onPickJobForDriver: (driver: Driver) => void;
  onViewMore: () => void;
  onMarkUnavailable: (driver: Driver) => void;
  onUnitTrailerSaved: () => void;
}) {
  const openContexts = contexts.filter((context) => !isClosed(context.job));

  // Inline unit/trailer editing state — keyed by driver id
  const [editing, setEditing] = useState<Record<number, {
    unit: string; unitClass: string;
    trailer: string; trailerClass: string;
  } | null>>({});
  const [savingUnit, setSavingUnit] = useState<number | null>(null);

  function vehicleClassLabel(cls: string) {
    return BODY_CATEGORIES.find((t) => t.value === cls)?.label
      ?? (cls ? cls.charAt(0).toUpperCase() + cls.slice(1).replace(/_/g, " ") : "");
  }

  function trailerClassLabel(cls: string) {
    return BODY_TYPES.find((t) => t.value === cls)?.label
      ?? (cls ? cls.charAt(0).toUpperCase() + cls.slice(1).replace(/_/g, " ") : "");
  }

  function fleetUnitForReg(reg: string) {
    const clean = reg.trim().toUpperCase().replace(/\s+/g, "");
    if (!clean) return null;
    return units.find((u) => u.registration.toUpperCase().replace(/\s+/g, "") === clean) ?? null;
  }

  function fleetTrailerForReg(reg: string) {
    const clean = reg.trim().toUpperCase().replace(/\s+/g, "");
    if (!clean) return null;
    return trailers.find((t) => t.registration.toUpperCase().replace(/\s+/g, "") === clean) ?? null;
  }

  function handleUnitRegChange(driverId: number, value: string) {
    const matched = fleetUnitForReg(value);
    setEditing(prev => ({
      ...prev,
      [driverId]: {
        ...prev[driverId]!,
        unit: value,
        unitClass: matched ? (matched.bodyCategory || matched.vehicleClass) : (prev[driverId]?.unitClass ?? ""),
      },
    }));
  }

  function handleTrailerRegChange(driverId: number, value: string) {
    const matched = fleetTrailerForReg(value);
    setEditing(prev => ({
      ...prev,
      [driverId]: {
        ...prev[driverId]!,
        trailer: value,
        trailerClass: matched ? (matched.bodyType || matched.trailerType) : (prev[driverId]?.trailerClass ?? ""),
      },
    }));
  }

  async function saveUnitTrailer(driver: Driver) {
    const e = editing[driver.id];
    if (!e) return;
    setSavingUnit(driver.id);
    try {
      await driversApi.update(driver.id, {
        defaultTruckReg:     (e.unit ?? "").trim().toUpperCase(),
        defaultTruckClass:   e.unitClass ?? "",
        defaultTrailerReg:   (e.trailer ?? "").trim().toUpperCase(),
        defaultTrailerClass: e.trailerClass ?? "",
      });
      setEditing(prev => ({ ...prev, [driver.id]: null }));
      onUnitTrailerSaved();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingUnit(null);
    }
  }

  function startEditing(driver: Driver) {
    const matchedUnit    = fleetUnitForReg(driver.defaultTruckReg ?? "");
    const matchedTrailer = fleetTrailerForReg(driver.defaultTrailerReg ?? "");
    setEditing(prev => ({
      ...prev,
      [driver.id]: {
        unit:         driver.defaultTruckReg ?? "",
        unitClass:    matchedUnit    ? (matchedUnit.bodyCategory || matchedUnit.vehicleClass) : (driver.defaultTruckClass    ?? ""),
        trailer:      driver.defaultTrailerReg ?? "",
        trailerClass: matchedTrailer ? (matchedTrailer.bodyType || matchedTrailer.trailerType) : (driver.defaultTrailerClass ?? ""),
      },
    }));
  }

  // Sort: needs-attention first (no vehicle), then active, then unavailable
  function driverSortKey(driver: Driver) {
    if (driver.status !== "active") return 2;
    const hasVehicle = !!driver.defaultTruckReg;
    if (!hasVehicle) return 0;
    return 1;
  }

  const sortedDrivers = [...drivers].sort((a, b) => driverSortKey(a) - driverSortKey(b));
  const needsAttentionDrivers = sortedDrivers.filter((d) => d.status === "active" && !d.defaultTruckReg);
  const otherDrivers = sortedDrivers.filter((d) => !(d.status === "active" && !d.defaultTruckReg));
  const visibleDrivers = [...needsAttentionDrivers, ...otherDrivers].slice(0, 8);

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-primary">Drivers</h2>
          <p className="text-xs text-muted">
            {needsAttentionDrivers.length > 0
              ? `${needsAttentionDrivers.length} need${needsAttentionDrivers.length === 1 ? "s" : ""} a unit`
              : "All active drivers have a unit"}
          </p>
        </div>
        <button type="button" onClick={onViewMore} className="text-xs font-semibold text-accent hover:underline">View all</button>
      </div>

      <div className="space-y-2">
        {visibleDrivers.map((driver) => {
          const isActive = driver.status === "active";
          const noVehicle = isActive && !driver.defaultTruckReg;
          const needsAttention = noVehicle;
          const editState = editing[driver.id];
          const linkedTrailer = driver.defaultTrailerReg
            ? trailers.find((t) => t.registration.toUpperCase() === driver.defaultTrailerReg.toUpperCase())
            : null;

          return (
            <div key={driver.id} className={`rounded-lg border p-2.5 ${needsAttention ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-white"}`}>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-primary">{driver.displayName}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {!isActive && <span className="rounded px-1.5 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-500">Unavailable</span>}
                  {isActive && noVehicle
                    ? <span className="rounded px-1.5 py-0.5 text-[11px] font-bold bg-red-100 text-red-700">No unit</span>
                    : isActive && (() => {
                        const fleetUnit = fleetUnitForReg(driver.defaultTruckReg ?? "");
                        const cls = fleetUnit ? (fleetUnit.bodyCategory || fleetUnit.vehicleClass) : (driver.defaultTruckClass ?? "");
                        const clsLabel = vehicleClassLabel(cls);
                        const matchedTrailerFleet = fleetTrailerForReg(driver.defaultTrailerReg ?? "");
                        const trailerCls = matchedTrailerFleet ? (matchedTrailerFleet.bodyType || matchedTrailerFleet.trailerType) : (driver.defaultTrailerClass ?? "");
                        const trailerClsLabel = trailerClassLabel(trailerCls);
                        return (
                          <span className="rounded px-1.5 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-600">
                            🚛 {driver.defaultTruckReg}
                            {clsLabel && <span className="ml-1 text-slate-400">· {clsLabel}</span>}
                            {driver.defaultTrailerReg && (
                              <span className={linkedTrailer?.status === "vor" ? " text-red-600" : linkedTrailer?.status === "available" ? " text-green-700" : ""}>
                                {" "}+ {driver.defaultTrailerReg}
                                {trailerClsLabel && <span className="text-slate-400"> · {trailerClsLabel}</span>}
                              </span>
                            )}
                          </span>
                        );
                      })()
                  }
                </div>
              </div>

              {/* Inline unit / trailer edit */}
              {isActive && editState && (() => {
                const regClean      = editState.unit.trim();
                const matchedUnit   = fleetUnitForReg(regClean);
                const isExternal    = !!regClean && !matchedUnit;
                const needsClass    = isExternal && !editState.unitClass;
                // Can save when: unit is empty (removal) OR unit is set and type is resolved
                const canSave       = !needsClass;

                const trailerClean   = editState.trailer.trim();
                const matchedTrailer = fleetTrailerForReg(trailerClean);
                const isExternalTrailer = !!trailerClean && !matchedTrailer;

                function clearUnit() {
                  setEditing(prev => ({ ...prev, [driver.id]: { ...prev[driver.id]!, unit: "", unitClass: "" } }));
                }
                function clearTrailer() {
                  setEditing(prev => ({ ...prev, [driver.id]: { ...prev[driver.id]!, trailer: "", trailerClass: "" } }));
                }

                return (
                  <div className="mt-2 space-y-2">
                    {/* ── Unit ── */}
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] font-bold uppercase text-muted">Unit reg</label>
                        {regClean && (
                          <button type="button" onClick={clearUnit}
                            className="text-[10px] text-red-500 hover:text-red-700 font-semibold">
                            ✕ Remove unit
                          </button>
                        )}
                      </div>
                      <input
                        className="input text-xs py-1"
                        placeholder="AB12 CDE — leave blank to remove"
                        value={editState.unit}
                        onChange={(e) => handleUnitRegChange(driver.id, e.target.value)}
                      />
                      {matchedUnit && (
                        <p className="mt-0.5 text-[10px] text-green-700 font-semibold">
                          ✓ In fleet · {vehicleClassLabel(matchedUnit.bodyCategory || matchedUnit.vehicleClass) || matchedUnit.bodyCategory || matchedUnit.vehicleClass} · {matchedUnit.status}
                        </p>
                      )}
                      {isExternal && (
                        <p className="mt-0.5 text-[10px] text-amber-700 font-semibold">
                          Not in company fleet — external vehicle. Select type:
                        </p>
                      )}
                    </div>

                    {/* External vehicle type picker */}
                    {isExternal && (
                      <div className="flex flex-wrap gap-1">
                        {BODY_CATEGORIES.map((t) => (
                          <button key={t.value} type="button"
                            onClick={() => setEditing(prev => ({ ...prev, [driver.id]: { ...prev[driver.id]!, unitClass: t.value } }))}
                            className={`rounded px-2 py-0.5 text-[11px] font-bold border transition-colors ${
                              editState.unitClass === t.value
                                ? "bg-primary text-white border-primary"
                                : "bg-white text-slate-600 border-slate-300 hover:border-primary"
                            }`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* ── Trailer ── */}
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] font-bold uppercase text-muted">Trailer reg (optional)</label>
                        {trailerClean && (
                          <button type="button" onClick={clearTrailer}
                            className="text-[10px] text-red-500 hover:text-red-700 font-semibold">
                            ✕ Remove trailer
                          </button>
                        )}
                      </div>
                      <input
                        className="input text-xs py-1"
                        placeholder="TR45 XYZ — leave blank to remove"
                        value={editState.trailer}
                        onChange={(e) => handleTrailerRegChange(driver.id, e.target.value)}
                      />
                      {matchedTrailer && (
                        <p className="mt-0.5 text-[10px] text-green-700 font-semibold">
                          ✓ In fleet · {trailerClassLabel(matchedTrailer.bodyType || matchedTrailer.trailerType) || (matchedTrailer.bodyType || matchedTrailer.trailerType)?.replace(/_/g, " ")} · {({"available":"Available","off_road":"Off Road","vor":"VOR","loaded":"Loaded","in_use":"In Use","repair":"In Repair","decommissioned":"Decommissioned"} as Record<string,string>)[matchedTrailer.status] ?? matchedTrailer.status}
                        </p>
                      )}
                      {isExternalTrailer && (
                        <p className="mt-0.5 text-[10px] text-amber-700 font-semibold">
                          Rented / not in fleet — select type:
                        </p>
                      )}
                    </div>

                    {/* External trailer type picker */}
                    {isExternalTrailer && (
                      <div className="flex flex-wrap gap-1">
                        {BODY_TYPES.map((t) => (
                          <button key={t.value} type="button"
                            onClick={() => setEditing(prev => ({ ...prev, [driver.id]: { ...prev[driver.id]!, trailerClass: t.value } }))}
                            className={`rounded px-2 py-0.5 text-[11px] font-bold border transition-colors ${
                              editState.trailerClass === t.value
                                ? "bg-primary text-white border-primary"
                                : "bg-white text-slate-600 border-slate-300 hover:border-primary"
                            }`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {!regClean && (
                      <p className="text-[10px] text-orange-600 font-semibold">
                        ⚠ Driver will show as having no unit after saving.
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button type="button" disabled={savingUnit === driver.id || !canSave} onClick={() => saveUnitTrailer(driver)}
                        className="text-xs font-semibold text-accent hover:underline disabled:opacity-40">
                        {savingUnit === driver.id ? "Saving…" : needsClass ? "Select vehicle type first" : "Save"}
                      </button>
                      <button type="button" onClick={() => setEditing(prev => ({ ...prev, [driver.id]: null }))}
                        className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                    </div>
                  </div>
                );
              })()}

              {isActive && !editState && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {noVehicle && (
                    <button type="button" onClick={() => startEditing(driver)}
                      className="text-xs font-semibold text-accent hover:underline">
                      Assign unit →
                    </button>
                  )}
                  {!noVehicle && (
                    <button type="button" onClick={() => onAssignDriver(driver)}
                      className="text-xs font-semibold text-accent hover:underline">
                      View Runs →
                    </button>
                  )}
                  {!noVehicle && (
                    <button type="button" onClick={() => startEditing(driver)}
                      className="text-xs text-slate-500 hover:text-primary">
                      Change unit
                    </button>
                  )}
                  <button type="button" onClick={() => onMarkUnavailable(driver)}
                    className="text-xs text-slate-400 hover:text-red-600">
                    Mark unavailable
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {visibleDrivers.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-muted">No drivers yet.</div>
        )}
      </div>
    </section>
  );
}

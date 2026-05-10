import type { Driver, FleetTrailer, FleetUnit } from "../../types";
import type { JobContext } from "./dashboardTypes";
import { BODY_CATEGORIES, BODY_TYPES, GVW_CLASSES } from "../../constants/vehicleTaxonomy";

function fleetStatusRank(status: string) {
  if (status === "available") return 0;
  if (status === "vor") return 2;
  return 1; // in_use, loaded, assigned, etc.
}

function statusDot(status: string) {
  if (status === "available") return <span className="inline-block h-2 w-2 rounded-full bg-green-500" />;
  if (status === "vor")       return <span className="inline-block h-2 w-2 rounded-full bg-red-500" />;
  return                             <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />;
}

function labelFor(options: readonly { value: string; label: string }[], value?: string | null) {
  return value ? options.find((option) => option.value === value)?.label ?? value : "";
}

function unitSpec(unit: FleetUnit) {
  return [
    labelFor(BODY_CATEGORIES, unit.bodyCategory || unit.vehicleClass),
    labelFor(GVW_CLASSES, unit.gvwClass),
    labelFor(BODY_TYPES, unit.bodyType),
  ].filter(Boolean).join(" · ");
}

function trailerSpec(trailer: FleetTrailer) {
  return labelFor(BODY_TYPES, trailer.bodyType || trailer.trailerType);
}

export default function FleetSnapshot({
  units,
  trailers,
  drivers,
  openContexts,
  onViewMore,
}: {
  units: FleetUnit[];
  trailers: FleetTrailer[];
  drivers: Driver[];
  openContexts: JobContext[];
  onViewMore: () => void;
}) {
  const sortedUnits = [...units].sort((a, b) =>
    fleetStatusRank(a.status) - fleetStatusRank(b.status) || a.registration.localeCompare(b.registration)
  );
  const sortedTrailers = [...trailers].sort((a, b) =>
    fleetStatusRank(a.status) - fleetStatusRank(b.status) || a.registration.localeCompare(b.registration)
  );

  function unitDriver(reg: string): Driver | null {
    const byJob = openContexts.find((ctx) => ctx.job.assignedTruck?.toUpperCase() === reg.toUpperCase() && ctx.job.assignedDriverId);
    if (byJob?.job.assignedDriverId) return drivers.find((d) => d.id === byJob.job.assignedDriverId) ?? null;
    return drivers.find((d) => d.defaultTruckReg?.toUpperCase() === reg.toUpperCase()) ?? null;
  }

  function unitTrailer(unit: FleetUnit): FleetTrailer | null {
    if (unit.currentTrailerId) return trailers.find((t) => t.id === unit.currentTrailerId) ?? null;
    const byJob = openContexts.find((ctx) => ctx.job.assignedTruck?.toUpperCase() === unit.registration.toUpperCase() && ctx.job.assignedTrailer);
    if (byJob?.job.assignedTrailer) return trailers.find((t) => t.registration.toUpperCase() === byJob.job.assignedTrailer!.toUpperCase()) ?? null;
    return null;
  }

  function trailerUnit(trailer: FleetTrailer): FleetUnit | null {
    if (trailer.attachedUnitId) return units.find((u) => u.id === trailer.attachedUnitId) ?? null;
    const byJob = openContexts.find((ctx) => ctx.job.assignedTrailer?.toUpperCase() === trailer.registration.toUpperCase() && ctx.job.assignedTruck);
    if (byJob?.job.assignedTruck) return units.find((u) => u.registration.toUpperCase() === byJob.job.assignedTruck!.toUpperCase()) ?? null;
    // also check driver default trailer
    const byDriver = drivers.find((d) => d.defaultTrailerReg?.toUpperCase() === trailer.registration.toUpperCase());
    if (byDriver?.defaultTruckReg) return units.find((u) => u.registration.toUpperCase() === byDriver.defaultTruckReg.toUpperCase()) ?? null;
    return null;
  }

  const availUnits    = sortedUnits.filter((u) => u.status === "available");
  const assignedUnits = sortedUnits.filter((u) => u.status !== "available" && u.status !== "vor");
  const vorUnits      = sortedUnits.filter((u) => u.status === "vor");

  const availTrailers    = sortedTrailers.filter((t) => t.status === "available");
  const assignedTrailers = sortedTrailers.filter((t) => t.status !== "available" && t.status !== "vor");
  const vorTrailers      = sortedTrailers.filter((t) => t.status === "vor");

  function UnitRow({ unit }: { unit: FleetUnit }) {
    const driver  = unitDriver(unit.registration);
    const trailer = unitTrailer(unit);
    return (
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="mt-0.5 flex-shrink-0">{statusDot(unit.status)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-primary">{unit.registration}</span>
            {unitSpec(unit) && (
              <span className="text-[11px] text-slate-400 font-medium">{unitSpec(unit)}</span>
            )}
            {unit.status === "vor" && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700">VOR</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
            {driver
              ? <span className="font-medium text-slate-700">👤 {driver.displayName}</span>
              : <span className="text-slate-400 italic">No driver</span>
            }
            {trailer && (
              <span className="flex items-center gap-1">
                · 🔗 {trailer.registration}
                {trailerSpec(trailer) && <span className="text-slate-400">({trailerSpec(trailer)})</span>}
                {statusDot(trailer.status)}
              </span>
            )}
            {unit.yardLocation && <span className="text-slate-400">· {unit.yardLocation}</span>}
          </div>
        </div>
      </div>
    );
  }

  function TrailerRow({ trailer }: { trailer: FleetTrailer }) {
    const unit = trailerUnit(trailer);
    return (
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="mt-0.5 flex-shrink-0">{statusDot(trailer.status)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-primary">{trailer.registration}</span>
            {trailerSpec(trailer) && (
              <span className="text-[11px] text-slate-400 font-medium">{trailerSpec(trailer)}</span>
            )}
            {trailer.status === "vor" && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700">VOR</span>
            )}
            {trailer.status === "loaded" && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700">Loaded</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
            {unit
              ? <span className="font-medium text-slate-700">🚛 {unit.registration}</span>
              : <span className="text-slate-400 italic">Not attached</span>
            }
            {trailer.yardLocation && <span>· 📍 {trailer.yardLocation}</span>}
          </div>
        </div>
      </div>
    );
  }

  function SectionGroup({ label, items, renderRow }: {
    label: string;
    items: (FleetUnit | FleetTrailer)[];
    renderRow: (item: any) => React.ReactNode;
  }) {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{label}</div>
        <div className="space-y-1.5">{items.map(renderRow)}</div>
      </div>
    );
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-primary">Fleet</h2>
          <p className="text-xs text-muted">
            {units.length} unit{units.length !== 1 ? "s" : ""} · {trailers.length} trailer{trailers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button type="button" onClick={onViewMore} className="text-xs font-semibold text-accent hover:underline">Manage fleet</button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Units column */}
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Units</div>
          <SectionGroup label="Available" items={availUnits} renderRow={(u) => <UnitRow key={u.id} unit={u} />} />
          <SectionGroup label="On job" items={assignedUnits} renderRow={(u) => <UnitRow key={u.id} unit={u} />} />
          <SectionGroup label="Off road (VOR)" items={vorUnits} renderRow={(u) => <UnitRow key={u.id} unit={u} />} />
          {units.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-muted text-center">No units in fleet.</div>
          )}
        </div>

        {/* Trailers column */}
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Trailers</div>
          <SectionGroup label="Available" items={availTrailers} renderRow={(t) => <TrailerRow key={t.id} trailer={t} />} />
          <SectionGroup label="In use" items={assignedTrailers} renderRow={(t) => <TrailerRow key={t.id} trailer={t} />} />
          <SectionGroup label="Off road (VOR)" items={vorTrailers} renderRow={(t) => <TrailerRow key={t.id} trailer={t} />} />
          {trailers.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-muted text-center">No trailers in fleet.</div>
          )}
        </div>
      </div>
    </section>
  );
}

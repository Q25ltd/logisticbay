import { useState } from "react";
import { jobsApi } from "../../api/jobs";
import type { Driver, FleetTrailer, FleetUnit } from "../../types";
import { Alert } from "../../components/Alert";
import type { AssignmentInput, JobContext } from "./dashboardTypes";
import { WARNING_CLASSES } from "./dashboardConstants";
import {
  buildWarnings,
  isClosed,
  isPickup,
  loadedTrailerForJob,
  loadedTrailerStandingDetail,
  loadedTrailerStandingText,
  requiresTrailer,
  selectedTrailerForJob,
  shortLocation,
  sortedStops,
  unitByRegistration,
  warningDot,
} from "./dashboardUtils";
import { BODY_CATEGORIES, BODY_TYPES, GVW_CLASSES } from "../../constants/vehicleTaxonomy";

function labelFor(options: readonly { value: string; label: string }[], value?: string | null) {
  return value ? options.find((option) => option.value === value)?.label ?? value : "";
}

const FLEET_STATUS_LABEL: Record<string, string> = {
  available:      "Available",
  off_road:       "Off Road",
  vor:            "VOR",
  loaded:         "Loaded",
  in_use:         "In Use",
  repair:         "In Repair",
  decommissioned: "Decommissioned",
};
function fleetStatusLabel(s: string) { return FLEET_STATUS_LABEL[s] ?? (s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ")); }

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

export default function AssignDrawer({
  context,
  allContexts,
  drivers,
  units,
  trailers,
  date,
  presetDriverId,
  onClose,
  onSaved,
}: {
  context: JobContext;
  allContexts: JobContext[];
  drivers: Driver[];
  units: FleetUnit[];
  trailers: FleetTrailer[];
  date: string;
  presetDriverId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const linkedLoadedTrailer = loadedTrailerForJob(context.job, trailers);
  const initialDriver = presetDriverId ?? context.job.assignedDriverId ?? null;
  const [driverId, setDriverId] = useState(initialDriver ? String(initialDriver) : "");
  const [trailerReg, setTrailerReg] = useState(linkedLoadedTrailer?.registration || context.job.assignedTrailer || "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Stop timing state — keyed by stopId
  const [stopTimes, setStopTimes] = useState<Record<number, {
    bookedDate: string; bookedTime: string;
    earliestArrival: string; unloading: string;
  }>>(() => {
    const init: Record<number, { bookedDate: string; bookedTime: string; earliestArrival: string; unloading: string }> = {};
    for (const stop of sortedStops(context.job)) {
      if (stop.id == null) continue;
      let bDate = "", bTime = "";
      if (stop.bookedTime) {
        const d = new Date(stop.bookedTime);
        if (!Number.isNaN(d.getTime())) {
          bDate = d.toISOString().slice(0, 10);
          bTime = d.toISOString().slice(11, 16);
        }
      }
      init[stop.id] = {
        bookedDate: bDate,
        bookedTime: bTime,
        earliestArrival: stop.earliestArrivalMinutes != null ? String(stop.earliestArrivalMinutes) : "",
        unloading:        stop.unloadingAllowanceMinutes != null ? String(stop.unloadingAllowanceMinutes) : "",
      };
    }
    return init;
  });

  function setStopField(stopId: number, field: string, value: string) {
    setStopTimes(prev => ({ ...prev, [stopId]: { ...prev[stopId], [field]: value } }));
  }

  const selectedDriver = drivers.find((driver) => String(driver.id) === driverId) ?? null;
  // Unit comes from the driver's profile — not set on the job
  const driverUnit = selectedDriver?.defaultTruckReg
    ? unitByRegistration(units, selectedDriver.defaultTruckReg)
    : null;

  const openOthers = allContexts.filter((ctx) => ctx.job.id !== context.job.id && !isClosed(ctx.job));
  const driverOnOtherJob = driverId
    ? openOthers.find((ctx) => ctx.job.assignedDriverId === Number(driverId))
    : null;
  const removingDriver = context.job.assignedDriverId != null && !driverId;
  const trailerOnOtherJob = trailerReg.trim() && !linkedLoadedTrailer
    ? openOthers.find((ctx) => ctx.job.assignedTrailer?.toUpperCase() === trailerReg.trim().toUpperCase())
    : null;

  // Use driver's unit for validation purposes
  const assignment: AssignmentInput = {
    assignedDriverId: driverId ? Number(driverId) : null,
    assignedTruck: selectedDriver?.defaultTruckReg ?? "",
    assignedTrailer: trailerReg,
  };
  const warnings = buildWarnings(context.job, drivers, units, trailers, assignment);
  const nonInfoWarnings = warnings
    .filter((w) => w.level !== "info")
    .filter((w) => w.type !== "no_unit")
    .filter((w) => !(removingDriver && w.type === "no_driver"));
  const hardBlocked = warnings.some((w) => w.type === "driver_unavailable") || (!driverId && !removingDriver);
  const needsReason = nonInfoWarnings.length > 0 && !hardBlocked;
  const selectedTrailer = selectedTrailerForJob(context.job, trailers, assignment);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const stopTimesPayload = sortedStops(context.job)
        .filter((stop) => stop.id != null)
        .map((stop) => {
          const t = stopTimes[stop.id!];
          if (!t) return null;
          const bookedIso = t.bookedDate && t.bookedTime
            ? `${t.bookedDate}T${t.bookedTime}:00.000Z`
            : (t.bookedDate || t.bookedTime ? null : undefined);
          return {
            stopId: stop.id!,
            ...(bookedIso !== undefined ? { bookedTime: bookedIso } : {}),
            ...(t.earliestArrival !== "" ? { earliestArrivalMinutes: parseInt(t.earliestArrival, 10) } : {}),
            ...(t.unloading !== "" ? { unloadingAllowanceMinutes: parseInt(t.unloading, 10) } : {}),
          };
        })
        .filter(Boolean);

      await jobsApi.allocate(context.job.id, {
        assignedDriverId: driverId ? Number(driverId) : null,
        // Unit is carried from driver — pass their defaultTruckReg so it's recorded on the job
        assignedTruck:   selectedDriver?.defaultTruckReg ?? "",
        assignedTrailer: trailerReg.trim(),
        overrideReason:  reason.trim() || (removingDriver ? "Driver removed by planner. Job needs replanning." : undefined),
        ...(stopTimesPayload.length > 0 ? { stopTimes: stopTimesPayload } : {}),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save allocation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <div className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="border-b border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-primary">Allocate job</h2>
              <p className="mt-1 text-sm text-muted">{context.route}</p>
              {context.job.customerRef && (
                <p className="text-xs text-muted">Ref: {context.job.customerRef}</p>
              )}
            </div>
            <button type="button" onClick={onClose} className="btn btn-outline px-3 py-1.5 text-xs">Close</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && <Alert type="error" message={error} />}

          {/* ── Stop timing ──────────────────────────────────────── */}
          {sortedStops(context.job).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Stop times</div>
              {sortedStops(context.job).map((stop) => {
                if (stop.id == null) return null;
                const t = stopTimes[stop.id] ?? { bookedDate: "", bookedTime: "", earliestArrival: "", unloading: "" };
                return (
                  <div key={stop.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${isPickup(stop) ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
                        {isPickup(stop) ? "Collection" : "Delivery"}
                      </span>
                      <span className="text-sm font-semibold text-primary truncate">{shortLocation(stop, stop.locationTextSnapshot)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label text-[11px]">Booked date</label>
                        <input type="date" className="input text-sm"
                          value={t.bookedDate}
                          onChange={(e) => setStopField(stop.id!, "bookedDate", e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-[11px]">Booked time</label>
                        <input type="time" className="input text-sm"
                          value={t.bookedTime}
                          onChange={(e) => setStopField(stop.id!, "bookedTime", e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-[11px]">Earliest arrival (mins before)</label>
                        <input type="number" min="0" max="480" className="input text-sm"
                          placeholder="e.g. 30"
                          value={t.earliestArrival}
                          onChange={(e) => setStopField(stop.id!, "earliestArrival", e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-[11px]">{isPickup(stop) ? "Loading" : "Unloading"} allowance (mins)</label>
                        <input type="number" min="0" max="480" className="input text-sm"
                          placeholder="e.g. 60"
                          value={t.unloading}
                          onChange={(e) => setStopField(stop.id!, "unloading", e.target.value)} />
                      </div>
                    </div>
                    {stop.contactPhone && (
                      <p className="text-xs text-muted">Contact: {stop.contactPhone}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Driver ───────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Driver</div>
            <div>
              <select className="input" value={driverId} onChange={(event) => setDriverId(event.target.value)}>
                <option value="">No driver — needs replanning</option>
                {drivers.map((driver) => {
                  const onOther = openOthers.find((ctx) => ctx.job.assignedDriverId === driver.id);
                  return (
                    <option key={driver.id} value={driver.id}>
                      {driver.displayName}
                      {driver.status !== "active" ? " (unavailable)" : ""}
                      {onOther ? ` — on ${onOther.route}` : ""}
                    </option>
                  );
                })}
              </select>
              {selectedDriver && (
                <p className="mt-1 text-xs text-muted">
                  {selectedDriver.status !== "active" ? "⚠ Driver marked unavailable" :
                    selectedDriver.defaultTruckReg ? `Default unit: ${selectedDriver.defaultTruckReg}` : "No default unit set"}
                </p>
              )}
              {driverOnOtherJob && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠ This driver is currently on <strong>{driverOnOtherJob.route}</strong> (Job #{driverOnOtherJob.job.id}). Saving will move them to this job.
                </div>
              )}
              {removingDriver && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Removing the driver will clear the unit and put this job back into Needs planning. Any linked or typed trailer stays on the job.
                </div>
              )}
            </div>
          </div>

          {/* ── Driver's unit (read-only — unit belongs to driver) ── */}
          {selectedDriver && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Driver's unit</div>
              {selectedDriver.defaultTruckReg ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-primary">🚛 {selectedDriver.defaultTruckReg}</span>
                  {driverUnit && (
                    <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${driverUnit.status === "available" ? "bg-green-100 text-green-800" : driverUnit.status === "vor" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                      {unitSpec(driverUnit) || driverUnit.vehicleClass} — {fleetStatusLabel(driverUnit.status)}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-amber-700 font-semibold">⚠ No unit assigned to this driver — assign a unit to the driver from the driver panel first.</p>
              )}
            </div>
          )}

          {/* ── Trailer ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Trailer</div>
              {requiresTrailer(context.job) && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">Required</span>
              )}
            </div>
            {linkedLoadedTrailer ? (
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
                <div className="font-bold">{linkedLoadedTrailer.registration} — loaded trailer waiting</div>
                {linkedLoadedTrailer.yardLocation && <div className="mt-0.5 text-xs">Location: {linkedLoadedTrailer.yardLocation}</div>}
                <div className="mt-0.5 text-xs text-purple-700">{loadedTrailerStandingDetail(linkedLoadedTrailer)}</div>
              </div>
            ) : (
              <div>
                <input
                  className="input"
                  list="trailer-suggestions"
                  value={trailerReg}
                  onChange={(e) => setTrailerReg(e.target.value.toUpperCase())}
                  placeholder="Registration… (leave blank = driver confirms)"
                />
                <datalist id="trailer-suggestions">
                  {trailers.map((trailer) => (
                    <option key={trailer.id} value={trailer.registration}>
                      {trailer.registration} — {trailerSpec(trailer) || trailer.trailerType} — {fleetStatusLabel(trailer.status)}{trailer.yardLocation ? ` @ ${trailer.yardLocation}` : ""}
                    </option>
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-muted">
                  {selectedTrailer
                    ? `${trailerSpec(selectedTrailer) || selectedTrailer.trailerType} | ${fleetStatusLabel(selectedTrailer.status)}${selectedTrailer.yardLocation ? ` | ${selectedTrailer.yardLocation}` : ""}${selectedTrailer.status === "loaded" ? ` | ${loadedTrailerStandingText(selectedTrailer)}` : ""}`
                    : trailerReg.trim() ? "Not in fleet list — saved as entered." : "Leave blank if driver will confirm at job start."}
                </p>
                {trailerOnOtherJob && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    ⚠ Trailer <strong>{trailerReg}</strong> is currently on <strong>{trailerOnOtherJob.route}</strong> (Job #{trailerOnOtherJob.job.id}).
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── System checks ────────────────────────────────────── */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">System checks</div>
              {warnings.map((warning, index) => (
                <div key={`${warning.type}-${index}`} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${WARNING_CLASSES[warning.level]}`}>
                  {warningDot(warning.level)}
                  <span>{warning.message}</span>
                </div>
              ))}
            </div>
          )}

          {needsReason && (
            <div>
              <label className="label">Reason for override</label>
              <textarea
                className="input min-h-16"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain why this mismatch is acceptable…"
              />
            </div>
          )}
        </div>

        <div className="border-t border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {removingDriver
                ? "This job will be unassigned and flagged for planning."
                : driverOnOtherJob || trailerOnOtherJob
                ? "Driver/trailer will be swapped from the other job on save."
                : "Changes apply immediately on save."}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
              <button
                type="button"
                disabled={saving || hardBlocked || (needsReason && !reason.trim())}
                onClick={save}
                className="btn btn-primary"
              >
                {saving ? "Saving…" : removingDriver ? "Remove driver" : (driverOnOtherJob || trailerOnOtherJob) ? "Swap & save" : "Save allocation"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

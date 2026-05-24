import { useState, useEffect, useCallback } from "react";
import { planningApi, type StopCluster, type UnplannedStop, type PlanningRun, type FleetTrailer, type PlanningDriver, type RunWaypoint } from "../../api/planning";
import { aiApi } from "../../api/ai";
import { BODY_TYPES } from "../../constants/vehicleTaxonomy";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Returns "Mon 27 Jan" for an ISO datetime, comparing against the planning date */
function stopDateLabel(iso: string | null | undefined, planningDate: string): string | null {
  if (!iso) return null;
  const stopDay  = iso.slice(0, 10);
  if (stopDay === planningDate) return null; // same day — no label needed
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

const WAYPOINT_TYPE_LABEL: Record<string, string> = {
  depot_start:    "Depot start",
  yard_pickup:    "Yard pickup",
  hub_drop:       "Hub drop",
  return_to_base: "Return to base",
  custom:         "Waypoint",
};

function cap(s: string): string {
  const spaced = s.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function bodyTypeLabel(v: string): string {
  return BODY_TYPES.find(b => b.value === v)?.label ?? cap(v);
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

function prevDay(d: string): string {
  const dt = new Date(d); dt.setDate(dt.getDate() - 1); return dt.toISOString().slice(0, 10);
}
function nextDay(d: string): string {
  const dt = new Date(d); dt.setDate(dt.getDate() + 1); return dt.toISOString().slice(0, 10);
}

const STOP_TYPE_LABEL: Record<string, string> = {
  collection: "Collection", delivery: "Delivery", pickup: "Pickup",
  dropoff: "Drop-off", reload: "Reload", return: "Return", waypoint: "Waypoint", other: "Other",
};

const RUN_TYPE_LABELS: Record<string, string> = {
  direct: "Direct", relay: "Relay", split: "Split load", consolidation: "Consolidation",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ children, colour }: { children: React.ReactNode; colour: string }) {
  return <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${colour}`}>{children}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft:       "bg-slate-100 text-slate-600",
    assigned:    "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    completed:   "bg-green-100 text-green-700",
    cancelled:   "bg-red-100 text-red-600",
  };
  const label: Record<string, string> = {
    draft: "Draft", assigned: "Assigned", in_progress: "In progress",
    completed: "Done", cancelled: "Cancelled",
  };
  return <Badge colour={map[status] ?? "bg-slate-100 text-slate-600"}>{label[status] ?? status}</Badge>;
}

// ── Cluster card (left panel) ─────────────────────────────────────────────────

function ClusterCard({
  cluster,
  onAddToRun,
  runs,
  planningDate,
  allClusters,
}: {
  cluster:      StopCluster;
  onAddToRun:   (stopId: number, runId: number) => void;
  runs:         PlanningRun[];
  planningDate: string;
  allClusters:  StopCluster[];
}) {
  const [expanded, setExpanded]   = useState(false);
  const [stopRunId, setStopRunId] = useState<Record<number, number>>({});
  const [adding,    setAdding]    = useState<Record<number, boolean>>({});

  const draftRuns = runs.filter(r => r.status === "draft" || r.status === "assigned");

  async function handleAdd(stopId: number) {
    const runId = stopRunId[stopId];
    if (!runId) return;
    setAdding(p => ({ ...p, [stopId]: true }));
    try { await onAddToRun(stopId, runId); } finally { setAdding(p => ({ ...p, [stopId]: false })); }
  }

  return (
    <div className="card p-3 mb-2">
      <div className="flex items-start gap-2">
        <button
          className="flex-1 text-left"
          onClick={() => setExpanded(e => !e)}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-primary">{cluster.label}</span>
            <span className="text-xs text-muted">{cluster.stops.length} stop{cluster.stops.length !== 1 ? "s" : ""}</span>
            {cluster.totalWeightKg > 0 && (
              <span className="text-xs text-muted">{cluster.totalWeightKg.toLocaleString()} kg</span>
            )}
            {cluster.totalQty > 0 && (
              <span className="text-xs text-muted">{cluster.totalQty}{cluster.primaryQtyUnit ? " " + cap(cluster.primaryQtyUnit) : ""}</span>
            )}
            {cluster.hasTimeWindows && cluster.earliestWindow && (
              <Badge colour="bg-amber-50 text-amber-700">
                {fmtTime(cluster.earliestWindow)}–{fmtTime(cluster.latestWindow)}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted mt-0.5">
            {cluster.stops.map(s => STOP_TYPE_LABEL[s.type] ?? s.type).join(" · ")}
          </div>
        </button>
        <span className="text-slate-400 text-xs mt-0.5">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          {cluster.stops.map(stop => {
            // Companion stops: other parts of the same job that are in a DIFFERENT cluster
            const companions = allClusters
              .filter(c => c.id !== cluster.id)
              .flatMap(c => c.stops.filter(s => s.jobId === stop.jobId));

            const dateLabel = stopDateLabel(stop.timeWindowStart ?? stop.bookedTime, planningDate);

            return (
              <div key={stop.id} className="text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge colour={stop.type === "collection" || stop.type === "pickup" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}>
                    {STOP_TYPE_LABEL[stop.type] ?? stop.type}
                  </Badge>
                  <span className="font-medium text-primary">{stop.customerName ?? "—"}</span>
                  <span className="text-muted">{stop.siteName ?? stop.locationText ?? stop.postcode}</span>
                  {stop.timeWindowStart && (
                    <span className="text-amber-600">{fmtTime(stop.timeWindowStart)}–{fmtTime(stop.timeWindowEnd)}</span>
                  )}
                  {dateLabel && (
                    <span className="text-violet-600 font-semibold">📅 {dateLabel}</span>
                  )}
                </div>
                {/* Job reference + companion stops from same job */}
                <div className="flex items-center gap-2 text-muted mt-0.5 flex-wrap">
                  <span>{stop.jobReference}</span>
                  {companions.map(c => (
                    <span key={c.id} className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 text-[10px]">
                      🔗 {STOP_TYPE_LABEL[c.type] ?? c.type} also in {allClusters.find(cl => cl.stops.some(s => s.id === c.id))?.label ?? "another cluster"}
                      {c.timeWindowStart && <> · {fmtTime(c.timeWindowStart)}</>}
                    </span>
                  ))}
                </div>
                {draftRuns.length > 0 && (
                  <div className="flex gap-1.5 mt-1 items-center">
                    <select
                      className="input text-xs py-0.5 flex-1"
                      value={stopRunId[stop.id] ?? ""}
                      onChange={e => setStopRunId(p => ({ ...p, [stop.id]: parseInt(e.target.value, 10) }))}
                    >
                      <option value="">Add to run…</option>
                      {draftRuns.map(r => (
                        <option key={r.id} value={r.id}>{r.runReference}</option>
                      ))}
                    </select>
                    <button
                      disabled={!stopRunId[stop.id] || adding[stop.id]}
                      onClick={() => handleAdd(stop.id)}
                      className="btn text-xs py-0.5 px-2 bg-accent text-white disabled:opacity-40"
                    >
                      {adding[stop.id] ? "…" : "Add"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Run card (right panel) ────────────────────────────────────────────────────

function RunCard({
  run,
  trailers,
  drivers,
  allRuns,
  onUpdate,
  onRemoveStop,
  onAddWaypoint,
  onRemoveWaypoint,
  onPublish,
  onDelete,
}: {
  run:               PlanningRun;
  trailers:          FleetTrailer[];
  drivers:           PlanningDriver[];
  allRuns:           PlanningRun[];
  onUpdate:          (id: number, patch: Record<string, unknown>) => Promise<void>;
  onRemoveStop:      (runId: number, assignmentId: number) => Promise<void>;
  onAddWaypoint:     (runId: number, type: string, locationText: string, seq: number) => Promise<void>;
  onRemoveWaypoint:  (runId: number, waypointId: number) => Promise<void>;
  onPublish:         (runId: number) => Promise<void>;
  onDelete:          (runId: number) => Promise<void>;
}) {
  const [saving,    setSaving]    = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [err,       setErr]       = useState("");
  const [showWaypointForm, setShowWaypointForm] = useState(false);
  const [wpType,       setWpType]    = useState("depot_start");
  const [wpText,       setWpText]    = useState("");
  const [wpAfterIdx,   setWpAfterIdx] = useState<number>(-1); // -1 = before all, N = after assignments[N]
  const [wpAdding,     setWpAdding]  = useState(false);
  const [aiCheck,   setAiCheck]   = useState<{ ok: boolean; severity: "ok"|"warn"|"block"; reason: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Run AI feasibility check whenever stops or departure time changes
  useEffect(() => {
    if (!run.assignments.length) { setAiCheck(null); return; }
    setAiLoading(true);
    const timer = setTimeout(async () => {
      try {
        const sortedStops = [...run.assignments]
          .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
          .map(a => ({
            sequenceNumber:   a.sequenceNumber,
            type:             a.jobPart.type,
            locationText:     a.jobPart.locationTextSnapshot,
            postcode:         a.jobPart.postcode,
            lat:              a.jobPart.lat,
            lng:              a.jobPart.lng,
            timeWindowStart:  a.jobPart.timeWindowStart,
            timeWindowEnd:    a.jobPart.timeWindowEnd,
            customerName:     a.jobPart.job.customerName,
          }));
        const result = await aiApi.checkRun({
          stops:              sortedStops,
          estimatedStartTime: run.estimatedStartTime,
        });
        setAiCheck({
          ok:       !result.concern,
          severity: result.severity === "high"   ? "block" :
                    result.severity === "medium"  ? "warn"  :
                    result.severity === "low"     ? "warn"  : "ok",
          reason:   result.message,
        });
      } catch { setAiCheck(null); }
      finally  { setAiLoading(false); }
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.assignments.length, run.estimatedStartTime]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true); setErr("");
    try { await onUpdate(run.id, body); }
    catch (e: unknown) { setErr((e as Error).message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  async function handleAddWaypoint() {
    if (!wpText.trim()) return;
    setWpAdding(true);
    try {
      // Sequence number: depot_start=0, return_to_base=9999,
      // mid-route = after the chosen stop's sequenceNumber
      const sorted = [...run.assignments].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      let seq: number;
      if (wpType === "depot_start")    seq = 0;
      else if (wpType === "return_to_base") seq = 9999;
      else if (wpAfterIdx < 0)         seq = 0;        // before all
      else seq = (sorted[wpAfterIdx]?.sequenceNumber ?? 0) + 5;

      await onAddWaypoint(run.id, wpType, wpText.trim(), seq);
      setWpText(""); setShowWaypointForm(false);
    } catch (e: unknown) { setErr((e as Error).message ?? "Failed to add waypoint"); }
    finally { setWpAdding(false); }
  }

  async function handlePublish() {
    setPublishing(true); setErr("");
    try { await onPublish(run.id); }
    catch (e: unknown) { setErr((e as Error).message ?? "Publish failed"); }
    finally { setPublishing(false); }
  }

  const canPublish = run.status !== "completed" && run.status !== "cancelled" && !run.publishedToDriver;
  const dependsOnRun = allRuns.find(r => r.id === run.dependsOnRunId);
  const isLocked = !!dependsOnRun && dependsOnRun.status !== "completed";

  return (
    <div className={`card p-4 mb-3 ${isLocked ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="font-bold text-sm text-primary">{run.runReference}</span>
        <StatusBadge status={run.status} />
        {run.publishedToDriver && <Badge colour="bg-violet-100 text-violet-700">Published</Badge>}
        {isLocked && <Badge colour="bg-orange-100 text-orange-700">🔒 Waiting on {dependsOnRun?.runReference}</Badge>}
        {run.hasHazardous       && <Badge colour="bg-red-100 text-red-700">ADR</Badge>}
        {run.hasTemperatureLoad && <Badge colour="bg-cyan-100 text-cyan-700">Temp</Badge>}
        {run.hasOversized       && <Badge colour="bg-purple-100 text-purple-700">Oversized</Badge>}
        <button
          onClick={() => onDelete(run.id)}
          className="ml-auto text-xs text-red-400 hover:text-red-600"
          title="Delete run"
        >✕</button>
      </div>

      {err && <div className="text-xs text-red-600 mb-2">{err}</div>}

      {/* AI check */}
      {aiLoading && <div className="text-xs text-muted mb-2 animate-pulse">🤖 Checking route feasibility…</div>}
      {!aiLoading && aiCheck && (
        <div className={`text-xs rounded px-2 py-1.5 mb-2 ${
          aiCheck.severity === "block" ? "bg-red-50 text-red-700" :
          aiCheck.severity === "warn"  ? "bg-amber-50 text-amber-700" :
                                         "bg-green-50 text-green-700"
        }`}>
          {aiCheck.severity === "block" ? "🔴" : aiCheck.severity === "warn" ? "🟡" : "🟢"} {aiCheck.reason}
        </div>
      )}

      {/* Stops */}
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wide font-bold text-muted mb-1">Stops</div>
        {run.assignments.length === 0 ? (
          <div className="text-xs text-muted italic">No stops yet — add from the left panel</div>
        ) : (
          <>
            <div className="space-y-1">
              {run.assignments.map((a, i) => (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-center font-bold text-muted">{i + 1}</span>
                  <Badge colour={a.jobPart.type === "collection" || a.jobPart.type === "pickup" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}>
                    {STOP_TYPE_LABEL[a.jobPart.type] ?? a.jobPart.type}
                  </Badge>
                  <span className="flex-1 truncate text-primary">{a.jobPart.job.customerName ?? "—"} · {a.jobPart.locationTextSnapshot ?? a.jobPart.postcode}</span>
                  {a.jobPart.timeWindowStart && (
                    <span className="text-amber-600 flex-shrink-0">{fmtTime(a.jobPart.timeWindowStart)}</span>
                  )}
                  <button
                    onClick={() => onRemoveStop(run.id, a.id)}
                    className="text-red-400 hover:text-red-600 flex-shrink-0"
                    title="Remove"
                  >✕</button>
                </div>
              ))}
            </div>
            {/* Stop order warning */}
            {(() => {
              const sorted = [...run.assignments].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
              const COLLECTION_TYPES = new Set(["collection", "pickup"]);
              const DELIVERY_TYPES   = new Set(["delivery", "dropoff"]);
              const firstDelivery   = sorted.find(a => DELIVERY_TYPES.has(a.jobPart.type));
              const firstCollection = sorted.find(a => COLLECTION_TYPES.has(a.jobPart.type));
              const hasOrderIssue   = firstDelivery && firstCollection &&
                firstDelivery.sequenceNumber < firstCollection.sequenceNumber;
              return hasOrderIssue ? (
                <div className="mt-1.5 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-1">
                  ⚠ Delivery appears before collection — check the stop order
                </div>
              ) : null;
            })()}
          </>
        )}
      </div>

      {/* Waypoints (depot/yard/hub stops) */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] uppercase tracking-wide font-bold text-muted">Depot / yard stops</div>
          <button
            onClick={() => setShowWaypointForm(v => !v)}
            className="text-[10px] text-accent hover:underline"
          >
            {showWaypointForm ? "Cancel" : "+ Add"}
          </button>
        </div>

        {/* Existing waypoints */}
        {run.waypoints.length > 0 && (
          <div className="space-y-1 mb-1">
            {run.waypoints.map(w => (
              <div key={w.id} className="flex items-center gap-1.5 text-xs">
                <Badge colour="bg-slate-100 text-slate-600">
                  {WAYPOINT_TYPE_LABEL[w.waypointType] ?? w.waypointType}
                </Badge>
                <span className="flex-1 text-primary truncate">
                  {w.location?.siteName ?? w.location?.name ?? w.locationText ?? w.postcode ?? "—"}
                </span>
                {w.scheduledTime && <span className="text-muted flex-shrink-0">{w.scheduledTime}</span>}
                <button
                  onClick={() => onRemoveWaypoint(run.id, w.id)}
                  className="text-red-400 hover:text-red-600 flex-shrink-0"
                  title="Remove"
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Add form */}
        {showWaypointForm && (
          <div className="rounded border border-slate-200 bg-slate-50 p-2 space-y-1.5 text-xs">
            {/* Stop type */}
            <select
              className="input text-xs py-1 w-full"
              value={wpType}
              onChange={e => setWpType(e.target.value)}
            >
              <option value="depot_start">🏭 Depot start — first stop before any collections</option>
              <option value="yard_pickup">🅿 Yard pickup — collect trailer or equipment</option>
              <option value="hub_drop">🔄 Hub / transfer point — relay or consolidation</option>
              <option value="return_to_base">🏠 Return to base — last stop after all deliveries</option>
              <option value="custom">📍 Other — custom waypoint</option>
            </select>

            {/* Location */}
            <input
              type="text"
              className="input text-xs py-1 w-full"
              placeholder="Location name, e.g. Trafford Park Depot"
              value={wpText}
              onChange={e => setWpText(e.target.value)}
            />

            {/* "After which stop?" — only for mid-route types */}
            {wpType !== "depot_start" && wpType !== "return_to_base" && (
              <div>
                <label className="text-muted block mb-0.5">Place after which job stop?</label>
                <select
                  className="input text-xs py-1 w-full"
                  value={wpAfterIdx}
                  onChange={e => setWpAfterIdx(parseInt(e.target.value, 10))}
                >
                  <option value={-1}>— Before all stops (beginning of run)</option>
                  {[...run.assignments]
                    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
                    .map((a, i) => (
                      <option key={a.id} value={i}>
                        After stop {i + 1}: {STOP_TYPE_LABEL[a.jobPart.type] ?? a.jobPart.type} — {a.jobPart.job.customerName ?? a.jobPart.locationTextSnapshot ?? a.jobPart.postcode ?? "Unknown"}
                      </option>
                    ))
                  }
                </select>
              </div>
            )}

            <button
              onClick={handleAddWaypoint}
              disabled={!wpText.trim() || wpAdding}
              className="btn text-xs py-1 px-3 bg-accent text-white disabled:opacity-40 w-full"
            >
              {wpAdding ? "Adding…" : "Add stop"}
            </button>
          </div>
        )}

        {run.waypoints.length === 0 && !showWaypointForm && (
          <div className="text-[10px] text-muted italic">No depot/yard stops</div>
        )}
      </div>

      {/* Trailer — optional */}
      <div className="mb-2">
        <label className="text-[10px] uppercase tracking-wide font-bold text-muted block mb-1">
          Trailer <span className="text-[10px] text-muted font-normal normal-case">(assign now or later)</span>
        </label>
        <select
          className="input text-sm w-full"
          value={run.assignedTrailerId ?? ""}
          disabled={saving}
          onChange={e => patch({ assignedTrailerId: e.target.value ? parseInt(e.target.value, 10) : null })}
        >
          <option value="">— assign later —</option>
          {trailers.map(t => (
            <option key={t.id} value={t.id}>
              {t.registration} · {bodyTypeLabel(t.bodyType || t.trailerType)}
              {t.status !== "available" ? ` (${FLEET_STATUS_LABEL[t.status] ?? cap(t.status)})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Driver — optional */}
      <div className="mb-2">
        <label className="text-[10px] uppercase tracking-wide font-bold text-muted block mb-1">Driver</label>
        <select
          className="input text-sm w-full"
          value={run.assignedDriverId ?? ""}
          disabled={saving}
          onChange={e => patch({ assignedDriverId: e.target.value ? parseInt(e.target.value, 10) : null })}
        >
          <option value="">— assign later —</option>
          {drivers.map(d => (
            <option key={d.id} value={d.id}>{d.displayName}</option>
          ))}
        </select>
      </div>

      {/* Run type */}
      <div className="mb-2">
        <label className="text-[10px] uppercase tracking-wide font-bold text-muted block mb-1">Run type</label>
        <select
          className="input text-sm w-full"
          value={run.runType ?? "direct"}
          disabled={saving}
          onChange={e => patch({ runType: e.target.value })}
        >
          {Object.entries(RUN_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Depends on (relay) */}
      {(run.runType === "relay" || run.dependsOnRunId) && (
        <div className="mb-2">
          <label className="text-[10px] uppercase tracking-wide font-bold text-muted block mb-1">
            Locked until run completes
          </label>
          <select
            className="input text-sm w-full"
            value={run.dependsOnRunId ?? ""}
            disabled={saving}
            onChange={e => patch({ dependsOnRunId: e.target.value ? parseInt(e.target.value, 10) : null })}
          >
            <option value="">— no dependency —</option>
            {allRuns.filter(r => r.id !== run.id).map(r => (
              <option key={r.id} value={r.id}>{r.runReference} ({r.status})</option>
            ))}
          </select>
        </div>
      )}

      {/* Planner notes */}
      <div className="mb-3">
        <label className="text-[10px] uppercase tracking-wide font-bold text-muted block mb-1">Planner notes</label>
        <textarea
          className="input text-xs w-full resize-none"
          rows={2}
          placeholder="Notes for driver…"
          defaultValue={run.plannerNotes ?? ""}
          onBlur={e => { if (e.target.value !== (run.plannerNotes ?? "")) patch({ plannerNotes: e.target.value }); }}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {canPublish && (
          <button
            onClick={handlePublish}
            disabled={publishing || run.assignments.length === 0}
            className="btn text-sm px-3 py-1.5 bg-primary text-white disabled:opacity-40 flex-1"
          >
            {publishing ? "Publishing…" : "Publish to driver"}
          </button>
        )}
        {run.publishedToDriver && (
          <Badge colour="bg-green-100 text-green-700">✓ Published to driver</Badge>
        )}
        {saving && <span className="text-xs text-muted">Saving…</span>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlanningBoardPage() {
  const [date,        setDate]        = useState(todayISO());
  const [clusters,    setClusters]    = useState<StopCluster[]>([]);
  const [runs,        setRuns]        = useState<PlanningRun[]>([]);
  const [trailers,    setTrailers]    = useState<FleetTrailer[]>([]);
  const [drivers,     setDrivers]     = useState<PlanningDriver[]>([]);
  const [loadingLeft, setLoadingLeft] = useState(false);
  const [loadingRight,setLoadingRight]= useState(false);
  const [totalUnplanned, setTotalUnplanned] = useState(0);
  const [err,         setErr]         = useState("");
  const [creatingRun, setCreatingRun] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);

  const loadLeft = useCallback(async (d: string) => {
    setLoadingLeft(true);
    try {
      const res = await planningApi.getUnplanned(d);
      setClusters(res.clusters);
      setTotalUnplanned(res.total);
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setLoadingLeft(false); }
  }, []);

  const loadRight = useCallback(async (d: string) => {
    setLoadingRight(true);
    try {
      const res = await planningApi.getRuns(d);
      setRuns(res.runs);
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setLoadingRight(false); }
  }, []);

  const loadFleet = useCallback(async () => {
    try {
      const res = await planningApi.getFleet();
      setTrailers(res.trailers);
    } catch { /* non-fatal */ }
  }, []);

  const loadDrivers = useCallback(async (d: string) => {
    try {
      const res = await planningApi.getDrivers(d);
      setDrivers(res.drivers);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    loadLeft(date);
    loadRight(date);
    loadDrivers(date);
  }, [date, loadLeft, loadRight, loadDrivers]);

  useEffect(() => { loadFleet(); }, [loadFleet]);

  async function handleAddToRun(stopId: number, runId: number) {
    await planningApi.addStop(runId, stopId);
    await Promise.all([loadLeft(date), loadRight(date)]);
  }

  async function handleUpdate(runId: number, patch: Record<string, unknown>) {
    await planningApi.patchRun(runId, patch as Parameters<typeof planningApi.patchRun>[1]);
    await loadRight(date);
  }

  async function handleRemoveStop(runId: number, assignmentId: number) {
    await planningApi.removeStop(runId, assignmentId);
    await Promise.all([loadLeft(date), loadRight(date)]);
  }

  async function handlePublish(runId: number) {
    await planningApi.publish(runId);
    await loadRight(date);
  }

  async function handleAddWaypoint(runId: number, waypointType: string, locationText: string, sequenceNumber: number) {
    await planningApi.addWaypoint(runId, { waypointType, locationText, sequenceNumber });
    await loadRight(date);
  }

  async function handleRemoveWaypoint(runId: number, waypointId: number) {
    await planningApi.removeWaypoint(runId, waypointId);
    await loadRight(date);
  }

  async function handleDeleteRun(runId: number) {
    if (!window.confirm("Delete this run? Stops will return to the unplanned list.")) return;
    await planningApi.patchRun(runId, { status: "cancelled" });
    await Promise.all([loadLeft(date), loadRight(date)]);
  }

  async function handleCreateRun() {
    setCreatingRun(true);
    try {
      const run = await planningApi.createRun({ date, runType: "direct" });
      setRuns(prev => [...prev, run]);
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setCreatingRun(false); }
  }

  async function handleAiSuggest() {
    if (!clusters.length) { setErr("No unplanned stops to suggest runs for."); return; }
    setAiSuggesting(true); setErr("");
    try {
      // All unplanned stops across every cluster, keyed by stop id
      const allStops = clusters.flatMap(c => c.stops);
      const allStopMap = new Map(allStops.map(s => [s.id, s]));

      // Group ALL stops by jobId — collection + delivery of the same job must travel together
      const byJob = new Map<number, typeof allStops>();
      for (const stop of allStops) {
        if (!byJob.has(stop.jobId)) byJob.set(stop.jobId, []);
        byJob.get(stop.jobId)!.push(stop);
      }

      // Build run groups: start from each cluster's COLLECTION/PICKUP stops,
      // then pull in the matching deliveries from the same jobs (even if in another cluster).
      const assignedStopIds = new Set<number>();
      const COLLECTION_TYPES = new Set(["collection", "pickup"]);
      const DELIVERY_TYPES   = new Set(["delivery", "dropoff"]);

      for (const cluster of clusters) {
        // Skip clusters where every stop is already assigned to a run
        const unassigned = cluster.stops.filter(s => !assignedStopIds.has(s.id));
        if (!unassigned.length) continue;

        // All job IDs that appear in this cluster's unassigned stops
        const jobIds = new Set(unassigned.map(s => s.jobId));

        // Collect every stop that belongs to any of those jobs (across all clusters)
        // Sort: collections/pickups first, deliveries/dropoffs second
        const runStops = [...byJob.entries()]
          .filter(([jobId]) => jobIds.has(jobId))
          .flatMap(([, stops]) => stops)
          .filter(s => !assignedStopIds.has(s.id))
          .sort((a, b) => {
            const order = (t: string) => COLLECTION_TYPES.has(t) ? 0 : DELIVERY_TYPES.has(t) ? 1 : 2;
            return order(a.type) - order(b.type);
          });

        if (!runStops.length) continue;

        const suggestion = await aiApi.suggestVehicle({
          weight:       cluster.totalWeightKg || undefined,
          quantity:     cluster.totalQty      || undefined,
          quantityUnit: cluster.primaryQtyUnit ?? undefined,
          goodsType:    runStops[0]?.goodsType ?? undefined,
          stopCount:    runStops.length,
        });

        const run = await planningApi.createRun({
          date,
          runType:      "direct",
          plannerNotes: `AI: ${suggestion.reasoning ?? ""}`,
        });

        for (const stop of runStops) {
          try {
            await planningApi.addStop(run.id, stop.id);
            assignedStopIds.add(stop.id);
          } catch { /* skip */ }
        }
      }

      await Promise.all([loadLeft(date), loadRight(date)]);
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setAiSuggesting(false); }
  }

  return (
    <div className="h-full flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border flex-shrink-0 flex-wrap">
        <h1 className="text-xl font-bold text-primary">Planning Board</h1>

        {/* Date nav */}
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => setDate(prevDay(date))}
            className="btn px-2 py-1 text-sm border border-border bg-white hover:bg-slate-50">←</button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input text-sm px-2 py-1 w-36"
          />
          <button onClick={() => setDate(nextDay(date))}
            className="btn px-2 py-1 text-sm border border-border bg-white hover:bg-slate-50">→</button>
          <button onClick={() => setDate(todayISO())}
            className="btn px-2 py-1 text-xs border border-border bg-white hover:bg-slate-50 text-muted">Today</button>
        </div>

        <span className="text-sm text-muted ml-1">{fmtDate(date)}</span>

        <div className="ml-auto flex gap-2">
          <button
            onClick={handleAiSuggest}
            disabled={aiSuggesting || !clusters.length}
            className="btn text-sm px-3 py-1.5 border border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-40 flex items-center gap-1.5"
          >
            {aiSuggesting ? <><span className="animate-spin inline-block">⟳</span> Building runs…</> : <>🤖 Suggest all runs</>}
          </button>
          <button
            onClick={handleCreateRun}
            disabled={creatingRun}
            className="btn text-sm px-3 py-1.5 bg-primary text-white hover:opacity-90 disabled:opacity-40"
          >
            {creatingRun ? "Creating…" : "+ New run"}
          </button>
        </div>
      </div>

      {err && (
        <div className="mx-6 mt-2 p-2 bg-red-50 text-red-700 text-sm rounded flex items-center gap-2">
          <span>{err}</span>
          <button onClick={() => setErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── Two-panel layout ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left — unplanned stops */}
        <div className="w-80 flex-shrink-0 border-r border-border flex flex-col">
          <div className="px-4 py-3 border-b border-border flex-shrink-0 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Unplanned stops</div>
              <div className="text-lg font-bold text-primary">{totalUnplanned}</div>
            </div>
            {loadingLeft && <span className="text-xs text-muted animate-pulse">Loading…</span>}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {!loadingLeft && clusters.length === 0 && (
              <div className="text-center py-12 text-muted text-sm">
                <div className="text-3xl mb-2">✅</div>
                <div>All stops are planned for this date</div>
              </div>
            )}
            {clusters.map(c => (
              <ClusterCard
                key={c.id}
                cluster={c}
                runs={runs}
                onAddToRun={handleAddToRun}
                planningDate={date}
                allClusters={clusters}
              />
            ))}
          </div>
        </div>

        {/* Right — runs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex-shrink-0 flex items-center gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Runs</div>
              <div className="text-lg font-bold text-primary">{runs.length}</div>
            </div>
            {loadingRight && <span className="text-xs text-muted animate-pulse">Loading…</span>}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {!loadingRight && runs.length === 0 && (
              <div className="text-center py-16 text-muted">
                <div className="text-4xl mb-3">🚚</div>
                <div className="text-base font-medium mb-1">No runs yet for this date</div>
                <div className="text-sm mb-4">Create a run then drag stops onto it from the left panel</div>
                <button
                  onClick={handleCreateRun}
                  disabled={creatingRun}
                  className="btn text-sm px-4 py-2 bg-primary text-white hover:opacity-90"
                >
                  + Create first run
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {runs.map(run => (
                <RunCard
                  key={run.id}
                  run={run}
                  trailers={trailers}
                  drivers={drivers}
                  allRuns={runs}
                  onUpdate={handleUpdate}
                  onRemoveStop={handleRemoveStop}
                  onAddWaypoint={handleAddWaypoint}
                  onRemoveWaypoint={handleRemoveWaypoint}
                  onPublish={handlePublish}
                  onDelete={handleDeleteRun}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from "react";
import { planningApi, type StopCluster, type UnplannedStop, type PlanningRun, type FleetTrailer, type PlanningDriver, type RunWaypoint, type SavedLocationOption } from "../../api/planning";
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

/** Returns "Mon 27 Jan" when the stop date differs from the planning date */
function stopDateLabel(iso: string | null | undefined, planningDate: string): string | null {
  if (!iso) return null;
  if (iso.slice(0, 10) === planningDate) return null;
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
  collection: "Collect", delivery: "Deliver", pickup: "Pickup",
  dropoff: "Drop", reload: "Reload", return: "Return", waypoint: "Stop", other: "Other",
};

const RUN_TYPE_LABELS: Record<string, string> = {
  direct: "Direct", relay: "Relay", split: "Split load", consolidation: "Consolidation",
};

/** Format a stop's address: siteName, town, postcode — or locationText fallback */
function stopAddress(stop: UnplannedStop): string {
  const parts = [stop.siteName, stop.town, stop.postcode].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return stop.locationText ?? "—";
}

// ── Job grouping ──────────────────────────────────────────────────────────────

interface JobGroup {
  jobId:        number;
  jobReference: string | null;
  customerName: string | null;
  goodsType:    string | null;
  weight:       number | null;
  quantity:     number | null;
  quantityUnit: string | null;
  plannedDate:  string | null;   // ISO date string YYYY-MM-DD, from the job's plannedDate
  stops:        UnplannedStop[];
}

const COLLECT_FIRST = new Set(["collection", "pickup"]);

function buildJobGroups(clusters: StopCluster[]): JobGroup[] {
  const allStops = clusters.flatMap(c => c.stops);
  const byJob = new Map<number, JobGroup>();

  for (const stop of allStops) {
    if (!byJob.has(stop.jobId)) {
      byJob.set(stop.jobId, {
        jobId:        stop.jobId,
        jobReference: stop.jobReference,
        customerName: stop.customerName,
        goodsType:    stop.goodsType,
        weight:       stop.weight,
        quantity:     stop.quantity,
        quantityUnit: stop.quantityUnit,
        plannedDate:  stop.plannedDate ? (stop.plannedDate as string).slice(0, 10) : null,
        stops:        [],
      });
    }
    byJob.get(stop.jobId)!.stops.push(stop);
  }

  // Sort stops within each job: collections before deliveries
  for (const g of byJob.values()) {
    g.stops.sort((a, b) =>
      (COLLECT_FIRST.has(a.type) ? 0 : 1) - (COLLECT_FIRST.has(b.type) ? 0 : 1)
    );
  }

  // Sort groups: by plannedDate first, then time window, then customer name
  return [...byJob.values()].sort((a, b) => {
    if (a.plannedDate && b.plannedDate && a.plannedDate !== b.plannedDate)
      return a.plannedDate.localeCompare(b.plannedDate);
    const aTime = a.stops.find(s => s.timeWindowStart)?.timeWindowStart
               ?? a.stops.find(s => s.bookedTime)?.bookedTime ?? null;
    const bTime = b.stops.find(s => s.timeWindowStart)?.timeWindowStart
               ?? b.stops.find(s => s.bookedTime)?.bookedTime ?? null;
    if (aTime && bTime) return aTime.localeCompare(bTime);
    if (aTime) return -1;
    if (bTime) return 1;
    return (a.customerName ?? "").localeCompare(b.customerName ?? "");
  });
}

/** Shift an ISO date string by n days (UTC-safe). */
function addDaysToISO(d: string, n: number): string {
  const dt = new Date(d + "T12:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Client-side text search across customer name, reference, and stop addresses. */
function matchesSearch(group: JobGroup, q: string): boolean {
  const lq = q.toLowerCase();
  if ((group.customerName  ?? "").toLowerCase().includes(lq)) return true;
  if ((group.jobReference  ?? "").toLowerCase().includes(lq)) return true;
  for (const s of group.stops) {
    if ((s.siteName    ?? "").toLowerCase().includes(lq)) return true;
    if ((s.town        ?? "").toLowerCase().includes(lq)) return true;
    if ((s.postcode    ?? "").toLowerCase().includes(lq)) return true;
    if ((s.locationText ?? "").toLowerCase().includes(lq)) return true;
  }
  return false;
}

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

// ── Job card (left panel) ─────────────────────────────────────────────────────

/**
 * Per-stop row used in split mode — each stop gets its own run selector.
 */
function StopRow({
  stop,
  runs,
  planningDate,
  onAddStop,
}: {
  stop:         UnplannedStop;
  runs:         PlanningRun[];
  planningDate: string;
  onAddStop:    (stopId: number, runId: number) => Promise<void>;
}) {
  const [selectedRunId, setSelectedRunId] = useState<number | "">("");
  const [adding, setAdding] = useState(false);

  const isCollect = stop.type === "collection" || stop.type === "pickup";
  const dateLabel = stopDateLabel(stop.timeWindowStart ?? stop.bookedTime, planningDate);
  const timeStr   = stop.timeWindowStart
    ? `${fmtTime(stop.timeWindowStart)}${stop.timeWindowEnd ? `–${fmtTime(stop.timeWindowEnd)}` : ""}`
    : stop.bookedTime ? fmtTime(stop.bookedTime) : null;

  const draftRuns = runs.filter(r => r.status === "draft" || r.status === "assigned");

  async function handleAdd() {
    if (!selectedRunId) return;
    setAdding(true);
    try { await onAddStop(stop.id, Number(selectedRunId)); }
    finally { setAdding(false); }
  }

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-2 space-y-1.5">
      {/* Stop identity row */}
      <div className="flex items-start gap-1.5 text-xs">
        <div className="flex-shrink-0 mt-0.5">
          <Badge colour={isCollect ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}>
            {STOP_TYPE_LABEL[stop.type] ?? stop.type}
          </Badge>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-primary font-medium leading-tight truncate">
            {stopAddress(stop)}
          </div>
          {(timeStr || dateLabel) && (
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {timeStr  && <span className="text-amber-700 font-medium">{timeStr}</span>}
              {dateLabel && <span className="text-violet-600 font-semibold text-[10px]">📅 {dateLabel}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Per-stop run selector */}
      {draftRuns.length > 0 ? (
        <div className="flex gap-1 items-center">
          <select
            className="input text-xs py-0.5 flex-1"
            value={selectedRunId}
            onChange={e => setSelectedRunId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Add to run…</option>
            {draftRuns.map(r => (
              <option key={r.id} value={r.id}>
                {r.runReference}{r.driver ? ` — ${r.driver.displayName}` : ""}
              </option>
            ))}
          </select>
          <button
            disabled={!selectedRunId || adding}
            onClick={handleAdd}
            className="btn text-xs py-0.5 px-2 bg-accent text-white disabled:opacity-40 whitespace-nowrap"
          >
            {adding ? "…" : "Add →"}
          </button>
        </div>
      ) : (
        <div className="text-[10px] text-muted italic">No runs yet</div>
      )}
    </div>
  );
}

function JobCard({
  group,
  onAddJobToRun,
  onAddStopToRun,
  runs,
  planningDate,
  showDateBadge,
}: {
  group:           JobGroup;
  onAddJobToRun:   (jobId: number, runId: number) => Promise<void>;
  onAddStopToRun:  (stopId: number, runId: number) => Promise<void>;
  runs:            PlanningRun[];
  planningDate:    string;
  showDateBadge?:  boolean;   // true in multi-day mode to label which day each job belongs to
}) {
  const [selectedRunId, setSelectedRunId] = useState<number | "">("");
  const [adding,    setAdding]    = useState(false);
  const [splitMode, setSplitMode] = useState(false);

  const draftRuns    = runs.filter(r => r.status === "draft" || r.status === "assigned");
  const canSplit     = group.stops.length > 1;

  async function handleAdd() {
    if (!selectedRunId) return;
    setAdding(true);
    try { await onAddJobToRun(group.jobId, Number(selectedRunId)); }
    finally { setAdding(false); }
  }

  return (
    <div className="card p-3 mb-2">
      {/* Job header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-primary leading-tight">
            {group.customerName ?? "Unknown customer"}
          </div>
          <div className="text-xs text-muted mt-0.5 flex items-center gap-2 flex-wrap">
            {group.jobReference && (
              <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[10px]">{group.jobReference}</span>
            )}
            {/* Date badge — shown in multi-day mode */}
            {showDateBadge && group.plannedDate && (
              <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                📅 {new Date(group.plannedDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </span>
            )}
            {group.goodsType && (
              <Badge colour="bg-slate-100 text-slate-600">{cap(group.goodsType)}</Badge>
            )}
            {group.weight != null && group.weight > 0 && (
              <span>{group.weight.toLocaleString()} kg</span>
            )}
            {group.quantity != null && group.quantity > 0 && (
              <span>{group.quantity}{group.quantityUnit ? " " + cap(group.quantityUnit) : ""}</span>
            )}
          </div>
        </div>

        {/* Split toggle — only shown for multi-stop jobs */}
        {canSplit && (
          <button
            onClick={() => setSplitMode(v => !v)}
            className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors ${
              splitMode
                ? "border-violet-400 bg-violet-100 text-violet-700"
                : "border-slate-300 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-700"
            }`}
            title={splitMode ? "Assign all stops to one run" : "Assign stops to different runs"}
          >
            {splitMode ? "✂ Split" : "✂ Split"}
          </button>
        )}
      </div>

      {/* ── Normal mode — stops list + single run selector ── */}
      {!splitMode && (
        <>
          <div className="space-y-2 mb-3">
            {group.stops.map(stop => {
              const isCollect = stop.type === "collection" || stop.type === "pickup";
              const dateLabel = stopDateLabel(stop.timeWindowStart ?? stop.bookedTime, planningDate);
              const timeStr   = stop.timeWindowStart
                ? `${fmtTime(stop.timeWindowStart)}${stop.timeWindowEnd ? `–${fmtTime(stop.timeWindowEnd)}` : ""}`
                : stop.bookedTime ? fmtTime(stop.bookedTime) : null;

              return (
                <div key={stop.id} className="flex items-start gap-1.5 text-xs">
                  <div className="flex-shrink-0 mt-0.5">
                    <Badge colour={isCollect ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}>
                      {STOP_TYPE_LABEL[stop.type] ?? stop.type}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-primary font-medium leading-tight truncate">
                      {stopAddress(stop)}
                    </div>
                    {(timeStr || dateLabel) && (
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {timeStr  && <span className="text-amber-700 font-medium">{timeStr}</span>}
                        {dateLabel && <span className="text-violet-600 font-semibold">📅 {dateLabel}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {draftRuns.length > 0 ? (
            <div className="flex gap-1.5 items-center">
              <select
                className="input text-xs py-1 flex-1"
                value={selectedRunId}
                onChange={e => setSelectedRunId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Add all stops to run…</option>
                {draftRuns.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.runReference}{r.driver ? ` — ${r.driver.displayName}` : ""}
                  </option>
                ))}
              </select>
              <button
                disabled={!selectedRunId || adding}
                onClick={handleAdd}
                className="btn text-xs py-1 px-2.5 bg-accent text-white disabled:opacity-40 whitespace-nowrap"
              >
                {adding ? "…" : "Add all →"}
              </button>
            </div>
          ) : (
            <div className="text-[10px] text-muted italic">Create a run first to add this job</div>
          )}
        </>
      )}

      {/* ── Split mode — each stop gets its own run selector ── */}
      {splitMode && (
        <div className="space-y-2">
          <div className="text-[10px] text-violet-700 font-semibold uppercase tracking-wide mb-1">
            Assign each stop to its own run
          </div>
          {group.stops.map(stop => (
            <StopRow
              key={stop.id}
              stop={stop}
              runs={runs}
              planningDate={planningDate}
              onAddStop={onAddStopToRun}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Run card (right panel) ────────────────────────────────────────────────────

function RunCard({
  run,
  isExpanded,
  onToggleExpand,
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
  isExpanded:        boolean;
  onToggleExpand:    () => void;
  trailers:          FleetTrailer[];
  drivers:           PlanningDriver[];
  allRuns:           PlanningRun[];
  onUpdate:          (id: number, patch: Record<string, unknown>) => Promise<void>;
  onRemoveStop:      (runId: number, assignmentId: number) => Promise<void>;
  onAddWaypoint:     (runId: number, type: string, locationText: string, seq: number, locationId?: number) => Promise<void>;
  onRemoveWaypoint:  (runId: number, waypointId: number) => Promise<void>;
  onPublish:         (runId: number) => Promise<void>;
  onDelete:          (runId: number) => Promise<void>;
}) {
  const [saving,    setSaving]      = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [err,       setErr]         = useState("");

  // Waypoint form state
  const [showWpForm,   setShowWpForm]   = useState(false);
  const [wpType,       setWpType]       = useState("depot_start");
  const [wpLocationId, setWpLocationId] = useState<number | "">("");
  const [wpText,       setWpText]       = useState("");
  const [wpAfterIdx,   setWpAfterIdx]   = useState<number>(-1);
  const [wpAdding,     setWpAdding]     = useState(false);
  const [savedLocs,    setSavedLocs]    = useState<SavedLocationOption[]>([]);
  const [locsLoading,  setLocsLoading]  = useState(false);

  // AI feasibility check
  const [aiCheck,   setAiCheck]   = useState<{ severity: "ok"|"warn"|"block"; reason: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // AI route feasibility — re-runs whenever stops or start time change
  useEffect(() => {
    if (!run.assignments.length) { setAiCheck(null); return; }
    setAiLoading(true);
    const timer = setTimeout(async () => {
      try {
        const sortedStops = [...run.assignments]
          .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
          .map(a => ({
            sequenceNumber:  a.sequenceNumber,
            type:            a.jobPart.type,
            locationText:    a.jobPart.locationTextSnapshot,
            postcode:        a.jobPart.postcode,
            lat:             a.jobPart.lat,
            lng:             a.jobPart.lng,
            timeWindowStart: a.jobPart.timeWindowStart,
            timeWindowEnd:   a.jobPart.timeWindowEnd,
            customerName:    a.jobPart.job.customerName,
          }));
        const result = await aiApi.checkRun({ stops: sortedStops, estimatedStartTime: run.estimatedStartTime });
        setAiCheck({
          severity: result.severity === "high"  ? "block" :
                    result.severity === "medium" ? "warn"  :
                    result.severity === "low"    ? "warn"  : "ok",
          reason:   result.message,
        });
      } catch { setAiCheck(null); }
      finally  { setAiLoading(false); }
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.assignments.length, run.estimatedStartTime]);

  // Load saved locations lazily when the waypoint form opens for the first time
  useEffect(() => {
    if (!showWpForm || savedLocs.length > 0 || locsLoading) return;
    setLocsLoading(true);
    planningApi.getLocations()
      .then(res => setSavedLocs(res.data))
      .catch(() => {/* non-fatal */})
      .finally(() => setLocsLoading(false));
  }, [showWpForm, savedLocs.length, locsLoading]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true); setErr("");
    try { await onUpdate(run.id, body); }
    catch (e: unknown) { setErr((e as Error).message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  async function handleAddWaypoint() {
    const locationId    = wpLocationId ? Number(wpLocationId) : undefined;
    const selectedLoc   = savedLocs.find(l => l.id === locationId);
    const locationText  = selectedLoc
      ? (selectedLoc.siteName ?? selectedLoc.name)
      : wpText.trim();
    if (!locationText && !locationId) return;

    setWpAdding(true);
    try {
      const sorted = [...run.assignments].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      let seq: number;
      if      (wpType === "depot_start")    seq = 0;
      else if (wpType === "return_to_base") seq = 9999;
      else if (wpAfterIdx < 0)              seq = 0;
      else seq = (sorted[wpAfterIdx]?.sequenceNumber ?? 0) + 5;

      await onAddWaypoint(run.id, wpType, locationText, seq, locationId);
      setWpText(""); setWpLocationId(""); setShowWpForm(false);
    } catch (e: unknown) { setErr((e as Error).message ?? "Failed to add waypoint"); }
    finally { setWpAdding(false); }
  }

  async function handlePublish() {
    setPublishing(true); setErr("");
    try { await onPublish(run.id); }
    catch (e: unknown) { setErr((e as Error).message ?? "Publish failed"); }
    finally { setPublishing(false); }
  }

  const canPublish   = run.status !== "completed" && run.status !== "cancelled" && !run.publishedToDriver;
  const dependsOnRun = allRuns.find(r => r.id === run.dependsOnRunId);
  const isLocked     = !!dependsOnRun && dependsOnRun.status !== "completed";

  // Route summary shown in collapsed header
  const sortedA = [...run.assignments].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const routeSummary = run.assignments.length === 0
    ? "No stops — expand to add"
    : run.assignments.length === 1
    ? (sortedA[0]?.jobPart.job.customerName ?? sortedA[0]?.jobPart.locationTextSnapshot ?? "1 stop")
    : `${sortedA[0]?.jobPart.job.customerName ?? "?"} → ${sortedA[sortedA.length - 1]?.jobPart.job.customerName ?? "?"}`;

  const aiDot = aiLoading ? "⟳" :
    aiCheck?.severity === "block" ? "🔴" :
    aiCheck?.severity === "warn"  ? "🟡" :
    aiCheck                       ? "🟢" : null;

  const selectedLocObj = savedLocs.find(l => l.id === Number(wpLocationId));

  return (
    <div className={`card mb-3 ${isLocked ? "opacity-60" : ""}`}>

      {/* ── Always-visible collapsed header ── */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none hover:bg-slate-50 rounded-t"
        onClick={onToggleExpand}
      >
        <span className="font-bold text-sm text-primary flex-shrink-0">{run.runReference}</span>
        <StatusBadge status={run.status} />
        {run.publishedToDriver && <Badge colour="bg-violet-100 text-violet-700">Published</Badge>}
        {isLocked           && <Badge colour="bg-orange-100 text-orange-700">🔒</Badge>}
        {run.hasHazardous   && <Badge colour="bg-red-100 text-red-700">ADR</Badge>}
        {run.hasTemperatureLoad && <Badge colour="bg-cyan-100 text-cyan-700">Temp</Badge>}

        {/* Route summary */}
        <span className="text-xs text-muted flex-1 truncate min-w-0 ml-1">{routeSummary}</span>

        {/* Driver chip */}
        {run.driver && (
          <span className="text-xs text-slate-500 flex-shrink-0 hidden sm:inline">
            👤 {run.driver.displayName}
          </span>
        )}

        {/* AI dot */}
        {aiDot && <span className="flex-shrink-0 text-xs leading-none">{aiDot}</span>}

        {/* Delete */}
        <button
          onClick={e => { e.stopPropagation(); onDelete(run.id); }}
          className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 ml-1 leading-none"
          title="Delete run"
        >✕</button>

        {/* Expand/collapse arrow */}
        <span className="text-slate-400 text-xs flex-shrink-0">{isExpanded ? "▲" : "▼"}</span>
      </div>

      {/* ── Expanded body ── */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100">

          {err && <div className="text-xs text-red-600 mb-2">{err}</div>}

          {/* AI check result */}
          {aiLoading && (
            <div className="text-xs text-muted mb-2 animate-pulse">🤖 Checking route feasibility…</div>
          )}
          {!aiLoading && aiCheck && (
            <div className={`text-xs rounded px-2 py-1.5 mb-3 ${
              aiCheck.severity === "block" ? "bg-red-50 text-red-700" :
              aiCheck.severity === "warn"  ? "bg-amber-50 text-amber-700" :
                                             "bg-green-50 text-green-700"
            }`}>
              {aiCheck.severity === "block" ? "🔴" : aiCheck.severity === "warn" ? "🟡" : "🟢"} {aiCheck.reason}
            </div>
          )}

          {/* ── Stops ── */}
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wide font-bold text-muted mb-1.5">Stops</div>
            {run.assignments.length === 0 ? (
              <div className="text-xs text-muted italic">No stops yet — add from the left panel</div>
            ) : (
              <>
                <div className="space-y-1.5">
                  {run.assignments.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      <span className="w-4 text-center font-bold text-muted flex-shrink-0">{i + 1}</span>
                      <Badge colour={a.jobPart.type === "collection" || a.jobPart.type === "pickup"
                        ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}>
                        {STOP_TYPE_LABEL[a.jobPart.type] ?? a.jobPart.type}
                      </Badge>
                      <span className="font-medium text-primary truncate flex-1 min-w-0">
                        {a.jobPart.job.customerName ?? "—"}
                      </span>
                      <span className="text-muted truncate hidden sm:inline">
                        {a.jobPart.locationTextSnapshot ?? a.jobPart.postcode ?? ""}
                      </span>
                      {a.jobPart.timeWindowStart && (
                        <span className="text-amber-600 flex-shrink-0">{fmtTime(a.jobPart.timeWindowStart)}</span>
                      )}
                      <button
                        onClick={() => onRemoveStop(run.id, a.id)}
                        className="text-red-400 hover:text-red-600 flex-shrink-0"
                        title="Remove stop"
                      >✕</button>
                    </div>
                  ))}
                </div>
                {/* Delivery-before-collection warning */}
                {(() => {
                  const sorted = [...run.assignments].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
                  const DELIVER = new Set(["delivery", "dropoff"]);
                  const COLLECT = new Set(["collection", "pickup"]);
                  const fd = sorted.find(a => DELIVER.has(a.jobPart.type));
                  const fc = sorted.find(a => COLLECT.has(a.jobPart.type));
                  if (fd && fc && fd.sequenceNumber < fc.sequenceNumber) {
                    return (
                      <div className="mt-1.5 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-1">
                        ⚠ Delivery appears before collection — check the stop order
                      </div>
                    );
                  }
                  return null;
                })()}
              </>
            )}
          </div>

          {/* ── Depot / yard stops ── */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-wide font-bold text-muted">Depot / yard stops</div>
              <button
                onClick={() => setShowWpForm(v => !v)}
                className="text-[10px] text-accent hover:underline"
              >
                {showWpForm ? "Cancel" : "+ Add"}
              </button>
            </div>

            {run.waypoints.length > 0 && (
              <div className="space-y-1 mb-1.5">
                {run.waypoints.map((w: RunWaypoint) => (
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

            {showWpForm && (
              <div className="rounded border border-slate-200 bg-slate-50 p-2.5 space-y-2 text-xs">
                {/* Type */}
                <select
                  className="input text-xs py-1 w-full"
                  value={wpType}
                  onChange={e => setWpType(e.target.value)}
                >
                  <option value="depot_start">🏭 Depot start — first stop before collections</option>
                  <option value="yard_pickup">🅿 Yard pickup — collect trailer or equipment</option>
                  <option value="hub_drop">🔄 Hub / transfer point — relay or consolidation</option>
                  <option value="return_to_base">🏠 Return to base — last stop after all deliveries</option>
                  <option value="custom">📍 Other — custom waypoint</option>
                </select>

                {/* Location — saved location picker + free text fallback */}
                <div>
                  <label className="text-muted block mb-1">Location</label>
                  {locsLoading && (
                    <div className="text-muted animate-pulse text-[11px]">Loading saved locations…</div>
                  )}
                  {!locsLoading && savedLocs.length > 0 && (
                    <select
                      className="input text-xs py-1 w-full"
                      value={wpLocationId}
                      onChange={e => {
                        setWpLocationId(e.target.value ? Number(e.target.value) : "");
                        setWpText("");
                      }}
                    >
                      <option value="">— pick a saved location, or type below —</option>
                      {savedLocs.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name}{l.town ? ` · ${l.town}` : ""}{l.postcode ? ` · ${l.postcode}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedLocObj && (
                    <div className="text-[10px] text-muted mt-0.5">
                      {[selectedLocObj.siteName, selectedLocObj.town, selectedLocObj.postcode].filter(Boolean).join(", ")}
                    </div>
                  )}
                  {!wpLocationId && (
                    <input
                      type="text"
                      className={`input text-xs py-1 w-full ${savedLocs.length > 0 ? "mt-1.5" : ""}`}
                      placeholder="Location name, e.g. Trafford Park Depot"
                      value={wpText}
                      onChange={e => setWpText(e.target.value)}
                    />
                  )}
                </div>

                {/* After which stop? — only for mid-route types */}
                {wpType !== "depot_start" && wpType !== "return_to_base" && run.assignments.length > 0 && (
                  <div>
                    <label className="text-muted block mb-1">Place after which job stop?</label>
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
                            After {i + 1}: {STOP_TYPE_LABEL[a.jobPart.type] ?? a.jobPart.type} — {a.jobPart.job.customerName ?? a.jobPart.locationTextSnapshot ?? "Unknown"}
                          </option>
                        ))
                      }
                    </select>
                  </div>
                )}

                <button
                  onClick={handleAddWaypoint}
                  disabled={(!wpText.trim() && !wpLocationId) || wpAdding}
                  className="btn text-xs py-1 px-3 bg-accent text-white disabled:opacity-40 w-full"
                >
                  {wpAdding ? "Adding…" : "Add stop"}
                </button>
              </div>
            )}

            {run.waypoints.length === 0 && !showWpForm && (
              <div className="text-[10px] text-muted italic">No depot/yard stops added</div>
            )}
          </div>

          {/* ── Trailer ── */}
          <div className="mb-2">
            <label className="text-[10px] uppercase tracking-wide font-bold text-muted block mb-1">
              Trailer <span className="text-[10px] font-normal normal-case">(assign now or later)</span>
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

          {/* ── Driver ── */}
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

          {/* ── Run type ── */}
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

          {/* ── Relay dependency ── */}
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

          {/* ── Planner notes ── */}
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

          {/* ── Actions ── */}
          <div className="flex gap-2 flex-wrap items-center">
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
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const LOOK_AHEAD_OPTIONS = [
  { days: 0,  label: "1 day"   },
  { days: 2,  label: "3 days"  },
  { days: 6,  label: "7 days"  },
  { days: 13, label: "2 weeks" },
];

export default function PlanningBoardPage() {
  const [date,           setDate]           = useState(todayISO());
  const [lookAheadDays,  setLookAheadDays]  = useState(0);
  const [search,         setSearch]         = useState("");
  const [clusters,       setClusters]       = useState<StopCluster[]>([]);
  const [runs,           setRuns]           = useState<PlanningRun[]>([]);
  const [trailers,       setTrailers]       = useState<FleetTrailer[]>([]);
  const [drivers,        setDrivers]        = useState<PlanningDriver[]>([]);
  const [loadingLeft,    setLoadingLeft]    = useState(false);
  const [loadingRight,   setLoadingRight]   = useState(false);
  const [totalUnplanned, setTotalUnplanned] = useState(0);
  const [err,            setErr]            = useState("");
  const [mobileTab,      setMobileTab]      = useState<"jobs" | "runs">("jobs");
  const [creatingRun,    setCreatingRun]    = useState(false);
  const [aiSuggesting,   setAiSuggesting]   = useState(false);

  // Collapse state for run cards, keyed by run ID.
  // Kept in the parent so it survives data refreshes — local state in RunCard
  // would reset to the initializer value every time the runs array updates.
  // undefined = use default (collapsed when has stops, expanded when empty).
  // expandedRunIds: the set of run IDs that the user has explicitly opened.
  // All runs default to collapsed. We auto-add new runs so they open immediately.
  const [expandedRunIds, setExpandedRunIds] = useState<Set<number>>(new Set());

  function isRunExpanded(runId: number): boolean {
    return expandedRunIds.has(runId);
  }

  function toggleRunExpand(runId: number) {
    setExpandedRunIds(prev => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId); else next.add(runId);
      return next;
    });
  }

  function autoExpand(runId: number) {
    setExpandedRunIds(prev => new Set(prev).add(runId));
  }

  // End date of the unplanned window (date + lookAheadDays)
  const dateTo = useMemo(() => addDaysToISO(date, lookAheadDays), [date, lookAheadDays]);

  // Derive job groups from clusters, then apply text search filter
  const allJobGroups     = useMemo(() => buildJobGroups(clusters), [clusters]);
  const jobGroups        = useMemo(
    () => search.trim() ? allJobGroups.filter(g => matchesSearch(g, search.trim())) : allJobGroups,
    [allJobGroups, search],
  );

  const loadLeft = useCallback(async (d: string, to: string) => {
    setLoadingLeft(true);
    try {
      const res = await planningApi.getUnplanned(d, to);
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
    loadLeft(date, dateTo);
    loadRight(date);
    loadDrivers(date);
  }, [date, dateTo, loadLeft, loadRight, loadDrivers]);

  useEffect(() => { loadFleet(); }, [loadFleet]);

  /** Add all stops of a job to one run (normal mode) */
  async function handleAddJobToRun(jobId: number, runId: number) {
    const allStops = clusters.flatMap(c => c.stops);
    const jobStops = allStops
      .filter(s => s.jobId === jobId)
      .sort((a, b) => (COLLECT_FIRST.has(a.type) ? 0 : 1) - (COLLECT_FIRST.has(b.type) ? 0 : 1));
    for (const stop of jobStops) {
      try { await planningApi.addStop(runId, stop.id); } catch { /* skip already-assigned */ }
    }
    await Promise.all([loadLeft(date, dateTo), loadRight(date)]);
    setMobileTab("runs");
  }

  /** Add a single stop to a run (split mode) */
  async function handleAddStopToRun(stopId: number, runId: number) {
    try { await planningApi.addStop(runId, stopId); } catch { /* skip already-assigned */ }
    await Promise.all([loadLeft(date, dateTo), loadRight(date)]);
    setMobileTab("runs");
  }

  async function handleUpdate(runId: number, patch: Record<string, unknown>) {
    await planningApi.patchRun(runId, patch as Parameters<typeof planningApi.patchRun>[1]);
    await loadRight(date);
  }

  async function handleRemoveStop(runId: number, assignmentId: number) {
    await planningApi.removeStop(runId, assignmentId);
    await Promise.all([loadLeft(date, dateTo), loadRight(date)]);
  }

  async function handlePublish(runId: number) {
    await planningApi.publish(runId);
    await loadRight(date);
  }

  async function handleAddWaypoint(
    runId: number, waypointType: string, locationText: string,
    sequenceNumber: number, locationId?: number,
  ) {
    await planningApi.addWaypoint(runId, { waypointType, locationText, sequenceNumber, locationId });
    await loadRight(date);
  }

  async function handleRemoveWaypoint(runId: number, waypointId: number) {
    await planningApi.removeWaypoint(runId, waypointId);
    await loadRight(date);
  }

  async function handleDeleteRun(runId: number) {
    if (!window.confirm("Delete this run? Stops will return to the unplanned list.")) return;
    await planningApi.patchRun(runId, { status: "cancelled" });
    await Promise.all([loadLeft(date, dateTo), loadRight(date)]);
  }

  async function handleCreateRun() {
    setCreatingRun(true);
    try {
      const run = await planningApi.createRun({ date, runType: "direct" });
      setRuns(prev => [...prev, run]);
      autoExpand(run.id); // open the new run immediately so the planner can fill it
      setMobileTab("runs"); // switch to the Runs tab on mobile so the new run is visible
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setCreatingRun(false); }
  }

  async function handleAiSuggest() {
    if (!clusters.length) { setErr("No unplanned stops to suggest runs for."); return; }
    setAiSuggesting(true); setErr("");
    try {
      const allStops   = clusters.flatMap(c => c.stops);
      const byJob      = new Map<number, typeof allStops>();
      for (const stop of allStops) {
        if (!byJob.has(stop.jobId)) byJob.set(stop.jobId, []);
        byJob.get(stop.jobId)!.push(stop);
      }

      const assignedStopIds = new Set<number>();
      const DELIVERY_TYPES  = new Set(["delivery", "dropoff"]);

      for (const cluster of clusters) {
        const unassigned = cluster.stops.filter(s => !assignedStopIds.has(s.id));
        if (!unassigned.length) continue;

        const jobIds   = new Set(unassigned.map(s => s.jobId));
        const runStops = [...byJob.entries()]
          .filter(([jobId]) => jobIds.has(jobId))
          .flatMap(([, stops]) => stops)
          .filter(s => !assignedStopIds.has(s.id))
          .sort((a, b) => {
            const order = (t: string) => COLLECT_FIRST.has(t) ? 0 : DELIVERY_TYPES.has(t) ? 1 : 2;
            return order(a.type) - order(b.type);
          });

        if (!runStops.length) continue;

        const suggestion = await aiApi.suggestRunTrailer({
          weight:       cluster.totalWeightKg || undefined,
          quantity:     cluster.totalQty      || undefined,
          quantityUnit: cluster.primaryQtyUnit ?? undefined,
          goodsType:    runStops[0]?.goodsType ?? undefined,
          stopCount:    runStops.length,
        });

        const run = await planningApi.createRun({
          date,
          runType:            "direct",
          plannerNotes:       `AI: ${suggestion.reasoning ?? ""}`,
          assignedTrailerId:  suggestion.trailerId ?? undefined,
        });

        for (const stop of runStops) {
          try {
            await planningApi.addStop(run.id, stop.id);
            assignedStopIds.add(stop.id);
          } catch { /* skip */ }
        }
      }

      await Promise.all([loadLeft(date, dateTo), loadRight(date)]);
      setMobileTab("runs"); // switch to runs tab so the user can see the created runs
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setAiSuggesting(false); }
  }

  return (
    <div className="h-full flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-3 sm:py-4 border-b border-border flex-shrink-0 flex-wrap">
        <h1 className="text-base sm:text-xl font-bold text-primary">Planning</h1>

        <div className="flex items-center gap-1">
          <button onClick={() => setDate(prevDay(date))}
            className="btn px-2 py-1 text-sm border border-border bg-white hover:bg-slate-50">←</button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input text-sm px-2 py-1 w-32 sm:w-36"
          />
          <button onClick={() => setDate(nextDay(date))}
            className="btn px-2 py-1 text-sm border border-border bg-white hover:bg-slate-50">→</button>
          <button onClick={() => setDate(todayISO())}
            className="btn px-2 py-1 text-xs border border-border bg-white hover:bg-slate-50 text-muted">Today</button>
        </div>

        <span className="hidden sm:inline text-sm text-muted">{fmtDate(date)}</span>

        <div className="ml-auto flex gap-1.5 sm:gap-2">
          <button
            onClick={handleAiSuggest}
            disabled={aiSuggesting || !clusters.length}
            className="btn text-xs sm:text-sm px-2 sm:px-3 py-1.5 border border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-40 flex items-center gap-1"
          >
            {aiSuggesting
              ? <><span className="animate-spin inline-block">⟳</span><span className="hidden sm:inline"> Building…</span></>
              : <><span>🤖</span><span className="hidden sm:inline"> Suggest runs</span></>
            }
          </button>
          <button
            onClick={handleCreateRun}
            disabled={creatingRun}
            className="btn text-xs sm:text-sm px-2 sm:px-3 py-1.5 bg-primary text-white hover:opacity-90 disabled:opacity-40"
          >
            {creatingRun ? "…" : "+ Run"}
          </button>
        </div>
      </div>

      {err && (
        <div className="mx-3 sm:mx-6 mt-2 p-2 bg-red-50 text-red-700 text-sm rounded flex items-center gap-2">
          <span>{err}</span>
          <button onClick={() => setErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── Mobile tab bar ── */}
      <div className="sm:hidden flex border-b border-border flex-shrink-0 bg-white">
        <button
          onClick={() => setMobileTab("jobs")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            mobileTab === "jobs"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-primary"
          }`}
        >
          Jobs{jobGroups.length > 0 ? ` (${jobGroups.length})` : ""}
        </button>
        <button
          onClick={() => setMobileTab("runs")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            mobileTab === "runs"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-primary"
          }`}
        >
          Runs{runs.length > 0 ? ` (${runs.length})` : ""}
        </button>
      </div>

      {/* ── Two-panel layout ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left — jobs to plan ── */}
        <div className={`${mobileTab === "jobs" ? "flex" : "hidden"} sm:flex flex-col w-full sm:w-80 flex-shrink-0 sm:border-r border-border`}>

          {/* Panel header: count + loading */}
          <div className="px-3 pt-3 pb-2 border-b border-border flex-shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Jobs to plan</div>
                <div className="text-lg font-bold text-primary leading-tight">
                  {jobGroups.length}
                  {allJobGroups.length !== jobGroups.length && (
                    <span className="text-sm font-normal text-muted ml-1">of {allJobGroups.length}</span>
                  )}
                  {allJobGroups.length !== totalUnplanned && jobGroups.length === allJobGroups.length && (
                    <span className="text-sm font-normal text-muted ml-1">({totalUnplanned} stops)</span>
                  )}
                </div>
              </div>
              {loadingLeft && <span className="text-xs text-muted animate-pulse">Loading…</span>}
            </div>

            {/* Search input */}
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
              <input
                type="search"
                placeholder="Search customer, ref, location…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input text-xs py-1.5 pl-7 pr-2 w-full"
              />
            </div>

            {/* Look-ahead day selector */}
            <div className="flex gap-1">
              {LOOK_AHEAD_OPTIONS.map(opt => (
                <button
                  key={opt.days}
                  onClick={() => setLookAheadDays(opt.days)}
                  className={`flex-1 text-[10px] font-semibold py-1 rounded border transition-colors ${
                    lookAheadDays === opt.days
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-slate-500 border-slate-300 hover:border-primary hover:text-primary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {!loadingLeft && jobGroups.length === 0 && (
              <div className="text-center py-12 text-muted text-sm">
                <div className="text-3xl mb-2">{search ? "🔍" : "✅"}</div>
                <div>{search ? "No jobs match your search" : "All jobs are planned for this period"}</div>
                {search && (
                  <button onClick={() => setSearch("")} className="mt-2 text-xs text-accent hover:underline">
                    Clear search
                  </button>
                )}
              </div>
            )}
            {jobGroups.map(group => (
              <JobCard
                key={group.jobId}
                group={group}
                runs={runs}
                onAddJobToRun={handleAddJobToRun}
                onAddStopToRun={handleAddStopToRun}
                planningDate={date}
                showDateBadge={lookAheadDays > 0}
              />
            ))}
          </div>
        </div>

        {/* ── Right — runs ── */}
        <div className={`${mobileTab === "runs" ? "flex" : "hidden"} sm:flex flex-1 flex-col overflow-hidden`}>
          <div className="px-4 py-3 border-b border-border flex-shrink-0 flex items-center gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Runs</div>
              <div className="text-lg font-bold text-primary">{runs.length}</div>
            </div>
            {loadingRight && <span className="text-xs text-muted animate-pulse">Loading…</span>}
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {!loadingRight && runs.length === 0 && (
              <div className="text-center py-16 text-muted">
                <div className="text-4xl mb-3">🚚</div>
                <div className="text-base font-medium mb-1">No runs yet for this date</div>
                <div className="text-sm mb-4">Create a run, then add jobs from the Jobs tab</div>
                <button
                  onClick={handleCreateRun}
                  disabled={creatingRun}
                  className="btn text-sm px-4 py-2 bg-primary text-white hover:opacity-90"
                >
                  + Create first run
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {runs.map(run => (
                <RunCard
                  key={run.id}
                  run={run}
                  isExpanded={isRunExpanded(run.id)}
                  onToggleExpand={() => toggleRunExpand(run.id)}
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

import { useState, useEffect, useCallback, useMemo } from "react";
import { planningApi, type StopCluster, type UnplannedStop, type PlanningRun, type FleetTrailer, type FleetUnit, type PlanningDriver, type RunWaypoint, type SavedLocationOption, type DepotLocation } from "../../api/planning";
import { api } from "../../api/client";
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
  custom:         "Stop",
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

function JobCard({
  group,
  onAddJobToRun,
  runs,
  planningDate,
  showDateBadge,
}: {
  group:          JobGroup;
  onAddJobToRun:  (jobId: number, runId: number) => Promise<void>;
  runs:           PlanningRun[];
  planningDate:   string;
  showDateBadge?: boolean;
}) {
  const [selectedRunId, setSelectedRunId] = useState<number | "">("");
  const [adding, setAdding] = useState(false);

  const draftRuns = runs.filter(r => r.status === "draft" || r.status === "assigned");

  async function handleAdd() {
    if (!selectedRunId) return;
    setAdding(true);
    try { await onAddJobToRun(group.jobId, Number(selectedRunId)); }
    finally { setAdding(false); }
  }

  return (
    <div className="card p-3 mb-2">
      {/* Header */}
      <div className="mb-2">
        <div className="font-bold text-sm text-primary leading-tight">
          {group.customerName ?? "Unknown customer"}
        </div>
        <div className="text-xs text-muted mt-0.5 flex items-center gap-2 flex-wrap">
          {group.jobReference && (
            <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[10px]">{group.jobReference}</span>
          )}
          {showDateBadge && group.plannedDate && (
            <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">
              {new Date(group.plannedDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
            </span>
          )}
          {group.goodsType && <Badge colour="bg-slate-100 text-slate-600">{cap(group.goodsType)}</Badge>}
          {group.weight   != null && group.weight   > 0 && <span>{group.weight.toLocaleString()} kg</span>}
          {group.quantity != null && group.quantity > 0 && (
            <span>{group.quantity}{group.quantityUnit ? " " + cap(group.quantityUnit) : ""}</span>
          )}
        </div>
      </div>

      {/* Stops */}
      <div className="space-y-1.5 mb-3">
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
                <div className="text-primary font-medium leading-tight truncate">{stopAddress(stop)}</div>
                {(timeStr || dateLabel) && (
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {timeStr   && <span className="text-amber-700 font-medium">{timeStr}</span>}
                    {dateLabel && <span className="text-violet-600 font-semibold">📅 {dateLabel}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add to run */}
      {draftRuns.length > 0 ? (
        <div className="flex gap-1.5 items-center">
          <select
            className="input text-xs py-1 flex-1"
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
            className="btn text-xs py-1 px-2.5 bg-accent text-white disabled:opacity-40 whitespace-nowrap"
          >
            {adding ? "…" : "Add →"}
          </button>
        </div>
      ) : (
        <div className="text-[10px] text-muted italic">Create a run first to add this job</div>
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
  trucks,
  drivers,
  depot,
  onDepotSet,
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
  trucks:            FleetUnit[];
  drivers:           PlanningDriver[];
  depot:             DepotLocation | null;
  onDepotSet:        (d: DepotLocation) => void;
  allRuns:           PlanningRun[];
  onUpdate:          (id: number, patch: Record<string, unknown>) => Promise<void>;
  onRemoveStop:      (runId: number, assignmentId: number) => Promise<void>;
  onAddWaypoint:     (runId: number, type: string, locationText: string, seq: number, locationId?: number, scheduledTime?: string) => Promise<void>;
  onRemoveWaypoint:  (runId: number, waypointId: number) => Promise<void>;
  onPublish:         (runId: number) => Promise<void>;
  onDelete:          (runId: number) => Promise<void>;
}) {
  const [saving,    setSaving]      = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [err,       setErr]         = useState("");

  // Waypoint form state
  const [showWpForm, setShowWpForm] = useState(false);
  // wpPosition: -2 = before all stops (depot start), -1 = after all stops (return to base), 0..n = intermediate
  const [wpPosition, setWpPosition] = useState<number>(-2);
  const [wpTime,     setWpTime]     = useState("");
  const [wpAdding,   setWpAdding]   = useState(false);

  // Unified waypoint location state — picker-first for all positions
  const [wpLocId,       setWpLocId]       = useState<number | "">("");
  const [wpShowCreate,  setWpShowCreate]  = useState(false);
  const [wpNewName,     setWpNewName]     = useState("");
  const [wpNewStreet,   setWpNewStreet]   = useState("");
  const [wpNewTown,     setWpNewTown]     = useState("");
  const [wpNewPostcode, setWpNewPostcode] = useState("");
  const [wpNewLat,      setWpNewLat]      = useState("");
  const [wpNewLng,      setWpNewLng]      = useState("");
  const [wpGeoLoading,  setWpGeoLoading]  = useState(false);
  const [savedLocs,     setSavedLocs]     = useState<SavedLocationOption[]>([]);
  const [locsLoading,   setLocsLoading]   = useState(false);

  // AI route feasibility check
  const [aiCheck,   setAiCheck]   = useState<{ severity: "ok"|"warn"|"block"; reason: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Derived dep: joined waypoint scheduled times so effect re-fires when a time changes
  const wpTimesKey = run.waypoints.map(w => `${w.id}:${w.scheduledTime ?? ""}`).sort().join("|");

  useEffect(() => {
    if (!run.assignments.length && !run.waypoints.length) { setAiCheck(null); return; }
    setAiLoading(true);
    const timer = setTimeout(async () => {
      try {
        // Assignment stops
        const assignmentStops = [...run.assignments]
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

        // plannedDate comes back from the API as a full ISO datetime ("2026-05-25T12:00:00.000Z")
        // — we only want the YYYY-MM-DD date part so we can build valid ISO datetimes.
        const planDate = run.plannedDate ? run.plannedDate.slice(0, 10) : null;

        // Waypoint stops — convert HH:MM scheduledTime to ISO using planDate
        // Coordinates may be on the linked location record rather than the waypoint itself
        const waypointStops = [...run.waypoints]
          .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
          .map(w => ({
            sequenceNumber:  w.sequenceNumber,
            type:            w.waypointType,
            locationText:    w.location?.siteName ?? w.location?.name ?? w.locationText ?? null,
            postcode:        w.postcode ?? w.location?.postcode ?? null,
            lat:             w.lat ?? w.location?.lat ?? null,
            lng:             w.lng ?? w.location?.lng ?? null,
            timeWindowStart: w.scheduledTime && planDate
              ? `${planDate}T${w.scheduledTime}:00Z`
              : null,
            timeWindowEnd:   null,
            customerName:    null,
          }));

        const allStops = [...assignmentStops, ...waypointStops]
          .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

        // Derive vehicle dimensions from assigned truck + trailer
        const truck   = run.assignedTruckId   ? trucks.find(t => t.id === run.assignedTruckId)     : null;
        const trailer = run.assignedTrailerId  ? trailers.find(t => t.id === run.assignedTrailerId) : null;

        // GVW: parse from truck's gvwClass string e.g. "44t" → 44, "7.5t" → 7.5
        const gvwT = truck?.gvwClass ? parseFloat(truck.gvwClass) || null : null;

        // Height: taller of truck or trailer (trailer is usually the restriction)
        const heightM = Math.max(
          truck?.heightM ?? 0,
          trailer?.heightM ?? 0,
        ) || null;

        // Width: wider of the two
        const widthM = Math.max(
          truck?.widthM ?? 0,
          trailer?.widthM ?? 0,
        ) || null;

        // Length: cab + trailer
        const lengthM = (truck?.lengthM ?? 0) + (trailer?.lengthM ?? 0) || null;

        // Axle load: stricter of the two
        const axleLoadT = Math.max(
          truck?.axleLoadT ?? 0,
          trailer?.axleLoadT ?? 0,
        ) || null;

        const vehicle = (gvwT || heightM || widthM || lengthM || axleLoadT)
          ? { weightT: gvwT, heightM, widthM, lengthM, axleLoadT }
          : null;

        // Use run's estimatedStartTime, or fall back to the depot_start waypoint's scheduledTime
        const depotStart = run.waypoints.find(w => w.waypointType === "depot_start");
        const departureTime = run.estimatedStartTime
          ?? (depotStart?.scheduledTime && planDate
              ? `${planDate}T${depotStart.scheduledTime}:00Z`
              : null);

        const result = await aiApi.checkRun({ stops: allStops, estimatedStartTime: departureTime, vehicle });
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
  }, [run.assignments.length, run.waypoints.length, wpTimesKey, run.estimatedStartTime]);

  // Auto-fill lat/lng from postcode using postcodes.io (free, no key)
  async function geocodePostcode() {
    const pc = wpNewPostcode.trim().replace(/\s+/g, "").toUpperCase();
    if (!pc) return;
    setWpGeoLoading(true);
    try {
      const res  = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
      const data = await res.json() as { result?: { latitude: number; longitude: number } };
      if (data.result) {
        setWpNewLat(String(data.result.latitude));
        setWpNewLng(String(data.result.longitude));
      }
    } catch { /* non-fatal */ }
    finally { setWpGeoLoading(false); }
  }

  // Load saved locations — called when form opens (user-triggered, never on mount)
  async function loadSavedLocs() {
    if (savedLocs.length > 0) return; // already loaded
    setLocsLoading(true);
    try {
      const res = await planningApi.getLocations();
      setSavedLocs(res.data);
      if (res.data.length === 0) setWpShowCreate(true); // no locations yet → go straight to create
    } catch { /* non-fatal */ }
    finally { setLocsLoading(false); }
  }

  // When position changes while form is open: reset selection, pre-select depot for start/end
  useEffect(() => {
    if (!showWpForm) return;
    setWpShowCreate(false);
    setWpLocId((wpPosition === -2 || wpPosition === -1) ? (depot?.id ?? "") : "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wpPosition]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true); setErr("");
    try { await onUpdate(run.id, body); }
    catch (e: unknown) { setErr((e as Error).message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  async function handleAddWaypoint() {
    setWpAdding(true);
    try {
      // ── Sequence & waypoint type ──────────────────────────────────────────
      let seq: number;
      let waypointType: string;
      if (wpPosition === -2) {
        seq = 0; waypointType = "depot_start";
      } else if (wpPosition === -1) {
        seq = 999999; waypointType = "return_to_base";
      } else {
        const allItems = [
          ...run.assignments.map(a => ({ seq: a.sequenceNumber })),
          ...run.waypoints.map(w => ({ seq: w.sequenceNumber })),
        ].sort((a, b) => a.seq - b.seq);
        const prevSeq = allItems[wpPosition]?.seq ?? 0;
        const nextSeq = allItems[wpPosition + 1]?.seq;
        seq = nextSeq != null ? Math.round((prevSeq + nextSeq) / 2) : prevSeq + 1000;
        waypointType = "custom";
      }

      // ── Location ──────────────────────────────────────────────────────────
      let locationId: number | undefined;
      let locationText = "";
      const isDepotStop = wpPosition === -2 || wpPosition === -1;

      if (wpShowCreate) {
        // Create a brand new saved location
        if (!wpNewName.trim() || !wpNewStreet.trim()) return;
        const newLoc = await api.post<any>("/locations", {
          name:     wpNewName.trim(),
          street:   wpNewStreet.trim(),
          town:     wpNewTown.trim() || undefined,
          postcode: wpNewPostcode.trim() || undefined,
          lat:      wpNewLat ? parseFloat(wpNewLat) : undefined,
          lng:      wpNewLng ? parseFloat(wpNewLng) : undefined,
        });
        locationId   = newLoc.id;
        locationText = newLoc.siteName ?? newLoc.name;
        setSavedLocs(prev => [...prev, { id: newLoc.id, name: newLoc.name, siteName: newLoc.siteName, town: newLoc.town ?? null, postcode: newLoc.postcode ?? null }]);
        // Depot stop: set this new location as company depot
        if (isDepotStop) {
          await api.patch<any>("/company", { depotLocationId: newLoc.id });
          onDepotSet({ id: newLoc.id, name: newLoc.name, siteName: newLoc.siteName ?? null, town: newLoc.town ?? null, postcode: newLoc.postcode ?? null, lat: newLoc.lat ?? null, lng: newLoc.lng ?? null });
        }
      } else {
        // Pick from existing saved locations
        if (!wpLocId) return;
        locationId = Number(wpLocId);
        const sel = savedLocs.find(l => l.id === locationId);
        locationText = sel ? (sel.siteName ?? sel.name) : "";
        // Depot stop: if different from current company depot, update it
        if (isDepotStop && locationId !== depot?.id) {
          await api.patch<any>("/company", { depotLocationId: locationId });
          if (sel) onDepotSet({ id: sel.id, name: sel.name, siteName: sel.siteName ?? null, town: sel.town ?? null, postcode: sel.postcode ?? null, lat: null, lng: null });
        }
      }

      await onAddWaypoint(run.id, waypointType, locationText, seq, locationId, wpTime || undefined);
      // Reset form
      setWpLocId(""); setWpShowCreate(false);
      setWpNewName(""); setWpNewStreet(""); setWpNewTown(""); setWpNewPostcode("");
      setWpNewLat(""); setWpNewLng("");
      setWpPosition(-2); setWpTime(""); setShowWpForm(false);
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

          {/* AI feasibility check result */}
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

          {/* ── Route timeline — assignments + waypoints merged ── */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-wide font-bold text-muted">Route</div>
              <button
                onClick={() => {
                  if (!showWpForm) {
                    // Opening — pre-select depot for the default position (-2 = start)
                    setWpLocId(depot?.id ?? "");
                    setWpShowCreate(false);
                    setWpPosition(-2);
                    loadSavedLocs();
                  }
                  setShowWpForm(v => !v);
                }}
                className="text-[10px] text-accent hover:underline"
              >
                {showWpForm ? "Cancel" : "+ Add stop"}
              </button>
            </div>

            {run.assignments.length === 0 && run.waypoints.length === 0 ? (
              <div className="text-xs text-muted italic">No stops yet — add jobs from the left panel</div>
            ) : (
              <div className="space-y-1.5">
                {/* Build combined sorted timeline */}
                {(() => {
                  type RouteItem =
                    | { kind: "assignment"; seq: number; data: typeof run.assignments[0] }
                    | { kind: "waypoint";   seq: number; data: RunWaypoint };

                  const items: RouteItem[] = [
                    ...run.assignments.map(a => ({ kind: "assignment" as const, seq: a.sequenceNumber, data: a })),
                    ...run.waypoints.map(w => ({ kind: "waypoint" as const, seq: w.sequenceNumber, data: w })),
                  ].sort((a, b) => a.seq - b.seq);

                  let stopNum = 0;
                  return items.map(item => {
                    if (item.kind === "waypoint") {
                      const w = item.data;
                      const wpPostcode = w.postcode ?? w.location?.postcode ?? null;
                      return (
                        <div key={`w-${w.id}`} className="flex items-center gap-2 text-xs pl-6">
                          <Badge colour="bg-slate-100 text-slate-600">
                            {WAYPOINT_TYPE_LABEL[w.waypointType] ?? w.waypointType}
                          </Badge>
                          <span className="font-medium text-primary truncate flex-1 min-w-0">
                            {w.location?.siteName ?? w.location?.name ?? w.locationText ?? "—"}
                          </span>
                          {wpPostcode && (
                            <span className="text-muted truncate hidden sm:inline flex-shrink-0">{wpPostcode}</span>
                          )}
                          {w.scheduledTime && <span className="text-amber-600 flex-shrink-0">{w.scheduledTime}</span>}
                          <button onClick={() => onRemoveWaypoint(run.id, w.id)}
                            className="text-red-400 hover:text-red-600 flex-shrink-0" title="Remove">✕</button>
                        </div>
                      );
                    } else {
                      const a = item.data;
                      stopNum++;
                      return (
                        <div key={`a-${a.id}`} className="flex items-center gap-2 text-xs">
                          <span className="w-4 text-center font-bold text-muted flex-shrink-0">{stopNum}</span>
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
                          <button onClick={() => onRemoveStop(run.id, a.id)}
                            className="text-red-400 hover:text-red-600 flex-shrink-0" title="Remove stop">✕</button>
                        </div>
                      );
                    }
                  });
                })()}
              </div>
            )}

            {/* Delivery-before-collection warning */}
            {(() => {
              const sorted = [...run.assignments].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
              const fd = sorted.find(a => ["delivery","dropoff"].includes(a.jobPart.type));
              const fc = sorted.find(a => ["collection","pickup"].includes(a.jobPart.type));
              if (fd && fc && fd.sequenceNumber < fc.sequenceNumber) {
                return (
                  <div className="mt-1.5 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-1">
                    ⚠ Delivery appears before collection — check the stop order
                  </div>
                );
              }
              return null;
            })()}

            {showWpForm && (
              <div className="rounded border border-slate-200 bg-slate-50 p-2.5 space-y-2 text-xs">

                {/* ── Where in the route? (always shown first) ── */}
                <div>
                  <label className="text-muted block mb-1">Where in the route?</label>
                  <select
                    className="input text-xs py-1 w-full"
                    value={wpPosition}
                    onChange={e => setWpPosition(parseInt(e.target.value, 10))}
                  >
                    <option value={-2}>Before all stops (depot start)</option>
                    {(() => {
                      // Combined sorted list so waypoints appear in the right position
                      type CombinedItem =
                        | { kind: "stop"; seq: number; label: string; key: string }
                        | { kind: "wp";   seq: number; label: string; key: string };
                      const items: CombinedItem[] = [
                        ...[...run.assignments].sort((a, b) => a.sequenceNumber - b.sequenceNumber).map(a => ({
                          kind: "stop" as const,
                          seq:  a.sequenceNumber,
                          key:  `a-${a.id}`,
                          label: `${STOP_TYPE_LABEL[a.jobPart.type] ?? a.jobPart.type} — ${a.jobPart.job.customerName ?? a.jobPart.locationTextSnapshot ?? "Unknown"}`,
                        })),
                        ...[...run.waypoints].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
                          .filter(w => w.waypointType !== "depot_start" && w.waypointType !== "return_to_base")
                          .map(w => ({
                            kind: "wp" as const,
                            seq:  w.sequenceNumber,
                            key:  `w-${w.id}`,
                            label: `${WAYPOINT_TYPE_LABEL[w.waypointType] ?? w.waypointType}: ${w.location?.siteName ?? w.location?.name ?? w.locationText ?? "—"}`,
                          })),
                      ].sort((a, b) => a.seq - b.seq);
                      return items.map((item, i) => (
                        <option key={item.key} value={i}>
                          After: {item.label}
                        </option>
                      ));
                    })()}
                    <option value={-1}>After all stops (return to depot)</option>
                  </select>
                </div>

                {/* ── Location — picker-first for ALL positions ── */}
                <div className="space-y-1.5">
                  <label className="text-muted block">
                    {(wpPosition === -2 || wpPosition === -1) ? "Depot / yard location" : "Location"}
                  </label>

                  {locsLoading && <div className="text-muted animate-pulse text-[11px]">Loading…</div>}

                  {!locsLoading && !wpShowCreate && (
                    <>
                      {savedLocs.length > 0 ? (
                        <select
                          className="input text-xs py-1 w-full"
                          value={wpLocId}
                          onChange={e => setWpLocId(e.target.value ? Number(e.target.value) : "")}
                        >
                          <option value="">— select a location —</option>
                          {savedLocs.map(l => (
                            <option key={l.id} value={l.id}>
                              {l.siteName ? `${l.siteName} (${l.name})` : l.name}
                              {l.town ? ` · ${l.town}` : ""}
                              {l.postcode ? ` · ${l.postcode}` : ""}
                              {l.id === depot?.id ? " 🏭" : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-[11px] text-muted italic">No saved locations yet</div>
                      )}
                      <button type="button"
                        onClick={() => { setWpShowCreate(true); setWpLocId(""); }}
                        className="text-[10px] text-accent hover:underline">
                        + New address
                      </button>
                    </>
                  )}

                  {!locsLoading && wpShowCreate && (
                    <>
                      <input type="text" className="input text-xs py-1 w-full"
                        placeholder={`${(wpPosition === -2 || wpPosition === -1) ? "Depot name (e.g. Main Yard)" : "Name"} *`}
                        value={wpNewName} onChange={e => setWpNewName(e.target.value)} />
                      <input type="text" className="input text-xs py-1 w-full" placeholder="Street address *"
                        value={wpNewStreet} onChange={e => setWpNewStreet(e.target.value)} />
                      <div className="grid grid-cols-2 gap-1.5">
                        <input type="text" className="input text-xs py-1" placeholder="Town"
                          value={wpNewTown} onChange={e => setWpNewTown(e.target.value)} />
                        <input type="text" className="input text-xs py-1" placeholder="Postcode"
                          value={wpNewPostcode} onChange={e => setWpNewPostcode(e.target.value.toUpperCase())} />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input type="number" step="any" className="input text-xs py-1" placeholder="Latitude (opt.)"
                          value={wpNewLat} onChange={e => setWpNewLat(e.target.value)} />
                        <input type="number" step="any" className="input text-xs py-1" placeholder="Longitude (opt.)"
                          value={wpNewLng} onChange={e => setWpNewLng(e.target.value)} />
                      </div>
                      {wpNewPostcode.trim() && (
                        <button type="button" onClick={geocodePostcode} disabled={wpGeoLoading}
                          className="text-[10px] text-accent hover:underline disabled:opacity-50">
                          {wpGeoLoading ? "Looking up…" : "Auto-fill coordinates from postcode"}
                        </button>
                      )}
                      {savedLocs.length > 0 && (
                        <button type="button"
                          onClick={() => { setWpShowCreate(false); setWpNewName(""); setWpNewStreet(""); setWpNewTown(""); setWpNewPostcode(""); }}
                          className="text-[10px] text-accent hover:underline">
                          ← Pick existing
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* ── Expected time ── */}
                <div>
                  <label className="text-muted block mb-1">Expected time <span className="text-red-500">*</span></label>
                  <input type="time" className="input text-xs py-1 w-full"
                    value={wpTime} onChange={e => setWpTime(e.target.value)} />
                </div>

                <button
                  onClick={handleAddWaypoint}
                  disabled={
                    wpAdding ||
                    locsLoading ||
                    !wpTime ||
                    (!wpShowCreate && !wpLocId) ||
                    (wpShowCreate && (!wpNewName.trim() || !wpNewStreet.trim()))
                  }
                  className="btn text-xs py-1 px-3 bg-accent text-white disabled:opacity-40 w-full"
                >
                  {wpAdding ? "Adding…" : wpShowCreate && (wpPosition === -2 || wpPosition === -1) ? "Save depot & add stop" : "Add stop"}
                </button>
              </div>
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
  const [trucks,         setTrucks]         = useState<FleetUnit[]>([]);
  const [depot,          setDepot]          = useState<DepotLocation | null>(null);
  const [drivers,        setDrivers]        = useState<PlanningDriver[]>([]);
  const [loadingLeft,    setLoadingLeft]    = useState(false);
  const [loadingRight,   setLoadingRight]   = useState(false);
  const [totalUnplanned, setTotalUnplanned] = useState(0);
  const [err,            setErr]            = useState("");
  const [mobileTab,      setMobileTab]      = useState<"jobs" | "runs">("jobs");
  const [creatingRun,    setCreatingRun]    = useState(false);

  // Expand state: multiple runs can be open at once (user controls manually).
  // New runs are NOT auto-expanded — the user clicks to open them.
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
      setTrucks(res.trucks);
      setDepot(res.depot ?? null);
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
    sequenceNumber: number, locationId?: number, scheduledTime?: string,
  ) {
    await planningApi.addWaypoint(runId, { waypointType, locationText, sequenceNumber, locationId, scheduledTime });
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
      setMobileTab("runs"); // switch to the Runs tab on mobile so the new run is visible
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setCreatingRun(false); }
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

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
              {runs.map(run => (
                <RunCard
                  key={run.id}
                  run={run}
                  isExpanded={isRunExpanded(run.id)}
                  onToggleExpand={() => toggleRunExpand(run.id)}
                  trailers={trailers}
                  trucks={trucks}
                  drivers={drivers}
                  depot={depot}
                  onDepotSet={setDepot}
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

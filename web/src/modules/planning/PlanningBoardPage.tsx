import { useState, useEffect, useCallback, useMemo } from "react";
import {
  planningApi,
  type PlannerWorkItem, type StopCluster, type UnplannedStop,
  type PlanningRun, type PlanningAssignment,
  type FleetTrailer, type FleetUnit,
  type PlanningDriver, type RunWaypoint,
  type SavedLocationOption, type DepotLocation,
} from "../../api/planning";
import { api } from "../../api/client";
import { aiApi } from "../../api/ai";
import { bodyTypeLabel } from "../../constants/vehicleTaxonomy";
import { today, addDays, cap } from "../jobs/createJobUtils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function prevDay(d: string): string { return addDays(d, -1); }
function nextDay(d: string): string { return addDays(d, 1); }

function relativeDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d   = iso.slice(0, 10);
  const now = new Date().toISOString().slice(0, 10);
  const tom = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return t.toISOString().slice(0, 10); })();
  if (d === now) return "Today";
  if (d === tom) return "Tomorrow";
  return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function partDate(part: PlannerWorkItem): string | null {
  return part.timeWindowStart?.slice(0, 10) ?? part.bookedTime?.slice(0, 10) ?? null;
}

function fmtStopTime(item: PlannerWorkItem): string | null {
  if (item.timeWindowStart) {
    const start = fmtTime(item.timeWindowStart);
    const end   = item.timeWindowEnd ? fmtTime(item.timeWindowEnd) : null;
    return end ? `${start}–${end}` : start;
  }
  if (item.bookedTime) return fmtTime(item.bookedTime);
  return null;
}

/** Nearest-neighbor geographic sort for optimising stop order */
function nearestNeighborSort(assignments: PlanningAssignment[]): PlanningAssignment[] {
  if (assignments.length <= 1) return assignments;
  const sorted = [...assignments].sort((a, b) =>
    (a.jobPart.timeWindowStart ?? "23:59") < (b.jobPart.timeWindowStart ?? "23:59") ? -1 : 1
  );
  const ordered: PlanningAssignment[] = [sorted[0]];
  const remaining = sorted.slice(1);
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    const lat0 = last.jobPart.lat ?? 51.5;
    const lng0 = last.jobPart.lng ?? -0.1;
    let nearestIdx = 0, nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = ((remaining[i].jobPart.lat  ?? 51.5) - lat0) ** 2
              + ((remaining[i].jobPart.lng ?? -0.1) - lng0) ** 2;
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    ordered.push(remaining[nearestIdx]);
    remaining.splice(nearestIdx, 1);
  }
  return ordered;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WAYPOINT_TYPE_LABEL: Record<string, string> = {
  depot_start: "Depot start", yard_pickup: "Yard pickup", hub_drop: "Hub drop",
  return_to_base: "Return to base", overnight_rest: "Overnight rest", custom: "Stop",
};

/** Abbreviated labels for compact planning-board display */
const STOP_TYPE_LABEL_SHORT: Record<string, string> = {
  collection: "Collect", delivery: "Deliver", pickup: "Pickup",
  dropoff: "Drop", reload: "Reload", return: "Return", waypoint: "Stop", other: "Other",
};

const RUN_TYPE_LABELS: Record<string, string> = {
  direct: "Direct", relay: "Relay", split: "Split load", consolidation: "Consolidation",
};

const FLEET_STATUS_LABEL: Record<string, string> = {
  available: "Available", off_road: "Off Road", vor: "VOR",
  loaded: "Loaded", in_use: "In Use", repair: "In Repair",
};


const GOODS_COMPAT: Record<string, { label: string; colour: string }> = {
  liquid:            { label: "Liquid",   colour: "bg-cyan-50 text-cyan-800"    },
  bulk_liquid:       { label: "Liquid",   colour: "bg-cyan-50 text-cyan-800"    },
  bulk:              { label: "Bulk",     colour: "bg-stone-100 text-stone-700" },
  food_refrigerated: { label: "Food ❄",  colour: "bg-blue-50 text-blue-800"    },
  refrigerated:      { label: "Temp",     colour: "bg-blue-50 text-blue-800"    },
  pallets:           { label: "Pallets",  colour: "bg-slate-100 text-slate-700" },
  general_goods:     { label: "General",  colour: "bg-slate-100 text-slate-600" },
  steel:             { label: "Steel",    colour: "bg-zinc-100 text-zinc-700"   },
  machinery:         { label: "Machinery",colour: "bg-zinc-100 text-zinc-700"   },
  timber:            { label: "Timber",   colour: "bg-amber-50 text-amber-800"  },
  waste:             { label: "Waste",    colour: "bg-red-50 text-red-700"      },
};

const COLLECT_FIRST = new Set(["collection", "pickup"]);

// ── Job colour palette ──────────────────────────────────────────────────────
// Deterministic: jobId % 10 — no DB column, always consistent across the board
const JOB_COLOURS = [
  "#3B82F6", "#F97316", "#8B5CF6", "#14B8A6", "#EC4899",
  "#EAB308", "#6366F1", "#22C55E", "#F43F5E", "#06B6D4",
];
function getJobColour(jobId: number): string {
  return JOB_COLOURS[jobId % JOB_COLOURS.length];
}

const LOOK_AHEAD_OPTIONS = [
  { days: 0, label: "Today" },
  { days: 2, label: "3 days" },
  { days: 6, label: "1 week" },
  { days: 13, label: "2 weeks" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ children, colour }: { children: React.ReactNode; colour: string }) {
  return <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${colour}`}>{children}</span>;
}

/** Single badge that merges run status + publishedToDriver into one coherent pill.
 *  Replaces the confusing two-badge (StatusBadge + "Sent") pattern. */
function RunStatusBadge({ run }: { run: PlanningRun }) {
  if (run.status === "completed")   return <Badge colour="bg-green-100 text-green-700">✓ Done</Badge>;
  if (run.status === "in_progress") return <Badge colour="bg-amber-100 text-amber-700">In progress</Badge>;
  if (run.status === "cancelled")   return <Badge colour="bg-red-100 text-red-600">Cancelled</Badge>;
  if (run.publishedToDriver)        return <Badge colour="bg-violet-100 text-violet-700">📤 Sent</Badge>;
  if (run.status === "assigned")    return <Badge colour="bg-blue-100 text-blue-700">Assigned</Badge>;
  return <Badge colour="bg-slate-100 text-slate-600">Draft</Badge>;
}

function goodsCompatBadge(goodsType: string | null | undefined) {
  if (!goodsType) return null;
  const m = GOODS_COMPAT[goodsType.toLowerCase()];
  return m ? <Badge colour={m.colour}>{m.label}</Badge>
           : <Badge colour="bg-slate-100 text-slate-600">{cap(goodsType)}</Badge>;
}

// ── CapacityBar ───────────────────────────────────────────────────────────────

function CapacityBar({ run, trucks }: { run: PlanningRun; trucks: FleetUnit[] }) {
  // Deduplicate by jobId so collect+deliver of the same job doesn't double-count
  const seenJobs = new Set<number>();
  let totalKg = 0, pallets = 0;
  for (const a of run.assignments) {
    if (!seenJobs.has(a.jobId)) {
      seenJobs.add(a.jobId);
      totalKg += a.jobPart.job.weight ?? 0;
      if (["pallet","pallets","plt","pl"].includes((a.jobPart.job.quantityUnit ?? "").toLowerCase())) {
        pallets += a.jobPart.job.quantity ?? 0;
      }
    }
  }

  const truck  = trucks.find(t => t.id === run.assignedTruckId);
  const maxKg  = truck?.gvwClass ? parseFloat(truck.gvwClass) * 1000 : null;
  const pct    = maxKg && totalKg > 0 ? Math.min(100, (totalKg / maxKg) * 100) : null;

  if (totalKg === 0 && pallets === 0) return null;

  return (
    <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted uppercase tracking-wide">Load</span>
        <span className="text-[11px] font-semibold text-primary">
          {totalKg > 0 ? `${totalKg.toLocaleString()} kg` : ""}
          {maxKg ? <span className="font-normal text-muted"> / {maxKg >= 1000 ? `${(maxKg/1000).toFixed(0)}t` : `${maxKg}kg`}</span> : ""}
        </span>
      </div>
      {pct !== null ? (
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${pct > 95 ? "bg-red-500" : pct > 80 ? "bg-amber-400" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : totalKg > 0 ? (
        <div className="h-1 bg-blue-200 rounded-full" title="No vehicle assigned — cannot calculate % full" />
      ) : null}
      {pallets > 0 && (
        <div className="text-[10px] text-muted">📦 {pallets} pallets</div>
      )}
    </div>
  );
}

// ── JobWorkGroup type ─────────────────────────────────────────────────────────

interface JobWorkGroup {
  jobId:        number;
  jobReference: string | null;
  customerName: string | null;
  parts:        PlannerWorkItem[];
  riskLevel:    "high" | "medium" | "low" | "none";
  warnings:     string[];
}

// ── JobWorkCard ───────────────────────────────────────────────────────────────

function JobWorkCard({
  group,
  onAddJobToRun,
  onAddPartToRun,
  draftRuns,
  selected,
  onSelectToggle,
}: {
  group:           JobWorkGroup;
  onAddJobToRun:   (jobId: number, runId: number, partIds?: number[]) => Promise<void>;
  onAddPartToRun:  (jobPartId: number, runId: number) => Promise<void>;
  draftRuns:       PlanningRun[];
  selected:        boolean;
  onSelectToggle:  (jobId: number) => void;
}) {
  const [selectedRunId, setSelectedRunId] = useState<number | "">("");
  const [adding, setAdding] = useState(false);
  const [addingPartId, setAddingPartId] = useState<number | null>(null);

  const effectiveRunId = selectedRunId || (draftRuns.length === 1 ? draftRuns[0].id : "");

  async function handleAdd() {
    if (!effectiveRunId) return;
    setAdding(true);
    // Pass this card's part IDs so only the date-scoped parts are added
    try { await onAddJobToRun(group.jobId, Number(effectiveRunId), group.parts.map(p => p.jobPartId)); }
    finally { setAdding(false); }
  }

  async function handleAddPart(jobPartId: number) {
    if (!effectiveRunId) return;
    setAddingPartId(jobPartId);
    try { await onAddPartToRun(jobPartId, Number(effectiveRunId)); }
    finally { setAddingPartId(null); }
  }

  const collections  = group.parts.filter(p => p.nextAction.startsWith("Collect"));
  const deliveries   = group.parts.filter(p => p.nextAction.startsWith("Deliver"));
  const others       = group.parts.filter(p => !p.nextAction.startsWith("Collect") && !p.nextAction.startsWith("Deliver"));
  const rep          = group.parts[0];

  const deliveryBlocked = group.warnings.some(w => w.toLowerCase().includes("not yet collected"));
  const collectDate     = collections[0] ? partDate(collections[0]) : null;
  const deliverDate     = deliveries[0]  ? partDate(deliveries[0])  : null;
  const isMultiDay      = collectDate && deliverDate && collectDate !== deliverDate;
  const collectStart    = collections[0]?.timeWindowStart ?? collections[0]?.bookedTime;
  const deliverEnd      = deliveries[0]?.timeWindowEnd   ?? deliveries[0]?.timeWindowStart ?? deliveries[0]?.bookedTime;
  const impossible      = collectStart && deliverEnd && deliverEnd < collectStart;
  const isLiquid        = rep.goodsType?.toLowerCase().includes("liquid") || rep.goodsType?.toLowerCase().includes("bulk");
  const isADR           = rep.hasHazardous;
  const isTemp          = rep.hasTempControl;

  const borderColour =
    impossible             ? "border-l-red-600"    :
    deliveryBlocked        ? "border-l-orange-500" :
    group.riskLevel === "high"   ? "border-l-red-500"   :
    group.riskLevel === "medium" ? "border-l-amber-400"  :
    group.riskLevel === "low"    ? "border-l-yellow-300" :
    "border-l-slate-200";

  // Risk tooltip: the warnings explain the risk level to the planner
  const riskTooltip = group.warnings.length > 0 ? group.warnings.join(" · ") : "";

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData("application/job-id", String(group.jobId));
        e.dataTransfer.setData("application/job-part-ids", group.parts.map(p => p.jobPartId).join(","));
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={`bg-white rounded border border-border border-l-4 ${borderColour} mb-1.5 overflow-hidden cursor-grab active:cursor-grabbing transition-shadow hover:shadow-sm ${
        selected ? "ring-2 ring-primary/40" : ""
      }`}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-2 pt-2 pb-0.5">
        {/* Checkbox */}
        <input
          type="checkbox"
          className="w-3.5 h-3.5 flex-shrink-0 rounded border-slate-300 cursor-pointer"
          checked={selected}
          onChange={() => onSelectToggle(group.jobId)}
          onClick={e => e.stopPropagation()}
          title="Select for batch action"
        />
        <div className="font-bold text-[14px] text-primary leading-tight truncate flex-1 min-w-0">
          {group.customerName ?? "Unknown customer"}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {impossible && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700" title="Delivery window closes before collection can start">
              ⛔ IMPOSSIBLE
            </span>
          )}
          {!impossible && deliveryBlocked && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700" title="Goods not yet collected — collect before planning delivery">
              ▶ COLLECT FIRST
            </span>
          )}
          {!impossible && !deliveryBlocked && group.riskLevel !== "none" && (
            <span
              title={riskTooltip}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-help ${
                group.riskLevel === "high"   ? "bg-red-100 text-red-700"    :
                group.riskLevel === "medium" ? "bg-amber-100 text-amber-700" :
                "bg-yellow-50 text-yellow-700"
              }`}
            >
              {group.riskLevel === "high" ? "⚠ URGENT" : group.riskLevel === "medium" ? "⚠ TIGHT" : "ℹ NOTE"}
            </span>
          )}
          {isMultiDay && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
              Multi-day
            </span>
          )}
          {group.jobReference && (
            <span className="font-mono text-[10px] text-muted">{group.jobReference}</span>
          )}
        </div>
      </div>

      {/* ── Stop rows ── */}
      <div className="px-2.5 py-1 space-y-0.5">
        {[...collections, ...others, ...deliveries].map(part => {
          const time      = fmtStopTime(part);
          const isCollect = part.nextAction.startsWith("Collect");
          const isDrop    = part.nextAction.startsWith("Deliver");
          const location  = part.currentLocation ?? part.finalDestination ?? "—";
          const postcode  = isCollect ? part.currentPostcode : part.finalPostcode;
          const dDate     = partDate(part);
          const dateLabel = dDate && dDate !== today() ? relativeDate(dDate) : null;
          const isBlocked = isDrop && deliveryBlocked;

          return (
            <div
              key={part.jobPartId}
              draggable
              onDragStart={e => {
                e.stopPropagation();
                e.dataTransfer.setData("application/job-part-id", String(part.jobPartId));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={`flex items-baseline gap-1.5 cursor-grab active:cursor-grabbing hover:bg-slate-50 rounded px-0.5 -mx-0.5 ${isBlocked ? "opacity-50" : ""}`}
              title={isBlocked ? undefined : "Drag to add just this stop to a run"}
            >
              <span className={`flex-shrink-0 font-bold text-[10px] uppercase w-14 ${
                isCollect ? "text-blue-600" :
                isDrop    ? (isBlocked ? "text-slate-400" : "text-green-700") :
                "text-slate-500"
              }`}>
                {isCollect ? "Collect" : isDrop ? "Deliver" : "Stop"}
              </span>
              {dateLabel && (
                <span className="flex-shrink-0 text-[10px] font-semibold px-1 py-0.5 rounded bg-violet-50 text-violet-700">
                  {dateLabel}
                </span>
              )}
              <span className={`flex-shrink-0 font-bold text-[13px] tabular-nums ${
                time ? (isCollect ? "text-blue-700" : isBlocked ? "text-slate-400" : "text-green-800") : "text-slate-300"
              }`}>
                {time ?? "—"}
              </span>
              {isBlocked ? (
                <span className="text-[10px] font-semibold text-orange-600">⛔ collect first</span>
              ) : (
                <span className="text-slate-500 text-[11px] truncate leading-tight">
                  {postcode
                    ? <><span className="font-medium text-slate-700">{postcode}</span>{location !== postcode ? ` · ${location}` : ""}</>
                    : location}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Load incompatibility strip ── */}
      {(isLiquid || isADR || isTemp) && (
        <div className={`px-2.5 py-0.5 text-[10px] font-semibold flex items-center gap-1.5 border-t ${
          isADR    ? "bg-orange-50 text-orange-700 border-orange-100" :
          isLiquid ? "bg-cyan-50 text-cyan-800 border-cyan-100"      :
          "bg-blue-50 text-blue-700 border-blue-100"
        }`}>
          {isADR    && <><span>☢</span><span>ADR — do not mix with food or general goods</span></>}
          {!isADR && isLiquid && <><span>💧</span><span>Liquid — tanker only</span></>}
          {!isADR && !isLiquid && isTemp && <><span>❄</span><span>Temp controlled — fridge trailer only</span></>}
        </div>
      )}

      {/* ── Metadata ── */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 flex-wrap border-t border-slate-50">
        {rep.vehicleCategory && <Badge colour="bg-slate-100 text-slate-600">{cap(rep.vehicleCategory)}</Badge>}
        {goodsCompatBadge(rep.goodsType)}
        {rep.weight   != null && rep.weight   > 0 && <span className="text-[11px] text-muted">{rep.weight.toLocaleString()} kg</span>}
        {rep.quantity != null && rep.quantity > 0  && <span className="text-[11px] text-muted">{rep.quantity}{rep.quantityUnit ? " " + cap(rep.quantityUnit) : ""}</span>}
      </div>

      {/* ── Warnings ── */}
      {impossible ? (
        <div className="px-2.5 py-1 bg-red-50 text-red-700 text-[11px] border-t border-red-100 font-medium">
          ⛔ Delivery window closes before collection can start
        </div>
      ) : !impossible && group.warnings.length > 0 ? (
        <div className={`px-2.5 py-1 border-t text-[11px] flex items-start gap-1 ${
          group.riskLevel === "high" ? "bg-red-50 text-red-700 border-red-100" : "bg-amber-50 text-amber-700 border-amber-100"
        }`}>
          <span className="flex-shrink-0">⚠</span>
          <span>{group.warnings[0]}{group.warnings.length > 1 ? ` +${group.warnings.length - 1} more` : ""}</span>
        </div>
      ) : null}

      {/* ── Add to run ── */}
      <div className="px-2.5 py-1.5 bg-slate-50 border-t border-border">
        {draftRuns.length === 0 ? (
          <span className="text-[11px] text-muted italic">Create a run first — or drag a stop</span>
        ) : (
          <div className="flex flex-col gap-1">
            {/* Run selector (only when >1 run) */}
            {draftRuns.length > 1 && (
              <select className="input text-xs py-1 w-full"
                value={selectedRunId}
                onChange={e => setSelectedRunId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Pick run…</option>
                {draftRuns.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.runReference}{r.driver ? ` · ${r.driver.displayName}` : ""}
                  </option>
                ))}
              </select>
            )}
            {/* Add buttons */}
            <div className="flex items-center gap-1">
              {/* Add both (all parts) */}
              <button disabled={!effectiveRunId || adding} onClick={handleAdd}
                className="btn text-xs py-1 px-2.5 bg-accent text-white disabled:opacity-40 whitespace-nowrap flex-1">
                {adding ? "…" : collections.length > 0 && deliveries.length > 0 ? "Add both →" : "Add →"}
              </button>
              {/* Individual part buttons — shown when job has separate collect + deliver */}
              {collections.length > 0 && deliveries.length > 0 && (
                <>
                  <button
                    disabled={!effectiveRunId || addingPartId !== null}
                    onClick={() => handleAddPart(collections[0].jobPartId)}
                    className="btn text-[11px] py-1 px-2 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-40 whitespace-nowrap"
                    title="Add collect stop only — for relay runs">
                    {addingPartId === collections[0].jobPartId ? "…" : "Collect →"}
                  </button>
                  <button
                    disabled={!effectiveRunId || addingPartId !== null}
                    onClick={() => handleAddPart(deliveries[0].jobPartId)}
                    className="btn text-[11px] py-1 px-2 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-40 whitespace-nowrap"
                    title="Add deliver stop only — for relay runs">
                    {addingPartId === deliveries[0].jobPartId ? "…" : "Deliver →"}
                  </button>
                </>
              )}
            </div>
            {/* Relay hint */}
            {collections.length > 0 && deliveries.length > 0 && (
              <span className="text-[10px] text-muted">
                Relay run? Add collect to one run, deliver to another, then use + Waypoint → Yard stop on each.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── RunLane — Kanban column (replaces RunCard) ────────────────────────────────

function RunLane({
  run,
  trailers,
  trucks,
  drivers,
  depot,
  onDepotSet,
  allRuns,
  onUpdate,
  onRemoveStop,
  onReorderStops,
  onAddWaypoint,
  onRemoveWaypoint,
  onPublish,
  onDelete,
  onDropJob,
  onDropPart,
  onOptimiseRoute,
  onConfirmOptimise,
  confirmingOptimise,
  optimising,
  collapsed,
  onToggleCollapsed,
  onCreateOvernightRun,
}: {
  run:              PlanningRun;
  trailers:         FleetTrailer[];
  trucks:           FleetUnit[];
  drivers:          PlanningDriver[];
  depot:            DepotLocation | null;
  onDepotSet:       (d: DepotLocation) => void;
  allRuns:          PlanningRun[];
  onUpdate:         (id: number, patch: Record<string, unknown>) => Promise<void>;
  onRemoveStop:     (runId: number, assignmentId: number) => Promise<void>;
  onReorderStops:   (runId: number, assignmentIds: number[]) => Promise<void>;
  onAddWaypoint:    (runId: number, type: string, locationText: string, seq: number, locationId?: number, scheduledTime?: string) => Promise<void>;
  onRemoveWaypoint: (runId: number, waypointId: number) => Promise<void>;
  onPublish:        (runId: number) => Promise<void>;
  onDelete:         (runId: number) => Promise<void>;
  onDropJob:         (jobId: number, partIds?: number[]) => Promise<void>;
  onDropPart:        (jobPartId: number) => Promise<void>;
  onOptimiseRoute:    (runId: number) => Promise<void>;
  onConfirmOptimise:  (runId: number) => Promise<void>;
  confirmingOptimise: boolean;
  optimising:         boolean;
  collapsed:          boolean;
  onToggleCollapsed:  () => void;
  onCreateOvernightRun: (runId: number, body: {
    restLocationText?: string;
    restPostcode?: string;
    restLat?: number;
    restLng?: number;
    shiftEndIso?: string;
    restHours?: 9 | 11;
    moveDeliveries?: boolean;
  }) => Promise<void>;
}) {
  const [saving,     setSaving]     = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [recalling,  setRecalling]  = useState(false);
  const [err,        setErr]        = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [isOver,     setIsOver]     = useState(false);

  // Manual stop reorder via drag-and-drop within the lane
  const [reorderDragId, setReorderDragId] = useState<number | null>(null);
  const [reorderOverId, setReorderOverId] = useState<number | null>(null);
  const [reordering,    setReordering]    = useState(false);

  // Waypoint form state
  const [showWpForm,    setShowWpForm]    = useState(false);
  const [wpPosition,    setWpPosition]    = useState<number>(-2);
  const [wpType,        setWpType]        = useState("custom");
  const [wpTime,        setWpTime]        = useState("");
  const [wpAdding,      setWpAdding]      = useState(false);
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

  // Overnight rest form state
  const [showOvernightForm, setShowOvernightForm] = useState(false);
  const [orLocation,  setOrLocation]  = useState("");
  const [orPostcode,  setOrPostcode]  = useState("");
  const [orLat,       setOrLat]       = useState("");
  const [orLng,       setOrLng]       = useState("");
  const [orShiftEnd,  setOrShiftEnd]  = useState("");
  const [orRestHours, setOrRestHours] = useState<9 | 11>(11);
  const [orMoveParts, setOrMoveParts] = useState(true);
  const [orGeoLoading, setOrGeoLoading] = useState(false);
  const [orCreating,  setOrCreating]  = useState(false);

  // AI feasibility check
  const [aiCheck,   setAiCheck]   = useState<{ severity: "ok"|"warn"|"block"; reason: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const wpTimesKey = run.waypoints.map(w => `${w.id}:${w.scheduledTime ?? ""}`).sort().join("|");

  useEffect(() => {
    if (!run.assignments.length && !run.waypoints.length) { setAiCheck(null); return; }
    setAiLoading(true);
    const timer = setTimeout(async () => {
      try {
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

        const planDate = run.plannedDate ? run.plannedDate.slice(0, 10) : null;

        const waypointStops = [...run.waypoints]
          .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
          .map(w => ({
            sequenceNumber:  w.sequenceNumber,
            type:            w.waypointType,
            locationText:    w.location?.siteName ?? w.location?.name ?? w.locationText ?? null,
            postcode:        w.postcode ?? w.location?.postcode ?? null,
            lat:             w.lat ?? w.location?.lat ?? null,
            lng:             w.lng ?? w.location?.lng ?? null,
            timeWindowStart: w.scheduledTime && planDate ? `${planDate}T${w.scheduledTime}:00Z` : null,
            timeWindowEnd:   null,
            customerName:    null,
          }));

        const allStops = [...assignmentStops, ...waypointStops]
          .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

        const truck   = run.assignedTruckId   ? trucks.find(t => t.id === run.assignedTruckId)    : null;
        const trailer = run.assignedTrailerId  ? trailers.find(t => t.id === run.assignedTrailerId) : null;
        const gvwT    = truck?.gvwClass ? parseFloat(truck.gvwClass) || null : null;
        const heightM = Math.max(truck?.heightM ?? 0, trailer?.heightM ?? 0) || null;
        const widthM  = Math.max(truck?.widthM  ?? 0, trailer?.widthM  ?? 0) || null;
        const lengthM = ((truck?.lengthM ?? 0) + (trailer?.lengthM ?? 0)) || null;
        const axleLoadT = Math.max(truck?.axleLoadT ?? 0, trailer?.axleLoadT ?? 0) || null;
        const vehicle = (gvwT || heightM || widthM || lengthM || axleLoadT)
          ? { weightT: gvwT, heightM, widthM, lengthM, axleLoadT } : null;

        const depotStart = run.waypoints.find(w => w.waypointType === "depot_start");
        const departureTime = run.estimatedStartTime
          ?? (depotStart?.scheduledTime && planDate ? `${planDate}T${depotStart.scheduledTime}:00Z` : null);

        const result = await aiApi.checkRun({ stops: allStops, estimatedStartTime: departureTime, vehicle });
        setAiCheck({
          severity: result.severity === "high" ? "block" : result.severity === "medium" || result.severity === "low" ? "warn" : "ok",
          reason:   result.message,
        });
      } catch { setAiCheck(null); }
      finally  { setAiLoading(false); }
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.assignments.length, run.waypoints.length, wpTimesKey, run.estimatedStartTime]);

  useEffect(() => {
    if (!showWpForm) return;
    setWpShowCreate(false);
    setWpLocId((wpPosition === -2 || wpPosition === -1) ? (depot?.id ?? "") : "");
    // Reset mid-route type when switching positions
    if (wpPosition !== -2 && wpPosition !== -1) setWpType("custom");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wpPosition]);

  async function geocodePostcode() {
    const pc = wpNewPostcode.trim().replace(/\s+/g, "").toUpperCase();
    if (!pc) return;
    setWpGeoLoading(true);
    try {
      const res  = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
      const data = await res.json() as { result?: { latitude: number; longitude: number } };
      if (data.result) { setWpNewLat(String(data.result.latitude)); setWpNewLng(String(data.result.longitude)); }
    } catch { /* non-fatal */ }
    finally { setWpGeoLoading(false); }
  }

  async function loadSavedLocs() {
    if (savedLocs.length > 0) return;
    setLocsLoading(true);
    try {
      const res = await planningApi.getLocations();
      setSavedLocs(res.data);
      if (res.data.length === 0) setWpShowCreate(true);
    } catch { /* non-fatal */ }
    finally { setLocsLoading(false); }
  }

  async function patch(body: Record<string, unknown>) {
    setSaving(true); setErr("");
    try { await onUpdate(run.id, body); }
    catch (e: unknown) { setErr((e as Error).message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  // Sorted assignment IDs in current display order — used for reorder calculations
  const sortedAssignmentIds = [...run.assignments]
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .map(a => a.id);

  async function handleReorderDrop(targetId: number) {
    if (!reorderDragId || reorderDragId === targetId) {
      setReorderDragId(null); setReorderOverId(null); return;
    }
    const ids = [...sortedAssignmentIds];
    const fromIdx = ids.indexOf(reorderDragId);
    const toIdx   = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) { setReorderDragId(null); setReorderOverId(null); return; }
    // Move dragged item to just before the target
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, reorderDragId);
    setReorderDragId(null); setReorderOverId(null);
    setReordering(true);
    try { await onReorderStops(run.id, ids); }
    catch (e: unknown) { setErr((e as Error).message ?? "Reorder failed"); }
    finally { setReordering(false); }
  }

  async function handleAddWaypoint() {
    setWpAdding(true);
    try {
      let seq: number; let waypointType: string;
      if (wpPosition === -2) { seq = 0; waypointType = "depot_start"; }
      else if (wpPosition === -1) { seq = 999999; waypointType = "return_to_base"; }
      else {
        const allItems = [
          ...run.assignments.map(a => ({ seq: a.sequenceNumber })),
          ...run.waypoints.map(w => ({ seq: w.sequenceNumber })),
        ].sort((a, b) => a.seq - b.seq);
        const prevSeq = allItems[wpPosition]?.seq ?? 0;
        const nextSeq = allItems[wpPosition + 1]?.seq;
        seq = nextSeq != null ? Math.round((prevSeq + nextSeq) / 2) : prevSeq + 1000;
        waypointType = wpType;
      }

      let locationId: number | undefined;
      let locationText = "";
      const isDepotStop = wpPosition === -2 || wpPosition === -1;

      if (wpShowCreate) {
        if (!wpNewName.trim() || !wpNewStreet.trim()) return;
        const newLoc = await api.post<any>("/locations", {
          name: wpNewName.trim(), street: wpNewStreet.trim(),
          town: wpNewTown.trim() || undefined,
          postcode: wpNewPostcode.trim() || undefined,
          lat: wpNewLat ? parseFloat(wpNewLat) : undefined,
          lng: wpNewLng ? parseFloat(wpNewLng) : undefined,
        });
        locationId   = newLoc.id;
        locationText = newLoc.siteName ?? newLoc.name;
        setSavedLocs(prev => [...prev, { id: newLoc.id, name: newLoc.name, siteName: newLoc.siteName, town: newLoc.town ?? null, postcode: newLoc.postcode ?? null }]);
        if (isDepotStop) {
          await api.patch<any>("/company", { depotLocationId: newLoc.id });
          onDepotSet({ id: newLoc.id, name: newLoc.name, siteName: newLoc.siteName ?? null, town: newLoc.town ?? null, postcode: newLoc.postcode ?? null, lat: newLoc.lat ?? null, lng: newLoc.lng ?? null });
        }
      } else {
        if (!wpLocId) return;
        locationId = Number(wpLocId);
        const sel = savedLocs.find(l => l.id === locationId);
        locationText = sel ? (sel.siteName ?? sel.name) : "";
        if (isDepotStop && locationId !== depot?.id) {
          await api.patch<any>("/company", { depotLocationId: locationId });
          if (sel) onDepotSet({ id: sel.id, name: sel.name, siteName: sel.siteName ?? null, town: sel.town ?? null, postcode: sel.postcode ?? null, lat: null, lng: null });
        }
      }

      await onAddWaypoint(run.id, waypointType, locationText, seq, locationId, wpTime || undefined);
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

  async function handleRecall() {
    if (!window.confirm("Recall this run? The driver will no longer see it until you re-publish.")) return;
    setRecalling(true); setErr("");
    try { await onUpdate(run.id, { publishedToDriver: false }); }
    catch (e: unknown) { setErr((e as Error).message ?? "Recall failed"); }
    finally { setRecalling(false); }
  }

  const canPublish   = run.status !== "completed" && run.status !== "cancelled" && !run.publishedToDriver;
  const dependsOnRun = allRuns.find(r => r.id === run.dependsOnRunId);
  const isLocked     = !!dependsOnRun && dependsOnRun.status !== "completed";

  const aiDot = aiLoading ? "⟳" :
    aiCheck?.severity === "block" ? "🔴" :
    aiCheck?.severity === "warn"  ? "🟡" :
    aiCheck                       ? "🟢" : "";

  // Combined + sorted stop list
  type RouteItem =
    | { kind: "assignment"; seq: number; data: PlanningAssignment }
    | { kind: "waypoint";   seq: number; data: RunWaypoint };
  const routeItems: RouteItem[] = [
    ...run.assignments.map(a => ({ kind: "assignment" as const, seq: a.sequenceNumber, data: a })),
    ...run.waypoints.map(w => ({ kind: "waypoint" as const, seq: w.sequenceNumber, data: w })),
  ].sort((a, b) => a.seq - b.seq);

  // Delivery-before-collection warning
  const sortedA = [...run.assignments].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const fd = sortedA.find(a => ["delivery","dropoff"].includes(a.jobPart.type));
  const fc = sortedA.find(a => ["collection","pickup"].includes(a.jobPart.type));
  const deliveryBeforeCollection = fd && fc && fd.sequenceNumber < fc.sequenceNumber;

  // Day-driver multi-day warning
  const assignedDriver = run.assignedDriverId ? drivers.find(d => d.id === run.assignedDriverId) : null;
  const isDayDriver    = assignedDriver && !assignedDriver.nightsOutAllowed;
  const stopDates = run.assignments
    .map(a => a.jobPart.timeWindowStart ? new Date(a.jobPart.timeWindowStart).toISOString().slice(0, 10) : null)
    .filter(Boolean) as string[];
  const runDate = run.plannedDate?.slice(0, 10) ?? null;
  const allDates = runDate ? [...new Set([runDate, ...stopDates])] : [...new Set(stopDates)];
  const isMultiDayRun  = allDates.length > 1;
  const dayDriverMultiDayWarning = isDayDriver && isMultiDayRun;

  return (
    <div
      className={`w-full flex flex-col bg-white rounded-lg border shadow-sm overflow-hidden transition-all ${
        isLocked ? "opacity-60" : ""
      } ${isOver ? "ring-2 ring-primary shadow-lg" : "border-border"}`}
      style={collapsed ? undefined : { maxHeight: "calc(100vh - 130px)" }}
    >
      {/* ── Lane header ── */}
      <div className="flex items-center gap-2 px-3 py-3 bg-slate-50 border-b border-slate-200 flex-shrink-0">
        <span className="font-bold text-base text-primary flex-shrink-0">{run.runReference}</span>
        <RunStatusBadge run={run} />
        {run.plannedDate && (
          <span className="text-[10px] text-slate-500 font-medium tabular-nums">
            {new Date(run.plannedDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        )}
        {isLocked           && <Badge colour="bg-orange-100 text-orange-700">🔒 Locked</Badge>}
        {run.hasHazardous   && <Badge colour="bg-red-100 text-red-700">ADR</Badge>}
        {run.hasTemperatureLoad && <Badge colour="bg-cyan-100 text-cyan-700">❄</Badge>}
        <span className="flex-1" />
        {!collapsed && aiDot && <span className="text-sm leading-none" title={aiCheck?.reason ?? "Checking…"}>{aiDot}</span>}
        <button
          onClick={onToggleCollapsed}
          className="text-slate-400 hover:text-primary text-sm leading-none flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100"
          title={collapsed ? "Expand run" : "Collapse run"}
        >{collapsed ? "▼" : "▲"}</button>
        <button
          onClick={() => onDelete(run.id)}
          className="text-slate-400 hover:text-red-500 text-sm leading-none flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-red-50"
          title="Delete run"
        >✕</button>
      </div>

      {/* ── Collapsed summary ── */}
      {collapsed && (
        <div className="px-3 py-2 text-xs text-slate-500 flex items-center gap-2 flex-wrap bg-white border-t border-slate-100">
          <span className="font-medium text-slate-600 truncate max-w-[180px]">
            {assignedDriver?.displayName ?? "— no driver —"}
          </span>
          <span className="text-slate-300">·</span>
          <span>{run.assignments.length} stop{run.assignments.length !== 1 ? "s" : ""}</span>
          {run.hasHazardous     && <Badge colour="bg-red-100 text-red-700">ADR</Badge>}
          {run.hasTemperatureLoad && <Badge colour="bg-cyan-100 text-cyan-700">❄</Badge>}
        </div>
      )}

      {/* ── Expanded body ── */}
      {!collapsed && (<>
      {/* ── Driver + Trailer assign — full-width rows ── */}
      <div className="flex-shrink-0 border-b border-slate-100 divide-y divide-slate-100">
        <div className={`flex items-center px-3 py-2.5 gap-3 ${run.assignedDriverId ? "" : "bg-amber-50/40"}`}>
          <span className="text-xs font-bold text-muted uppercase tracking-wide w-14 flex-shrink-0">Driver</span>
          <select
            className={`flex-1 text-sm font-medium bg-transparent border-none outline-none cursor-pointer min-w-0 ${run.assignedDriverId ? "text-primary" : "text-slate-400"}`}
            value={run.assignedDriverId ?? ""}
            disabled={saving}
            onChange={e => {
              const driverId = e.target.value ? parseInt(e.target.value, 10) : null;
              const updates: Record<string, unknown> = { assignedDriverId: driverId };
              // Keep status in sync: assigning → "assigned", removing → back to "draft"
              if (!driverId && (run.status === "assigned")) updates.status = "draft";
              if (driverId  && run.status === "draft")      updates.status = "assigned";
              patch(updates);
            }}
          >
            <option value="">— no driver assigned —</option>
            {drivers.map(d => {
              const wp = d.workPattern === "tramper" ? " 🚛" : d.workPattern === "night_driver" ? " 🌙" : d.workPattern === "day_driver" ? " ☀" : "";
              return (
                <option key={d.id} value={d.id}>
                  {d.displayName}{wp}
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex items-center px-3 py-2.5 gap-3">
          <span className="text-xs font-bold text-muted uppercase tracking-wide w-14 flex-shrink-0">Trailer</span>
          <select
            className={`flex-1 text-sm font-medium bg-transparent border-none outline-none cursor-pointer min-w-0 ${run.assignedTrailerId ? "text-primary" : "text-slate-400"}`}
            value={run.assignedTrailerId ?? ""}
            disabled={saving}
            onChange={e => patch({ assignedTrailerId: e.target.value ? parseInt(e.target.value, 10) : null })}
          >
            <option value="">— no trailer —</option>
            {trailers.map(t => (
              <option key={t.id} value={t.id}>
                {t.registration} · {bodyTypeLabel(t.bodyType || t.trailerType)}
                {t.status !== "available" ? ` (${FLEET_STATUS_LABEL[t.status] ?? cap(t.status)})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Capacity bar ── */}
      <CapacityBar run={run} trucks={trucks} />

      {/* ── AI feasibility strip (compact 1-liner) ── */}
      {aiLoading && (
        <div className="px-3 py-1.5 text-xs text-muted animate-pulse bg-slate-50 border-b border-slate-100 flex-shrink-0">
          🤖 Checking route…
        </div>
      )}
      {!aiLoading && aiCheck && (
        <div className={`px-3 py-1.5 text-xs border-b flex-shrink-0 ${
          aiCheck.severity === "block" ? "bg-red-50 text-red-700 border-red-100" :
          aiCheck.severity === "warn"  ? "bg-amber-50 text-amber-700 border-amber-100" :
          "bg-green-50 text-green-700 border-green-100"
        }`}>
          <span className="font-semibold">{aiDot}</span> {aiCheck.reason}
        </div>
      )}

      {/* ── Stop list (scrollable) + drop zone ── */}
      <div
        className="flex-1 overflow-y-auto min-h-0"
        onDragOver={e => { e.preventDefault(); setIsOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false); }}
        onDrop={async e => {
          e.preventDefault(); setIsOver(false);
          // Single-part row drag (individual stop row)
          const partId = parseInt(e.dataTransfer.getData("application/job-part-id"), 10);
          if (!isNaN(partId)) { await onDropPart(partId); return; }
          // Card-level drag — job-id always present; part-ids present when date-scoped card
          const jobId = parseInt(e.dataTransfer.getData("application/job-id"), 10);
          if (!isNaN(jobId)) {
            const partIdsStr = e.dataTransfer.getData("application/job-part-ids");
            const partIds = partIdsStr
              ? partIdsStr.split(",").map(s => parseInt(s, 10)).filter(n => !isNaN(n))
              : undefined;
            await onDropJob(jobId, partIds);
          }
        }}
      >
        {routeItems.length === 0 ? (
          <div className={`m-3 rounded-lg border-2 border-dashed flex flex-col items-center justify-center py-8 text-sm transition-colors ${
            isOver ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-400"
          }`}>
            <span className="text-xl mb-1">📦</span>
            <span>{isOver ? "Drop to add" : "Drag jobs here"}</span>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {/* Stop rows */}
            {(() => {
              let stopNum = 0;
              return routeItems.map(item => {
                if (item.kind === "waypoint") {
                  const w = item.data;
                  return (
                    <div key={`w-${w.id}`} className="flex items-center gap-2 px-3 py-2 rounded bg-slate-50 border border-slate-100 hover:border-slate-200 group transition-colors">
                      <Badge colour="bg-slate-100 text-slate-600">
                        {WAYPOINT_TYPE_LABEL[w.waypointType] ?? w.waypointType}
                      </Badge>
                      <span className="font-medium text-sm text-primary truncate flex-1 min-w-0">
                        {w.location?.siteName ?? w.location?.name ?? w.locationText ?? "—"}
                      </span>
                      {w.scheduledTime && <span className="text-amber-600 flex-shrink-0 tabular-nums text-sm font-bold">{w.scheduledTime}</span>}
                      <button onClick={() => onRemoveWaypoint(run.id, w.id)}
                        className="text-slate-300 hover:text-red-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">✕</button>
                    </div>
                  );
                } else {
                  const a = item.data;
                  stopNum++;
                  const jobStatus   = a.jobPart.job.status ?? "pending";
                  const isCollect   = a.jobPart.type === "collection" || a.jobPart.type === "pickup";
                  const isDeliver   = a.jobPart.type === "delivery"   || a.jobPart.type === "dropoff";
                  const cargoReady  = ["collected","arrived_dropoff","completed"].includes(jobStatus);
                  const cargoMoving = jobStatus === "arrived_dropoff";
                  const cargoDone   = jobStatus === "completed";
                  // Cargo state pill — shown only when there's something actionable to flag
                  const cargoPill =
                    isDeliver && !cargoReady  ? <span className="flex-shrink-0 text-[10px] font-semibold px-1 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200 whitespace-nowrap" title="Collection not confirmed yet — cargo may not be ready">⏳ Not collected</span> :
                    isDeliver && cargoMoving  ? <span className="flex-shrink-0 text-[10px] font-semibold px-1 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 whitespace-nowrap">🚛 At drop-off</span> :
                    isDeliver && cargoDone    ? <span className="flex-shrink-0 text-[10px] font-semibold px-1 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">✅ Delivered</span> :
                    isCollect && cargoReady   ? <span className="flex-shrink-0 text-[10px] font-semibold px-1 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">✅ Collected</span> :
                    null;
                  return (
                    <div key={`a-${a.id}`}>
                      {/* Drop indicator — blue line ABOVE the target stop */}
                      {reorderOverId === a.id && reorderDragId !== a.id && (
                        <div className="h-0.5 bg-primary rounded-full mx-1 mb-0.5" />
                      )}
                    <div
                      draggable
                      onDragStart={e => {
                        e.stopPropagation(); // don't trigger outer lane drag
                        setReorderDragId(a.id);
                        e.dataTransfer.setData("application/run-assignment", String(a.id));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={e => {
                        if (e.dataTransfer.types.includes("application/run-assignment")) {
                          e.preventDefault(); e.stopPropagation();
                          setReorderOverId(a.id);
                        }
                      }}
                      onDragLeave={e => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setReorderOverId(null);
                      }}
                      onDrop={async e => {
                        if (e.dataTransfer.types.includes("application/run-assignment")) {
                          e.preventDefault(); e.stopPropagation();
                          await handleReorderDrop(a.id);
                        }
                      }}
                      onDragEnd={() => { setReorderDragId(null); setReorderOverId(null); }}
                      className={`flex flex-col rounded bg-white border border-slate-100 hover:border-slate-300 overflow-hidden group transition-colors ${
                        reorderDragId === a.id ? "opacity-40 ring-1 ring-primary" : ""
                      }`}
                      style={{ borderLeft: `3px solid ${getJobColour(a.jobId)}` }}
                    >
                      {/* Row 1: drag handle · stop number · type badge · customer · X */}
                      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-0.5">
                        <span
                          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0 select-none text-[14px] leading-none"
                          title="Drag to reorder"
                        >⠿</span>
                        <span className="w-5 text-center font-bold text-slate-400 flex-shrink-0 text-[11px]">{stopNum}</span>
                        <Badge colour={
                          a.jobPart.type === "collection" || a.jobPart.type === "pickup"
                            ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                        }>
                          {STOP_TYPE_LABEL_SHORT[a.jobPart.type] ?? a.jobPart.type}
                        </Badge>
                        <span className="font-semibold text-[13px] text-primary truncate flex-1 min-w-0">
                          {a.jobPart.job.customerName ?? "—"}
                        </span>
                        <button
                          onClick={() => onRemoveStop(run.id, a.id)}
                          className="text-slate-300 hover:text-red-500 flex-shrink-0 text-sm leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove stop"
                        >✕</button>
                      </div>
                      {/* Row 2: address · time window */}
                      <div className="flex items-center gap-1.5 px-2 pb-1 pl-9">
                        <span className="text-[11px] text-slate-500 truncate flex-1 min-w-0">
                          {a.jobPart.postcode && a.jobPart.locationTextSnapshot
                            ? <><span className="font-medium text-slate-600">{a.jobPart.postcode}</span> · {a.jobPart.locationTextSnapshot}</>
                            : a.jobPart.postcode
                            ? <span className="font-medium text-slate-600">{a.jobPart.postcode}</span>
                            : a.jobPart.locationTextSnapshot
                            ? a.jobPart.locationTextSnapshot
                            : <span className="text-slate-400 italic">No address</span>
                          }
                        </span>
                        {a.jobPart.timeWindowStart && (() => {
                          const tws = a.jobPart.timeWindowStart!;
                          const stopLocalDate = new Date(tws).toLocaleDateString("en-GB");
                          const runLocalDate  = run.plannedDate ? new Date(run.plannedDate).toLocaleDateString("en-GB") : null;
                          const wrongDay      = runLocalDate && stopLocalDate !== runLocalDate;
                          return (
                            <span className="flex items-center gap-0.5 flex-shrink-0">
                              {wrongDay && (
                                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 border border-slate-200 rounded px-1 leading-tight">
                                  {new Date(tws).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                </span>
                              )}
                              <span className="font-bold tabular-nums text-[12px] text-amber-700">
                                {fmtTime(tws)}{a.jobPart.timeWindowEnd ? `–${fmtTime(a.jobPart.timeWindowEnd)}` : ""}
                              </span>
                            </span>
                          );
                        })()}
                      </div>
                      {/* Row 3: load details (only when present) */}
                      {((a.jobPart.job.weight ?? 0) > 0 || (a.jobPart.job.quantity ?? 0) > 0) && (
                        <div className="flex items-center gap-2 px-2 pb-1 pl-9">
                          {(a.jobPart.job.weight ?? 0) > 0 && (
                            <span className="text-[10px] text-muted">{a.jobPart.job.weight!.toLocaleString()} kg</span>
                          )}
                          {(a.jobPart.job.quantity ?? 0) > 0 && (
                            <span className="text-[10px] text-muted">
                              {a.jobPart.job.quantity}{a.jobPart.job.quantityUnit ? ` ${cap(a.jobPart.job.quantityUnit)}` : ""}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Row 4: cargo state pill */}
                      {cargoPill && (
                        <div className="flex items-center gap-1 px-2 pb-1 pl-9">
                          {cargoPill}
                        </div>
                      )}
                    </div>
                    </div>
                  );
                }
              });
            })()}

            {/* Reorder loading overlay */}
            {reordering && (
              <div className="text-xs text-muted text-center py-2 animate-pulse">Reordering…</div>
            )}

            {/* Delivery-before-collection warning */}
            {deliveryBeforeCollection && (
              <div className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-1.5">
                ⚠ Delivery appears before collection — check order
              </div>
            )}

            {/* Day driver on multi-day run */}
            {dayDriverMultiDayWarning && (
              <div className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded px-2 py-1.5">
                ⚠ Day driver — stops span multiple days. Add a depot return and a new run for the following day.
              </div>
            )}

            {/* Drop zone overlay (when has stops + hovering) */}
            {isOver && routeItems.length > 0 && (
              <div className="rounded border-2 border-dashed border-primary bg-primary/5 py-3 text-center text-sm text-primary">
                Drop to add to run
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Action bar ── */}
      <div className="flex-shrink-0 border-t border-slate-100 bg-slate-50">
        {/* Waypoint + optimise tools */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-wrap">
          <button
            onClick={() => {
              if (!showWpForm) { setWpLocId(depot?.id ?? ""); setWpShowCreate(false); setWpPosition(-2); loadSavedLocs(); }
              setShowWpForm(v => !v);
              setShowOvernightForm(false);
            }}
            className={`text-xs font-semibold px-2.5 py-1.5 rounded border transition-colors ${
              showWpForm
                ? "bg-slate-100 text-slate-600 border-slate-200"
                : "bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary"
            }`}
          >
            {showWpForm ? "✕ Cancel" : "+ Waypoint"}
          </button>
          <button
            onClick={() => { setShowOvernightForm(v => !v); setShowWpForm(false); }}
            className={`text-xs font-semibold px-2.5 py-1.5 rounded border transition-colors ${
              showOvernightForm
                ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600"
            }`}
            title="Auto-create a delivery run for the next day after an overnight rest"
          >
            {showOvernightForm ? "✕ Cancel" : "🌙 Overnight run"}
          </button>
          {run.assignments.length >= 2 && !confirmingOptimise && (
            <button
              onClick={() => onOptimiseRoute(run.id)}
              disabled={optimising}
              className="text-xs font-semibold px-2.5 py-1.5 rounded border bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary disabled:opacity-40 ml-auto transition-colors"
              title="Sort stops in geographically optimal order"
            >
              {optimising ? "⟳ Sorting…" : "⟡ Optimise route"}
            </button>
          )}
          {confirmingOptimise && (
            <div className="ml-auto flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Reorder stops?</span>
              <button onClick={() => onConfirmOptimise(run.id)} className="text-white bg-primary rounded px-3 py-1.5 font-semibold">Yes</button>
              <button onClick={() => onOptimiseRoute(-1)} className="text-slate-500 hover:text-slate-700 px-2 py-1.5">Cancel</button>
            </div>
          )}
        </div>

        {/* Waypoint form */}
        {showWpForm && (
          <div className="px-2 py-2 border-b border-slate-100 space-y-2 bg-white">
            <select className="input text-sm py-1.5 w-full" value={wpPosition}
              onChange={e => setWpPosition(parseInt(e.target.value, 10))}>
              <option value={-2}>Before all stops (depot start)</option>
              {(() => {
                const items = [
                  ...[...run.assignments].sort((a, b) => a.sequenceNumber - b.sequenceNumber).map(a => ({
                    key: `a-${a.id}`, seq: a.sequenceNumber,
                    label: `${STOP_TYPE_LABEL_SHORT[a.jobPart.type] ?? a.jobPart.type} — ${a.jobPart.job.customerName ?? a.jobPart.locationTextSnapshot ?? "Unknown"}`,
                  })),
                  ...[...run.waypoints].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
                    .filter(w => w.waypointType !== "depot_start" && w.waypointType !== "return_to_base")
                    .map(w => ({
                      key: `w-${w.id}`, seq: w.sequenceNumber,
                      label: `${WAYPOINT_TYPE_LABEL[w.waypointType] ?? w.waypointType}: ${w.location?.siteName ?? w.location?.name ?? w.locationText ?? "—"}`,
                    })),
                ].sort((a, b) => a.seq - b.seq);
                return items.map((item, i) => <option key={item.key} value={i}>After: {item.label}</option>);
              })()}
              <option value={-1}>After all stops (return to depot)</option>
            </select>

            {/* Stop type — only for mid-route stops (not depot start / return to base) */}
            {wpPosition !== -2 && wpPosition !== -1 && (
              <select className="input text-sm py-1.5 w-full" value={wpType}
                onChange={e => setWpType(e.target.value)}>
                <option value="custom">Stop / other</option>
                <option value="yard_pickup">Yard pickup</option>
                <option value="hub_drop">Hub drop</option>
                <option value="overnight_rest">Overnight rest</option>
              </select>
            )}

            {locsLoading && <div className="text-muted animate-pulse text-xs">Loading locations…</div>}
            {!locsLoading && !wpShowCreate && (
              <>
                {savedLocs.length > 0 ? (
                  <select className="input text-sm py-1.5 w-full" value={wpLocId}
                    onChange={e => setWpLocId(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">— select location —</option>
                    {savedLocs.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.siteName ? `${l.siteName} (${l.name})` : l.name}
                        {l.town ? ` · ${l.town}` : ""}{l.postcode ? ` · ${l.postcode}` : ""}
                        {l.id === depot?.id ? " 🏭" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs text-muted italic">No saved locations</div>
                )}
                <button type="button" onClick={() => { setWpShowCreate(true); setWpLocId(""); }}
                  className="text-xs text-accent hover:underline">+ New address</button>
              </>
            )}
            {!locsLoading && wpShowCreate && (
              <>
                <input type="text" className="input text-sm py-1.5 w-full"
                  placeholder={`${wpPosition === -2 || wpPosition === -1 ? "Depot name" : "Name"} *`}
                  value={wpNewName} onChange={e => setWpNewName(e.target.value)} />
                <input type="text" className="input text-sm py-1.5 w-full" placeholder="Street *"
                  value={wpNewStreet} onChange={e => setWpNewStreet(e.target.value)} />
                <div className="grid grid-cols-2 gap-1">
                  <input type="text" className="input text-sm py-1.5" placeholder="Town"
                    value={wpNewTown} onChange={e => setWpNewTown(e.target.value)} />
                  <input type="text" className="input text-sm py-1.5" placeholder="Postcode"
                    value={wpNewPostcode} onChange={e => setWpNewPostcode(e.target.value.toUpperCase())} />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <input type="number" step="any" className="input text-sm py-1.5" placeholder="Lat"
                    value={wpNewLat} onChange={e => setWpNewLat(e.target.value)} />
                  <input type="number" step="any" className="input text-sm py-1.5" placeholder="Lng"
                    value={wpNewLng} onChange={e => setWpNewLng(e.target.value)} />
                </div>
                {wpNewPostcode.trim() && (
                  <button type="button" onClick={geocodePostcode} disabled={wpGeoLoading}
                    className="text-xs text-accent hover:underline disabled:opacity-50">
                    {wpGeoLoading ? "Looking up…" : "Auto-fill from postcode"}
                  </button>
                )}
                {savedLocs.length > 0 && (
                  <button type="button"
                    onClick={() => { setWpShowCreate(false); setWpNewName(""); setWpNewStreet(""); setWpNewTown(""); setWpNewPostcode(""); }}
                    className="text-xs text-accent hover:underline block">← Pick existing</button>
                )}
              </>
            )}

            <input type="time" className="input text-sm py-1.5 w-full" placeholder="Expected time *"
              value={wpTime} onChange={e => setWpTime(e.target.value)} />
            <button
              onClick={handleAddWaypoint}
              disabled={wpAdding || locsLoading || !wpTime || (!wpShowCreate && !wpLocId) || (wpShowCreate && (!wpNewName.trim() || !wpNewStreet.trim()))}
              className="btn text-sm py-2 px-3 bg-accent text-white disabled:opacity-40 w-full"
            >
              {wpAdding ? "Adding…" : wpShowCreate && (wpPosition === -2 || wpPosition === -1) ? "Save depot & add" : "Add stop"}
            </button>
          </div>
        )}

        {/* Overnight rest form */}
        {showOvernightForm && (
          <div className="px-2 py-2 border-b border-slate-100 space-y-2 bg-indigo-50/40">
            <div className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
              🌙 Create overnight delivery run
            </div>
            <div className="text-xs text-slate-500 leading-relaxed">
              Driver rests at a roadside location. System creates a new relay run for the next day — same driver &amp; trailer, starting at the rest coordinates.
            </div>

            {/* Rest location */}
            <input
              type="text" className="input text-sm py-1.5 w-full"
              placeholder="Rest location name (e.g. M1 Northampton Services)"
              value={orLocation} onChange={e => setOrLocation(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-1">
              <input
                type="text" className="input text-sm py-1.5"
                placeholder="Postcode (optional)"
                value={orPostcode}
                onChange={e => setOrPostcode(e.target.value.toUpperCase())}
                onBlur={async () => {
                  if (!orPostcode.trim()) return;
                  setOrGeoLoading(true);
                  try {
                    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(orPostcode.trim())}`);
                    const j = await r.json();
                    if (j.result) { setOrLat(String(j.result.latitude)); setOrLng(String(j.result.longitude)); }
                  } catch { /* ignore */ } finally { setOrGeoLoading(false); }
                }}
              />
              <div className="flex items-center gap-1">
                <input type="number" step="any" className="input text-sm py-1.5 flex-1 min-w-0" placeholder="Lat" value={orLat} onChange={e => setOrLat(e.target.value)} />
                <input type="number" step="any" className="input text-sm py-1.5 flex-1 min-w-0" placeholder="Lng" value={orLng} onChange={e => setOrLng(e.target.value)} />
              </div>
            </div>
            {orGeoLoading && <div className="text-xs text-muted animate-pulse">Looking up postcode…</div>}

            {/* Shift end time + rest hours */}
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="text-[10px] font-semibold text-muted block mb-0.5">Shift end (date + time)</label>
                <input
                  type="datetime-local" className="input text-sm py-1.5 w-full"
                  value={orShiftEnd} onChange={e => setOrShiftEnd(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted block mb-0.5">DVLA rest</label>
                <select className="input text-sm py-1.5 w-full" value={orRestHours}
                  onChange={e => setOrRestHours(parseInt(e.target.value, 10) as 9 | 11)}>
                  <option value={11}>11h — standard</option>
                  <option value={9}>9h — reduced</option>
                </select>
              </div>
            </div>

            {/* Move deliveries toggle */}
            {run.assignments.filter(a => ["delivery","dropoff"].includes(a.jobPart.type ?? "")).length > 0 && (
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={orMoveParts} onChange={e => setOrMoveParts(e.target.checked)} />
                <span>Move {run.assignments.filter(a => ["delivery","dropoff"].includes(a.jobPart.type ?? "")).length} delivery stop{run.assignments.filter(a => ["delivery","dropoff"].includes(a.jobPart.type ?? "")).length !== 1 ? "s" : ""} to new run</span>
              </label>
            )}

            {orShiftEnd && (
              <div className="text-xs text-indigo-600 font-medium">
                Delivery run starts: {new Date(new Date(orShiftEnd).getTime() + orRestHours * 3600000).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            )}

            <button
              onClick={async () => {
                setOrCreating(true);
                try {
                  await onCreateOvernightRun(run.id, {
                    restLocationText: orLocation.trim() || undefined,
                    restPostcode:     orPostcode.trim() || undefined,
                    restLat:          orLat ? parseFloat(orLat) : undefined,
                    restLng:          orLng ? parseFloat(orLng) : undefined,
                    shiftEndIso:      orShiftEnd ? new Date(orShiftEnd).toISOString() : undefined,
                    restHours:        orRestHours,
                    moveDeliveries:   orMoveParts,
                  });
                  setShowOvernightForm(false);
                  // Reset form
                  setOrLocation(""); setOrPostcode(""); setOrLat(""); setOrLng("");
                  setOrShiftEnd(""); setOrRestHours(11); setOrMoveParts(true);
                } finally { setOrCreating(false); }
              }}
              disabled={orCreating}
              className="btn text-sm py-2 px-3 bg-indigo-600 text-white disabled:opacity-40 w-full"
            >
              {orCreating ? "Creating…" : "🌙 Create delivery run"}
            </button>
          </div>
        )}

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings(v => !v)}
          className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:text-primary hover:bg-white transition-colors flex items-center gap-1.5"
        >
          <span>{showSettings ? "▲" : "▼"}</span>
          <span className="font-medium">{showSettings ? "Hide settings" : "⚙ Run settings"}</span>
          {(saving || reordering) && <span className="ml-auto text-xs text-muted animate-pulse">{reordering ? "Reordering…" : "Saving…"}</span>}
        </button>

        {showSettings && (
          <div className="px-3 pb-3 pt-2 space-y-3 bg-white border-t border-slate-100">
            {err && <div className="text-sm text-red-600">{err}</div>}

            {/* Run type */}
            <div>
              <label className="text-xs font-semibold text-muted block mb-1">Run type</label>
              <select className="input text-sm w-full py-1.5" value={run.runType ?? "direct"} disabled={saving}
                onChange={e => patch({ runType: e.target.value })}>
                {Object.entries(RUN_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {/* Relay dependency */}
            {(run.runType === "relay" || run.dependsOnRunId) && (
              <div>
                <label className="text-xs font-semibold text-muted block mb-1">Locked until run</label>
                <select className="input text-sm w-full py-1.5" value={run.dependsOnRunId ?? ""} disabled={saving}
                  onChange={e => patch({ dependsOnRunId: e.target.value ? parseInt(e.target.value, 10) : null })}>
                  <option value="">— no dependency —</option>
                  {allRuns.filter(r => r.id !== run.id).map(r => (
                    <option key={r.id} value={r.id}>{r.runReference} ({r.status})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Truck */}
            <div>
              <label className="text-xs font-semibold text-muted block mb-1">Truck unit</label>
              <select className="input text-sm w-full py-1.5" value={run.assignedTruckId ?? ""} disabled={saving}
                onChange={e => patch({ assignedTruckId: e.target.value ? parseInt(e.target.value, 10) : null })}>
                <option value="">— no truck —</option>
                {trucks.map(t => <option key={t.id} value={t.id}>{t.registration}{t.gvwClass ? ` · ${t.gvwClass}` : ""}</option>)}
              </select>
            </div>

            {/* Planner notes */}
            <div>
              <label className="text-xs font-semibold text-muted block mb-1">Notes for driver</label>
              <textarea className="input text-sm w-full resize-none" rows={2}
                placeholder="Notes…"
                defaultValue={run.plannerNotes ?? ""}
                onBlur={e => { if (e.target.value !== (run.plannerNotes ?? "")) patch({ plannerNotes: e.target.value }); }}
              />
            </div>
          </div>
        )}

        {/* Publish / Recall */}
        <div className="px-3 py-2 space-y-1.5">
          {canPublish ? (
            <>
              {!run.assignedDriverId && run.assignments.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  Assign a driver before publishing
                </div>
              )}
              <button
                onClick={handlePublish}
                disabled={publishing || run.assignments.length === 0 || !run.assignedDriverId}
                className="btn text-sm px-3 py-2 bg-primary text-white disabled:opacity-40 w-full"
              >
                {publishing ? "Publishing…" : "📤 Publish to driver"}
              </button>
            </>
          ) : run.publishedToDriver ? (
            <div className="space-y-1.5">
              <div className="text-center text-[11px] text-green-700 font-medium">✓ Published to driver</div>
              <button
                onClick={handleRecall}
                disabled={recalling}
                className="btn text-sm px-3 py-2 w-full border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
              >
                {recalling ? "Recalling…" : "↩ Recall run"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      </>)}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarCounts {
  needs_attention: number;
  in_custody:      number;
  ready_today:     number;
  future:          number;
  byVehicle:       Record<string, number>;
  byArea:          Record<string, number>;  // postcode district → job count
}

const VEHICLE_ORDER = [
  "van", "rigid", "artic", "artic_curtainsider", "artic_fridge",
  "flatbed", "taillift", "tail_lift", "hiab", "adr",
];
const VEHICLE_LABELS: Record<string, string> = {
  van: "Van", rigid: "Rigid", artic: "Artic", artic_curtainsider: "Artic — Curtainsider",
  artic_fridge: "Artic — Fridge", flatbed: "Flatbed", taillift: "Tail lift",
  tail_lift: "Tail lift", hiab: "HIAB", adr: "ADR",
};

function Sidebar({
  counts,
  activePool,
  onPoolChange,
  activeVehicle,
  onVehicleChange,
  activeArea,
  onAreaChange,
}: {
  counts:          SidebarCounts;
  activePool:      string | null;
  onPoolChange:    (p: string | null) => void;
  activeVehicle:   string | null;
  onVehicleChange: (v: string | null) => void;
  activeArea:      string | null;
  onAreaChange:    (a: string | null) => void;
}) {
  const vehicleEntries = Object.entries(counts.byVehicle)
    .sort(([a], [b]) => (VEHICLE_ORDER.indexOf(a) - VEHICLE_ORDER.indexOf(b)) || a.localeCompare(b));
  const areaEntries = Object.entries(counts.byArea)
    .sort(([a], [b]) => a.localeCompare(b));

  function SidebarItem({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left flex items-center justify-between px-2.5 py-2 rounded text-sm transition-colors ${
          active ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100 hover:text-primary"
        }`}
      >
        <span className="truncate">{label}</span>
        {active ? (
          <span className="text-xs font-bold flex-shrink-0 ml-1 text-white/80">✕</span>
        ) : (
          <span className="text-xs font-bold flex-shrink-0 ml-1 tabular-nums text-muted">{count}</span>
        )}
      </button>
    );
  }

  return (
    <aside className="w-44 flex-shrink-0 border-r border-border bg-slate-50/50 overflow-y-auto flex flex-col gap-0.5 py-2">
      {/* Work Pools */}
      <div className="px-2.5 py-1 text-xs font-bold text-muted uppercase tracking-wide">Work pools</div>
      <SidebarItem label="⚠ Needs attention" count={counts.needs_attention} active={activePool === "needs_attention"} onClick={() => onPoolChange(activePool === "needs_attention" ? null : "needs_attention")} />
      <SidebarItem label="📦 In custody" count={counts.in_custody} active={activePool === "in_custody"} onClick={() => onPoolChange(activePool === "in_custody" ? null : "in_custody")} />
      <SidebarItem label="📅 Ready today" count={counts.ready_today} active={activePool === "ready_today"} onClick={() => onPoolChange(activePool === "ready_today" ? null : "ready_today")} />
      <SidebarItem label="🗓 Future" count={counts.future} active={activePool === "future"} onClick={() => onPoolChange(activePool === "future" ? null : "future")} />

      {/* By Vehicle */}
      {vehicleEntries.length > 0 && (
        <>
          <div className="px-2.5 pt-3 pb-1 text-xs font-bold text-muted uppercase tracking-wide">By vehicle</div>
          {vehicleEntries.map(([v, c]) => (
            <SidebarItem
              key={v}
              label={VEHICLE_LABELS[v] ?? cap(v)}
              count={c}
              active={activeVehicle === v}
              onClick={() => onVehicleChange(activeVehicle === v ? null : v)}
            />
          ))}
        </>
      )}

      {/* By Area (postcode district) */}
      {areaEntries.length > 0 && (
        <>
          <div className="px-2.5 pt-3 pb-1 text-xs font-bold text-muted uppercase tracking-wide">By area</div>
          {areaEntries.map(([a, c]) => (
            <SidebarItem
              key={a}
              label={`📍 ${a}`}
              count={c}
              active={activeArea === a}
              onClick={() => onAreaChange(activeArea === a ? null : a)}
            />
          ))}
        </>
      )}

      {/* Clear all filters */}
      {(activePool || activeVehicle || activeArea) && (
        <div className="px-2.5 pt-3">
          <button
            onClick={() => { onPoolChange(null); onVehicleChange(null); onAreaChange(null); }}
            className="text-xs text-accent hover:underline font-medium"
          >
            ✕ Clear filters
          </button>
        </div>
      )}
    </aside>
  );
}

function matchesWorkItem(item: PlannerWorkItem, q: string): boolean {
  const lq = q.toLowerCase();
  return [
    item.customerName, item.jobReference, item.nextAction,
    item.currentLocation, item.finalDestination, item.finalPostcode,
    item.currentPostcode, item.goodsType, item.goodsDescription,
  ].some(v => (v ?? "").toLowerCase().includes(lq));
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlanningBoardPage() {
  const [date,           setDate]           = useState(today());
  const [lookAheadDays,  setLookAheadDays]  = useState(0);
  const [search,         setSearch]         = useState("");
  const [workItems,      setWorkItems]      = useState<PlannerWorkItem[]>([]);
  const [clusters,       setClusters]       = useState<StopCluster[]>([]);
  const [runs,           setRuns]           = useState<PlanningRun[]>([]);
  const [trailers,       setTrailers]       = useState<FleetTrailer[]>([]);
  const [trucks,         setTrucks]         = useState<FleetUnit[]>([]);
  const [depot,          setDepot]          = useState<DepotLocation | null>(null);
  const [drivers,        setDrivers]        = useState<PlanningDriver[]>([]);
  const [loadingLeft,    setLoadingLeft]    = useState(false);
  const [loadingRight,   setLoadingRight]   = useState(false);
  const [err,            setErr]            = useState("");
  const [mobileTab,      setMobileTab]      = useState<"jobs" | "runs">("jobs");
  const [creatingRun,    setCreatingRun]    = useState(false);

  // Sidebar filters
  const [activePool,    setActivePool]    = useState<string | null>(null);
  const [activeVehicle, setActiveVehicle] = useState<string | null>(null);
  const [activeArea,    setActiveArea]    = useState<string | null>(null);

  // Batch selection
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set());
  const [batchRunId,     setBatchRunId]     = useState<number | "">("");
  const [batchAdding,    setBatchAdding]    = useState(false);

  // Collapsed run cards (lifted so state survives data reloads)
  const [collapsedRunIds, setCollapsedRunIds] = useState<Set<number>>(new Set());

  function toggleRunCollapsed(runId: number) {
    setCollapsedRunIds(prev => {
      const n = new Set(prev);
      if (n.has(runId)) n.delete(runId); else n.add(runId);
      return n;
    });
  }

  // Route optimise loading + inline confirmation
  const [optimisingRunIds,   setOptimisingRunIds]   = useState<Set<number>>(new Set());
  const [confirmOptimiseId,  setConfirmOptimiseId]  = useState<number | null>(null);

  // End date of unplanned window
  const dateTo = useMemo(() => addDays(date, lookAheadDays), [date, lookAheadDays]);

  // ── Sidebar counts ──────────────────────────────────────────────────────────
  const sidebarCounts = useMemo<SidebarCounts>(() => {
    const needs = new Set<number>();
    const custody = new Set<number>();
    const todayIds = new Set<number>();
    const future = new Set<number>();
    const byVehicle: Record<string, Set<number>> = {};
    const byArea: Record<string, Set<number>> = {};

    for (const item of workItems) {
      const gk = item.groupKey;
      if (gk === "needs_attention") needs.add(item.jobId);
      else if (gk === "in_custody") custody.add(item.jobId);
      else if (gk === "future")     future.add(item.jobId);
      else                          todayIds.add(item.jobId);

      const vc = item.vehicleCategory?.toLowerCase();
      if (vc) {
        if (!byVehicle[vc]) byVehicle[vc] = new Set();
        byVehicle[vc].add(item.jobId);
      }

      // Postcode district grouping — use the stop's own district
      if (item.postcodeDistrict) {
        if (!byArea[item.postcodeDistrict]) byArea[item.postcodeDistrict] = new Set();
        byArea[item.postcodeDistrict].add(item.jobId);
      }
    }

    return {
      needs_attention: needs.size,
      in_custody:      custody.size,
      ready_today:     todayIds.size,
      future:          future.size,
      byVehicle: Object.fromEntries(Object.entries(byVehicle).map(([k, v]) => [k, v.size])),
      byArea:    Object.fromEntries(Object.entries(byArea).map(([k, v]) => [k, v.size])),
    };
  }, [workItems]);

  // ── Filtered work items (search + sidebar) ──────────────────────────────────
  const filteredWorkItems = useMemo(() => {
    return workItems.filter(item => {
      const gk = item.groupKey;

      if (activePool === "needs_attention" && gk !== "needs_attention") return false;
      if (activePool === "in_custody"      && gk !== "in_custody")      return false;
      if (activePool === "future"          && gk !== "future")           return false;
      if (activePool === "ready_today" && (gk === "needs_attention" || gk === "in_custody" || gk === "future")) return false;

      if (activeVehicle && (item.vehicleCategory?.toLowerCase() ?? "") !== activeVehicle) return false;
      if (activeArea    && item.postcodeDistrict !== activeArea) return false;

      if (search.trim() && !matchesWorkItem(item, search.trim())) return false;
      return true;
    });
  }, [workItems, activePool, activeVehicle, activeArea, search]);

  // ── Build JobWorkGroups (grouped by part date) ──────────────────────────────
  // Each part is placed under its OWN date bucket so multi-day jobs appear in
  // BOTH a collection-date card AND a delivery-date card.
  // Parts with the same jobId AND the same date are merged into one card.
  // Priority buckets: needs_attention → in_custody → date_YYYY-MM-DD (asc) → future
  const jobWorkGroupsByDisplayKey = useMemo(() => {
    const riskOrder = { high: 3, medium: 2, low: 1, none: 0 } as const;

    // Step 1: bucket each part into (jobId × displayKey) cards
    // cardKey = `${jobId}:${displayKey}`
    const byCard = new Map<string, { displayKey: string; parts: PlannerWorkItem[] }>();
    for (const item of filteredWorkItems) {
      const gk = item.groupKey;
      let displayKey: string;
      if      (gk === "needs_attention") displayKey = "needs_attention";
      else if (gk === "in_custody")      displayKey = "in_custody";
      else {
        const d = partDate(item);
        displayKey = d ? `date_${d}` : "future";
      }
      const cardKey = `${item.jobId}:${displayKey}`;
      if (!byCard.has(cardKey)) byCard.set(cardKey, { displayKey, parts: [] });
      byCard.get(cardKey)!.parts.push(item);
    }

    // Step 2: build JobWorkGroups and bucket by displayKey
    const byGroup = new Map<string, JobWorkGroup[]>();
    for (const [, { displayKey, parts }] of byCard) {
      const rep       = parts[0];
      const riskLevel = parts.reduce<"high"|"medium"|"low"|"none">((best, p) =>
        riskOrder[p.riskLevel] > riskOrder[best] ? p.riskLevel : best, "none");
      const warnings  = [...new Set(parts.flatMap(p => p.warnings))];
      const grp: JobWorkGroup = {
        jobId:        rep.jobId,
        jobReference: rep.jobReference,
        customerName: rep.customerName,
        parts,
        riskLevel,
        warnings,
      };
      if (!byGroup.has(displayKey)) byGroup.set(displayKey, []);
      byGroup.get(displayKey)!.push(grp);
    }

    // Step 3: within each date group sort by stop time → postcode → goods type
    for (const [key, grps] of byGroup) {
      if (!key.startsWith("date_")) continue;
      grps.sort((a, b) => {
        const ca = a.parts.find(p => p.nextAction.startsWith("Collect")) ?? a.parts[0];
        const cb = b.parts.find(p => p.nextAction.startsWith("Collect")) ?? b.parts[0];
        const ta = ca.timeWindowStart ?? ca.bookedTime ?? "9999";
        const tb = cb.timeWindowStart ?? cb.bookedTime ?? "9999";
        if (ta !== tb) return ta < tb ? -1 : 1;
        const pa = ca.currentPostcode ?? "";
        const pb = cb.currentPostcode ?? "";
        if (pa !== pb) return pa < pb ? -1 : 1;
        return (a.parts[0].goodsType ?? "").localeCompare(b.parts[0].goodsType ?? "");
      });
    }

    return byGroup;
  }, [filteredWorkItems]);

  const orderedDisplayKeys = useMemo(() => {
    const keys: string[] = [];
    if (jobWorkGroupsByDisplayKey.has("needs_attention")) keys.push("needs_attention");
    if (jobWorkGroupsByDisplayKey.has("in_custody"))      keys.push("in_custody");
    // Date groups sorted chronologically (ISO string sort = calendar order)
    const dateKeys = [...jobWorkGroupsByDisplayKey.keys()]
      .filter(k => k.startsWith("date_"))
      .sort();
    keys.push(...dateKeys);
    if (jobWorkGroupsByDisplayKey.has("future")) keys.push("future");
    return keys;
  }, [jobWorkGroupsByDisplayKey]);

  const totalJobCount = useMemo(() => new Set(filteredWorkItems.map(i => i.jobId)).size, [filteredWorkItems]);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadLeft = useCallback(async (d: string, to: string) => {
    setLoadingLeft(true);
    try {
      const [wiRes, unRes] = await Promise.all([
        planningApi.getWorkItems(d, to),
        planningApi.getUnplanned(d, to),
      ]);
      setWorkItems(wiRes.items);
      setClusters(unRes.clusters);
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setLoadingLeft(false); }
  }, []);

  const loadRight = useCallback(async (d: string) => {
    setLoadingRight(true);
    try { const res = await planningApi.getRuns(d); setRuns(res.runs); }
    catch (e: unknown) { setErr((e as Error).message); }
    finally { setLoadingRight(false); }
  }, []);

  const loadFleet = useCallback(async () => {
    try {
      const res = await planningApi.getFleet();
      setTrailers(res.trailers); setTrucks(res.trucks); setDepot(res.depot ?? null);
    } catch { /* non-fatal */ }
  }, []);

  const loadDrivers = useCallback(async (d: string) => {
    try { const res = await planningApi.getDrivers(d); setDrivers(res.drivers); }
    catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    loadLeft(date, dateTo);
    loadRight(date);
    loadDrivers(date);
  }, [date, dateTo, loadLeft, loadRight, loadDrivers]);

  useEffect(() => { loadFleet(); }, [loadFleet]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  // partIds — when provided, only those parts are added (date-scoped card drop/button).
  // When omitted, all parts of the job are added (batch select, full-job drop).
  async function handleAddJobToRun(jobId: number, runId: number, partIds?: number[]) {
    const jobParts = workItems
      .filter(i => i.jobId === jobId && (!partIds || partIds.includes(i.jobPartId)))
      .sort((a, b) => (a.nextAction.startsWith("Collect") ? 0 : 1) - (b.nextAction.startsWith("Collect") ? 0 : 1));

    if (jobParts.length > 0) {
      for (const part of jobParts) {
        try { await planningApi.addStop(runId, part.jobPartId); } catch { /* skip */ }
      }
    } else if (!partIds) {
      // Fallback to clusters only when doing a full-job add (no partIds filter)
      const allStops = clusters.flatMap(c => c.stops)
        .filter(s => s.jobId === jobId)
        .sort((a, b) => (COLLECT_FIRST.has(a.type) ? 0 : 1) - (COLLECT_FIRST.has(b.type) ? 0 : 1));
      for (const stop of allStops) {
        try { await planningApi.addStop(runId, stop.id); } catch { /* skip */ }
      }
    }
    await Promise.all([loadLeft(date, dateTo), loadRight(date)]);
    setMobileTab("runs");
  }

  async function handleAddPartToRun(jobPartId: number, runId: number) {
    try { await planningApi.addStop(runId, jobPartId); } catch { /* skip */ }
    await Promise.all([loadLeft(date, dateTo), loadRight(date)]);
    setMobileTab("runs");
  }

  async function handleBatchAddToRun() {
    if (!batchRunId || selectedJobIds.size === 0) return;
    setBatchAdding(true);
    try {
      for (const jobId of selectedJobIds) {
        await handleAddJobToRun(jobId, Number(batchRunId));
      }
      setSelectedJobIds(new Set());
    } finally { setBatchAdding(false); }
  }

  async function handleUpdate(runId: number, patch: Record<string, unknown>) {
    await planningApi.patchRun(runId, patch as Parameters<typeof planningApi.patchRun>[1]);
    await loadRight(date);
  }

  async function handleRemoveStop(runId: number, assignmentId: number) {
    await planningApi.removeStop(runId, assignmentId);
    await Promise.all([loadLeft(date, dateTo), loadRight(date)]);
  }

  async function handleReorderStops(runId: number, assignmentIds: number[]) {
    await planningApi.reorderStops(runId, assignmentIds);
    await loadRight(date);
  }

  async function handlePublish(runId: number) {
    await planningApi.publish(runId);
    await loadRight(date);
  }

  async function handleAddWaypoint(runId: number, waypointType: string, locationText: string, sequenceNumber: number, locationId?: number, scheduledTime?: string) {
    await planningApi.addWaypoint(runId, { waypointType, locationText, sequenceNumber, locationId, scheduledTime });
    await loadRight(date);
  }

  async function handleRemoveWaypoint(runId: number, waypointId: number) {
    await planningApi.removeWaypoint(runId, waypointId);
    await loadRight(date);
  }

  async function handleDeleteRun(runId: number) {
    if (!window.confirm("Delete this run? Stops return to the unplanned list.")) return;
    await planningApi.patchRun(runId, { status: "cancelled" });
    await Promise.all([loadLeft(date, dateTo), loadRight(date)]);
  }

  async function handleCreateRun() {
    setCreatingRun(true);
    try {
      const run = await planningApi.createRun({ date, runType: "direct" });
      setRuns(prev => [...prev, run]);
      setMobileTab("runs");
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setCreatingRun(false); }
  }

  async function handleOptimiseRoute(runId: number) {
    if (runId === -1) { setConfirmOptimiseId(null); return; } // cancel
    const run = runs.find(r => r.id === runId);
    if (!run || run.assignments.length < 2) return;
    setConfirmOptimiseId(runId);
  }

  async function confirmOptimise(runId: number) {
    setConfirmOptimiseId(null);
    const run = runs.find(r => r.id === runId);
    if (!run) return;
    setOptimisingRunIds(prev => new Set(prev).add(runId));
    try {
      const sorted = nearestNeighborSort([...run.assignments]);
      for (const a of run.assignments) {
        await planningApi.removeStop(runId, a.id);
      }
      for (const a of sorted) {
        await planningApi.addStop(runId, a.jobPart.id);
      }
      await Promise.all([loadLeft(date, dateTo), loadRight(date)]);
    } catch {
      setErr("Route optimisation failed — check stops manually");
    } finally {
      setOptimisingRunIds(prev => { const n = new Set(prev); n.delete(runId); return n; });
    }
  }

  async function handleCreateOvernightRun(
    runId: number,
    body: {
      restLocationText?: string;
      restPostcode?: string;
      restLat?: number;
      restLng?: number;
      shiftEndIso?: string;
      restHours?: 9 | 11;
      moveDeliveries?: boolean;
    }
  ) {
    try {
      await planningApi.createOvernightRestRun(runId, body);
      // Reload left panel (delivery stops may have moved) + right panel (new run appeared)
      await Promise.all([loadLeft(date, dateTo), loadRight(date)]);
    } catch (e: unknown) {
      setErr((e as Error).message || "Failed to create overnight run");
    }
  }

  function toggleJobSelect(jobId: number) {
    setSelectedJobIds(prev => {
      const n = new Set(prev);
      if (n.has(jobId)) n.delete(jobId); else n.add(jobId);
      return n;
    });
  }

  const draftRuns = runs.filter(r => r.status === "draft" || r.status === "assigned");

  // Panel title
  const panelTitle = activePool === "needs_attention" ? "Needs Attention" :
    activePool === "in_custody" ? "In Custody" :
    activePool === "future"     ? "Future Jobs" :
    activePool === "ready_today"? "Ready Today" :
    activeVehicle               ? VEHICLE_LABELS[activeVehicle] ?? cap(activeVehicle) :
    activeArea                  ? `Area: ${activeArea}` :
    "All Jobs";

  return (
    <div className="h-full flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b border-border flex-shrink-0 flex-wrap bg-white">
        <h1 className="text-base sm:text-lg font-bold text-primary">Planning</h1>

        <div className="flex items-center gap-1">
          <button onClick={() => setDate(prevDay(date))}
            className="btn px-2 py-1 text-sm border border-border bg-white hover:bg-slate-50">←</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="input text-sm px-2 py-1 w-32" />
          <button onClick={() => setDate(nextDay(date))}
            className="btn px-2 py-1 text-sm border border-border bg-white hover:bg-slate-50">→</button>
          <button onClick={() => setDate(today())}
            className="btn px-2 py-1 text-xs border border-border bg-white hover:bg-slate-50 text-muted">Today</button>
        </div>

        <span className="hidden sm:inline text-sm text-muted">{fmtDate(date)}</span>

        <div className="ml-auto flex gap-1.5">
          <button onClick={handleCreateRun} disabled={creatingRun}
            className="btn text-sm px-3 py-1.5 bg-primary text-white hover:opacity-90 disabled:opacity-40">
            {creatingRun ? "…" : "+ New run"}
          </button>
        </div>
      </div>

      {err && (
        <div className="mx-3 sm:mx-5 mt-2 p-2 bg-red-50 text-red-700 text-sm rounded flex items-center gap-2">
          <span>{err}</span>
          <button onClick={() => setErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── Mobile tab bar ── */}
      <div className="sm:hidden flex border-b border-border flex-shrink-0 bg-white">
        <button onClick={() => setMobileTab("jobs")}
          className={`flex-1 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            mobileTab === "jobs" ? "border-primary text-primary" : "border-transparent text-muted"
          }`}>
          Jobs{totalJobCount > 0 ? ` (${totalJobCount})` : ""}
        </button>
        <button onClick={() => setMobileTab("runs")}
          className={`flex-1 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            mobileTab === "runs" ? "border-primary text-primary" : "border-transparent text-muted"
          }`}>
          Runs{runs.length > 0 ? ` (${runs.length})` : ""}
        </button>
      </div>

      {/* ── 3-panel layout ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Sidebar */}
        <div className="hidden sm:block">
          <Sidebar
            counts={sidebarCounts}
            activePool={activePool}
            onPoolChange={setActivePool}
            activeVehicle={activeVehicle}
            onVehicleChange={setActiveVehicle}
            activeArea={activeArea}
            onAreaChange={setActiveArea}
          />
        </div>

        {/* Jobs panel */}
        <div className={`${mobileTab === "jobs" ? "flex" : "hidden"} sm:flex flex-col w-full sm:w-80 lg:w-96 flex-shrink-0 sm:border-r border-border`}>

          <div className="px-3 pt-3 pb-2 border-b border-border flex-shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-muted">{panelTitle}</div>
                <div className="text-xl font-bold text-primary leading-tight">
                  {totalJobCount}
                  {filteredWorkItems.length !== workItems.length && (
                    <span className="text-sm font-normal text-muted ml-1">of {new Set(workItems.map(i => i.jobId)).size}</span>
                  )}
                </div>
              </div>
              {loadingLeft && <span className="text-xs text-muted animate-pulse">Loading…</span>}
            </div>

            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
              <input type="search" placeholder="Search customer, ref, postcode…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="input text-sm py-2 pl-8 pr-2 w-full" />
            </div>

            <div className="flex gap-1">
              {LOOK_AHEAD_OPTIONS.map(opt => (
                <button key={opt.days} onClick={() => setLookAheadDays(opt.days)}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded border transition-colors ${
                    lookAheadDays === opt.days
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-slate-500 border-slate-300 hover:border-primary hover:text-primary"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
            {!loadingLeft && totalJobCount === 0 && (
              <div className="text-center py-12 text-muted text-sm">
                <div className="text-3xl mb-2">{search ? "🔍" : "✅"}</div>
                <div>{search ? "No jobs match" : "All planned for this period"}</div>
                {search && <button onClick={() => setSearch("")} className="mt-2 text-xs text-accent hover:underline">Clear search</button>}
              </div>
            )}

            {orderedDisplayKeys.map(dk => {
              const grps = jobWorkGroupsByDisplayKey.get(dk) ?? [];
              if (grps.length === 0) return null;

              // Header label + colour
              let headerLabel: string;
              let headerClass: string;
              if (dk === "needs_attention") {
                headerLabel = "Needs attention";
                headerClass = "text-red-600 border-red-200";
              } else if (dk === "in_custody") {
                headerLabel = "Collected — in custody";
                headerClass = "text-blue-700 border-blue-200";
              } else if (dk === "future") {
                headerLabel = "Future";
                headerClass = "text-slate-400 border-slate-200";
              } else if (dk.startsWith("date_")) {
                const d    = dk.slice(5);
                const tom  = addDays(date, 1);
                headerLabel = d === date ? `Today — ${fmtDate(d + "T12:00:00")}` :
                              d === tom  ? `Tomorrow — ${fmtDate(d + "T12:00:00")}` :
                              fmtDate(d + "T12:00:00");
                headerClass = "text-violet-700 border-violet-200";
              } else {
                headerLabel = dk;
                headerClass = "text-slate-400 border-slate-200";
              }

              return (
                <div key={dk} className="mb-3">
                  <div className={`text-xs font-bold uppercase tracking-wider px-1 py-1.5 mb-1 border-b flex items-center justify-between ${headerClass}`}>
                    <span>{headerLabel}</span>
                    <span className="font-normal normal-case text-muted">{grps.length} job{grps.length !== 1 ? "s" : ""}</span>
                  </div>
                  {grps.map(grp => (
                    <JobWorkCard
                      key={`${grp.jobId}:${dk}`}
                      group={grp}
                      draftRuns={draftRuns}
                      selected={selectedJobIds.has(grp.jobId)}
                      onSelectToggle={toggleJobSelect}
                      onAddJobToRun={handleAddJobToRun}
                      onAddPartToRun={handleAddPartToRun}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Batch action bar */}
          {selectedJobIds.size > 0 && (
            <div className="flex-shrink-0 border-t border-border bg-primary/5 px-2 py-2 space-y-1.5">
              <div className="text-xs font-semibold text-primary">{selectedJobIds.size} job{selectedJobIds.size !== 1 ? "s" : ""} selected</div>
              <div className="flex gap-1.5">
                {draftRuns.length === 0 ? (
                  <span className="text-xs text-muted flex-1">Create a run first</span>
                ) : (
                  <>
                    <select className="input text-xs py-1 flex-1 min-w-0"
                      value={batchRunId}
                      onChange={e => setBatchRunId(e.target.value ? Number(e.target.value) : "")}>
                      <option value="">Pick run…</option>
                      {draftRuns.map(r => <option key={r.id} value={r.id}>{r.runReference}{r.driver ? ` · ${r.driver.displayName}` : ""}</option>)}
                    </select>
                    <button onClick={handleBatchAddToRun} disabled={!batchRunId || batchAdding}
                      className="btn text-xs py-1 px-2.5 bg-primary text-white disabled:opacity-40 whitespace-nowrap">
                      {batchAdding ? "…" : "Add →"}
                    </button>
                  </>
                )}
                <button onClick={() => setSelectedJobIds(new Set())}
                  className="btn text-xs py-1 px-2 border border-slate-300 text-slate-500">✕</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Kanban run lanes ── */}
        <div className={`${mobileTab === "runs" ? "block" : "hidden"} sm:block flex-1 overflow-y-auto overflow-x-hidden`}>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 p-3 items-start">

            {!loadingRight && runs.length === 0 && (
              <div className="col-span-1 xl:col-span-2 flex flex-col items-center justify-center text-muted py-16">
                <div className="text-5xl mb-3">🚚</div>
                <div className="text-base font-medium mb-1">No runs yet for {fmtDate(date)}</div>
                <div className="text-sm mb-4">Create a run, then drag jobs into it</div>
                <button onClick={handleCreateRun} disabled={creatingRun}
                  className="btn text-sm px-4 py-2 bg-primary text-white hover:opacity-90">
                  + Create first run
                </button>
              </div>
            )}

            {runs.map(run => (
              <RunLane
                key={run.id}
                run={run}
                trailers={trailers}
                trucks={trucks}
                drivers={drivers}
                depot={depot}
                onDepotSet={setDepot}
                allRuns={runs}
                onUpdate={handleUpdate}
                onRemoveStop={handleRemoveStop}
                onReorderStops={handleReorderStops}
                onAddWaypoint={handleAddWaypoint}
                onRemoveWaypoint={handleRemoveWaypoint}
                onPublish={handlePublish}
                onDelete={handleDeleteRun}
                onDropJob={(jobId, partIds) => handleAddJobToRun(jobId, run.id, partIds)}
                onDropPart={partId => handleAddPartToRun(partId, run.id)}
                onOptimiseRoute={handleOptimiseRoute}
                onConfirmOptimise={confirmOptimise}
                confirmingOptimise={confirmOptimiseId === run.id}
                optimising={optimisingRunIds.has(run.id)}
                collapsed={collapsedRunIds.has(run.id)}
                onToggleCollapsed={() => toggleRunCollapsed(run.id)}
                onCreateOvernightRun={handleCreateOvernightRun}
              />
            ))}

            {/* Add new run tile */}
            <button
              onClick={handleCreateRun}
              disabled={creatingRun}
              className="w-full h-28 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-40"
            >
              <span className="text-3xl leading-none mb-1">{creatingRun ? "⟳" : "+"}</span>
              <span className="text-xs font-semibold">New run</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

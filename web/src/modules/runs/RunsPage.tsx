import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { runsApi, type RunReadiness, type RunCandidates, type Candidate } from "../../api/runs";
import { planningApi, type FleetTrailer, type FleetUnit } from "../../api/planning";
import { driversApi } from "../../api/drivers";
import type { Run, Driver } from "../../types";
import { Button } from "../../components/Button";
import { today, addDays } from "../jobs/createJobUtils";
import { runRoute, runTimes, requiredTrailerLabel } from "./runUtils";
import { BODY_CATEGORIES, GVW_CLASSES, ONBOARD_EQUIPMENT, bodyTypeLabel } from "../../constants/vehicleTaxonomy";

function truckLabel(t: FleetUnit): string {
  const cat = BODY_CATEGORIES.find(c => c.value === t.category)?.label;
  const gvw = GVW_CLASSES.find(g => g.value === t.gvwClass)?.label;
  return [cat, gvw].filter(Boolean).join(" · ");
}
function trailerLabel(t: FleetTrailer): string {
  return t.bodyType || t.trailerType ? bodyTypeLabel(t.bodyType || t.trailerType) : "";
}

const RUN_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", assigned: "Assigned", in_progress: "In Progress",
  completed: "Completed", cancelled: "Cancelled",
};

// Tabs map to the planner's worklist piles (readiness is a gate, not a %).
type Tab = "all" | "missing_driver" | "missing_trailer" | "missing_truck" | "ready" | "done";
type RangeMode = "day" | "week" | "all";
type SortKey = "priority" | "reference" | "readiness";
type GroupKey = "none" | "driver" | "status";

type RunState = "attention" | "ready" | "published" | "done" | "checking";
function runState(run: Run, r: RunReadiness | null | undefined): RunState {
  if (run.status === "cancelled" || run.status === "completed") return "done";
  if (run.publishedToDriver) return "published";
  if (r === undefined) return "checking";
  if (r && r.ready) return "ready";
  return "attention";
}
const STATE_RANK: Record<RunState, number> = { attention: 0, checking: 1, ready: 2, published: 3, done: 4 };
const OUT_OF_SERVICE = new Set(["vor", "off_road", "repair", "decommissioned", "workshop", "disposed"]);

function readinessPct(r: RunReadiness | null | undefined): number {
  if (!r) return -1;
  const { passed, total } = r.resources;
  return total > 0 ? Math.round((passed / total) * 100) : 0;
}

/** Best available + suitable candidate, recommended first — used by Auto allocate. */
function bestCandidate(list: Candidate[]): Candidate | null {
  const avail = list.filter(c => c.available && c.suitable);
  if (!avail.length) return null;
  return [...avail].sort((a, b) => (a.recommended === b.recommended ? 0 : a.recommended ? -1 : 1))[0];
}

/** Deterministic fit score from real signals (not AI) — used only to order/label candidates. */
function fitScore(c: Candidate): number {
  if (!c.available) return 0;
  let s = 100 - c.reasons.length * 8;
  if (!c.suitable) s -= 12;
  return Math.max(45, Math.min(99, s));
}

// ── Inline asset picker — the row IS the allocation UI, and each candidate ────
// shows WHY it fits (fit %, suggested, busy-elsewhere) instead of a blind list.
// Candidates come from the same B4 endpoint the old side panel used, fetched on
// demand when the picker opens (not one call per row on page load).
// Module-level on purpose: defined inside RunsPage it would be remounted on every
// parent re-render, losing its open state and candidate cache.
type PickerKind = "driver" | "truck" | "trailer";
type AssignField = "assignedDriverId" | "assignedTruckId" | "assignedTrailerId";
const FIELD_BY_KIND: Record<PickerKind, AssignField> = {
  driver: "assignedDriverId", truck: "assignedTruckId", trailer: "assignedTrailerId",
};
const POPOVER_WIDTH = 300;
const KIND_META: Record<PickerKind, { icon: string; noun: string }> = {
  driver:  { icon: "👤", noun: "driver" },
  truck:   { icon: "🚚", noun: "truck" },
  trailer: { icon: "🚛", noun: "trailer" },
};

/** "John Smith" → "JS" for the driver avatar circle. */
function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function AssetPicker({ run, kind, currentId, currentLabel, subtitle, saving, onAssign }: {
  run: Run; kind: PickerKind; currentId: number | null; currentLabel: string | null;
  subtitle?: string | null;
  saving: boolean; onAssign: (runId: number, field: AssignField, raw: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cands, setCands] = useState<RunCandidates | null>(null);
  const [loadingCands, setLoadingCands] = useState(false);
  // Fixed-position coords — the table wrapper is overflow-x-auto, which clips
  // absolutely-positioned children, so the popover must escape it via `fixed`.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function close() { setOpen(false); }
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  async function toggleOpen() {
    if (!open) {
      // Anchor the popover to the whole control (chip or placeholder), not the ▾
      // button — with a selected asset the ▾ is only a few px wide.
      const rect = boxRef.current?.getBoundingClientRect();
      if (rect) {
        const width = Math.max(rect.width, POPOVER_WIDTH);
        setPos({
          top:  rect.bottom + 4,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
          width,
        });
      }
      if (!cands) {
        setLoadingCands(true);
        try { setCands(await runsApi.candidates(run.id)); }
        catch { setCands(null); }
        finally { setLoadingCands(false); }
      }
    }
    setOpen(o => !o);
  }

  function pick(id: number | null) {
    setOpen(false);
    onAssign(run.id, FIELD_BY_KIND[kind], id ? String(id) : "");
  }

  const list = kind === "driver" ? cands?.drivers : kind === "truck" ? cands?.trucks : cands?.trailers;
  const sorted = [...(list ?? [])].sort((a, b) =>
    a.available === b.available
      ? (a.recommended === b.recommended ? fitScore(b) - fitScore(a) : a.recommended ? -1 : 1)
      : a.available ? -1 : 1);

  return (
    <div className="relative" ref={boxRef}>
      {currentLabel ? (
        // Assigned → rich chip: avatar/icon, name + subtitle, ✓, clear ×, change ▾
        <div className={`flex items-center gap-1.5 border border-border rounded-lg bg-white pl-1.5 pr-1 py-1 ${saving ? "opacity-60" : ""}`}>
          {kind === "driver" ? (
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {initials(currentLabel)}
            </span>
          ) : (
            <span className="w-6 h-6 rounded bg-slate-100 text-[12px] flex items-center justify-center flex-shrink-0">{KIND_META[kind].icon}</span>
          )}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[12px] font-semibold text-slate-700 truncate">{currentLabel}</span>
            {subtitle && <span className="block text-[10px] text-slate-500 truncate">{subtitle}</span>}
          </span>
          <span className="text-green-600 text-[12px] flex-shrink-0" title="Assigned">✓</span>
          <button type="button" onClick={() => pick(null)} disabled={saving} title={`Remove ${KIND_META[kind].noun}`}
            className="text-slate-300 hover:text-rose-500 text-[14px] leading-none px-0.5 flex-shrink-0">×</button>
          <button ref={btnRef} type="button" onClick={toggleOpen} disabled={saving} title={`Change ${KIND_META[kind].noun}`}
            className="text-slate-400 hover:text-slate-600 text-[9px] px-1 py-1 flex-shrink-0">▾</button>
        </div>
      ) : (
        <button
          ref={btnRef}
          type="button"
          onClick={toggleOpen}
          disabled={saving}
          className="input text-[12px] py-1.5 w-full text-left flex items-center justify-between gap-1 disabled:opacity-60">
          <span className="text-slate-400">Select {KIND_META[kind].noun}</span>
          <span className="text-slate-400 text-[9px] flex-shrink-0">▾</span>
        </button>
      )}
      {open && pos && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
          className="z-30 max-h-80 overflow-y-auto bg-white border border-border rounded-lg shadow-xl">
          {loadingCands && <div className="p-3 text-[12px] text-slate-400">Loading…</div>}
          {!loadingCands && (
            <>
              <button onClick={() => pick(null)} className="w-full text-left px-3 py-2 text-[12px] text-slate-500 hover:bg-slate-50 border-b border-border">
                — Unassigned —
              </button>
              {sorted.map(c => {
                const busyElsewhere = c.busyOn && c.busyOn !== run.runReference ? c.busyOn : null;
                const isCurrent = c.id === currentId;
                return (
                  <button
                    key={c.id}
                    onClick={() => c.available && pick(c.id)}
                    disabled={!c.available}
                    title={c.reasons.join(" · ")}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-50 last:border-0 ${
                      !c.available ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"
                    } ${isCurrent ? "bg-primary/5" : ""}`}>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-[13px] text-primary truncate">{c.label}</span>
                        {isCurrent && <span className="text-primary text-xs">✓</span>}
                        {c.recommended && !isCurrent && <span className="text-[9px] font-bold bg-green-600 text-white px-1 rounded flex-shrink-0">★ Suggested</span>}
                      </span>
                      <span className="block text-[11px] text-slate-500 truncate">
                        {busyElsewhere ? `on ${busyElsewhere}` : c.reasons[0] ?? c.note ?? (c.suitable ? "Available" : "")}
                      </span>
                    </span>
                    <span className={`flex-shrink-0 text-[11px] font-semibold ${
                      !c.available ? "text-slate-400" : c.suitable ? "text-green-600" : "text-amber-600"
                    }`}>
                      {c.available ? `${fitScore(c)}%` : "busy"}
                    </span>
                  </button>
                );
              })}
              {sorted.length === 0 && <div className="p-3 text-[12px] text-slate-400">None found</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Run card — the run's info + allocation controls in one card (2026-07-15 UX ──
// refresh). Module-level for the same remount reason as AssetPicker. Everything
// rendered here is form-born or derived server-side: route/times from stops,
// badges from Run derived requirements, checks straight from the B1 readiness
// endpoint — no invented categories.
interface RunRow {
  run: Run; r: RunReadiness | null | undefined; state: RunState;
  driver: string | null; truck: string | null; trailer: string | null;
}

const WORK_PATTERN_LABELS: Record<string, string> = {
  day_driver: "Day driver", night_driver: "Night driver", tramper: "Tramper",
};
const CHECK_ICON: Record<string, { icon: string; cls: string }> = {
  pass:    { icon: "✓", cls: "text-green-600" },
  warn:    { icon: "⚠", cls: "text-amber-600" },
  fail:    { icon: "✕", cls: "text-rose-600" },
  unknown: { icon: "?", cls: "text-slate-400" },
};

// Where each readiness problem is fixed — the four intake sources + this screen.
// Mirrors the server's check `source` stamp so the planner never has to guess.
const FIX_AT: Record<string, { label: string; to?: string }> = {
  driver:     { label: "Fix on the Drivers page", to: "/app/drivers" },
  fleet:      { label: "Fix on the Fleet page",   to: "/app/fleet" },
  job:        { label: "Fix on the job form",     to: "/app/jobs" },
  allocation: { label: "Fix with the pickers below" },
};

function cardStatusChip(run: Run, state: RunState): { label: string; cls: string } {
  switch (state) {
    case "done":      return { label: RUN_STATUS_LABELS[run.status] ?? run.status, cls: "bg-slate-100 text-slate-500 border-slate-200" };
    case "published": return { label: "Published", cls: "bg-blue-50 text-blue-700 border-blue-200" };
    case "checking":  return { label: "Checking…", cls: "bg-slate-50 text-slate-400 border-slate-200" };
    case "ready":     return { label: "Ready to publish", cls: "bg-green-50 text-green-700 border-green-200" };
    case "attention":
      // Severity-honest colours: no driver blocks publish (hard), truck/trailer are soft.
      if (!run.assignedDriverId)  return { label: "Missing driver",  cls: "bg-rose-50 text-rose-700 border-rose-200" };
      if (!run.assignedTruckId)   return { label: "Missing truck",   cls: "bg-amber-50 text-amber-700 border-amber-200" };
      if (!run.assignedTrailerId) return { label: "Missing trailer", cls: "bg-amber-50 text-amber-700 border-amber-200" };
      return { label: "Not ready", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  }
}

function fmtRunDate(iso: string | null | undefined): { label: string | null; dayChip: "Today" | "Tomorrow" | null } {
  if (!iso) return { label: null, dayChip: null };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { label: null, dayChip: null };
  const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const ymd = iso.slice(0, 10);
  const dayChip = ymd === today() ? "Today" as const : ymd === addDays(today(), 1) ? "Tomorrow" as const : null;
  return { label, dayChip };
}

function AllocationSlot({ label, missing, hard, children }: {
  label: string; missing: boolean; hard: boolean; children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[11px] font-semibold text-slate-600">{label}</span>
        {missing && (
          <span className={`text-[9px] font-bold px-1.5 py-px rounded border ${
            hard ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-amber-50 text-amber-600 border-amber-200"}`}>
            {hard ? "Required" : "Needed"}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function RunCard({ row, checked, highlighted, saving, publishing, allDrivers, trucks, trailers, onToggle, onAssign, onPublish }: {
  row: RunRow; checked: boolean; highlighted: boolean; saving: boolean; publishing: boolean;
  allDrivers: Driver[]; trucks: FleetUnit[]; trailers: FleetTrailer[];
  onToggle: (id: number) => void;
  onAssign: (runId: number, field: AssignField, raw: string) => void;
  onPublish: (e: React.MouseEvent, runId: number) => void;
}) {
  const { run, r, state, driver, truck, trailer } = row;
  const [issuesOpen, setIssuesOpen] = useState(false);
  const route = runRoute(run);
  const times = runTimes(run);
  const trailerHint = requiredTrailerLabel(run);
  const chip = cardStatusChip(run, state);
  const { label: dateLabel, dayChip } = fmtRunDate(run.plannedDate);

  // Subtitles for the assigned chips — from the already-loaded fleet/driver lists.
  const driverObj = run.assignedDriverId ? allDrivers.find(d => d.id === run.assignedDriverId) : undefined;
  const driverSub = driverObj
    ? [driverObj.adrAllowed ? "ADR" : null, driverObj.workPattern ? WORK_PATTERN_LABELS[driverObj.workPattern] : null].filter(Boolean).join(" · ")
    : null;
  const truckObj = run.assignedTruckId ? trucks.find(t => t.id === run.assignedTruckId) : undefined;
  const trailerObj = run.assignedTrailerId ? trailers.find(t => t.id === run.assignedTrailerId) : undefined;

  // Readiness → progress; checks → issue rows (real B1 checks, "na" hidden).
  const checks = (r?.resources.checks ?? []).filter(c => c.status !== "na");
  const issues = checks.filter(c => c.status !== "pass");
  const hasHardFail = issues.some(c => c.status === "fail" && c.hard);
  const pct = r ? readinessPct(r) : -1;
  const checksLeft = r ? r.resources.total - r.resources.passed : 0;

  const equipmentLabels = (run.requiredEquipment ?? [])
    .map(v => ONBOARD_EQUIPMENT.find(e => e.value === v)?.label ?? v);

  // Unique jobs on this run → "view full job" links.
  const runJobs = [...new Map(
    (run.assignments ?? []).filter(a => a.job).map(a => [a.job!.id, a.job!.jobReference ?? `#${a.job!.id}`]),
  ).entries()];

  const canPublish = state === "ready";
  const isDone = state === "done";

  return (
    <div className={`rounded-xl border bg-white shadow-sm ${highlighted ? "ring-2 ring-primary border-primary/40" : "border-border"}`}>
      {/* ── Run information band ── */}
      <div className="flex flex-wrap gap-x-5 gap-y-3 px-4 pt-3.5 pb-3">
        {/* Identity: ref, status, route, load meta, job links */}
        <div className="flex items-start gap-2.5 flex-1 min-w-[220px]">
          <input type="checkbox" className="mt-1.5" checked={checked} onChange={() => onToggle(run.id)} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[16px] font-bold text-primary leading-tight">{run.runReference}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${chip.cls}`}>{chip.label}</span>
              {state !== "done" && <span className="text-[10px] text-slate-400">{RUN_STATUS_LABELS[run.status] ?? run.status}</span>}
            </div>
            {(route.origin || route.destination) && (
              <div className="text-[13px] font-semibold text-slate-700 mt-0.5 truncate">
                {route.origin ?? "?"} → {route.destination ?? "?"}
              </div>
            )}
            <div className="flex items-center gap-2.5 flex-wrap text-[11px] text-slate-500 mt-1">
              <span>📍 {route.stops} {route.stops === 1 ? "stop" : "stops"}</span>
              {route.loadSummary && <span>📦 {route.loadSummary}</span>}
              {run.maxLoadWeight != null && run.maxLoadWeight > 0 && (
                <span>⚖ {run.maxLoadWeight.toLocaleString("en-GB")} kg</span>
              )}
            </div>
            {runJobs.map(([jobId, jobRef]) => (
              <Link key={jobId} to={`/app/jobs/${jobId}`}
                className="block text-[11px] font-semibold text-blue-600 hover:underline truncate mt-0.5">
                View job {jobRef} →
              </Link>
            ))}
          </div>
        </div>

        {/* Schedule: date + Today/Tomorrow, collection / delivery times */}
        <div className="min-w-[150px] text-[11px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold text-slate-700">📅 {dateLabel ?? "No date"}</span>
            {dayChip && (
              <span className="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-px">{dayChip}</span>
            )}
          </div>
          {times.collect && (
            <div className="text-slate-500 mt-1.5">Collection <span className="font-semibold text-slate-700 ml-0.5">🕐 {times.collect}</span></div>
          )}
          {times.deliver && (
            <div className="text-slate-500 mt-0.5">
              Delivery <span className="font-semibold text-slate-700 ml-0.5">🕐 {times.deliver}</span>
              {times.deliverBooked && (
                <span className="ml-1 text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1">booked</span>
              )}
            </div>
          )}
        </div>

        {/* Load needs: required trailer type + requirement badges */}
        {(trailerHint || run.hasHazardous || run.hasTemperatureLoad || run.hasOversized || equipmentLabels.length > 0) && (
          <div className="min-w-[130px] max-w-[200px]">
            {trailerHint && <div className="text-[12px] font-semibold text-slate-700">🚛 {trailerHint}</div>}
            <div className="flex gap-1 flex-wrap mt-1.5">
              {run.hasHazardous && (
                <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-px rounded" title="Requires an ADR-certified driver">⚠ ADR</span>
              )}
              {run.hasTemperatureLoad && (
                <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-px rounded" title="Requires a temperature-controlled trailer">❄ Temp</span>
              )}
              {run.hasOversized && (
                <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-px rounded">📏 Oversized</span>
              )}
              {equipmentLabels.map(l => (
                <span key={l} className="text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-px rounded">{l}</span>
              ))}
            </div>
          </div>
        )}

        {/* Readiness: % + bar (gate is boolean; % is progress through checks) */}
        {!isDone && (
          <div className="min-w-[130px]">
            <div className="text-[11px] font-semibold text-slate-600 mb-1">Readiness</div>
            {state === "checking" || !r ? (
              <span className="text-[11px] text-slate-400 animate-pulse">checking…</span>
            ) : (
              <>
                <div className={`text-[18px] font-bold leading-tight ${r.ready ? "text-green-700" : "text-amber-700"}`}>{pct}%</div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1 max-w-[130px]">
                  <div className={`h-full ${r.ready ? "bg-green-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {r.ready && checksLeft === 0 && <span className="text-green-700 font-semibold">All checks passed</span>}
                  {r.ready && checksLeft > 0 && <span className="text-green-700 font-semibold">Ready</span>}
                  {r.ready && checksLeft > 0 && <span> · {checksLeft} advisory left</span>}
                  {!r.ready && `${checksLeft} ${checksLeft === 1 ? "check" : "checks"} left`}
                </div>
              </>
            )}
          </div>
        )}

        {/* Checks panel — the real B1 readiness checks, problems first */}
        {!isDone && r && (
          <div className={`rounded-lg border px-3 py-2.5 min-w-[190px] max-w-[240px] text-[11px] ${
            hasHardFail ? "bg-rose-50/60 border-rose-200" : issues.length > 0 ? "bg-amber-50/60 border-amber-200" : "bg-green-50/50 border-green-200"}`}>
            <div className="font-semibold text-slate-600 mb-1">Checks</div>
            {issues.length === 0 && (
              <div className="text-green-700 font-semibold flex items-center gap-1.5"><span>✓</span> All good</div>
            )}
            {issues.map(c => {
              const ic = CHECK_ICON[c.status] ?? CHECK_ICON.unknown;
              // Blocking failures and missing information are ALWAYS explained in
              // place — why it fails and which intake source fixes it. The planner
              // must never have to hover or hunt (four-intake-gates).
              const alwaysOpen = c.status === "fail" || c.status === "unknown";
              const fix = c.source ? FIX_AT[c.source] : undefined;
              return (
                <div key={c.key} className="flex items-start gap-1.5 py-px">
                  <span className={`${ic.cls} flex-shrink-0`}>{ic.icon}</span>
                  <span className="text-slate-700 min-w-0">
                    {c.label}
                    {(alwaysOpen || issuesOpen) && c.reason && <span className="block text-[10px] text-slate-500">{c.reason}</span>}
                    {(alwaysOpen || issuesOpen) && fix && (
                      fix.to
                        ? <Link to={fix.to} className="block text-[10px] font-semibold text-blue-600 hover:underline">{fix.label} →</Link>
                        : <span className="block text-[10px] font-semibold text-slate-400">{fix.label}</span>
                    )}
                  </span>
                </div>
              );
            })}
            {issues.some(c => c.reason) && (
              <button onClick={() => setIssuesOpen(o => !o)} className="mt-1 text-[10px] font-semibold text-blue-600 hover:underline">
                {issuesOpen ? "Hide details" : "Show details"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Allocation band: driver / truck / trailer + publish ── */}
      {!isDone && (
        <div className="border-t border-slate-100 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-start">
          <AllocationSlot label="👤 Driver" missing={!run.assignedDriverId} hard>
            <AssetPicker run={run} kind="driver" currentId={run.assignedDriverId ?? null} currentLabel={driver}
              subtitle={driverSub} saving={saving} onAssign={onAssign} />
          </AllocationSlot>
          <AllocationSlot label="🚚 Truck (Unit)" missing={!run.assignedTruckId} hard={false}>
            <AssetPicker run={run} kind="truck" currentId={run.assignedTruckId ?? null} currentLabel={truck}
              subtitle={truckObj ? truckLabel(truckObj) : null} saving={saving} onAssign={onAssign} />
          </AllocationSlot>
          <AllocationSlot label="🚛 Trailer" missing={!run.assignedTrailerId} hard={false}>
            <AssetPicker run={run} kind="trailer" currentId={run.assignedTrailerId ?? null} currentLabel={trailer}
              subtitle={trailerObj ? trailerLabel(trailerObj) : null} saving={saving} onAssign={onAssign} />
            {!run.assignedTrailerId && trailerHint && (
              <div className="text-[10px] text-amber-700 mt-1">Needs: {trailerHint}</div>
            )}
          </AllocationSlot>
          <div className="flex items-end justify-end sm:col-span-2 xl:col-span-1 xl:self-end">
            {state === "published" ? (
              <span className="inline-block text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">✓ Published</span>
            ) : (
              <button
                onClick={e => onPublish(e, run.id)}
                disabled={!canPublish || publishing}
                title={canPublish ? "Publish to driver" : (r ? r.blockers.join(" · ") : "Checking readiness…")}
                className={`text-[12px] font-semibold px-4 py-2 rounded-lg ${
                  canPublish ? "bg-green-600 text-white hover:opacity-90" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
                {publishing ? "Publishing…" : "🚀 Publish"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RunsPage() {
  const [searchParams] = useSearchParams();
  // Deep link from Dashboard/Planning ("Allocate in Runs" / "Open in Runs") —
  // the target run's date is unknown here, so force "all runs" to guarantee it loads.
  const deepLinkId = (() => {
    const parsed = parseInt(searchParams.get("id") ?? "", 10);
    return Number.isFinite(parsed) ? parsed : null;
  })();

  const [date, setDate] = useState(today());
  const [rangeMode, setRangeMode] = useState<RangeMode>(deepLinkId ? "all" : "day");
  const [tab, setTab] = useState<Tab>("all");
  const [runs, setRuns] = useState<Run[]>([]);
  const [readiness, setReadiness] = useState<Record<number, RunReadiness | null>>({});
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<FleetUnit[]>([]);
  const [trailers, setTrailers] = useState<FleetTrailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [savingRunId, setSavingRunId] = useState<number | null>(null);
  const [highlightId] = useState<number | null>(deepLinkId);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");   // amber, non-blocking backend warnings

  // Toolbar state
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [groupKey, setGroupKey] = useState<GroupKey>("none");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [autoAllocating, setAutoAllocating] = useState(false);
  const [creatingRun, setCreatingRun] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = rangeMode === "day" ? { date }
        : rangeMode === "week" ? { dateFrom: date, dateTo: addDays(date, 6) }
        : {};
      const res = await runsApi.list(params);
      setRuns(res.data);
      setReadiness({});
      const entries = await Promise.all(res.data.map(async run => {
        try { return [run.id, await runsApi.readiness(run.id)] as const; }
        catch { return [run.id, null] as const; }
      }));
      setReadiness(Object.fromEntries(entries));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [date, rangeMode]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    driversApi.list().then(res => setAllDrivers(res.data)).catch(() => {});
    planningApi.getFleet().then(f => { setTrucks(f.trucks); setTrailers(f.trailers); }).catch(() => {});
  }, []);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handlePublish(e: React.MouseEvent, runId: number) {
    e.stopPropagation();
    setPublishingId(runId); setError("");
    try { await runsApi.publish(runId); await load(); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed to publish run"); }
    finally { setPublishingId(null); }
  }

  async function handleNewRun() {
    setCreatingRun(true); setError("");
    try {
      await runsApi.create({ plannedDate: date });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create run");
    } finally {
      setCreatingRun(false);
    }
  }

  /** Inline row edit — assign/clear a driver, truck or trailer directly on the run. */
  async function handleAssignField(
    runId: number,
    field: "assignedDriverId" | "assignedTruckId" | "assignedTrailerId",
    raw: string,
  ) {
    setSavingRunId(runId); setError(""); setNotice("");
    try {
      const updated = await runsApi.update(runId, { [field]: raw ? Number(raw) : null });
      // Backend conflict warnings (driver/truck/trailer double-booked that day,
      // trailer full with another job) — surface them, never swallow.
      const warning = (updated as Run & { warning?: string }).warning;
      if (warning) setNotice(warning);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update assignment");
    } finally {
      setSavingRunId(null);
    }
  }

  // ── Derive per-run state once ───────────────────────────────────────────────
  const withState = runs.map(run => {
    const r = readiness[run.id];
    const driver = r?.assigned.driver ?? run.driver?.displayName ?? null;
    const truck = r?.assigned.truck ?? null;
    const trailer = r?.assigned.trailer ?? null;
    return { run, r, state: runState(run, r), driver, truck, trailer };
  });
  const active = withState.filter(x => x.state !== "done");

  // ── Auto allocate — sequential so each pick reflects prior saves (no double-booking) ──
  async function handleAutoAllocate() {
    setAutoAllocating(true); setError("");
    try {
      const pool = selectedRows.size > 0 ? active.filter(x => selectedRows.has(x.run.id)) : active;
      const targets = pool.filter(x => x.state === "attention");
      for (const { run } of targets) {
        const cands = await runsApi.candidates(run.id);
        const patch: { assignedDriverId?: number; assignedTruckId?: number; assignedTrailerId?: number } = {};
        if (!run.assignedDriverId)  { const c = bestCandidate(cands.drivers);  if (c) patch.assignedDriverId  = c.id; }
        if (!run.assignedTruckId)   { const c = bestCandidate(cands.trucks);   if (c) patch.assignedTruckId   = c.id; }
        if (!run.assignedTrailerId) { const c = bestCandidate(cands.trailers); if (c) patch.assignedTrailerId = c.id; }
        if (Object.keys(patch).length > 0) await runsApi.update(run.id, patch);
      }
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Auto allocate failed");
    } finally {
      setAutoAllocating(false);
    }
  }

  // ── Runs overview ───────────────────────────────────────────────────────────
  const runStats = {
    total:      active.length,
    noDriver:   active.filter(x => !x.run.assignedDriverId).length,
    noTrailer:  active.filter(x => !x.run.assignedTrailerId).length,
    noTruck:    active.filter(x => !x.run.assignedTruckId).length,
    ready:      active.filter(x => x.state === "ready").length,
  };
  // Assets allocated to TODAY's active runs.
  const allocDrivers  = new Set(active.map(x => x.run.assignedDriverId).filter(Boolean));
  const allocTrucks   = new Set(active.map(x => x.run.assignedTruckId).filter(Boolean));
  const allocTrailers = new Set(active.map(x => x.run.assignedTrailerId).filter(Boolean));
  const driverStats = {
    total:     allDrivers.length,
    available: allDrivers.filter(d => d.status === "active" && !allocDrivers.has(d.id)).length,
    allocated: allocDrivers.size,
    inactive:  allDrivers.filter(d => d.status !== "active").length,
  };
  const trailerStats = {
    total:     trailers.length,
    available: trailers.filter(t => (t.status ?? "available") === "available" && !allocTrailers.has(t.id)).length,
    allocated: allocTrailers.size,
    out:       trailers.filter(t => OUT_OF_SERVICE.has((t.status ?? "").toLowerCase())).length,
  };
  const truckStats = {
    total:     trucks.length,
    available: trucks.filter(t => (t.status ?? "available") === "available" && !allocTrucks.has(t.id)).length,
    allocated: allocTrucks.size,
    out:       trucks.filter(t => OUT_OF_SERVICE.has((t.status ?? "").toLowerCase())).length,
  };

  // ── Tab filter ──────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "all",            label: "All runs",        count: runStats.total },
    { key: "missing_driver", label: "Missing driver",  count: runStats.noDriver },
    { key: "missing_trailer",label: "Missing trailer", count: runStats.noTrailer },
    { key: "missing_truck",  label: "Missing truck",   count: runStats.noTruck },
    { key: "ready",          label: "Ready",           count: runStats.ready },
  ];
  const doneCount = withState.filter(x => x.state === "done").length;

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => withState
    .filter(x => {
      switch (tab) {
        case "all":             return x.state !== "done";
        case "missing_driver":  return x.state !== "done" && !x.run.assignedDriverId;
        case "missing_trailer": return x.state !== "done" && !x.run.assignedTrailerId;
        case "missing_truck":   return x.state !== "done" && !x.run.assignedTruckId;
        case "ready":           return x.state === "ready";
        case "done":            return x.state === "done";
      }
    })
    .filter(x => statusFilter.size === 0 || statusFilter.has(x.run.status))
    .filter(x => !q || [x.run.runReference, x.driver, x.truck, x.trailer].some(v => v?.toLowerCase().includes(q)))
    .sort((a, b) => {
      if (sortKey === "reference") return a.run.runReference.localeCompare(b.run.runReference);
      if (sortKey === "readiness") return readinessPct(b.r) - readinessPct(a.r);
      return (STATE_RANK[a.state] - STATE_RANK[b.state]) || a.run.runReference.localeCompare(b.run.runReference);
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [withState, tab, statusFilter, q, sortKey]);

  // ── Grouping (visual sections within the same table) ───────────────────────
  const groups = useMemo(() => {
    if (groupKey === "none") return [{ label: null as string | null, rows: visible }];
    const map = new Map<string, typeof visible>();
    for (const row of visible) {
      const key = groupKey === "driver" ? (row.driver ?? "Unassigned") : RUN_STATUS_LABELS[row.run.status] ?? row.run.status;
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()].map(([label, rows]) => ({ label, rows }));
  }, [visible, groupKey]);

  function toggleRow(id: number) {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    setSelectedRows(prev => {
      const allSelected = visible.length > 0 && visible.every(x => prev.has(x.run.id));
      if (allSelected) return new Set();
      return new Set(visible.map(x => x.run.id));
    });
  }
  function toggleStatusFilter(status: string) {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }

  // ── Small pieces ────────────────────────────────────────────────────────────
  function StatGroup({ label, total, stats }: {
    label: string; total: number;
    stats: { label: string; value: number; tone: string }[];
  }) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="font-bold text-primary">{total}</span>
        <span className="text-slate-400">{label}</span>
        {stats.map(s => (
          <span key={s.label} className={`text-[11px] font-semibold ${s.tone}`}>· {s.value} {s.label}</span>
        ))}
      </span>
    );
  }

  // ── Company assets — read-only reference, 3 columns like the mockup's panel.
  // The FULL fleet, each asset with its live state (available / on RUN-x / off
  // road), so the planner sees what the company has at a glance. Allocation
  // itself happens on the run rows — this panel never assigns anything.
  function AssetsReferencePanel() {
    const driverRunRef  = new Map<number, string>();
    const truckRunRef   = new Map<number, string>();
    const trailerRunRef = new Map<number, string>();
    for (const x of active) {
      if (x.run.assignedDriverId)  driverRunRef.set(x.run.assignedDriverId, x.run.runReference);
      if (x.run.assignedTruckId)   truckRunRef.set(x.run.assignedTruckId, x.run.runReference);
      if (x.run.assignedTrailerId) trailerRunRef.set(x.run.assignedTrailerId, x.run.runReference);
    }

    type RefStatus = { tone: "green" | "amber" | "red"; text: string };
    const DOT: Record<RefStatus["tone"], string> = { green: "bg-green-500", amber: "bg-amber-400", red: "bg-rose-400" };
    // Sort: available first, then allocated, then out of service.
    const RANK: Record<RefStatus["tone"], number> = { green: 0, amber: 1, red: 2 };

    function AssetEntry({ name, detail, status }: { name: string; detail: string; status: RefStatus }) {
      return (
        <div className="rounded-lg border border-border bg-white px-2 py-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[status.tone]}`} />
            <span className="font-semibold text-[12px] text-slate-700 truncate">{name}</span>
          </div>
          <div className="text-[11px] text-slate-500 truncate">{detail || "—"}</div>
          <div className={`text-[10px] truncate ${status.tone === "green" ? "text-green-600" : status.tone === "amber" ? "text-amber-600" : "text-rose-500"}`}>{status.text}</div>
        </div>
      );
    }

    const driverEntries = allDrivers.map(d => {
      const onRun = driverRunRef.get(d.id);
      const status: RefStatus = d.status !== "active" ? { tone: "red", text: "Inactive" }
        : onRun ? { tone: "amber", text: `on ${onRun}` }
        : { tone: "green", text: "Available" };
      return { key: d.id, name: d.displayName, detail: d.preferredShiftHours ? `${d.preferredShiftHours}h shift` : "shift n/a", status };
    }).sort((a, b) => RANK[a.status.tone] - RANK[b.status.tone]);

    const truckEntries = trucks.filter(t => (t.status ?? "") !== "disposed").map(t => {
      const onRun = truckRunRef.get(t.id);
      const status: RefStatus = OUT_OF_SERVICE.has((t.status ?? "").toLowerCase()) ? { tone: "red", text: "Off road" }
        : onRun ? { tone: "amber", text: `on ${onRun}` }
        : { tone: "green", text: "Available" };
      return { key: t.id, name: t.registration, detail: truckLabel(t), status };
    }).sort((a, b) => RANK[a.status.tone] - RANK[b.status.tone]);

    const trailerEntries = trailers.filter(t => (t.status ?? "") !== "disposed").map(t => {
      const onRun = trailerRunRef.get(t.id);
      const status: RefStatus = OUT_OF_SERVICE.has((t.status ?? "").toLowerCase()) ? { tone: "red", text: "Off road" }
        : onRun ? { tone: "amber", text: `on ${onRun}` }
        : { tone: "green", text: "Available" };
      return { key: t.id, name: t.registration, detail: trailerLabel(t), status };
    }).sort((a, b) => RANK[a.status.tone] - RANK[b.status.tone]);

    function Column({ title, entries }: { title: string; entries: typeof driverEntries }) {
      const availCount = entries.filter(e => e.status.tone === "green").length;
      return (
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
            <span className="text-[11px] text-green-600 font-semibold">{availCount} free</span>
          </div>
          <div className="space-y-1.5">
            {entries.map(e => <AssetEntry key={e.key} name={e.name} detail={e.detail} status={e.status} />)}
            {entries.length === 0 && <div className="text-[12px] text-slate-400 py-2 text-center border border-dashed border-border rounded-lg">None</div>}
          </div>
        </div>
      );
    }

    return (
      <div className="border border-border rounded-xl bg-slate-50/50 p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Company assets</div>
        {/* 3 columns side by side wherever they fit; stacked on phones so entries stay legible */}
        <div className="flex flex-col sm:flex-row gap-2.5 sm:items-start">
          <Column title="Drivers"  entries={driverEntries} />
          <Column title="Units"    entries={truckEntries} />
          <Column title="Trailers" entries={trailerEntries} />
        </div>
      </div>
    );
  }

  const STATUS_OPTIONS = ["draft", "assigned", "in_progress"];
  const allVisibleSelected = visible.length > 0 && visible.every(x => selectedRows.has(x.run.id));

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-primary">Runs — Allocate Resources</h1>
        <p className="text-muted text-sm mt-0.5">Allocate driver, truck and trailer. Publish when all required resources are in place.</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-end gap-2 flex-wrap mb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">View</div>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} style={{ width: "auto" }} />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Range</div>
          <select className="input" style={{ width: "auto" }} value={rangeMode} onChange={e => setRangeMode(e.target.value as RangeMode)}>
            <option value="day">Selected day</option>
            <option value="week">7-day window</option>
            <option value="all">All runs</option>
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search run, ref, driver, vehicle…"
            className="input w-full"
          />
        </div>
        <div className="relative" ref={filtersRef}>
          <button onClick={() => setFiltersOpen(o => !o)}
            className={`btn text-sm px-3 py-2 rounded-lg border ${statusFilter.size > 0 ? "border-primary text-primary bg-primary/5" : "border-border text-slate-600 hover:border-slate-300"}`}>
            ⚙ Filters {statusFilter.size > 0 && <span className="ml-1 text-[10px] font-bold">{statusFilter.size}</span>}
          </button>
          {filtersOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-lg shadow-xl border border-border p-3 z-20">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Status</div>
              <div className="flex flex-col gap-1.5">
                {STATUS_OPTIONS.map(s => (
                  <label key={s} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatusFilter(s)} />
                    {RUN_STATUS_LABELS[s] ?? s}
                  </label>
                ))}
              </div>
              {statusFilter.size > 0 && (
                <button onClick={() => setStatusFilter(new Set())} className="mt-2 text-[11px] text-blue-600 hover:underline">Clear</button>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleAutoAllocate}
          disabled={autoAllocating}
          title={selectedRows.size > 0 ? `Auto-allocate ${selectedRows.size} selected run(s)` : "Auto-allocate all runs needing resources"}
          className="btn text-sm px-3 py-2 rounded-lg border border-border text-slate-600 hover:border-slate-300 disabled:opacity-60">
          {autoAllocating ? "Allocating…" : "⚡ Auto allocate"}
        </button>
        <Link to="/app/settings" title="Settings"
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-slate-500 hover:border-slate-300 hover:text-primary">
          ⚙️
        </Link>
        <Button variant="primary" onClick={handleNewRun} disabled={creatingRun}>
          {creatingRun ? "Creating…" : "+ New Run"}
        </Button>
      </div>

      {/* Overview — one compact strip, not four boxes eating vertical space */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3.5 py-2 mb-3 rounded-lg border border-border bg-white text-[12px]">
        <StatGroup label="runs" total={runStats.total} stats={[
          { label: "no driver",  value: runStats.noDriver,  tone: "text-rose-600" },
          { label: "no trailer", value: runStats.noTrailer, tone: "text-amber-600" },
          { label: "ready",      value: runStats.ready,     tone: "text-green-600" },
        ]} />
        <span className="w-px h-4 bg-border" />
        <StatGroup label="drivers" total={driverStats.total} stats={[
          { label: "available", value: driverStats.available, tone: "text-green-600" },
          { label: "inactive",  value: driverStats.inactive,  tone: "text-rose-600" },
        ]} />
        <StatGroup label="trailers" total={trailerStats.total} stats={[
          { label: "available", value: trailerStats.available, tone: "text-green-600" },
          { label: "off road",  value: trailerStats.out,       tone: "text-rose-600" },
        ]} />
        <StatGroup label="trucks" total={truckStats.total} stats={[
          { label: "available", value: truckStats.available, tone: "text-green-600" },
          { label: "off road",  value: truckStats.out,       tone: "text-rose-600" },
        ]} />
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {notice && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start justify-between gap-3">
          <span>⚠ {notice}</span>
          <button onClick={() => setNotice("")} className="text-amber-500 hover:text-amber-700 leading-none flex-shrink-0">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap mb-3 border-b border-border">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={"px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
              (tab === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-primary")}>
            {t.label} <span className={`ml-1 text-[11px] ${t.count > 0 && (t.key.startsWith("missing")) ? "text-rose-600 font-semibold" : "text-slate-400"}`}>{t.count}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1.5">
          <label className="text-[11px] text-slate-400 flex items-center gap-1">
            Group by
            <select className="input py-1 text-[12px]" value={groupKey} onChange={e => setGroupKey(e.target.value as GroupKey)}>
              <option value="none">None</option>
              <option value="driver">Driver</option>
              <option value="status">Status</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-400 flex items-center gap-1">
            Sort by
            <select className="input py-1 text-[12px]" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
              <option value="priority">Status</option>
              <option value="reference">Reference</option>
              <option value="readiness">Readiness</option>
            </select>
          </label>
          {doneCount > 0 && (
            <button onClick={() => setTab(tab === "done" ? "all" : "done")}
              className={"px-2 py-1 text-[12px] " + (tab === "done" ? "text-primary font-semibold" : "text-slate-400 hover:text-slate-600")}>
              {tab === "done" ? "← active" : `${doneCount} done`}
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-center py-12 text-muted">Loading runs…</div>}

      {!loading && runs.length === 0 && (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <div className="text-5xl mb-4">🚛</div>
          <p className="text-primary font-semibold mb-1">No runs for this date</p>
          <p className="text-muted text-sm mb-6">Build runs from this day's jobs on the Planning board.</p>
          <Link to="/app/planning"><Button variant="primary">📅 Go to Planning</Button></Link>
        </div>
      )}

      {/* Runs table (with inline driver/truck/trailer pickers) + read-only assets reference */}
      {!loading && runs.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start">
          {/* Table — full width when stacked (below lg), ~60% beside the assets panel on desktop */}
          <div className="w-full min-w-0 lg:flex-1">
            {visible.length === 0 ? (
              <div className="text-center py-12 text-muted border border-dashed border-border rounded-xl">
                <p className="text-sm">Nothing in this pile. <button onClick={() => setTab("all")} className="text-blue-600 hover:underline">Show all active runs</button></p>
              </div>
            ) : (
              <div>
                {/* Select-all lives here now that there's no table header */}
                <label className="flex items-center gap-2 text-[11px] text-slate-500 mb-2 cursor-pointer w-fit">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                  Select all shown
                </label>
                <div className="space-y-3">
                  {groups.map(group => (
                    <Fragment key={group.label ?? "__none__"}>
                      {group.label !== null && (
                        <div className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          {group.label} <span className="text-slate-400 font-normal normal-case">· {group.rows.length}</span>
                        </div>
                      )}
                      {group.rows.map(row => (
                        <RunCard
                          key={row.run.id}
                          row={row}
                          checked={selectedRows.has(row.run.id)}
                          highlighted={highlightId === row.run.id}
                          saving={savingRunId === row.run.id}
                          publishing={publishingId === row.run.id}
                          allDrivers={allDrivers}
                          trucks={trucks}
                          trailers={trailers}
                          onToggle={toggleRow}
                          onAssign={handleAssignField}
                          onPublish={handlePublish}
                        />
                      ))}
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Company assets — read-only 3-column reference, always visible (mockup right panel) */}
          <div className="w-full lg:w-2/5 flex-shrink-0">
            <AssetsReferencePanel />
          </div>
        </div>
      )}
    </div>
  );
}

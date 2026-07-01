import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { runsApi, type RunReadiness, type RunCandidates, type Candidate } from "../../api/runs";
import { planningApi, type FleetTrailer, type FleetUnit } from "../../api/planning";
import { driversApi } from "../../api/drivers";
import type { Run, Driver } from "../../types";
import { runRoute, requiredTrailerLabel } from "./runUtils";

// ── Allocation panel ──────────────────────────────────────────────────────────
//
// The right pane of the Runs screen: pick the driver, truck and trailer that will
// actually do the run. Candidates (B4) are shown as VISIBLE cards in three columns
// — best matches first, then other available — so the planner sees the whole fleet
// state at the moment of choosing, not a blind dropdown.
//
// Readiness stays a GATE (Ready / N checks left). The % is just passed ÷ total
// checks — an honest progress bar, never a fuzzy "confidence" score.

type Kind = "driver" | "truck" | "trailer";
const DRAG_MIME = "application/x-lb-candidate";

/** Deterministic fit score from real signals (not AI) — used only to order/label cards. */
function fitScore(c: Candidate): number {
  if (!c.available) return 0;
  let s = 100 - c.reasons.length * 8;
  if (!c.suitable) s -= 12;
  return Math.max(45, Math.min(99, s));
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function RunAllocationPanel({
  runId, onSaved, onClose,
}: { runId: number; onSaved: () => void; onClose: () => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const [candidates, setCandidates] = useState<RunCandidates | null>(null);
  const [readiness, setReadiness] = useState<RunReadiness | null>(null);
  const [drivers, setDrivers] = useState<Record<number, Driver>>({});
  const [trucks, setTrucks] = useState<Record<number, FleetUnit>>({});
  const [trailers, setTrailers] = useState<Record<number, FleetTrailer>>({});

  const [driverId, setDriverId] = useState<number | null>(null);
  const [truckId, setTruckId] = useState<number | null>(null);
  const [trailerId, setTrailerId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState<Record<Kind, string>>({ driver: "", truck: "", trailer: "" });
  const [bestOnly, setBestOnly] = useState<Record<Kind, boolean>>({ driver: false, truck: false, trailer: false });
  const [dropTarget, setDropTarget] = useState<Kind | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await runsApi.get(runId);
      setRun(r);
      setDriverId(r.assignedDriverId ?? null);
      setTruckId(r.assignedTruckId ?? null);
      setTrailerId(r.assignedTrailerId ?? null);
      setDirty(false);
      runsApi.candidates(runId).then(setCandidates).catch(() => setCandidates(null));
      runsApi.readiness(runId).then(setReadiness).catch(() => setReadiness(null));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load run");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { load(); }, [load]);

  // Fleet + driver records (for the rich card detail) — loaded once.
  useEffect(() => {
    driversApi.list("active").then(res =>
      setDrivers(Object.fromEntries(res.data.map(d => [d.id, d])))).catch(() => {});
    planningApi.getFleet().then(f => {
      setTrucks(Object.fromEntries(f.trucks.map(t => [t.id, t])));
      setTrailers(Object.fromEntries(f.trailers.map(t => [t.id, t])));
    }).catch(() => {});
  }, []);

  // Close the save-menu on outside click.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(kind: Kind, id: number) {
    if (kind === "driver")  setDriverId(prev => prev === id ? null : id);
    if (kind === "truck")   setTruckId(prev => prev === id ? null : id);
    if (kind === "trailer") setTrailerId(prev => prev === id ? null : id);
    setDirty(true);
  }
  function clear(kind: Kind) {
    if (kind === "driver")  setDriverId(null);
    if (kind === "truck")   setTruckId(null);
    if (kind === "trailer") setTrailerId(null);
    setDirty(true);
  }

  async function save() {
    setSaving(true); setError("");
    try {
      await runsApi.update(runId, {
        assignedDriverId:  driverId,
        assignedTruckId:   truckId,
        assignedTrailerId: trailerId,
      });
      await load();
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save allocation");
    } finally {
      setSaving(false);
    }
  }

  async function saveAndPublish() {
    setSaving(true); setError(""); setMenuOpen(false);
    try {
      await runsApi.update(runId, {
        assignedDriverId:  driverId,
        assignedTruckId:   truckId,
        assignedTrailerId: trailerId,
      });
      await runsApi.publish(runId);
      await load();
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save & publish");
    } finally {
      setSaving(false);
    }
  }

  const selectedId = (kind: Kind) => kind === "driver" ? driverId : kind === "truck" ? truckId : trailerId;

  // Split a candidate list into best matches / other available, applying search.
  const split = useCallback((cands: Candidate[] | undefined, kind: Kind) => {
    const q = search[kind].trim().toLowerCase();
    const list = (cands ?? []).filter(c => !q || c.label.toLowerCase().includes(q));
    const available = list.filter(c => c.available);
    const best  = available.filter(c => c.suitable)
      .sort((a, b) => (a.recommended === b.recommended ? fitScore(b) - fitScore(a) : a.recommended ? -1 : 1));
    const other = available.filter(c => !best.includes(c));
    const busy  = list.filter(c => !c.available);
    return { best, other, busy, availableCount: available.length };
  }, [search]);

  // ── A single candidate card ─────────────────────────────────────────────────
  function Card({ c, kind }: { c: Candidate; kind: Kind }) {
    const selected = selectedId(kind) === c.id;
    const score = fitScore(c);

    // Pull rich detail from the full record where we have it.
    let line2 = "";
    let badge: string | null = null;
    let dutyDot: "on" | "off" | null = null;
    if (kind === "driver") {
      const d = drivers[c.id];
      dutyDot = d ? (d.status === "active" ? "on" : "off") : null;
      const hrs = d?.preferredShiftHours;
      line2 = hrs ? `${hrs}h shift` : (d?.status === "active" ? "On duty" : (d?.status ?? ""));
      if (d?.adrAllowed) badge = "ADR";
    } else if (kind === "truck") {
      const t = trucks[c.id];
      line2 = [t?.category, t?.gvwClass ? `${t.gvwClass}t` : null].filter(Boolean).join(" · ") || "Unit";
    } else {
      const t = trailers[c.id];
      line2 = [t?.trailerType ?? t?.bodyType].filter(Boolean).join(" · ") || "Trailer";
    }

    return (
      <button
        onClick={() => pick(kind, c.id)}
        draggable={c.available}
        onDragStart={e => {
          if (!c.available) return;
          e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind, id: c.id }));
          e.dataTransfer.effectAllowed = "move";
        }}
        disabled={!c.available}
        title={c.reasons.join(" · ")}
        className={`w-full text-left rounded-lg border px-2.5 py-2 flex items-center gap-2.5 transition-colors ${
          selected ? "border-primary ring-1 ring-primary bg-primary/5"
          : c.available ? "border-border hover:border-slate-300 bg-white cursor-grab active:cursor-grabbing"
          : "border-slate-100 bg-slate-50 opacity-70 cursor-not-allowed"
        }`}>
        {/* Avatar / icon */}
        <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${
          kind === "driver" ? "bg-slate-200 text-slate-600" : "bg-blue-100 text-blue-700"
        }`}>
          {kind === "driver" ? initials(drivers[c.id]?.displayName ?? c.label) : kind === "truck" ? "🚚" : "🛻"}
        </span>
        {/* Text */}
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-[13px] text-primary truncate">
              {kind === "driver" ? (drivers[c.id]?.displayName ?? c.label) : c.label.split(" · ")[0]}
            </span>
            {badge && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1 rounded">{badge}</span>}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            {dutyDot && <span className={`w-1.5 h-1.5 rounded-full ${dutyDot === "on" ? "bg-green-500" : "bg-slate-300"}`} />}
            <span className="truncate">{c.busyOn ? `on ${c.busyOn}` : c.reasons[0] ?? line2}</span>
          </span>
        </span>
        {/* Fit / selected */}
        <span className="flex-shrink-0 text-right">
          {selected ? <span className="text-primary text-sm font-bold">✓</span>
            : c.available ? <span className={`text-[11px] font-semibold ${c.suitable ? "text-green-600" : "text-amber-600"}`}>{score}%</span>
            : <span className="text-[10px] text-slate-400">busy</span>}
        </span>
      </button>
    );
  }

  // ── Drop zone — accepts a dragged card, or click focuses the search box ─────
  function DropZone({ kind, inputRef }: { kind: Kind; inputRef: React.RefObject<HTMLInputElement | null> }) {
    const over = dropTarget === kind;
    return (
      <div
        onDragOver={e => { e.preventDefault(); setDropTarget(kind); }}
        onDragLeave={() => setDropTarget(prev => (prev === kind ? null : prev))}
        onDrop={e => {
          e.preventDefault();
          setDropTarget(null);
          const raw = e.dataTransfer.getData(DRAG_MIME);
          if (!raw) return;
          try {
            const parsed = JSON.parse(raw) as { kind: Kind; id: number };
            if (parsed.kind === kind) pick(kind, parsed.id);
          } catch { /* not a candidate payload — ignore */ }
        }}
        onClick={() => inputRef.current?.focus()}
        className={`mt-2 rounded-lg border-2 border-dashed text-center py-3 text-[11px] cursor-text transition-colors ${
          over ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-400 hover:border-slate-300"
        }`}>
        Drag {kind} here <span className="text-slate-300">· or click to select</span>
      </div>
    );
  }

  // ── A column (DRIVER / TRUCK / TRAILER) ─────────────────────────────────────
  function Column({ kind, title }: { kind: Kind; title: string }) {
    const cands = kind === "driver" ? candidates?.drivers : kind === "truck" ? candidates?.trucks : candidates?.trailers;
    const { best, other, availableCount } = split(cands, kind);
    const [showAll, setShowAll] = useState(false);
    const otherShown = showAll ? other : other.slice(0, 2);
    const inputRef = useRef<HTMLInputElement>(null);
    const onlyBest = bestOnly[kind];
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</h4>
          <span className="text-[11px] text-slate-400">{availableCount} available</span>
        </div>
        <div className="flex items-center gap-1 mb-2">
          <input
            ref={inputRef}
            value={search[kind]}
            onChange={e => setSearch(s => ({ ...s, [kind]: e.target.value }))}
            placeholder={`Search ${kind}…`}
            className="input flex-1 min-w-0 text-[12px] py-1.5"
          />
          <button
            type="button"
            onClick={() => setBestOnly(s => ({ ...s, [kind]: !s[kind] }))}
            title={onlyBest ? "Showing best matches only" : "Show best matches only"}
            className={`flex-shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center text-[12px] transition-colors ${
              onlyBest ? "bg-primary/10 border-primary text-primary" : "border-border text-slate-400 hover:text-primary hover:border-slate-300"
            }`}>
            ▾
          </button>
        </div>
        {best.length > 0 && (
          <>
            <div className="text-[10px] font-semibold text-slate-400 mb-1">BEST MATCHES</div>
            <div className="space-y-1.5 mb-2">{best.map(c => <Card key={c.id} c={c} kind={kind} />)}</div>
          </>
        )}
        {!onlyBest && other.length > 0 && (
          <>
            <div className="text-[10px] font-semibold text-slate-400 mb-1">OTHER AVAILABLE</div>
            <div className="space-y-1.5">{otherShown.map(c => <Card key={c.id} c={c} kind={kind} />)}</div>
            {other.length > 2 && (
              <button onClick={() => setShowAll(s => !s)} className="mt-1.5 text-[11px] text-blue-600 hover:underline">
                {showAll ? "Show fewer" : `View all ${availableCount} available ${kind}s`}
              </button>
            )}
          </>
        )}
        {best.length === 0 && other.length === 0 && (
          <div className="text-[12px] text-slate-400 py-3 text-center border border-dashed border-border rounded-lg">
            None available
          </div>
        )}
        <DropZone kind={kind} inputRef={inputRef} />
      </div>
    );
  }

  // ── Current allocation footer chip ──────────────────────────────────────────
  function AllocChip({ kind, title }: { kind: Kind; title: string }) {
    const id = selectedId(kind);
    let label: string | null = null;
    if (id != null) {
      if (kind === "driver")  label = drivers[id]?.displayName ?? `#${id}`;
      if (kind === "truck")   label = trucks[id]?.registration ?? `#${id}`;
      if (kind === "trailer") label = trailers[id]?.registration ?? `#${id}`;
    }
    return (
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">{title}</div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[13px] font-semibold truncate ${label ? "text-primary" : "text-rose-500"}`}>{label ?? "Missing"}</span>
          {label && <button onClick={() => clear(kind)} className="text-slate-300 hover:text-rose-500 text-sm leading-none">×</button>}
        </div>
      </div>
    );
  }

  const pct = useMemo(() => {
    if (!readiness) return null;
    const { passed, total } = readiness.resources;
    return total > 0 ? Math.round((passed / total) * 100) : 0;
  }, [readiness]);
  const checksLeft = readiness ? readiness.resources.total - readiness.resources.passed : 0;

  // Route + load summary — derived from the run's active stops (already sorted by sequence).
  const route = useMemo(() => (run ? runRoute(run) : null), [run]);
  const trailerReq = run ? requiredTrailerLabel(run) : null;

  const missingLabel =
    !driverId  ? "Missing driver" :
    !truckId   ? "Missing truck"  :
    !trailerId ? "Missing trailer" : null;

  if (loading || !run) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted text-sm">
        {error || "Loading…"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-primary">{run.runReference}</span>
              {run.publishedToDriver
                ? <span className="badge badge-completed text-[10px]">Published</span>
                : missingLabel
                  ? <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">{missingLabel}</span>
                  : <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">Ready</span>}
            </div>
            {route && (route.origin || route.destination) && (
              <div className="text-[12px] text-slate-600 font-medium mt-0.5 truncate">
                {route.origin ?? "?"} → {route.destination ?? "?"}
              </div>
            )}
            <div className="text-[11px] text-slate-400">
              {route && route.stops > 0 ? `${route.stops} stop${route.stops !== 1 ? "s" : ""}${route.loadSummary ? ` · ${route.loadSummary}` : ""}` : "No stops assigned"}
            </div>
            {trailerReq && (
              <div className="text-[11px] text-amber-700 font-medium mt-0.5">Needs: {trailerReq}</div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {readiness && (
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Readiness</div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-bold ${readiness.ready ? "text-green-600" : "text-amber-600"}`}>{pct}%</span>
                  <span className="text-[11px] text-slate-500">{readiness.ready ? "Ready" : `${checksLeft} left`}</span>
                </div>
              </div>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-primary text-xl leading-none">×</button>
          </div>
        </div>

        {/* This run needs — quick-glance driver/truck/trailer status */}
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mr-0.5">This run needs</span>
          {([
            { kind: "driver" as Kind,  label: "Driver",  ok: !!driverId },
            { kind: "truck" as Kind,   label: "Truck",   ok: !!truckId },
            { kind: "trailer" as Kind, label: "Trailer", ok: !!trailerId },
          ]).map(n => (
            <span key={n.kind} className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
              n.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-rose-50 text-rose-700 border-rose-200"
            }`}>
              {n.ok ? "✓" : "✗"} {n.label}
            </span>
          ))}
        </div>
      </div>

      {error && <div className="mx-4 mt-2 p-2 bg-red-50 border border-red-200 rounded text-[12px] text-red-700">{error}</div>}

      {/* Driver / Truck / Trailer — stacked, not squeezed 3-across (names were unreadable at real panel widths) */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-4">
          <Column kind="driver"  title="Driver" />
          <Column kind="truck"   title="Truck" />
          <Column kind="trailer" title="Trailer" />
        </div>
      </div>

      {/* Current allocation + save */}
      <div className="flex-shrink-0 border-t border-border px-4 py-3">
        <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Current allocation</div>
        <div className="flex items-center gap-3">
          <AllocChip kind="driver"  title="Driver" />
          <AllocChip kind="truck"   title="Truck" />
          <AllocChip kind="trailer" title="Trailer" />
          <div ref={menuRef} className="relative flex-shrink-0 flex">
            <button
              onClick={save}
              disabled={!dirty || saving}
              className={`text-sm font-semibold pl-4 pr-3 py-2 rounded-l-lg border-r ${
                dirty && !saving ? "bg-primary text-white hover:opacity-90 border-white/20" : "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200"
              }`}>
              {saving ? "Saving…" : "Save allocation"}
            </button>
            <button
              onClick={() => setMenuOpen(o => !o)}
              disabled={saving}
              className={`px-2 rounded-r-lg text-sm ${
                dirty && !saving ? "bg-primary text-white hover:opacity-90" : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}>
              ⌄
            </button>
            {menuOpen && (
              <div className="absolute bottom-full right-0 mb-1 w-48 bg-white rounded-lg shadow-xl border border-border py-1 z-10">
                <button
                  onClick={saveAndPublish}
                  disabled={!driverId || !truckId || !trailerId || saving}
                  className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  Save &amp; publish
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

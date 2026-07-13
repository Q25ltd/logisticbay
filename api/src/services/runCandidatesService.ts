/**
 * runCandidatesService — Runs B4: "what can I actually put on this run?"
 *
 * The allocation dropdowns are blind lists of registrations — a planner can't see
 * what's free, what suits the load, or what's already on another run. This annotates
 * every driver / trailer / truck with:
 *   - available  — not assigned to another run that day
 *   - suitable   — fits THIS run's load (body type / temp / hazmat / trailer rating)
 *   - recommended — available AND suitable (best fit first)
 * so the picker shows fleet state, and the best choice surfaces itself.
 *
 * Deterministic, pure: the route assembles the fleet + drivers + busy-sets + load
 * requirements and calls this (mirrors checkRunService / runReadinessService).
 */

import { FRIDGE_BODIES, ADR_UNSAFE_BODIES } from "./checkLoadVehicleService.js";

const lc = (s?: string | null) => (s ?? "").toLowerCase();
// A trailer's body string (bodyType + trailerType) contains one of these tokens.
const bodyHas = (body: string, tokens: Iterable<string>) =>
  [...tokens].some(t => body.includes(lc(t)));
const FRIDGE_SYNONYMS = [...FRIDGE_BODIES, "reefer", "chiller"];

export interface CandidateContext {
  hazardous:          boolean;
  needsTrailer:       boolean;
  tempControlled:     boolean;
  acceptableBodyTypes?: string[];     // ANY of these bodies suits (e.g. [curtain, flatbed] for ADR)
  // Allocation is theoretical (not live): a driver's availability is their FULL
  // preferred shift. The only hours check that makes sense here is whether that
  // shift covers the run's planned duration. Live consumed/remaining hours are
  // the Live phase.
  runDurationHours?:  number | null;
  // Jobs on THIS run — a trailer pre-loaded with one of them is the RIGHT trailer
  // to take; loaded with anything else means it's full and can't be allocated.
  runJobIds?:         number[];
  // Driver↔vehicle attachment: the assigned driver's usual unit gets recommended;
  // another driver's usual unit gets a "usually <name>'s" note so the planner
  // doesn't split a driver from their vehicle without noticing.
  assignedDriverUsualReg?: string | null;
  usualDriverByReg?:       Record<string, string>;   // reg (uppercase) → driver display name
}

export interface TrailerLite { id: number; registration: string; trailerType?: string | null; bodyType?: string | null; status?: string | null; linkedJobId?: number | null; }
export interface TruckLite   { id: number; registration: string; gvwClass?: string | null; status?: string | null; }
export interface DriverLite  {
  id: number; displayName: string; status: string;
  licenceClass?: string | null; canDriveCategories?: string[] | null;
  adrAllowed?: boolean | null; canUseTrailer?: boolean | null; trailerTypesAllowed?: string[] | null;
  preferredShiftHours?: number | null;   // full preferred shift (theoretical availability)
}

export interface BusySets {
  trailers: Record<number, string>;   // id → conflicting run reference
  trucks:   Record<number, string>;
  drivers:  Record<number, string>;
}

interface Candidate {
  id:          number;
  label:       string;
  available:   boolean;
  busyOn:      string | null;
  suitable:    boolean;
  reasons:     string[];   // why NOT suitable (empty when suitable)
  recommended: boolean;
  note?:         string;   // informational hint (never a failure): "Dave's usual unit"
  preloaded?:    boolean;  // trailer already carrying THIS run's job
  driversUsual?: boolean;  // truck: the assigned driver's usual unit
}

export interface RunCandidates {
  drivers:  Candidate[];
  trailers: Candidate[];
  trucks:   Candidate[];
}

const usable = (status?: string | null) => {
  const s = lc(status);
  return s === "" || s === "available" || s === "empty";
};

export function computeRunCandidates(
  ctx: CandidateContext,
  fleet: { trailers: TrailerLite[]; trucks: TruckLite[]; drivers: DriverLite[] },
  busy: BusySets,
): RunCandidates {
  const accept = (ctx.acceptableBodyTypes ?? []).map(lc).filter(Boolean);

  // ── Trailers ────────────────────────────────────────────────────────────────
  const runJobIds = new Set(ctx.runJobIds ?? []);
  const trailers: Candidate[] = fleet.trailers.map(t => {
    const reasons: string[] = [];
    const body = `${lc(t.bodyType)} ${lc(t.trailerType)}`;
    // Load state: a trailer pre-loaded with THIS run's job is the right one to
    // take; loaded with anything else is full — cannot be allocated.
    const loaded          = lc(t.status) === "loaded";
    const loadedWithOurs  = loaded && t.linkedJobId != null && runJobIds.has(t.linkedJobId);
    const loadedWithOther = loaded && !loadedWithOurs;
    const statusOk        = usable(t.status) || loadedWithOurs;
    const available = !busy.trailers[t.id] && statusOk;
    if (loadedWithOther)      reasons.push(t.linkedJobId != null ? "loaded with another job — full" : "loaded — full");
    else if (!usable(t.status) && !loadedWithOurs) reasons.push(`status ${t.status}`);
    if (ctx.tempControlled && !bodyHas(body, FRIDGE_SYNONYMS)) reasons.push("not refrigerated");
    // ADR: chemicals must NOT ride an enclosed (box/fridge) body — open bodies (flatbed/curtain) are fine.
    if (ctx.hazardous && bodyHas(body, ADR_UNSAFE_BODIES))     reasons.push("enclosed body — unsafe for ADR");
    // Acceptable body types: the trailer must match ANY of the job's allowed bodies (not just the first).
    if (accept.length > 0 && !accept.some(a => body.includes(a))) reasons.push(`needs ${(ctx.acceptableBodyTypes ?? []).join(" / ")}`);
    if (loadedWithOurs) reasons.length = 0;   // it literally has this run's load on it
    return {
      id: t.id,
      label: `${t.registration} · ${loadedWithOurs ? "loaded with this job" : t.trailerType ?? t.bodyType ?? "trailer"}`,
      available, busyOn: busy.trailers[t.id] ?? null,
      suitable: available && reasons.filter(r => !r.startsWith("status")).length === 0,
      reasons, recommended: false,
      preloaded: loadedWithOurs,
    };
  });

  // ── Trucks (units) — class/availability + driver↔vehicle attachment. ─────────
  const usualByReg = ctx.usualDriverByReg ?? {};
  const driverUsual = (ctx.assignedDriverUsualReg ?? "").trim().toUpperCase();
  const trucks: Candidate[] = fleet.trucks.map(t => {
    const available = !busy.trucks[t.id] && usable(t.status);
    const reg = t.registration.trim().toUpperCase();
    const isDriversUsual = driverUsual !== "" && reg === driverUsual;
    const reasons: string[] = [];
    if (!usable(t.status)) reasons.push(`status ${t.status}`);
    const note = isDriversUsual ? "assigned driver's usual unit"
      : usualByReg[reg] ? `usually ${usualByReg[reg]}'s unit`
      : undefined;
    return {
      id: t.id,
      label: `${t.registration}${t.gvwClass ? ` · ${t.gvwClass}` : ""}`,
      available, busyOn: busy.trucks[t.id] ?? null,
      suitable: usable(t.status),
      reasons, recommended: false,
      note,
      preloaded: false,
      driversUsual: isDriversUsual,
    };
  });

  // ── Drivers ───────────────────────────────────────────────────────────────
  const runHrs = ctx.runDurationHours ?? null;
  const drivers: Candidate[] = fleet.drivers.map(d => {
    const available = !busy.drivers[d.id] && d.status === "active";
    const reasons: string[] = [];
    if (d.status !== "active")                          reasons.push(`not active`);
    if (ctx.hazardous && !d.adrAllowed)                 reasons.push("no ADR");
    if (ctx.needsTrailer && !d.canUseTrailer)           reasons.push("not trailer-rated");
    if (ctx.needsTrailer && accept.length > 0 && (d.trailerTypesAllowed?.length ?? 0) > 0
        && !d.trailerTypesAllowed!.some(x => accept.some(a => lc(x).includes(a)))) reasons.push(`not cleared for ${accept.join("/")}`);
    // Hours = full preferred shift (theoretical). Soft: warn if the shift can't
    // cover the run's planned duration — never blocks (no live hours here).
    const shift = d.preferredShiftHours ?? null;
    if (runHrs != null && shift != null && shift > 0 && shift < runHrs) reasons.push(`shift ${shift}h < run ~${Math.round(runHrs)}h`);
    return {
      id: d.id,
      label: `${d.displayName}${shift != null && shift > 0 ? ` · ${shift}h` : ""}`,
      available, busyOn: busy.drivers[d.id] ?? null,
      // "not active" and the soft shift note don't flip suitability.
      suitable: reasons.filter(r => r !== "not active" && !r.startsWith("shift")).length === 0,
      reasons, recommended: false,
    };
  });

  // ── Recommend: available AND suitable, best-fit first. ──────────────────────
  // Trailers: one PRE-LOADED with this run's job beats everything; then prefer
  // an exact body match (don't grab a fridge for a curtain job).
  const bestTrailer = trailers
    .filter(c => c.available && c.suitable)
    .sort((a, b) => {
      const ap = a.preloaded ? 0 : 1, bp = b.preloaded ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const am = accept.length && accept.some(x => lc(a.label).includes(x)) ? 0 : 1;
      const bm = accept.length && accept.some(x => lc(b.label).includes(x)) ? 0 : 1;
      return am - bm;
    })[0];
  if (bestTrailer) bestTrailer.recommended = true;
  // Trucks: the assigned driver's usual unit wins when it's free and usable.
  const bestTruck = trucks.find(c => c.available && c.suitable && c.driversUsual)
                 ?? trucks.find(c => c.available && c.suitable);
  if (bestTruck)  bestTruck.recommended  = true;
  // Prefer a driver with NO soft warnings (e.g. shift that fully covers the run);
  // fall back to any available + suitable.
  const bestDriver = drivers.find(c => c.available && c.suitable && c.reasons.length === 0)
                  ?? drivers.find(c => c.available && c.suitable);
  if (bestDriver) bestDriver.recommended = true;

  // Sort each list: recommended → available+suitable → available → rest.
  const rank = (c: Candidate) => c.recommended ? 0 : c.available && c.suitable ? 1 : c.available ? 2 : c.suitable ? 3 : 4;
  const bySort = (a: Candidate, b: Candidate) => rank(a) - rank(b) || a.label.localeCompare(b.label);

  return { drivers: drivers.sort(bySort), trailers: trailers.sort(bySort), trucks: trucks.sort(bySort) };
}

/**
 * vehicleSuitability — Planning Q5b: "do these loads agree on a vehicle, and does
 * the allocated vehicle actually suit them?"
 *
 * Deterministic, advisory at planning (never blocks). Uses ALL available info:
 *   - each load's DECLARED requirement (vehicleCategory / minGvwClass / bodyTypes /
 *     equipment) when set, plus a class DERIVED from weight (and pallets) as fallback;
 *   - when a vehicle is already allocated, checks the vehicle meets every load's
 *     requirement — a substitute is fine only if it meets-or-exceeds (bigger/clas­sier
 *     is OK; a van under a pallet load is not). This is how a wrong-vehicle mistake
 *     gets caught.
 *
 * Hard enforcement against the assigned trailer stays in the Runs screen / S5.
 */

import { categoryFromWeight, KG_PER_PALLET, classRank, classCanCarry } from "./vehicleClass.js";

export interface SuitabilityLoad {
  label?:           string | null;
  weightKg?:        number | null;
  pallets?:         number | null;
  vehicleCategory?: string | null;   // declared required category (job.vehicleCategory)
  minGvwClass?:     string | null;   // declared min GVW (e.g. "7.5", "18", "44")
  bodyTypes?:       string[] | null; // acceptable body types
  equipment?:       string[] | null; // required onboard equipment (e.g. "tail_lift")
}

export interface AssignedVehicle {
  category?:  string | null;   // assigned truck bodyCategory (van/rigid/tractor…)
  payloadKg?: number | null;   // assigned vehicle payload capacity
  bodyType?:  string | null;
  equipment?: string[] | null; // onboard equipment present on the assigned vehicle
}

export interface SuitabilityConflict {
  severity: "high" | "medium" | "low";
  reason:   string;
}

export interface SuitabilityResult {
  ok:            boolean;
  requiredClass: string | null;   // most-demanding class the run's loads need
  assignedClass: string | null;   // class of the allocated vehicle (null if none)
  conflicts:     SuitabilityConflict[];
}

/** Map a numeric GVW string ("18", "7.5") to a vehicle category. */
function gvwToCategory(gvw?: string | null): string | null {
  if (!gvw) return null;
  const n = parseFloat(gvw);
  if (!isFinite(n)) return null;
  if (n > 18)  return "tractor";
  if (n > 7.5) return "rigid";
  if (n > 3.5) return "luton_van";
  return "van";
}

function loadWeightKg(l: SuitabilityLoad): number {
  if (l.weightKg && l.weightKg > 0) return l.weightKg;
  if (l.pallets && l.pallets > 0)   return l.pallets * KG_PER_PALLET;
  return 0;
}

/** The most-demanding category a single load requires (declared or derived). */
function requiredCategoryFor(l: SuitabilityLoad): string | null {
  const wt = loadWeightKg(l);
  const candidates = [
    l.vehicleCategory ?? null,
    gvwToCategory(l.minGvwClass),
    wt > 0 ? categoryFromWeight(wt) : null,
  ].filter((c): c is string => !!c);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (classRank(b) > classRank(a) ? b : a));
}

/**
 * Evaluate vehicle suitability across a run's loads (and the allocated vehicle).
 */
export function checkVehicleSuitability(freight: SuitabilityLoad[], assigned?: AssignedVehicle | null): SuitabilityResult {
  const conflicts: SuitabilityConflict[] = [];

  const perLoad = freight.map(l => ({ load: l, cat: requiredCategoryFor(l) }))
                         .filter(x => x.cat !== null) as { load: SuitabilityLoad; cat: string }[];

  if (perLoad.length === 0) {
    return { ok: true, requiredClass: null, assignedClass: assigned?.category ?? null, conflicts };
  }

  // Run-level required class = the most demanding load.
  const requiredClass = perLoad.reduce((a, b) => (classRank(b.cat) > classRank(a.cat) ? b : a)).cat;
  const totalWeightKg = freight.reduce((s, l) => s + loadWeightKg(l), 0);

  // 1. Class MIX — a van-class load sharing a run with an HGV-class load. These are
  //    different vehicles/service types; usually they should be separate runs.
  const ranks   = perLoad.map(x => classRank(x.cat));
  const minRank = Math.min(...ranks), maxRank = Math.max(...ranks);
  if (minRank <= 2 && maxRank >= 3) {
    const small = perLoad.find(x => classRank(x.cat) <= 2)!;
    const big   = perLoad.find(x => classRank(x.cat) >= 3)!;
    conflicts.push({
      severity: "high",
      reason: `Mixing a ${small.cat}-class load (${small.load.label ?? "a stop"}) with a ${big.cat}-class load (${big.load.label ?? "a stop"}) on one run — these usually need different vehicles.`,
    });
  }

  // 2. Allocated-vehicle suitability (when a vehicle is assigned).
  const assignedClass = assigned?.category ?? null;
  if (assigned) {
    if (assigned.category && !classCanCarry(assigned.category, requiredClass)) {
      conflicts.push({
        severity: "high",
        reason: `Allocated vehicle is a ${assigned.category} but the load needs a ${requiredClass} — too small for this run.`,
      });
    }
    if (assigned.payloadKg != null && totalWeightKg > assigned.payloadKg) {
      conflicts.push({
        severity: "high",
        reason: `Load is ~${Math.round(totalWeightKg).toLocaleString()} kg but the allocated vehicle carries ${Math.round(assigned.payloadKg).toLocaleString()} kg — over payload.`,
      });
    }
    // Body type — only when at least one load declares acceptable bodies.
    const allowedBodies = [...new Set(freight.flatMap(l => (l.bodyTypes ?? []).map(b => b.toLowerCase())))];
    if (allowedBodies.length > 0 && assigned.bodyType && !allowedBodies.includes(assigned.bodyType.toLowerCase())) {
      conflicts.push({
        severity: "medium",
        reason: `Allocated body type "${assigned.bodyType}" is not among the required (${allowedBodies.join(", ")}).`,
      });
    }
    // Equipment — required onboard equipment the vehicle lacks (e.g. tail-lift).
    const needed = [...new Set(freight.flatMap(l => (l.equipment ?? []).map(e => e.toLowerCase())))];
    const have   = new Set((assigned.equipment ?? []).map(e => e.toLowerCase()));
    const missing = needed.filter(e => !have.has(e));
    if (missing.length > 0) {
      conflicts.push({
        severity: "medium",
        reason: `Allocated vehicle is missing required equipment: ${missing.join(", ")}.`,
      });
    }
  }

  const hasHigh = conflicts.some(c => c.severity === "high");
  return { ok: !hasHigh, requiredClass, assignedClass, conflicts };
}

/**
 * vehicleClass — shared vehicle sizing constants + helpers.
 *
 * Single source for "what class of vehicle does this weight need" so the planner
 * suggestion (suggestVehicleService) and the planning suitability check
 * (vehicleSuitability) agree. No AI — deterministic thresholds.
 */

// Approximate weight per standard euro pallet (kg) — fallback when weight unknown.
export const KG_PER_PALLET = 400;

/** Smallest vehicle category whose payload comfortably carries `kg`. */
export function categoryFromWeight(kg: number): string {
  if (kg > 16_000) return "tractor";
  if (kg > 900)    return "rigid";
  if (kg > 500)    return "luton_van";
  return "van";
}

// Capability ordering — a higher-rank vehicle can carry anything a lower one can.
// Anything not listed (specialist: heavy_haulage, low_loader…) ranks highest so it
// is never wrongly flagged as "too small".
const CLASS_RANK: Record<string, number> = {
  van: 1, luton_van: 2, rigid: 3, tractor: 4, drawbar: 4,
};

/** Capability rank for a category string; unknown/specialist → 5 (treat as largest). */
export function classRank(category?: string | null): number {
  if (!category) return 0;
  return CLASS_RANK[category.toLowerCase()] ?? 5;
}

/** True when `assigned` can carry a load that requires `required` (≥ in capability). */
export function classCanCarry(assigned: string | null | undefined, required: string | null | undefined): boolean {
  return classRank(assigned) >= classRank(required);
}

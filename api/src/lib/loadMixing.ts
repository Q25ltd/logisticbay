/**
 * checkLoadMixing — "can these loads travel together?" (Planning Q1, A2).
 *
 * Deterministic, ADVISORY-only stop-mixing rules. The Planning screen never
 * blocks adding freight to a run — it surfaces the conflict + reason so the
 * planner decides. (Hard vehicle enforcement is the Runs screen / S5.)
 */

export interface MixPart {
  type:            string;
  hazardous?:      boolean | null;
  tempControlled?: boolean | null;
  tempRange?:      string | null;
  oversized?:      boolean | null;
  goodsType?:      string | null;
}

export interface MixConflict {
  severity: "high" | "medium" | "low";
  reason:   string;
}

export interface MixResult {
  compatible: boolean;        // true when there are no conflicts
  conflicts:  MixConflict[];
}

// Only freight-carrying stops contribute a load to the mix.
const FREIGHT_STOP_TYPES = new Set(["collection", "pickup", "delivery", "dropoff", "reload"]);

// Whole-word matching — substring matching flagged "air fresheners" as food
// via "fresh" (same failure class as "coil" containing "oil").
const FOOD_HINTS = ["food", "perishable", "fresh", "chilled", "frozen", "meat", "dairy", "produce", "grocery"];
const isFood = (g?: string | null) => {
  const s = (g ?? "").toLowerCase();
  return FOOD_HINTS.some(h => new RegExp(`\\b${h}\\b`).test(s));
};

/**
 * Evaluate whether a set of loads can share one run/trailer. Pure + sync.
 */
export function checkLoadMixing(parts: MixPart[]): MixResult {
  const loads = parts.filter(p => FREIGHT_STOP_TYPES.has(p.type));
  const conflicts: MixConflict[] = [];

  // Fewer than two loads can never conflict with each other.
  if (loads.length < 2) return { compatible: true, conflicts };

  const anyTemp     = loads.some(p => p.tempControlled);
  const anyAmbient  = loads.some(p => !p.tempControlled);
  const anyHaz      = loads.some(p => p.hazardous);
  const anyFood     = loads.some(p => isFood(p.goodsType) || p.tempControlled);
  const oversized   = loads.filter(p => p.oversized);

  // 1. Temperature-controlled mixed with ambient on one trailer.
  if (anyTemp && anyAmbient) {
    conflicts.push({ severity: "high", reason: "Mixing temperature-controlled and ambient freight on one trailer." });
  }

  // 2. Different temperature ranges among the chilled/frozen loads.
  const ranges = [...new Set(loads.filter(p => p.tempControlled && p.tempRange?.trim()).map(p => p.tempRange!.trim().toLowerCase()))];
  if (ranges.length > 1) {
    conflicts.push({ severity: "high", reason: `Different temperature ranges on one trailer (${ranges.join(" vs ")}).` });
  }

  // 3. Hazardous (ADR) mixed with food / temperature-controlled freight.
  if (anyHaz && anyFood) {
    conflicts.push({ severity: "high", reason: "Hazardous (ADR) freight mixed with food / temperature-controlled freight." });
  }

  // 4. Oversized load sharing a run — usually needs a dedicated vehicle.
  if (oversized.length > 0) {
    conflicts.push({ severity: "medium", reason: "Oversized load is sharing a run — it usually needs a dedicated vehicle." });
  }

  return { compatible: conflicts.length === 0, conflicts };
}

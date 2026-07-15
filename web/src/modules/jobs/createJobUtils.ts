// ── Helper date functions ─────────────────────────────────────────────────────
// The legacy StopState shape + its factory/mappers (makeStop, jobPartToStopState,
// stopComplete, toMins, fmtMins, nowDisplay) were deleted 2026-07-14 — nothing
// imported them; CJP uses SharedStopState from SharedStopCard.tsx (the shape
// with the canonical field names).

/** "some_snake_case" → "Some snake case" */
export function cap(s: string): string {
  const spaced = s.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const today = () => new Date().toISOString().split("T")[0];

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

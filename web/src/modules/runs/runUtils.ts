import type { Run } from "../../types";

const TRAILER_TYPE_LABELS: Record<string, string> = {
  temperature_controlled:  "Fridge / temp-controlled",
  curtainsider_or_flatbed: "Curtain or flatbed",
};

export interface RunRoute {
  origin:      string | null;
  destination: string | null;
  stops:       number;
  loadSummary: string | null;
}

/** Origin/destination + load summary derived from a run's sorted, active assignments. */
export function runRoute(run: Run): RunRoute {
  const list = run.assignments ?? [];
  if (!list.length) return { origin: null, destination: null, stops: 0, loadSummary: null };
  const first = list[0]?.jobPart;
  const last  = list[list.length - 1]?.jobPart;
  const origin      = first?.town || first?.locationTextSnapshot?.split(",")[0]?.trim() || null;
  const destination = last?.town  || last?.locationTextSnapshot?.split(",")[0]?.trim()  || null;
  const units    = new Set(list.map(a => a.quantityUnit).filter(Boolean));
  const totalQty = list.reduce((s, a) => s + (a.quantityAssigned || 0), 0);
  const loadSummary = units.size === 1 && totalQty > 0 ? `${totalQty} ${[...units][0]}` : null;
  return { origin, destination, stops: list.length, loadSummary };
}

/** Human label for Run.requiredTrailerType, or null if none / unrecognised. */
export function requiredTrailerLabel(run: Run): string | null {
  return run.requiredTrailerType ? (TRAILER_TYPE_LABELS[run.requiredTrailerType] ?? run.requiredTrailerType) : null;
}

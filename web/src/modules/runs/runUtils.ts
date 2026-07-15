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
  // The load on board is what the run COLLECTS — summing collect + deliver
  // double-counts the same pallets. Runs with no collection stop (e.g. a
  // yard-pick delivery leg) fall back to all stops.
  const collects = list.filter(a => a.jobPart?.type === "collection");
  // quantityAssigned is a Prisma Decimal — arrives as a string over JSON, so
  // coerce before summing or `+` concatenates ("0" + "14" + "14" = "01414").
  const totalQty = (collects.length ? collects : list)
    .reduce((s, a) => s + (Number(a.quantityAssigned) || 0), 0);
  const loadSummary = units.size === 1 && totalQty > 0 ? `${totalQty} ${[...units][0]}` : null;
  return { origin, destination, stops: list.length, loadSummary };
}

/** Human label for Run.requiredTrailerType, or null if none / unrecognised. */
export function requiredTrailerLabel(run: Run): string | null {
  return run.requiredTrailerType ? (TRAILER_TYPE_LABELS[run.requiredTrailerType] ?? run.requiredTrailerType) : null;
}

export interface RunTimes {
  collect:       string | null;   // first stop's window start, e.g. "22 Jun 04:00"
  deliver:       string | null;   // last stop's booked time (preferred) or window start
  deliverBooked: boolean;         // true when `deliver` is a customer-booked slot
}

// Stop times are stored as UTC wall-clock — render them as stored (no local shift).
const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtTime = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** Collection + delivery date/times from a run's sorted, active stops. */
export function runTimes(run: Run): RunTimes {
  const list = run.assignments ?? [];
  const first = list[0]?.jobPart;
  const last  = list[list.length - 1]?.jobPart;

  const parse = (iso?: string | null): Date | null => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const collectAt = parse(first?.timeWindowStart);
  const bookedAt  = parse(last?.bookedTime);
  const deliverAt = bookedAt ?? parse(last?.timeWindowStart) ?? parse(last?.timeWindowEnd);

  const collect = collectAt ? `${fmtDate(collectAt)} ${fmtTime(collectAt)}` : null;
  // Same day → time only on the delivery side; different day → full date both sides.
  const deliver = deliverAt
    ? (collectAt && fmtDate(collectAt) === fmtDate(deliverAt) ? fmtTime(deliverAt) : `${fmtDate(deliverAt)} ${fmtTime(deliverAt)}`)
    : null;

  return { collect, deliver, deliverBooked: !!bookedAt };
}

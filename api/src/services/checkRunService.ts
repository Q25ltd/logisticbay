/**
 * Rule-based run route feasibility check.
 *
 * Uses real HGV routing (ORS) for distances — no AI needed.
 * All feasibility decisions are deterministic rules:
 *   - UK legal 9-hour daily driving limit
 *   - EC 561/2006 break rule (45 min after 4.5 h driving)
 *   - Time window arrival checks per stop
 *   - Total run duration warnings
 *
 * Advisory only — the planner always makes the final call.
 */

import { postcodeToCoords, getHgvLeg } from "../lib/routing.js";
import { haversineKm }                from "../lib/geo.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunStop {
  sequenceNumber:   number;
  type:             string;
  locationText?:    string | null;
  postcode?:        string | null;
  lat?:             number | null;
  lng?:             number | null;
  timeWindowStart?: string | null;
  timeWindowEnd?:   string | null;
  bookedTime?:      string | null;
  customerName?:    string | null;
}

export interface VehicleRestrictions {
  weightT?:   number | null;
  heightM?:   number | null;
  widthM?:    number | null;
  lengthM?:   number | null;
  axleLoadT?: number | null;
}

export interface RunFeasibilityInput {
  stops:               RunStop[];
  estimatedStartTime?: string | null;
  vehicle?:            VehicleRestrictions | null;
}

export interface RunFeasibilityResult {
  concern:     boolean;
  severity:    "high" | "medium" | "low" | "none";
  message:     string;
  suggestion?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HGV_SPEED_KMH    = 60;
const ROAD_FACTOR      = 1.25;
const STOP_DWELL_MIN   = 30;
const MAX_DRIVE_MIN    = 540;  // 9 h legal daily driving limit
const BREAK_TRIGGER    = 270;  // 4.5 h — break required after this
const BREAK_DURATION   = 45;   // 45-min mandatory break

const WORK_STOP_TYPES = new Set([
  "collection", "delivery", "pickup", "dropoff", "reload",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────


function fmt12h(ms: number): string {
  const d = new Date(ms);
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m}${ampm}`;
}

function stopLabel(s: RunStop, idx: number): string {
  return s.customerName ?? s.locationText ?? s.postcode ?? `Stop ${idx + 1}`;
}

function fmtH(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function checkRun(input: RunFeasibilityInput): Promise<RunFeasibilityResult> {
  const stops = [...input.stops].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  if (stops.length === 0) {
    return { concern: false, severity: "none", message: "" };
  }

  // ── Resolve postcodes → coords ────────────────────────────────────────────

  interface StopWithCoords { lat: number | null; lng: number | null }

  const resolvedCoords: StopWithCoords[] = await Promise.all(
    stops.map(async s => {
      if (s.lat != null && s.lng != null) return { lat: s.lat, lng: s.lng };
      if (s.postcode) {
        const c = await postcodeToCoords(s.postcode).catch(() => null);
        if (c) return { lat: c.lat, lng: c.lng };
      }
      return { lat: null, lng: null };
    }),
  );

  // ── Leg calculations ──────────────────────────────────────────────────────

  interface LegInfo {
    roadKm:   number | null;
    driveMin: number | null;
  }

  const hgvParams = input.vehicle ? {
    ...(input.vehicle.weightT   != null ? { weight:    input.vehicle.weightT }   : {}),
    ...(input.vehicle.heightM   != null ? { height:    input.vehicle.heightM }   : {}),
    ...(input.vehicle.widthM    != null ? { width:     input.vehicle.widthM }    : {}),
    ...(input.vehicle.lengthM   != null ? { length:    input.vehicle.lengthM }   : {}),
    ...(input.vehicle.axleLoadT != null ? { axle_load: input.vehicle.axleLoadT } : {}),
  } : {};

  const legs: LegInfo[] = await Promise.all(
    stops.slice(0, -1).map(async (_, i) => {
      const a = resolvedCoords[i];
      const b = resolvedCoords[i + 1];
      if (a.lat == null || b.lat == null) return { roadKm: null, driveMin: null };

      const ors = await getHgvLeg(
        { lat: a.lat, lng: a.lng! },
        { lat: b.lat, lng: b.lng! },
        hgvParams,
      ).catch(() => null);

      if (ors) return { roadKm: ors.distanceKm, driveMin: ors.durationMinutes };

      const straight = haversineKm(a.lat, a.lng!, b.lat, b.lng!);
      const road     = straight * ROAD_FACTOR;
      return { roadKm: road, driveMin: (road / HGV_SPEED_KMH) * 60 };
    }),
  );

  const hasCoords    = legs.some(l => l.driveMin != null);
  const totalDriveMin = legs.reduce((s, l) => s + (l.driveMin ?? 0), 0);
  const totalDwellMin = stops.length * STOP_DWELL_MIN;

  // ── Break rule (EC 561/2006) ──────────────────────────────────────────────

  let breakRequired   = false;
  let breakLegIdx     = -1;
  let cumDrive        = 0;

  for (let i = 0; i < legs.length; i++) {
    cumDrive += legs[i].driveMin ?? 0;
    if (cumDrive >= BREAK_TRIGGER && breakLegIdx === -1) {
      breakRequired = true;
      breakLegIdx   = i;
    }
  }

  const restStopAfterBreak = breakLegIdx >= 0
    ? stops.slice(breakLegIdx + 1).find(s => !WORK_STOP_TYPES.has(s.type))
    : null;

  const totalRunMin = totalDriveMin + totalDwellMin + (breakRequired ? BREAK_DURATION : 0);

  // ── Rule checks ───────────────────────────────────────────────────────────

  // 1. Legal driving hours exceeded
  if (hasCoords && totalDriveMin > MAX_DRIVE_MIN) {
    return {
      concern:    true,
      severity:   "high",
      message:    `Estimated driving is ${fmtH(Math.round(totalDriveMin))} — exceeds the 9-hour legal daily limit.`,
      suggestion: "Split the run across two drivers or two days.",
    };
  }

  // 2. Break needed but no rest stop in the route
  if (breakRequired && !restStopAfterBreak) {
    const before = breakLegIdx >= 0 ? stopLabel(stops[breakLegIdx],     breakLegIdx)     : "the previous stop";
    const after  = breakLegIdx >= 0 ? stopLabel(stops[breakLegIdx + 1], breakLegIdx + 1) : "the next stop";
    return {
      concern:    true,
      severity:   "medium",
      message:    `Driver will need a 45-min break between ${before} and ${after} — no rest stop is planned there.`,
      suggestion: "Add a waypoint (e.g. motorway services) between those two stops.",
    };
  }

  // 3. Time window violations — walk through stops and check arrival vs window
  if (input.estimatedStartTime && hasCoords) {
    const startMs   = new Date(input.estimatedStartTime).getTime();
    let   elapsedMin = 0;
    let   breakApplied = false;

    for (let i = 0; i < stops.length; i++) {
      const s          = stops[i];
      const arrivalMs  = startMs + elapsedMin * 60 * 1000;

      // Check against booked time first, then window end
      const deadline = s.bookedTime
        ? new Date(s.bookedTime).getTime()
        : s.timeWindowEnd ? new Date(s.timeWindowEnd).getTime() : null;

      if (deadline !== null && arrivalMs > deadline) {
        const lateMin = Math.round((arrivalMs - deadline) / 60000);
        const label   = stopLabel(s, i);
        const timeStr = fmt12h(deadline);
        return {
          concern:    true,
          severity:   lateMin >= 30 ? "high" : "medium",
          message:    `Estimated arrival at ${label} is ~${lateMin} min past the ${s.bookedTime ? "booked slot" : "window"} (${timeStr}).`,
          suggestion: "Start earlier, adjust the stop order, or contact the customer.",
        };
      }

      // Accumulate time: dwell at this stop + drive to next
      elapsedMin += STOP_DWELL_MIN;
      if (i < legs.length) {
        elapsedMin += legs[i].driveMin ?? 0;
        if (!breakApplied && breakRequired && i === breakLegIdx) {
          elapsedMin += BREAK_DURATION;
          breakApplied = true;
        }
      }
    }
  }

  // 4. Very long day
  if (hasCoords && totalRunMin > 720) { // 12 h
    return {
      concern:    true,
      severity:   "medium",
      message:    `Run is roughly ${fmtH(Math.round(totalRunMin))} total — a very long day for one driver.`,
      suggestion: "Consider splitting across two drivers or starting earlier.",
    };
  }

  // 5. Long day
  if (hasCoords && totalRunMin > 600) { // 10 h
    return {
      concern:    true,
      severity:   "low",
      message:    `Run looks achievable but long — roughly ${fmtH(Math.round(totalRunMin))} total${breakRequired ? " including the required break" : ""}.`,
    };
  }

  // 6. No coordinates — can't assess timing
  if (!hasCoords) {
    return {
      concern:  false,
      severity: "none",
      message:  "No postcodes or coordinates on stops — add addresses for a timing check.",
    };
  }

  // 7. All good — informational summary
  const breakNote = breakRequired
    ? ` Break needed between ${stopLabel(stops[breakLegIdx], breakLegIdx)} and ${stopLabel(stops[breakLegIdx + 1], breakLegIdx + 1)}.`
    : "";

  return {
    concern:  false,
    severity: "none",
    message:  `Run looks feasible — roughly ${fmtH(Math.round(totalRunMin))} total.${breakNote}`,
  };
}

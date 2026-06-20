/**
 * Rule-based run planning check (NOT AI).
 *
 * Deterministic routing/time logic — uses real HGV routing (ORS) for distances.
 * Decisions are explainable rules:
 *   - UK legal 9-hour daily driving limit
 *   - EC 561/2006 break rule (45 min after 4.5 h driving)
 *   - Time-window arrival checks per stop, computed against a CONTINGENCY BUFFER
 *     so a plan that only works under perfect conditions is flagged (Step A2 Q3)
 *   - A 0–100 confidence score with explainable deductions
 *
 * Advisory only — the planner always makes the final call. Despite the
 * `/ai/check-run` route name, there is no AI here; UI copy says "Planning check"
 * / "Run confidence".
 */

import { postcodeToCoords, getHgvLeg } from "../lib/routing.js";
import { haversineKm }                from "../lib/geo.js";
import { checkLoadMixing, type MixResult } from "../lib/loadMixing.js";

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
  // A2 Q1 — freight requirements for the stop-mixing check (advisory).
  hazardous?:       boolean | null;
  tempControlled?:  boolean | null;
  tempRange?:       string | null;
  oversized?:       boolean | null;
  goodsType?:       string | null;
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
  // A2 Q2 — depot/base coords; when present, deadhead (empty miles) is computed.
  base?:               { lat: number; lng: number } | null;
}

export interface RunGeometry {
  routedKm:    number | null;   // total road distance of the run
  idealKm:     number | null;   // straight-line sum between consecutive stops
  detourRatio: number | null;   // routedKm / idealKm (1.0 = straight line)
  deadheadKm:  number | null;   // empty miles base→first + last→base (null if no base)
}

export interface RunFeasibilityResult {
  concern:     boolean;
  severity:    "high" | "medium" | "low" | "none";
  message:     string;
  suggestion?: string;
  // Step A2 Q3 — explainable confidence + the contingency buffer that was applied.
  /** 0–100 once timing can be assessed; null when stops lack coordinates. */
  confidence:  number | null;
  buffer: {
    driveBufferPct:  number;   // % padding added to ORS/haversine drive time
    dwellPerStopMin: number;   // dwell assumed per stop (incl. buffer)
    minSlackMin:     number | null;  // tightest window slack after buffer (null if no timed stops)
  };
  // A2 Q1 — "can these loads travel together?" (advisory; never blocks).
  compatibility: MixResult;
  // A2 Q2 — direction / empty miles.
  geometry: RunGeometry;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HGV_SPEED_KMH    = 60;
const ROAD_FACTOR      = 1.25;
const STOP_DWELL_MIN   = 30;
const MAX_DRIVE_MIN    = 540;  // 9 h legal daily driving limit
const BREAK_TRIGGER    = 270;  // 4.5 h — break required after this
const BREAK_DURATION   = 45;   // 45-min mandatory break

// Contingency buffer (A2 Q3) — plans must not assume perfect conditions.
const DRIVE_BUFFER_PCT = 0.15; // +15% on every drive leg
const DWELL_BUFFER_MIN = 15;   // extra dwell padding per stop
const BUFFERED_DWELL   = STOP_DWELL_MIN + DWELL_BUFFER_MIN;

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

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const SEV_RANK: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };

interface Issue {
  penalty:     number;
  severity:    "high" | "medium" | "low";
  message:     string;
  suggestion?: string;
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function checkRun(input: RunFeasibilityInput): Promise<RunFeasibilityResult> {
  const stops = [...input.stops].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  // A2 Q1 — stop-mixing is advisory and order-independent; compute once, attach
  // to every return. It never affects feasibility/confidence.
  const compatibility = checkLoadMixing(stops);

  const baseBuffer = { driveBufferPct: DRIVE_BUFFER_PCT, dwellPerStopMin: BUFFERED_DWELL, minSlackMin: null as number | null };
  const nullGeometry: RunGeometry = { routedKm: null, idealKm: null, detourRatio: null, deadheadKm: null };

  if (stops.length === 0) {
    return { concern: false, severity: "none", message: "", confidence: null, buffer: baseBuffer, compatibility, geometry: nullGeometry };
  }

  // ── Resolve postcodes → coords ────────────────────────────────────────────
  const resolvedCoords = await Promise.all(
    stops.map(async s => {
      if (s.lat != null && s.lng != null) return { lat: s.lat, lng: s.lng };
      if (s.postcode) {
        const c = await postcodeToCoords(s.postcode).catch(() => null);
        if (c) return { lat: c.lat as number, lng: c.lng as number };
      }
      return { lat: null as number | null, lng: null as number | null };
    }),
  );

  // ── Leg drive times (raw) ─────────────────────────────────────────────────
  const hgvParams = input.vehicle ? {
    ...(input.vehicle.weightT   != null ? { weight:    input.vehicle.weightT }   : {}),
    ...(input.vehicle.heightM   != null ? { height:    input.vehicle.heightM }   : {}),
    ...(input.vehicle.widthM    != null ? { width:     input.vehicle.widthM }    : {}),
    ...(input.vehicle.lengthM   != null ? { length:    input.vehicle.lengthM }   : {}),
    ...(input.vehicle.axleLoadT != null ? { axle_load: input.vehicle.axleLoadT } : {}),
  } : {};

  const legs = await Promise.all(
    stops.slice(0, -1).map(async (_, i) => {
      const a = resolvedCoords[i];
      const b = resolvedCoords[i + 1];
      if (a.lat == null || b.lat == null) return { driveMin: null as number | null, roadKm: null as number | null };
      const ors = await getHgvLeg({ lat: a.lat, lng: a.lng! }, { lat: b.lat, lng: b.lng! }, hgvParams).catch(() => null);
      if (ors) return { driveMin: ors.durationMinutes, roadKm: ors.distanceKm };
      const road = haversineKm(a.lat, a.lng!, b.lat, b.lng!) * ROAD_FACTOR;
      return { driveMin: (road / HGV_SPEED_KMH) * 60, roadKm: road };
    }),
  );

  const hasCoords      = legs.some(l => l.driveMin != null);
  const rawDriveMin    = legs.reduce((s, l) => s + (l.driveMin ?? 0), 0);
  // Buffered drive (A2 Q3) — used for timing/feasibility, not the legal limit.
  const bufDrive = (i: number) => (legs[i]?.driveMin ?? 0) * (1 + DRIVE_BUFFER_PCT);
  const bufferedDriveMin = legs.reduce((s, _l, i) => s + bufDrive(i), 0);

  // ── A2 Q2 — geometry (direction / empty miles) ────────────────────────────
  let geometry: RunGeometry = nullGeometry;
  if (hasCoords) {
    const routedKm = legs.reduce((s, l) => s + (l.roadKm ?? 0), 0);
    let idealKm = 0;
    for (let i = 0; i < resolvedCoords.length - 1; i++) {
      const a = resolvedCoords[i], b = resolvedCoords[i + 1];
      if (a.lat != null && b.lat != null) idealKm += haversineKm(a.lat, a.lng!, b.lat, b.lng!);
    }
    const detourRatio = idealKm > 0 ? routedKm / idealKm : null;
    let deadheadKm: number | null = null;
    if (input.base && Number.isFinite(input.base.lat) && Number.isFinite(input.base.lng)) {
      const first = resolvedCoords.find(c => c.lat != null);
      const last  = [...resolvedCoords].reverse().find(c => c.lat != null);
      if (first && last) {
        deadheadKm = haversineKm(input.base.lat, input.base.lng, first.lat!, first.lng!)
                   + haversineKm(last.lat!, last.lng!, input.base.lat, input.base.lng);
      }
    }
    geometry = {
      routedKm:    Math.round(routedKm),
      idealKm:     Math.round(idealKm),
      detourRatio: detourRatio != null ? Math.round(detourRatio * 100) / 100 : null,
      deadheadKm:  deadheadKm  != null ? Math.round(deadheadKm) : null,
    };
  }

  // ── Break rule (EC 561/2006) on raw driving ───────────────────────────────
  let breakRequired = false, breakLegIdx = -1, cum = 0;
  for (let i = 0; i < legs.length; i++) {
    cum += legs[i].driveMin ?? 0;
    if (cum >= BREAK_TRIGGER && breakLegIdx === -1) { breakRequired = true; breakLegIdx = i; }
  }
  const restStopAfterBreak = breakLegIdx >= 0
    ? stops.slice(breakLegIdx + 1).find(s => !WORK_STOP_TYPES.has(s.type)) : null;

  const totalRunMin = bufferedDriveMin + stops.length * BUFFERED_DWELL + (breakRequired ? BREAK_DURATION : 0);

  // ── Collect issues (no early return — we want a holistic score) ───────────
  const issues: Issue[] = [];
  let minSlackMin: number | null = null;

  // 1. Legal driving hours (on RAW driving — buffer is slack, not driving time)
  if (hasCoords && rawDriveMin > MAX_DRIVE_MIN) {
    issues.push({ penalty: 60, severity: "high",
      message: `Estimated driving is ${fmtH(Math.round(rawDriveMin))} — exceeds the 9-hour legal daily limit.`,
      suggestion: "Split the run across two drivers or two days." });
  }

  // 2. Break needed but no rest stop in the route
  if (breakRequired && !restStopAfterBreak) {
    const before = stopLabel(stops[breakLegIdx], breakLegIdx);
    const after  = stopLabel(stops[breakLegIdx + 1], breakLegIdx + 1);
    issues.push({ penalty: 22, severity: "medium",
      message: `Driver will need a 45-min break between ${before} and ${after} — no rest stop is planned there.`,
      suggestion: "Add a waypoint (e.g. motorway services) between those two stops." });
  }

  // 3. Time-window checks against the BUFFERED schedule
  if (input.estimatedStartTime && hasCoords) {
    const startMs = new Date(input.estimatedStartTime).getTime();
    let elapsedMin = 0, breakApplied = false;

    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const arrivalMs = startMs + elapsedMin * 60 * 1000;
      const deadline = s.bookedTime ? new Date(s.bookedTime).getTime()
        : s.timeWindowEnd ? new Date(s.timeWindowEnd).getTime() : null;

      if (deadline !== null) {
        const slackMin = Math.round((deadline - arrivalMs) / 60000);
        minSlackMin = minSlackMin == null ? slackMin : Math.min(minSlackMin, slackMin);

        if (slackMin < 0) {
          const lateMin = -slackMin;
          issues.push({ penalty: clamp(35 + lateMin, 35, 60), severity: lateMin >= 30 ? "high" : "medium",
            message: `Even with a ${Math.round(DRIVE_BUFFER_PCT * 100)}% buffer, arrival at ${stopLabel(s, i)} is ~${lateMin} min past the ${s.bookedTime ? "booked slot" : "window"} (${fmt12h(deadline)}).`,
            suggestion: "Start earlier, adjust the stop order, or contact the customer." });
        } else if (slackMin < 30) {
          issues.push({ penalty: 12, severity: "low",
            message: `Tight slack at ${stopLabel(s, i)} — only ~${slackMin} min spare before the ${s.bookedTime ? "booked slot" : "window"} after buffer.` });
        }
      }

      elapsedMin += BUFFERED_DWELL;
      if (i < legs.length) {
        elapsedMin += bufDrive(i);
        if (!breakApplied && breakRequired && i === breakLegIdx) { elapsedMin += BREAK_DURATION; breakApplied = true; }
      }
    }
  }

  // 4/5. Long day (on buffered total)
  if (hasCoords && totalRunMin > 720) {
    issues.push({ penalty: 22, severity: "medium",
      message: `Run is roughly ${fmtH(Math.round(totalRunMin))} total (with buffer) — a very long day for one driver.`,
      suggestion: "Consider splitting across two drivers or starting earlier." });
  } else if (hasCoords && totalRunMin > 600) {
    issues.push({ penalty: 10, severity: "low",
      message: `Achievable but long — roughly ${fmtH(Math.round(totalRunMin))} total with buffer${breakRequired ? " including the required break" : ""}.` });
  }

  // ── Derive confidence + the headline result ───────────────────────────────
  if (!hasCoords) {
    return {
      concern: false, severity: "none",
      message: "No postcodes or coordinates on stops — add addresses for a planning check.",
      confidence: null, buffer: { ...baseBuffer, minSlackMin: null }, compatibility, geometry,
    };
  }

  const confidence = clamp(100 - issues.reduce((s, x) => s + x.penalty, 0), 0, 100);
  const buffer = { driveBufferPct: DRIVE_BUFFER_PCT, dwellPerStopMin: BUFFERED_DWELL, minSlackMin };

  if (issues.length === 0) {
    const breakNote = breakRequired
      ? ` Break needed between ${stopLabel(stops[breakLegIdx], breakLegIdx)} and ${stopLabel(stops[breakLegIdx + 1], breakLegIdx + 1)}.`
      : "";
    return {
      concern: false, severity: "none",
      message: `Run looks feasible with buffer — roughly ${fmtH(Math.round(totalRunMin))} total.${breakNote}`,
      confidence, buffer, compatibility, geometry,
    };
  }

  // Headline = the worst issue.
  const worst = issues.reduce((a, b) => (SEV_RANK[b.severity] > SEV_RANK[a.severity] ? b : a));
  return {
    concern: true,
    severity: worst.severity,
    message: worst.message,
    ...(worst.suggestion ? { suggestion: worst.suggestion } : {}),
    confidence, buffer, compatibility, geometry,
  };
}

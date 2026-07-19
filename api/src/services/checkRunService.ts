/**
 * Rule-based run planning check (NOT AI).
 *
 * Deterministic routing/time logic — uses real HGV routing (ORS) for distances.
 * Decisions are explainable rules:
 *   - EC 561/2006 daily driving limit (9 h, extendable to 10 h ≤2×/week)
 *   - EC 561/2006 break rule — a 45-min break after EVERY 4.5 h of driving (repeating)
 *   - Working Time Directive — a 30-min break once on-duty work passes 6 h
 *   - ~13 h daily duty/spread ceiling (driving + work + breaks)
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
import { checkCapacity, type CapacityResult, type FleetCapacityProfile } from "../lib/loadCapacity.js";
import { checkVehicleSuitability, type SuitabilityResult, type SuitabilityConflict, type AssignedVehicle } from "../lib/vehicleSuitability.js";

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
  // Q4 coverage — which job this stop belongs to (match delivery ↔ collection).
  jobId?:           number | null;
  // Q5a capacity — pallet count + stackability of the load picked up at this stop.
  pallets?:         number | null;
  stackable?:       boolean | null;
  // Q5b vehicle suitability — load weight + declared vehicle requirement of the job.
  weightKg?:           number | null;
  reqVehicleCategory?: string | null;   // job.vehicleCategory
  reqMinGvwClass?:     string | null;   // job.minGvwClass
  reqBodyTypes?:       string[] | null; // job.bodyTypes
  reqEquipment?:       string[] | null; // job.equipment
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
  // Q4 coverage — true if this run is fed by a prior run (dependsOnRunId), so its
  // deliveries' goods may have been collected upstream (relay).
  hasFeederRun?:       boolean;
  // Q5a capacity — the company's available-fleet capacity profile (route injects it).
  fleet?:              FleetCapacityProfile | null;
  // Q5b — the allocated vehicle (when a run already has one), to check it suits the load.
  assignedVehicle?:    AssignedVehicle | null;
  /** Skip ORS + postcode lookups (haversine-only). Used by the readiness path,
   *  which runs per-run in lists and must never wait on the network. */
  offlineRouting?:     boolean;
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
  // Q4 — is every delivery serviceable (its load collected somewhere in the chain)?
  coverage: { ok: boolean; uncovered: string[] };
  // Q5a — does the load physically fit the company's fleet? (split if not)
  capacity: CapacityResult;
  // Q5b — do the loads agree on a vehicle, and does any allocated vehicle suit them?
  vehicleSuitability: SuitabilityResult;
  // Q3b — drivers'-hours summary (deterministic; raw, pre-buffer driving/work).
  legal: {
    drivingMin:        number;   // total driving time (raw)
    drivingBreakCount: number;   // 45-min breaks required (one per 4.5h driving)
    workingMin:        number;   // driving + loading/unloading work
    dutyMin:           number;   // whole run incl. drive + dwell + breaks (buffered)
    usesExtension:     boolean;  // driving is in the 9–10h extension band
  };
}

const ZERO_LEGAL = { drivingMin: 0, drivingBreakCount: 0, workingMin: 0, dutyMin: 0, usesExtension: false };

// ── Constants ─────────────────────────────────────────────────────────────────

const HGV_SPEED_KMH    = 60;
const ROAD_FACTOR      = 1.25;
const STOP_DWELL_MIN   = 30;
const MAX_DRIVE_MIN    = 540;  // 9 h standard daily driving limit (EC 561/2006)
const EXTENDED_DRIVE_MIN = 600;// 10 h absolute daily driving max (extension, ≤2×/week)
const BREAK_TRIGGER    = 270;  // 4.5 h — a 45-min break required after EVERY 4.5h driving
const BREAK_DURATION   = 45;   // 45-min mandatory driving break

// Working Time Directive (mobile workers) — a break once on-duty work passes 6h.
const WTD_WORK_TRIGGER = 360;  // 6 h working time
const WTD_BREAK_MIN    = 30;   // 30-min WTD break (covered by a 561 break when one falls)

// Daily duty / spread (working time + breaks) — advisory ceilings.
const MAX_DUTY_MIN     = 780;  // ~13 h daily duty
const LONG_DUTY_MIN    = 660;  // ~11 h — long day, advisory

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

// ── Q4 — collection coverage ───────────────────────────────────────────────────
// A delivery is serviceable only if its load is collected somewhere in the chain:
// a collection/pickup for the same job IN this run, a yard/depot pickup waypoint,
// or a feeding relay run. Otherwise the truck would deliver goods it never picked up.
const SOURCE_WAYPOINTS  = new Set(["yard_pickup", "depot_start", "reload", "pickup"]);
const isDeliveryType    = (t: string) => t === "delivery" || t === "dropoff";
const isCollectionType  = (t: string) => t === "collection" || t === "pickup";

function computeCoverage(stops: RunStop[], hasFeederRun: boolean): { ok: boolean; uncovered: string[] } {
  // Goods may be sourced from a yard/depot pickup or an upstream feeder run; we
  // can't match cross-run job ids here, so either satisfies coverage at planning time.
  if (hasFeederRun || stops.some(s => SOURCE_WAYPOINTS.has(s.type))) return { ok: true, uncovered: [] };
  const uncovered: string[] = [];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (!isDeliveryType(s.type) || s.jobId == null) continue;  // can't verify without a job id
    const collected = stops.some(c => isCollectionType(c.type) && c.jobId === s.jobId);
    if (!collected) uncovered.push(stopLabel(s, i));
  }
  return { ok: uncovered.length === 0, uncovered };
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function checkRun(input: RunFeasibilityInput): Promise<RunFeasibilityResult> {
  const stops = [...input.stops].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  // A2 Q1 — stop-mixing is advisory and order-independent; compute once, attach
  // to every return. It never affects feasibility/confidence.
  const compatibility = checkLoadMixing(stops);

  // Q4 — collection coverage (order-independent, no coords needed). A high concern
  // that must tank confidence so an unserviceable run can never read green.
  const coverage = computeCoverage(stops, input.hasFeederRun ?? false);
  const coverageIssue: Issue | null = coverage.ok ? null : {
    penalty: 80, severity: "high",
    message: coverage.uncovered.length === 1
      ? `${coverage.uncovered[0]} is a delivery with no collection on this run — its goods are never picked up.`
      : `${coverage.uncovered.length} deliveries have no collection on this run (${coverage.uncovered.slice(0, 2).join(", ")}${coverage.uncovered.length > 2 ? "…" : ""}).`,
    suggestion: "Add the matching collection, a yard pickup, or link a feeding run.",
  };

  // Q5a — fleet-aware capacity: peak pallet footprint (sum of collected pallets) vs
  // the company's best available vehicle. Forces a split when nothing fits whole.
  const collectStops  = stops.filter(s => isCollectionType(s.type));
  const totalPallets  = collectStops.reduce((sum, s) => sum + (s.pallets ?? 0), 0);
  const allStackable  = collectStops.length > 0 && collectStops.every(s => s.stackable === true);
  const capacity: CapacityResult = input.fleet
    ? checkCapacity({ pallets: totalPallets, stackable: allStackable }, input.fleet)
    : { ok: true, footprint: null, maxSpaces: null, splitInto: null, reason: null };
  const capacityIssue: Issue | null = capacity.ok ? null : {
    penalty: 55, severity: "high",
    message: capacity.reason ?? "Load exceeds available vehicle capacity — a split is required.",
    ...(capacity.splitInto ? { suggestion: `Split into ${capacity.splitInto} loads, or assign a larger / double-deck vehicle.` } : {}),
  };
  // Q5b — vehicle suitability: one load per job (dedupe so weight isn't double-counted
  // across its collection + delivery stops), checked for class agreement + (when a
  // vehicle is allocated) whether it actually suits the load.
  const suitByJob = new Map<string, Parameters<typeof checkVehicleSuitability>[0][number]>();
  for (const s of stops) {
    if (!WORK_STOP_TYPES.has(s.type)) continue;
    const key = s.jobId != null ? `job-${s.jobId}` : `seq-${s.sequenceNumber}`;
    if (suitByJob.has(key)) continue;
    suitByJob.set(key, {
      label: s.customerName, weightKg: s.weightKg, pallets: s.pallets,
      vehicleCategory: s.reqVehicleCategory, minGvwClass: s.reqMinGvwClass,
      bodyTypes: s.reqBodyTypes, equipment: s.reqEquipment,
    });
  }
  const vehicleSuitability = checkVehicleSuitability([...suitByJob.values()], input.assignedVehicle ?? null);
  const worstSuit = vehicleSuitability.conflicts.reduce<SuitabilityConflict | null>(
    (a, b) => (!a || SEV_RANK[b.severity] > SEV_RANK[a.severity] ? b : a), null);
  const suitabilityIssue: Issue | null = worstSuit ? {
    penalty: worstSuit.severity === "high" ? 50 : 18,
    severity: worstSuit.severity,
    message: worstSuit.reason,
    suggestion: "Split into separate runs by vehicle type, or allocate a suitable vehicle.",
  } : null;

  const hardIssue = coverageIssue ?? capacityIssue ?? (suitabilityIssue?.severity === "high" ? suitabilityIssue : null);

  const baseBuffer = { driveBufferPct: DRIVE_BUFFER_PCT, dwellPerStopMin: BUFFERED_DWELL, minSlackMin: null as number | null };
  const nullGeometry: RunGeometry = { routedKm: null, idealKm: null, detourRatio: null, deadheadKm: null };

  if (stops.length === 0) {
    return { concern: false, severity: "none", message: "", confidence: null, buffer: baseBuffer, compatibility, geometry: nullGeometry, coverage, capacity, vehicleSuitability, legal: ZERO_LEGAL };
  }

  // ── Resolve postcodes → coords ────────────────────────────────────────────
  const resolvedCoords = await Promise.all(
    stops.map(async s => {
      if (s.lat != null && s.lng != null) return { lat: s.lat, lng: s.lng };
      if (s.postcode && !input.offlineRouting) {
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
      const ors = input.offlineRouting ? null
        : await getHgvLeg({ lat: a.lat, lng: a.lng! }, { lat: b.lat, lng: b.lng! }, hgvParams).catch(() => null);
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

  // ── EC 561/2006 — a 45-min break after EVERY 4.5h of driving (repeating) ───
  // A break is due at each 4.5h cumulative-driving point where driving still
  // continues (breakpoints at 270, 540, 810… that are < total driving). This is
  // leg-independent: a single 11h leg still requires two mid-drive breaks.
  const drivingBreakCount = rawDriveMin > 0 ? Math.max(0, Math.ceil(rawDriveMin / BREAK_TRIGGER) - 1) : 0;
  const drivingBreakMin   = drivingBreakCount * BREAK_DURATION;

  // ── Working Time Directive — 30-min break once on-duty work passes 6h, only
  //    if the 561 driving breaks don't already cover it (little driving, lots of
  //    loading/unloading dwell).
  const otherWorkMin = stops.length * STOP_DWELL_MIN;
  const workingMin   = rawDriveMin + otherWorkMin;
  const wtdTopUpMin  = workingMin > WTD_WORK_TRIGGER && drivingBreakMin < WTD_BREAK_MIN
    ? WTD_BREAK_MIN - drivingBreakMin : 0;

  const totalBreakMin = drivingBreakMin + wtdTopUpMin;

  // A rest point = any non-work stop (services, yard, depot) where a break fits.
  const restOpportunities = stops.filter(s => !WORK_STOP_TYPES.has(s.type)).length;

  const totalRunMin = bufferedDriveMin + stops.length * BUFFERED_DWELL + totalBreakMin;

  // ── Collect issues (no early return — we want a holistic score) ───────────
  // Coverage (Q4) leads — an unserviceable run must dominate the headline + score.
  // Capacity (Q5a) + vehicle suitability (Q5b) follow.
  const issues: Issue[] = [coverageIssue, capacityIssue, suitabilityIssue].filter((x): x is Issue => x !== null);
  let minSlackMin: number | null = null;

  // 1. Legal driving hours (on RAW driving — buffer is slack, not driving time)
  if (hasCoords && rawDriveMin > EXTENDED_DRIVE_MIN) {
    issues.push({ penalty: 60, severity: "high",
      message: `Estimated driving is ${fmtH(Math.round(rawDriveMin))} — over the 10-hour absolute daily limit.`,
      suggestion: "Split the run across two drivers or two days." });
  } else if (hasCoords && rawDriveMin > MAX_DRIVE_MIN) {
    issues.push({ penalty: 14, severity: "low",
      message: `Driving is ${fmtH(Math.round(rawDriveMin))} — over 9h, so it relies on the 10-hour extension (allowed at most twice a week per driver).`,
      suggestion: "Check the driver hasn't already used both 10-hour days this week." });
  }

  // 2. Break(s) needed but nowhere to take them
  if (drivingBreakCount > 0 && restOpportunities === 0) {
    issues.push({ penalty: 22, severity: "medium",
      message: `Driver needs ${drivingBreakCount} × 45-min break${drivingBreakCount > 1 ? "s" : ""} (one per 4.5h driving) — no rest point is planned on this route.`,
      suggestion: "Add a waypoint (e.g. motorway services) where a break can be taken." });
  }

  // 2b. Working Time Directive — over 6h on duty with no driving break to cover it
  if (wtdTopUpMin > 0) {
    issues.push({ penalty: 8, severity: "low",
      message: `Over 6h on duty with little driving — a 30-min working-time break is required.` });
  }

  // 3. Time-window checks against the BUFFERED schedule.
  //    The clock WAITS when the driver arrives before a window opens — idle time
  //    is real and pushes every later stop back, which is how an out-of-order
  //    plan (deliver, then drive back to collect at a slot that already closed)
  //    gets exposed instead of looking deceptively on-time.
  let spreadMin: number | null = null;   // depot start → final stop, incl. waits
  if (input.estimatedStartTime && hasCoords) {
    const startMs = new Date(input.estimatedStartTime).getTime();
    let elapsedMin = 0, cumWork = 0, cumDrive = 0, breaksPlaced = 0, wtdInserted = wtdTopUpMin === 0;

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

      // Wait for the window to open if the driver arrives early (idle, not driving).
      // Only at customer stops — a depot/base waypoint's planned time is an
      // estimate, not a window to sit idle for.
      if (WORK_STOP_TYPES.has(s.type)) {
        const openMs = s.timeWindowStart ? new Date(s.timeWindowStart).getTime()
          : s.bookedTime ? new Date(s.bookedTime).getTime() : null;
        if (openMs !== null && arrivalMs < openMs) {
          elapsedMin += Math.round((openMs - arrivalMs) / 60000);
        }
      }

      elapsedMin += BUFFERED_DWELL;
      cumWork    += STOP_DWELL_MIN;
      // WTD break inserted once work passes 6h (when no 561 break covers it).
      if (!wtdInserted && cumWork >= WTD_WORK_TRIGGER) { elapsedMin += wtdTopUpMin; wtdInserted = true; }
      if (i < legs.length) {
        elapsedMin += bufDrive(i);
        cumWork    += legs[i].driveMin ?? 0;
        cumDrive   += legs[i].driveMin ?? 0;
        // Place any 561 breaks now due (breakpoints at 270, 540… of driving),
        // capped at the legal count so the final boundary isn't double-counted.
        const breaksDue = Math.min(drivingBreakCount, Math.floor(cumDrive / BREAK_TRIGGER));
        if (breaksDue > breaksPlaced) { elapsedMin += (breaksDue - breaksPlaced) * BREAK_DURATION; breaksPlaced = breaksDue; }
      }
    }
    spreadMin = elapsedMin;  // real depot-start → last-stop span, incl. window waits
  }

  // 4/5. Daily duty / spread — use the real schedule span (incl. waiting) when we
  // have a start time, else the buffered drive+dwell+breaks total.
  const dutyMin = spreadMin ?? totalRunMin;
  if (hasCoords && dutyMin > MAX_DUTY_MIN) {
    issues.push({ penalty: 22, severity: "medium",
      message: `Run spans about ${fmtH(Math.round(dutyMin))} from depot to base${spreadMin != null ? " including waiting for windows" : ""} — over the ~13h daily duty limit.`,
      suggestion: "Split across two drivers or start earlier." });
  } else if (hasCoords && dutyMin > LONG_DUTY_MIN) {
    issues.push({ penalty: 10, severity: "low",
      message: `Long duty day — about ${fmtH(Math.round(dutyMin))}${drivingBreakCount > 0 ? ` including ${drivingBreakCount} break${drivingBreakCount > 1 ? "s" : ""}` : ""}.` });
  }

  // Q3b — drivers'-hours summary (raw driving/work; duty is the real schedule span).
  const legal = {
    drivingMin:        Math.round(rawDriveMin),
    drivingBreakCount,
    workingMin:        Math.round(workingMin),
    dutyMin:           Math.round(dutyMin),
    usesExtension:     rawDriveMin > MAX_DRIVE_MIN && rawDriveMin <= EXTENDED_DRIVE_MIN,
  };

  // ── Derive confidence + the headline result ───────────────────────────────
  if (!hasCoords) {
    // Coverage (Q4) + capacity (Q5a) don't need coordinates — surface them even
    // when timing can't be assessed.
    if (hardIssue) {
      return {
        concern: true, severity: "high", message: hardIssue.message, ...(hardIssue.suggestion ? { suggestion: hardIssue.suggestion } : {}),
        confidence: null, buffer: { ...baseBuffer, minSlackMin: null }, compatibility, geometry, coverage, capacity, vehicleSuitability, legal,
      };
    }
    return {
      concern: false, severity: "none",
      message: "No postcodes or coordinates on stops — add addresses for a planning check.",
      confidence: null, buffer: { ...baseBuffer, minSlackMin: null }, compatibility, geometry, coverage, capacity, vehicleSuitability, legal,
    };
  }

  const confidence = clamp(100 - issues.reduce((s, x) => s + x.penalty, 0), 0, 100);
  const buffer = { driveBufferPct: DRIVE_BUFFER_PCT, dwellPerStopMin: BUFFERED_DWELL, minSlackMin };

  if (issues.length === 0) {
    const breakNote = drivingBreakCount > 0
      ? ` Includes ${drivingBreakCount} required 45-min break${drivingBreakCount > 1 ? "s" : ""}.`
      : (wtdTopUpMin > 0 ? " Includes a 30-min working-time break." : "");
    return {
      concern: false, severity: "none",
      message: `Run looks feasible with buffer — roughly ${fmtH(Math.round(totalRunMin))} total.${breakNote}`,
      confidence, buffer, compatibility, geometry, coverage, capacity, vehicleSuitability, legal,
    };
  }

  // Headline = the worst issue.
  const worst = issues.reduce((a, b) => (SEV_RANK[b.severity] > SEV_RANK[a.severity] ? b : a));
  return {
    concern: true,
    severity: worst.severity,
    message: worst.message,
    ...(worst.suggestion ? { suggestion: worst.suggestion } : {}),
    confidence, buffer, compatibility, geometry, coverage, capacity, vehicleSuitability, legal,
  };
}

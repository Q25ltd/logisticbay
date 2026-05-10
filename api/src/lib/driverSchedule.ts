/**
 * Driver day schedule feasibility checker.
 *
 * Given all jobs assigned to a driver on a date, works out:
 * - Arrival time at each stop
 * - Whether time windows can be met
 * - Whether the sequence is physically possible
 * - Flags for the planner
 */

import { getHgvLeg, postcodeToCoords, type Coords } from "./routing.js";

export interface ScheduleStop {
  jobId:           number;
  jobReference:    string | null;
  stopSequence:    number;
  type:            string;
  postcode:        string | null;
  lat:             number | null;
  lng:             number | null;
  windowStart:     string | null; // ISO datetime
  windowEnd:       string | null; // ISO datetime
  bookedTime:      string | null; // ISO datetime
  serviceMinutes:  number;        // loading/unloading allowance
}

export type FeasibilityStatus = "ok" | "tight" | "impossible" | "unknown";

export interface LegInfo {
  fromStopIdx:     number;
  toStopIdx:       number;
  travelMinutes:   number | null;
  distanceKm:      number | null;
}

export interface StopResult {
  stopIdx:         number;
  jobId:           number;
  jobReference:    string | null;
  type:            string;
  postcode:        string | null;
  earliestArrival: Date | null;   // when driver can arrive given travel chain
  windowStart:     Date | null;
  windowEnd:       Date | null;
  bookedTime:      Date | null;
  status:          FeasibilityStatus;
  issue:           string | null; // human-readable for planner
}

export interface DayScheduleResult {
  driverId:        number;
  date:            string;
  overallStatus:   FeasibilityStatus;
  stops:           StopResult[];
  legs:            LegInfo[];
  totalDriveMin:   number;
  totalServiceMin: number;
  warnings:        string[];
}

function parseTime(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

function diffMinutes(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60_000;
}

/**
 * Resolve coordinates for a stop: prefer stored lat/lng, fall back to postcode lookup.
 */
async function resolveCoords(stop: ScheduleStop): Promise<Coords | null> {
  if (stop.lat && stop.lng) return { lat: stop.lat, lng: stop.lng };
  if (stop.postcode)        return postcodeToCoords(stop.postcode);
  return null;
}

/**
 * Main entry: run the feasibility check for a driver's full day.
 *
 * `stops` should be pre-sorted by intended sequence (job plannedDate + stop sequenceNumber).
 * `dayStart` is the driver's earliest available start time (ISO datetime or "HH:MM").
 */
export async function checkDayFeasibility(
  driverId: number,
  date:     string,
  stops:    ScheduleStop[],
  dayStart: string = "06:00",
): Promise<DayScheduleResult> {
  const warnings: string[] = [];
  const legs:     LegInfo[] = [];
  const results:  StopResult[] = [];

  let totalDriveMin   = 0;
  let totalServiceMin = 0;

  if (stops.length === 0) {
    return {
      driverId, date,
      overallStatus: "ok",
      stops: [], legs: [],
      totalDriveMin: 0, totalServiceMin: 0,
      warnings: [],
    };
  }

  // Parse day start
  const [startH, startM] = dayStart.includes("T")
    ? [new Date(dayStart).getHours(), new Date(dayStart).getMinutes()]
    : dayStart.split(":").map(Number);
  const dayStartDate = new Date(`${date}T${String(startH).padStart(2,"0")}:${String(startM).padStart(2,"0")}:00`);

  // Resolve coordinates for all stops
  const coords = await Promise.all(stops.map(resolveCoords));

  // Walk through stops in sequence
  let cursor: Date = dayStartDate;

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    let travelMin:  number | null = null;
    let distanceKm: number | null = null;

    // Travel from previous stop (or day start)
    if (i > 0) {
      const fromCoords = coords[i - 1];
      const toCoords   = coords[i];

      if (fromCoords && toCoords) {
        const leg = await getHgvLeg(fromCoords, toCoords);
        if (leg) {
          travelMin  = leg.durationMinutes;
          distanceKm = leg.distanceKm;
          totalDriveMin += travelMin;
          // Add 10 min buffer for parking/dock finding
          cursor = addMinutes(cursor, travelMin + 10);
        } else {
          // ORS failed — can't determine travel time
          warnings.push(`Could not get routing between stop ${i} and stop ${i + 1} — check postcodes`);
        }
      } else {
        warnings.push(`Missing location data for stop ${i + 1} (${stop.postcode ?? "no postcode"}) — travel time unknown`);
      }

      legs.push({ fromStopIdx: i - 1, toStopIdx: i, travelMinutes: travelMin, distanceKm });
    }

    // Determine time constraints
    const windowStart = parseTime(stop.windowStart);
    const windowEnd   = parseTime(stop.windowEnd);
    const booked      = parseTime(stop.bookedTime);
    const deadline    = booked ?? windowEnd;
    const openAt      = windowStart;

    // If there's an opening time, can't arrive before it
    if (openAt && cursor < openAt) {
      cursor = new Date(openAt.getTime());
    }

    const arrivalTime = new Date(cursor.getTime());

    // Service time at this stop
    const serviceMin = stop.serviceMinutes > 0 ? stop.serviceMinutes : 30; // default 30 min
    totalServiceMin += serviceMin;

    // Check feasibility
    let status: FeasibilityStatus = "ok";
    let issue: string | null = null;

    if (travelMin === null && i > 0) {
      status = "unknown";
      issue  = "Travel time unavailable — verify location data";
    } else if (deadline) {
      const minsBeforeDeadline = diffMinutes(arrivalTime, deadline);
      if (minsBeforeDeadline < 0) {
        status = "impossible";
        issue  = `Arrives ${Math.abs(Math.round(minsBeforeDeadline))} min late for ${booked ? "booked time" : "window close"}`;
      } else if (minsBeforeDeadline < serviceMin) {
        status = "tight";
        issue  = `Only ${Math.round(minsBeforeDeadline)} min before deadline — not enough for unloading`;
      } else if (minsBeforeDeadline < serviceMin + 20) {
        status = "tight";
        issue  = `Tight — only ${Math.round(minsBeforeDeadline)} min buffer`;
      }
    }

    results.push({
      stopIdx:         i,
      jobId:           stop.jobId,
      jobReference:    stop.jobReference,
      type:            stop.type,
      postcode:        stop.postcode,
      earliestArrival: arrivalTime,
      windowStart,
      windowEnd,
      bookedTime:      booked,
      status,
      issue,
    });

    // Advance cursor past service time
    cursor = addMinutes(cursor, serviceMin);
  }

  // UK driving rules: 4.5h max continuous driving, 9h/day limit
  if (totalDriveMin > 9 * 60) {
    warnings.push(`Total driving (${Math.round(totalDriveMin / 60 * 10) / 10}h) exceeds 9h daily limit`);
  } else if (totalDriveMin > 4.5 * 60) {
    warnings.push(`Driving exceeds 4.5h — driver needs a 45-min break somewhere in this schedule`);
  }

  const impossibleCount = results.filter(r => r.status === "impossible").length;
  const tightCount      = results.filter(r => r.status === "tight").length;
  const unknownCount    = results.filter(r => r.status === "unknown").length;

  const overallStatus: FeasibilityStatus =
    impossibleCount > 0 ? "impossible" :
    tightCount      > 0 ? "tight"      :
    unknownCount    > 0 ? "unknown"    : "ok";

  return {
    driverId, date,
    overallStatus,
    stops:           results,
    legs,
    totalDriveMin,
    totalServiceMin,
    warnings,
  };
}

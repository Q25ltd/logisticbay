/**
 * AI-powered run route feasibility check.
 *
 * Given an ordered list of stops with coordinates and time windows, estimates
 * whether the run can be completed on time based on:
 *   - Haversine (straight-line) distances converted to approximate road time
 *   - 30 min dwell time per stop (loading / unloading)
 *   - Published time windows at each stop
 *   - UK HGV driving-hours rules (9 h driving max, 4.5 h before break)
 *
 * Advisory only — the planner always makes the final call.
 */

import { getAnthropicClient } from "../lib/anthropic.js";
import { postcodeToCoords, getHgvLeg } from "../lib/routing.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunStop {
  sequenceNumber:   number;
  type:             string;           // "collection" | "delivery" | etc.
  locationText?:    string | null;
  postcode?:        string | null;
  lat?:             number | null;
  lng?:             number | null;
  timeWindowStart?: string | null;    // ISO datetime
  timeWindowEnd?:   string | null;
  bookedTime?:      string | null;
  customerName?:    string | null;
}

export interface VehicleRestrictions {
  weightT?:   number | null;  // combined GVW in tonnes
  heightM?:   number | null;
  widthM?:    number | null;
  lengthM?:   number | null;
  axleLoadT?: number | null;
}

export interface RunFeasibilityInput {
  stops:               RunStop[];
  estimatedStartTime?: string | null; // ISO datetime
  vehicle?:            VehicleRestrictions | null;
}

export interface RunFeasibilityResult {
  concern:     boolean;
  severity:    "high" | "medium" | "low" | "none";
  message:     string;
  suggestion?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HGV_SPEED_KMH  = 60;   // average on UK roads including urban/motorway mix
const ROAD_FACTOR    = 1.25; // straight-line → road distance multiplier
const STOP_DWELL_MIN = 30;   // loading / unloading per stop

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function fmtUtcTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  } catch {
    return "—";
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function checkRun(input: RunFeasibilityInput): Promise<RunFeasibilityResult> {
  const client = getAnthropicClient();

  // Sort stops by sequence
  const stops = [...input.stops].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  // ── Resolve postcodes → coords for any stop missing lat/lng ──────────────
  // Uses postcodes.io (free, no key) so the AI gets real coordinates even
  // when the SavedLocation has no geocoded lat/lng yet.
  interface StopWithCoords {
    lat: number | null;
    lng: number | null;
    resolvedFromPostcode: boolean;
  }
  const resolvedCoords: StopWithCoords[] = await Promise.all(
    stops.map(async s => {
      if (s.lat != null && s.lng != null) {
        return { lat: s.lat, lng: s.lng, resolvedFromPostcode: false };
      }
      if (s.postcode) {
        const c = await postcodeToCoords(s.postcode).catch(() => null);
        if (c) return { lat: c.lat, lng: c.lng, resolvedFromPostcode: true };
      }
      return { lat: null, lng: null, resolvedFromPostcode: false };
    }),
  );

  // ── Leg calculations ──────────────────────────────────────────────────────

  interface LegInfo {
    fromIdx:    number;
    toIdx:      number;
    straightKm: number | null;
    roadKm:     number | null;
    driveMin:   number | null;
    source:     "ors" | "haversine" | "postcode_haversine" | "unknown";
  }

  const legPromises = stops.slice(0, -1).map(async (_, i) => {
    const aC = resolvedCoords[i];
    const bC = resolvedCoords[i + 1];

    const aLat = aC.lat; const aLng = aC.lng;
    const bLat = bC.lat; const bLng = bC.lng;

    if (aLat == null || aLng == null || bLat == null || bLng == null) {
      return { fromIdx: i, toIdx: i + 1, straightKm: null, roadKm: null, driveMin: null, source: "unknown" } as LegInfo;
    }

    // Try ORS HGV routing — pass real vehicle dimensions so the route respects
    // actual weight bridges, low bridges and width restrictions for this vehicle.
    const hgvParams = input.vehicle ? {
      ...(input.vehicle.weightT   != null ? { weight:    input.vehicle.weightT }   : {}),
      ...(input.vehicle.heightM   != null ? { height:    input.vehicle.heightM }   : {}),
      ...(input.vehicle.widthM    != null ? { width:     input.vehicle.widthM }    : {}),
      ...(input.vehicle.lengthM   != null ? { length:    input.vehicle.lengthM }   : {}),
      ...(input.vehicle.axleLoadT != null ? { axle_load: input.vehicle.axleLoadT } : {}),
    } : {};
    const ors = await getHgvLeg({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng }, hgvParams).catch(() => null);
    if (ors) {
      return {
        fromIdx: i, toIdx: i + 1,
        straightKm: haversineKm(aLat, aLng, bLat, bLng),
        roadKm:     ors.distanceKm,
        driveMin:   ors.durationMinutes,
        source:     "ors",
      } as LegInfo;
    }

    // Fallback: Haversine + road factor (estimated)
    const straightKm = haversineKm(aLat, aLng, bLat, bLng);
    const roadKm     = straightKm * ROAD_FACTOR;
    const driveMin   = (roadKm / HGV_SPEED_KMH) * 60;
    return {
      fromIdx: i, toIdx: i + 1, straightKm, roadKm, driveMin,
      source: "haversine",
    } as LegInfo;
  });

  const legs: LegInfo[] = await Promise.all(legPromises);

  const hasAnyCoords   = legs.some(l => l.driveMin != null);
  const hasUnknownLegs = legs.some(l => l.source === "unknown");
  const hasEstLegs     = legs.some(l => l.source === "haversine");
  const hasOrsLegs     = legs.some(l => l.source === "ors");
  const totalDriveMin   = legs.reduce((s, l) => s + (l.driveMin ?? 0), 0);
  const totalDwellMin   = stops.length * STOP_DWELL_MIN;
  const totalRunMin     = totalDriveMin + totalDwellMin;

  // ── Build prompt ──────────────────────────────────────────────────────────

  const STOP_TYPE_LABEL: Record<string, string> = {
    collection:     "Collection",
    delivery:       "Delivery",
    pickup:         "Pickup",
    dropoff:        "Drop-off",
    reload:         "Reload",
    return:         "Return",
    waypoint:       "Waypoint",
    depot_start:    "Depot start",
    return_to_base: "Return to depot",
    yard_pickup:    "Yard pickup",
    hub_drop:       "Hub drop",
    custom:         "Intermediate stop",
  };

  // One line per stop
  const stopLines = stops.map((s, i) => {
    const type     = STOP_TYPE_LABEL[s.type] ?? s.type;
    const location = s.locationText ?? s.postcode ?? `location unknown`;
    const customer = s.customerName ? ` (${s.customerName})` : "";
    const window   = (s.timeWindowStart || s.timeWindowEnd)
      ? ` | window ${fmtUtcTime(s.timeWindowStart)}–${fmtUtcTime(s.timeWindowEnd)} UTC`
      : " | no time window";
    const booked   = s.bookedTime
      ? ` | booked slot ${fmtUtcTime(s.bookedTime)} UTC`
      : "";

    // Show leg drive time AFTER this stop (i.e., leg i = from stop i to stop i+1)
    const leg = legs[i];
    const legInfo = leg?.roadKm != null
      ? ` → then ~${Math.round(leg.roadKm)} km / ~${Math.round(leg.driveMin!)} min${leg.source === "ors" ? " (HGV route)" : " (est.)"}`
      : i < stops.length - 1 ? " → (no postcode or coords — distance unknown)" : "";

    return `  Stop ${i + 1}: ${type} at ${location}${customer}${window}${booked}${legInfo}`;
  });

  const startLine = input.estimatedStartTime
    ? `Estimated departure: ${fmtUtcTime(input.estimatedStartTime)} UTC`
    : "No scheduled departure time set";

  const distanceSource = hasOrsLegs && !hasEstLegs && !hasUnknownLegs ? "ORS HGV routing"
    : hasOrsLegs ? "ORS HGV routing (some legs est.)"
    : hasEstLegs ? "estimated (est., not guaranteed)"
    : "calculated";

  const totalLine = hasAnyCoords
    ? [
        `Total road distance: ~${Math.round(legs.reduce((s, l) => s + (l.roadKm ?? 0), 0))} km (${distanceSource}${hasUnknownLegs ? ", some legs still unknown" : ""})`,
        `Driving time: ~${Math.round(totalDriveMin)} min`,
        `Dwell time (${stops.length} stops × 30 min): ${totalDwellMin} min`,
        `Total run: ~${Math.round(totalRunMin / 60 * 10) / 10} hours`,
      ].join("\n")
    : `No coordinates available — all distances estimated from postcodes (est., not guaranteed).\nPostcodes: ${stops.map(s => s.postcode || "?").join(" → ")}`;

  const systemPrompt =
    `You are a UK road freight planning expert reviewing whether a driver run is achievable. ` +
    `Distances are either from the ORS HGV routing API (accurate) or postcode-estimated (est., ±10 min). ` +
    `UK HGV rules: max 9 h driving per day, must take a 45-min break after 4.5 h driving. ` +
    `Always give a verdict. When any leg was estimated rather than routed, include "(est., not guaranteed)" in your message. ` +
    `Be direct — one or two plain-English sentences a transport planner would immediately understand. ` +
    `Return ONLY valid JSON, no markdown fences.`;

  const vehicleLine = input.vehicle
    ? `Vehicle: ${input.vehicle.weightT != null ? `${input.vehicle.weightT}t GVW` : "weight unknown"}, ` +
      `${input.vehicle.heightM != null ? `${input.vehicle.heightM}m high` : "height unknown"}, ` +
      `${input.vehicle.lengthM != null ? `${input.vehicle.lengthM}m long` : "length unknown"}`
    : "Vehicle: dimensions not set (ORS used default 44t / 4.0m / 16.5m constraints)";

  const userPrompt =
    `${startLine}\n${vehicleLine}\n${totalLine}\n\n` +
    `STOPS IN ORDER:\n${stopLines.join("\n")}\n\n` +
    `Question: Can the driver realistically complete this run and meet all time windows?\n\n` +
    `Return exactly this JSON (no extra keys, no markdown):\n` +
    `{\n` +
    `  "concern": true or false,\n` +
    `  "severity": "high" | "medium" | "low" | "none",\n` +
    `  "message": "1–2 sentence plain-English verdict",\n` +
    `  "suggestion": "brief fix in 5–10 words (omit this key when concern is false)"\n` +
    `}\n\n` +
    `Severity guide:\n` +
    `  high   — run is infeasible: time windows will definitely be missed or legal hours exceeded\n` +
    `  medium — tight run, likely delays, risk of missing a window\n` +
    `  low    — minor concern but achievable with good execution\n` +
    `  none   — run looks feasible (set concern: false)`;

  // ── Call Claude ───────────────────────────────────────────────────────────

  const response = await client.messages.create({
    model:      "claude-haiku-4-5",
    max_tokens: 250,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userPrompt }],
  });

  const raw      = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // Fail open — return no concern rather than crashing
    return { concern: false, severity: "none", message: "" };
  }

  const concern    = parsed.concern === true;
  const severity   =
    parsed.severity === "high"   ? "high"   :
    parsed.severity === "medium" ? "medium" :
    parsed.severity === "low"    ? "low"    : "none";
  const message    = typeof parsed.message    === "string" ? parsed.message.trim()    : "";
  const suggestion = typeof parsed.suggestion === "string" ? parsed.suggestion.trim() : undefined;

  return { concern, severity, message, ...(suggestion ? { suggestion } : {}) };
}

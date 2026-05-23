/**
 * Area-type lookup for UK postcodes.
 * Uses postcodes.io (free, no key) to resolve lat/lng,
 * then Nominatim OSM reverse geocoding (free, no key) to classify the area.
 *
 * Returned areaType is one of:
 *   industrial | residential | rural | urban | retail | port | unknown
 */

import { postcodeToCoords } from "../lib/routing.js";

// ── Public types ──────────────────────────────────────────────────────────────

export type AreaType =
  | "industrial"
  | "residential"
  | "rural"
  | "urban"
  | "retail"
  | "port"
  | "unknown";

export interface AreaInfo {
  postcode:  string;
  areaType:  AreaType;
  label:     string;   // human-readable place name / description
  emoji:     string;
  lat?:      number;
  lng?:      number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EMOJIS: Record<AreaType, string> = {
  industrial:  "🏭",
  residential: "🏘",
  rural:       "🌿",
  urban:       "🏙",
  retail:      "🏪",
  port:        "⚓",
  unknown:     "📍",
};

// ── Public API ────────────────────────────────────────────────────────────────

/** Classify a single UK postcode. Never throws — returns "unknown" on failure. */
export async function lookupAreaType(postcode: string): Promise<AreaInfo> {
  const base: AreaInfo = {
    postcode,
    areaType: "unknown",
    label:    "",
    emoji:    EMOJIS.unknown,
  };

  const coords = await postcodeToCoords(postcode);
  if (!coords) return base;

  try {
    // Nominatim usage policy: max 1 req/s, must include User-Agent
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=17&addressdetails=1`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "LogisticBay/1.0 (support@logisticbay.com)",
        "Accept":     "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return { ...base, lat: coords.lat, lng: coords.lng };

    const data = await res.json() as NominatimResult;
    return classify(postcode, coords, data);
  } catch {
    return { ...base, lat: coords.lat, lng: coords.lng };
  }
}

/**
 * Classify multiple postcodes.
 * Nominatim allows 1 req/s — this processes them 300 ms apart to stay safe.
 * Unique postcodes only; max 20 at once.
 */
export async function lookupAreaTypes(postcodes: string[]): Promise<AreaInfo[]> {
  const seen  = new Set<string>();
  const unique: string[] = [];
  for (const p of postcodes) {
    const norm = p.replace(/\s+/g, "").toUpperCase();
    if (norm && !seen.has(norm)) { seen.add(norm); unique.push(norm); }
  }

  const results: AreaInfo[] = [];
  for (let i = 0; i < unique.length && i < 20; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 320)); // stay under 1 req/s
    results.push(await lookupAreaType(unique[i]));
  }
  return results;
}

// ── Nominatim shape ───────────────────────────────────────────────────────────

interface NominatimResult {
  type:         string;
  class:        string;
  display_name: string;
  address:      Record<string, string>;
}

// ── Classification ────────────────────────────────────────────────────────────

function classify(
  postcode: string,
  coords:   { lat: number; lng: number },
  data:     NominatimResult,
): AreaInfo {
  const type    = (data.type    || "").toLowerCase();
  const cls     = (data.class   || "").toLowerCase();
  const addr    = data.address  || {};
  const display = (data.display_name || "").toLowerCase();

  const base = { postcode, lat: coords.lat, lng: coords.lng };

  function make(areaType: AreaType, label: string): AreaInfo {
    return { ...base, areaType, label, emoji: EMOJIS[areaType] };
  }

  // ── Industrial ──
  if (
    type === "industrial" ||
    (cls === "landuse" && type === "industrial") ||
    addr["industrial"] ||
    display.includes("industrial estate") ||
    display.includes("business park") ||
    display.includes("trading estate") ||
    display.includes("distribution centre") ||
    display.includes("distribution center")
  ) {
    return make("industrial", addr["industrial"] || "Industrial area");
  }

  // ── Port / terminal ──
  if (
    type === "port" || type === "terminal" ||
    addr["harbour"] || addr["port"] ||
    display.includes(" port") ||
    (display.includes("terminal") && !display.includes("street")) ||
    display.includes(" docks") ||
    display.includes("wharf")
  ) {
    return make("port", "Port / terminal");
  }

  // ── Retail / commercial ──
  if (
    type === "retail" || type === "commercial" ||
    (cls === "landuse" && (type === "retail" || type === "commercial"))
  ) {
    return make("retail", "Retail / commercial area");
  }

  // ── Residential ──
  if (
    type === "residential" ||
    (cls === "landuse" && type === "residential") ||
    addr["residential"]
  ) {
    return make("residential", addr["residential"] || "Residential area");
  }

  // ── Rural — no city/town, has village/hamlet, or rural land use ──
  const hasCity    = !!(addr["city"] || addr["city_district"]);
  const hasTown    = !!(addr["town"]);
  const hasVillage = !!(addr["village"] || addr["hamlet"] || addr["isolated_dwelling"]);
  const ruralLandUse = (cls === "landuse") &&
    ["farmland", "farm", "forest", "orchard", "meadow", "grass", "heath", "allotments"].includes(type);

  if (
    (!hasCity && !hasTown && hasVillage) ||
    ruralLandUse ||
    type === "village" ||
    type === "hamlet"
  ) {
    const label = addr["village"] || addr["hamlet"] || "Rural area";
    return make("rural", label);
  }

  // ── Urban ──
  if (hasCity || hasTown) {
    return make("urban", addr["city"] || addr["town"] || "Urban area");
  }

  // ── Suburban fallback ──
  if (addr["suburb"] || addr["quarter"]) {
    return make("urban", addr["suburb"] || addr["quarter"] || "Suburban area");
  }

  return make("unknown", "");
}

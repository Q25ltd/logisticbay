/**
 * HGV routing via OpenRouteService.
 * Uses the "driving-hgv" profile which respects weight limits, low bridges,
 * width restrictions, and hazmat rules — not car routing.
 */

const ORS_BASE = "https://api.openrouteservice.org/v2";
const API_KEY  = process.env.ORS_API_KEY ?? "";

// Default HGV constraints matching a typical 44t artic
const DEFAULT_HGV = {
  weight:     44,   // tonnes GVW
  height:     4.0,  // metres
  width:      2.55, // metres
  length:     16.5, // metres
  axle_load:  11.5, // tonnes per axle
};

export interface Coords {
  lat: number;
  lng: number;
}

export interface LegResult {
  durationMinutes: number;
  distanceKm:      number;
}

/**
 * Get HGV travel time between two coordinate pairs.
 * Returns null if routing fails (unreachable, API error, etc.)
 */
export async function getHgvLeg(
  from: Coords,
  to:   Coords,
  hgv:  Partial<typeof DEFAULT_HGV> = {},
): Promise<LegResult | null> {
  if (!API_KEY) return null;

  const vehicle = { ...DEFAULT_HGV, ...hgv };

  try {
    const res = await fetch(`${ORS_BASE}/directions/driving-hgv`, {
      method: "POST",
      headers: {
        "Authorization": API_KEY,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng,   to.lat],
        ],
        profile_params: {
          restrictions: {
            maximum_weight:    vehicle.weight,
            maximum_height:    vehicle.height,
            maximum_width:     vehicle.width,
            maximum_length:    vehicle.length,
            maximum_axle_load: vehicle.axle_load,
          },
        },
        units: "km",
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      routes?: Array<{
        summary: { duration: number; distance: number };
      }>;
    };

    const route = data.routes?.[0];
    if (!route) return null;

    return {
      durationMinutes: Math.ceil(route.summary.duration / 60),
      distanceKm:      Math.round(route.summary.distance * 10) / 10,
    };
  } catch {
    return null;
  }
}

/**
 * Matrix: get travel times from one origin to multiple destinations in one call.
 * Efficient for checking a driver's full day at once.
 * Returns durations[i] = minutes from origin to destinations[i], or null on failure.
 */
export async function getHgvMatrix(
  origin:       Coords,
  destinations: Coords[],
): Promise<number[] | null> {
  if (!API_KEY || destinations.length === 0) return null;

  const locations = [
    [origin.lng, origin.lat],
    ...destinations.map(d => [d.lng, d.lat]),
  ];

  try {
    const res = await fetch(`${ORS_BASE}/matrix/driving-hgv`, {
      method: "POST",
      headers: {
        "Authorization": API_KEY,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        locations,
        sources:      [0],
        destinations: destinations.map((_, i) => i + 1),
        metrics:      ["duration"],
        units:        "km",
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      durations?: number[][];
    };

    const row = data.durations?.[0];
    if (!row) return null;

    return row.map(s => Math.ceil(s / 60));
  } catch {
    return null;
  }
}

/**
 * Convert UK postcode to lat/lng using postcodes.io (free, no key needed).
 * Returns null if postcode is invalid or not found.
 */
export async function postcodeToCoords(postcode: string): Promise<Coords | null> {
  const clean = postcode.replace(/\s+/g, "").toUpperCase();
  if (!clean) return null;

  try {
    const res  = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
    if (!res.ok) return null;
    const data = await res.json() as { result?: { latitude: number; longitude: number } };
    if (!data.result) return null;
    return { lat: data.result.latitude, lng: data.result.longitude };
  } catch {
    return null;
  }
}

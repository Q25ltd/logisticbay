/**
 * GPS coordinate validation helper.
 *
 * A.4 fix: previously the online path (`routes/jobs.ts`) only checked GPS
 * pairing (lat and lng must both be present) but not the valid ranges.
 * The sync path (`routes/sync.ts`) checked both. This helper enforces the
 * full check on both paths.
 */

export type GpsValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Validate that a GPS coordinate pair is either both absent or both in range.
 *
 * Rules:
 *   - Both undefined → valid (no GPS data attached to this event)
 *   - One present, one absent → invalid (must be both or neither)
 *   - lat out of range [-90, 90] → invalid
 *   - lng out of range [-180, 180] → invalid
 *   - Non-finite numbers (NaN, Infinity) → invalid
 */
export function validateGpsPair(
  lat: number | undefined | null,
  lng: number | undefined | null,
): GpsValidationResult {
  const latPresent = lat !== undefined && lat !== null;
  const lngPresent = lng !== undefined && lng !== null;

  if (!latPresent && !lngPresent) return { valid: true };

  if (latPresent !== lngPresent) {
    return { valid: false, reason: 'gpsLat and gpsLng must be provided together' };
  }

  if (
    typeof lat !== 'number' ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90
  ) {
    return { valid: false, reason: 'gpsLat must be a number between -90 and 90' };
  }

  if (
    typeof lng !== 'number' ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return { valid: false, reason: 'gpsLng must be a number between -180 and 180' };
  }

  return { valid: true };
}

/**
 * loadCapacity — Planning Q5a: "does this physically fit the company's fleet?"
 *
 * Deterministic, fleet-aware capacity check. A load's pallet **footprint**
 * (stackable halves it) is compared against the **largest available vehicle** in
 * the company's registered fleet. If nothing can carry it whole → split required,
 * with a recommended split count. Advisory on Planning, hard on Runs publish.
 *
 * No schema change — trailer pallet spaces are derived from length × decks via a
 * lookup; the fleet profile is built from the company's FleetTrailer rows.
 */

// Standard floor spaces in a full 13.6 m trailer (single deck).
const SPACES_PER_136M = 26;

/** Floor pallet spaces for a trailer, from its length (m) and decks. */
export function trailerPalletSpaces(input: { lengthM?: number | null; trailerLength?: string | null; decks?: number | null }): number {
  const len =
    (input.lengthM && input.lengthM > 0 ? input.lengthM : null) ??
    parseLengthM(input.trailerLength) ??
    13.6;
  const decks = Math.max(1, input.decks ?? 1);
  const base = Math.max(1, Math.round((len / 13.6) * SPACES_PER_136M));
  return base * decks;
}

/** Parse "13.6m" / "13.6" / "10" → metres, else null. */
function parseLengthM(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export interface FleetTrailerLike {
  trailerType?:   string | null;
  trailerLength?: string | null;
  lengthM?:       number | null;
  decks?:         number | null;
  status?:        string | null;
}

export interface FleetCapacityProfile {
  /** Largest floor-pallet capacity among AVAILABLE trailers; null if none registered. */
  maxPalletSpaces: number | null;
  hasDoubleDeck:   boolean;
  /** Total registered trailers considered. */
  trailerCount:    number;
}

/** Build the company's available-fleet capacity profile from its trailers. */
export function buildFleetCapacityProfile(trailers: FleetTrailerLike[], opts: { availableOnly?: boolean } = {}): FleetCapacityProfile {
  const usable = opts.availableOnly === false ? trailers : trailers.filter(t => (t.status ?? "available") === "available");
  if (usable.length === 0) return { maxPalletSpaces: null, hasDoubleDeck: false, trailerCount: trailers.length };
  let max = 0;
  let hasDoubleDeck = false;
  for (const t of usable) {
    const spaces = trailerPalletSpaces(t);
    if (spaces > max) max = spaces;
    if ((t.decks ?? 1) >= 2) hasDoubleDeck = true;
  }
  return { maxPalletSpaces: max, hasDoubleDeck, trailerCount: trailers.length };
}

export interface CapacityResult {
  ok:        boolean;
  footprint: number | null;   // floor spaces the load needs
  maxSpaces: number | null;   // best available vehicle capacity
  splitInto: number | null;   // suggested number of loads when it can't fit whole
  reason:    string | null;
}

/**
 * Pure capacity check: a load's pallet footprint vs the fleet's best vehicle.
 */
export function checkCapacity(
  load: { pallets: number; stackable: boolean },
  fleet: FleetCapacityProfile,
): CapacityResult {
  if (!(load.pallets > 0)) {
    return { ok: true, footprint: null, maxSpaces: fleet.maxPalletSpaces, splitInto: null, reason: null };
  }
  const footprint = load.stackable ? Math.ceil(load.pallets / 2) : load.pallets;

  if (fleet.maxPalletSpaces == null) {
    return { ok: true, footprint, maxSpaces: null, splitInto: null, reason: "No trailers registered — capacity can't be checked." };
  }
  if (footprint <= fleet.maxPalletSpaces) {
    const needsBigger = footprint > SPACES_PER_136M && fleet.hasDoubleDeck;
    return {
      ok: true, footprint, maxSpaces: fleet.maxPalletSpaces, splitInto: null,
      reason: needsBigger ? `${load.pallets} pallets need ${footprint} spaces — fits a double-deck.` : null,
    };
  }
  const splitInto = Math.ceil(footprint / fleet.maxPalletSpaces);
  return {
    ok: false, footprint, maxSpaces: fleet.maxPalletSpaces, splitInto,
    reason: `${load.pallets} pallets need ${footprint} floor spaces but your largest available vehicle holds ${fleet.maxPalletSpaces} — split into ${splitInto} (collect in one go, carry on ${splitInto} trailers) or use a bigger vehicle.`,
  };
}

/**
 * Fleet vocabulary — the single status/ownership registry for FleetUnit,
 * FleetTrailer, and shift-time trailer identity (one-registry rule).
 *
 * "deleted" is deliberately NOT client-settable — the DELETE routes set it
 * server-side; intake schemas must never accept it.
 *
 * Web mirror: web/src/modules/fleet/fleetConstants.ts (keep values aligned).
 */

export const UNIT_STATUSES = ["available", "assigned", "vor"] as const;

export const TRAILER_STATUSES = ["available", "assigned", "loaded", "vor"] as const;

/**
 * Who owns the trailer a driver hooked up during a shift.
 * - "company"      — set by the SERVER when the reg matches the company fleet
 * - "contractor" / "third_party" — the driver's answer to the app's
 *   "this trailer is not in your company fleet" prompt
 * - "unregistered" — set by the SERVER when the reg is unknown and the client
 *   provided no answer (older app versions); surfaced to the planner
 */
export type TrailerOwnership = "company" | "contractor" | "third_party" | "unregistered";

/** The subset a driver may claim about a non-fleet trailer. */
export const CLAIMABLE_TRAILER_OWNERSHIPS = ["contractor", "third_party"] as const satisfies readonly TrailerOwnership[];

/**
 * loadVocab.ts — canonical vocabulary for the load-movement lifecycle.
 *
 * SINGLE SOURCE OF TRUTH. This file is duplicated BYTE-FOR-BYTE across:
 *   shared/loadVocab.ts            (canonical origin)
 *   api/src/constants/loadVocab.ts
 *   web/src/constants/loadVocab.ts
 *   mobile/src/constants/loadVocab.ts  (soft-checked — update in a mobile session)
 *
 * `npm run check:vocab` hashes the first three and fails the build if they drift.
 * To change a value: edit shared/, copy to api + web (and mobile), keep them identical,
 * and update DATA_DICTIONARY.md → "Load-movement vocabulary" in the same change.
 *
 * Defined by LOAD_MOVEMENT_PLAN.md §A3 (job planning status), §A4 (execution state),
 * §A5 (custody locations + transaction types). See that document for the model.
 *
 * STEP 0 (registries only): nothing imports this yet to change runtime behaviour.
 * Wiring existing code onto these names happens in Step 1+.
 */

// ─────────────────────────────────────────────────────────────────────────────
// §A3 — Dimension 1: Job planning status (Job.status)
// Office/planner + reconciler only. Drivers NEVER write these.
// ─────────────────────────────────────────────────────────────────────────────

export const JOB_PLANNING_STATUSES = [
  "draft",               // being created (CJP), not submitted
  "pending_review",      // arrived via Public Request Form, awaiting planner accept
  "ready_to_plan",       // accepted / created ready; eligible for the planning board
  "in_planning",         // has at least one active RunAssignment, not all parts assigned
  "planned",             // every part assigned to a run; runs not yet started
  "in_execution",        // at least one part's execution has begun (DERIVED)
  "partially_collected", // some but not all parts collected (DERIVED)
  "collected",           // all parts collected, none yet delivered (DERIVED)
  "partially_delivered", // some but not all parts delivered (DERIVED)
  "completed",           // all parts delivered, ledger closed (DERIVED)
  "attention_needed",    // an exception is open (refusal/breakdown/damage/partial) (DERIVED)
  "cancelled",           // planner cancelled
] as const;

export type JobPlanningStatus = typeof JOB_PLANNING_STATUSES[number];

/** Statuses set by intake/planner code (and cancel). */
export const PLANNER_SET_JOB_STATUSES = [
  "draft",
  "pending_review",
  "ready_to_plan",
  "in_planning",
  "planned",
  "cancelled",
] as const;

/** Statuses written ONLY by the reconciler (LOAD_MOVEMENT_PLAN §A6). Never inline, never by a driver. */
export const DERIVED_JOB_STATUSES = [
  "in_execution",
  "partially_collected",
  "collected",
  "partially_delivered",
  "completed",
  "attention_needed",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// §A4 — Dimension 2: Execution state (per RunAssignment / stop)
// Driver events only. This is the state machine the mobile app drives.
// ─────────────────────────────────────────────────────────────────────────────

export const EXECUTION_STATES = [
  "not_started",      // assignment published, driver hasn't acted
  "en_route_pickup",
  "at_pickup",
  "loaded",           // this part is on the vehicle (collected for this leg)
  "en_route_dropoff",
  "at_dropoff",
  "delivered",        // handed to consignee (final) OR dropped at yard (interim — see custody)
  "exception",        // refused / damaged / breakdown affecting this assignment
] as const;

export type ExecutionState = typeof EXECUTION_STATES[number];

// ─────────────────────────────────────────────────────────────────────────────
// §A5 — Dimension 3: Custody locations (LoadTrack.fromCustody / toCustody)
// A custody string is "<base>" or "<base>:<ref>" (e.g. on_vehicle:TR12, yard:7).
// ─────────────────────────────────────────────────────────────────────────────

export const CUSTODY_BASES = [
  "customer_origin", // at collection site, not yet picked up        → customer_origin:<stopId>
  "on_vehicle",      // physically on a vehicle, held by a driver     → on_vehicle:<truckReg|trailerId>
  "yard",            // buffered at a depot/yard, no driver holding it → yard:<locationId|label>
  "customer_dest",   // delivered to consignee (terminal-good)        → customer_dest:<stopId>
  "returned",        // refused, sent back (origin or yard)           → returned:<stopId|yard>
  "written_off",     // damage/loss (terminal-bad)
] as const;

export type CustodyBase = typeof CUSTODY_BASES[number];

/** Terminal custody bases — a load at one of these has left the active flow. */
export const TERMINAL_CUSTODY_BASES = ["customer_dest", "written_off"] as const;

/** Build a fully-qualified custody string. */
export const customAt = {
  customerOrigin: (stopId: number | string): string => `customer_origin:${stopId}`,
  onVehicle:      (vehicle: number | string): string => `on_vehicle:${vehicle}`,
  yard:           (loc: number | string): string => `yard:${loc}`,
  customerDest:   (stopId: number | string): string => `customer_dest:${stopId}`,
  returned:       (where: number | string): string => `returned:${where}`,
  writtenOff:     (): string => `written_off`,
} as const;

/** Extract the base from a custody string ("on_vehicle:TR12" → "on_vehicle"). */
export function custodyBaseOf(custody: string): CustodyBase | null {
  const base = custody.split(":")[0];
  return (CUSTODY_BASES as readonly string[]).includes(base) ? (base as CustodyBase) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §A5 — Dimension 3: Transaction types (LoadTrack.transactionType)
// Every load movement is one of these. New real-world situations must compose
// from these primitives (LOAD_MOVEMENT_PLAN §B15) — do not special-case in routes.
// ─────────────────────────────────────────────────────────────────────────────

export const TRANSACTION_TYPES = [
  "collect",         // customer_origin → on_vehicle
  "drop_at_yard",    // on_vehicle      → yard
  "pick_from_yard",  // yard            → on_vehicle
  "trailer_swap",    // on_vehicle(A)   → yard (load left on dropped trailer)
  "handover",        // on_vehicle(A)   → on_vehicle(B)  (driver A → driver B)
  "deliver",         // on_vehicle      → customer_dest  (terminal-good)
  "split",           // parent qty      → child custody rows (quantity divided)
  "consolidate",     // N rows          → same on_vehicle (bookkeeping; no qty change)
  "refuse_return",   // on_vehicle/customer_dest → returned
  "damage_writeoff", // any             → written_off
] as const;

export type TransactionType = typeof TRANSACTION_TYPES[number];

/**
 * Expected custody transition per transaction type, expressed in base terms.
 * `null` on a side means "context-dependent" (split/consolidate operate on
 * quantities/grouping rather than a single from→to pair).
 */
export const TRANSACTION_CUSTODY_MAP: Record<
  TransactionType,
  { from: CustodyBase | null; to: CustodyBase | null }
> = {
  collect:         { from: "customer_origin", to: "on_vehicle" },
  drop_at_yard:    { from: "on_vehicle",      to: "yard" },
  pick_from_yard:  { from: "yard",            to: "on_vehicle" },
  trailer_swap:    { from: "on_vehicle",      to: "yard" },
  handover:        { from: "on_vehicle",      to: "on_vehicle" },
  deliver:         { from: "on_vehicle",      to: "customer_dest" },
  split:           { from: null,              to: null },
  consolidate:     { from: null,              to: "on_vehicle" },
  refuse_return:   { from: "on_vehicle",      to: "returned" },
  damage_writeoff: { from: null,              to: "written_off" },
};

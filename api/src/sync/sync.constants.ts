/**
 * Rules for flagging sync events that need planner review.
 *
 * E.4 decision (2026-05-31): both sync and online paths flag stale events
 * with needsReview=true. Neither path rejects them. A driver offline for
 * more than 7 days must not lose their work records.
 *
 * Change values here to affect all review logic.
 */
export const SYNC_REVIEW_RULES = {
  MAX_EVENT_AGE_MS:        7 * 24 * 60 * 60 * 1000,
  MAX_EVENT_AGE_REASON:    'event_older_than_7d',
  MAX_FUTURE_DRIFT_MS:     60 * 60 * 1000,
  MAX_FUTURE_DRIFT_REASON: 'event_future_dated',
} as const;

// ── Execution-state event vocabulary ──────────────────────────────────────────
//
// LOAD_MOVEMENT_PLAN.md Step 1 (status bridge): driver events advance the
// per-RunAssignment EXECUTION state (dimension 2), NOT Job.status (dimension 1).
// Job.status is derived by the reconciler in Step 3. This decoupling is what
// makes a `planned` job startable (resolves the audit 🔴 blocker).
//
// EXECUTION_STATES is the single source for the state names (loadVocab.ts).

import { ExecutionState } from '../constants/loadVocab.js';

/**
 * Single source of truth for all driver-triggerable job events.
 *
 * Each entry defines:
 *   resultingState     — the RunAssignment.status set when this event is applied
 *   allowedFromStates  — RunAssignment.status values from which this event is valid
 *
 * 'cancelled' is NOT here — it is a planner-only Job-level action handled via the
 * override endpoint (E.1). Drivers cannot cancel.
 *
 * Source of truth: this file. Mobile event-type keys must match these keys.
 */
export const EVENT_DEFINITIONS = {
  started: {
    resultingState:    'en_route_pickup' as ExecutionState,
    allowedFromStates: ['not_started']   as ExecutionState[],
  },
  arrived_pickup: {
    resultingState:    'at_pickup'         as ExecutionState,
    allowedFromStates: ['en_route_pickup'] as ExecutionState[],
  },
  collected: {
    resultingState:    'loaded'      as ExecutionState,
    allowedFromStates: ['at_pickup'] as ExecutionState[],
  },
  arrived_dropoff: {
    resultingState:    'at_dropoff' as ExecutionState,
    allowedFromStates: ['loaded']   as ExecutionState[],
  },
  completed: {
    // 'completed' is the driver's final delivery event → assignment 'delivered'.
    resultingState:    'delivered'    as ExecutionState,
    allowedFromStates: ['at_dropoff'] as ExecutionState[],
  },
  // Step 6 (yard buffer / relay): a loaded run drops its load at a yard (its leg
  // ends 'delivered', but custody is yard — see applyJobEvent). A following run
  // picks the load up from the yard.
  drop_at_yard: {
    resultingState:    'delivered'                                 as ExecutionState,
    allowedFromStates: ['loaded', 'en_route_dropoff', 'at_dropoff'] as ExecutionState[],
  },
  pick_from_yard: {
    resultingState:    'loaded'        as ExecutionState,
    allowedFromStates: ['not_started'] as ExecutionState[],
  },
  // Step 7 (B4 trailer swap): the driver drops the LOADED trailer — custody goes
  // to yard and this leg ends 'delivered' (same shape as drop_at_yard) — then the
  // run continues on a different trailer (applyJobEvent updates the run's
  // assignedTrailerId from the event's newTrailerReg).
  trailer_swap: {
    resultingState:    'delivered'                                  as ExecutionState,
    allowedFromStates: ['loaded', 'en_route_dropoff', 'at_dropoff'] as ExecutionState[],
  },
  // Step 8 (B3 driver handover): driver A offers the load at the meet point (NO
  // custody change — A still holds it, state stays 'loaded'); driver B accepts on
  // their own run. The accept authors the single `handover` custody row
  // (vehicleA → vehicleB) and ends A's leg ('delivered') inside applyJobEvent.
  handover_offered: {
    resultingState:    'loaded'   as ExecutionState,
    allowedFromStates: ['loaded'] as ExecutionState[],
  },
  handover_accepted: {
    resultingState:    'loaded'        as ExecutionState,
    allowedFromStates: ['not_started'] as ExecutionState[],
  },
} as const;

export type EventType = keyof typeof EVENT_DEFINITIONS;

// ── Derived constants — do NOT edit; update EVENT_DEFINITIONS instead ─────────

/**
 * Event types the sync endpoint will process (driver-triggerable only).
 * 'cancelled' is absent — it is planner-only.
 */
export const SUPPORTED_EVENT_TYPES = Object.keys(EVENT_DEFINITIONS) as EventType[];

export type SupportedEventType = EventType;

/**
 * Maps eventType → resulting RunAssignment execution state. Derived.
 */
export const RESULTING_STATE_BY_EVENT: Record<SupportedEventType, ExecutionState> =
  Object.fromEntries(
    (Object.entries(EVENT_DEFINITIONS) as [EventType, { resultingState: ExecutionState }][])
      .map(([ev, def]) => [ev, def.resultingState]),
  ) as Record<SupportedEventType, ExecutionState>;

/**
 * Inbound alias for the online path (`PATCH /jobs/:id/status`).
 *
 * The mobile app posts a target `status` string in the legacy execution
 * vocabulary (e.g. "in_progress" to start, "collected", "completed"). This map
 * translates that wire value → the driver event type. Keeping it preserves the
 * mobile→server contract, so Step 1 needs NO mobile release.
 * 'cancelled' maps through for planner-facing override code (not a driver event).
 */
export const EVENT_TYPE_MAP: Record<string, string> = {
  in_progress:     'started',
  arrived_pickup:  'arrived_pickup',
  collected:       'collected',
  arrived_dropoff: 'arrived_dropoff',
  completed:       'completed',
  cancelled:       'cancelled',
};

/**
 * Execution-state transition table: state → states it may move to via a driver
 * event. Derived from EVENT_DEFINITIONS.allowedFromStates. For validation/docs.
 */
export const EXECUTION_TRANSITIONS: Record<string, string[]> = (() => {
  const trans: Record<string, Set<string>> = {};
  for (const def of Object.values(EVENT_DEFINITIONS)) {
    for (const from of def.allowedFromStates) {
      (trans[from] ??= new Set()).add(def.resultingState);
    }
  }
  return Object.fromEntries(Object.entries(trans).map(([k, v]) => [k, [...v]]));
})();

// ── Planner-only Job-level transitions (legacy reference; unchanged in Step 1) ─
//
// Kept per the Step 1 investigate report. These describe planner-only Job.status
// actions (accept / cancel) and are NOT driver events. The canonical Job
// planning-status vocabulary now lives in loadVocab.ts (JOB_PLANNING_STATUSES);
// planner transitions are enforced in jobService / the override endpoint, not
// here. This table is retained for the override path + tests.

export type JobStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'arrived_pickup'
  | 'collected'
  | 'arrived_dropoff'
  | 'completed'
  | 'cancelled';

export const PLANNER_ONLY_TRANSITIONS: Partial<Record<JobStatus, JobStatus[]>> = {
  accepted:  ['pending'],
  cancelled: ['pending', 'accepted', 'in_progress', 'arrived_pickup'],
};

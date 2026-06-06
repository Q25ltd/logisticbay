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

// ── Job status and event type vocabulary ──────────────────────────────────────

export type JobStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'arrived_pickup'
  | 'collected'
  | 'arrived_dropoff'
  | 'completed'
  | 'cancelled';

/**
 * Single source of truth for all driver-triggerable job events.
 *
 * Each entry defines:
 *   resultingStatus    — the Job.status value set when this event is applied
 *   allowedFromStatuses — Job.status values from which this event is valid
 *
 * Planner-only transitions (accept, cancel) are in PLANNER_ONLY_TRANSITIONS.
 *
 * E.1 decision (2026-05-31): 'cancelled' is planner-only — not in this table.
 * TASK 2.3 (applyJobEvent) enforces that drivers cannot trigger cancel.
 *
 * Source of truth: this file. Mobile must match the keys here.
 * A.13: event type vocabulary is now defined once here. Consuming code imports
 *   EventType / SUPPORTED_EVENT_TYPES rather than maintaining its own copy.
 */
export const EVENT_DEFINITIONS = {
  started: {
    resultingStatus:     'in_progress'    as JobStatus,
    allowedFromStatuses: ['pending', 'accepted'] as JobStatus[],
  },
  arrived_pickup: {
    resultingStatus:     'arrived_pickup' as JobStatus,
    allowedFromStatuses: ['in_progress']  as JobStatus[],
  },
  collected: {
    resultingStatus:     'collected'      as JobStatus,
    allowedFromStatuses: ['arrived_pickup'] as JobStatus[],
  },
  arrived_dropoff: {
    resultingStatus:     'arrived_dropoff' as JobStatus,
    allowedFromStatuses: ['collected']    as JobStatus[],
  },
  completed: {
    resultingStatus:     'completed'      as JobStatus,
    allowedFromStatuses: ['arrived_dropoff'] as JobStatus[],
  },
} as const;

export type EventType = keyof typeof EVENT_DEFINITIONS;

/**
 * Planner-only transitions — not triggerable via a driver event.
 * Maps the TARGET status to the statuses from which the transition is allowed.
 *
 * E.1 decision (2026-05-31): 'cancelled' is planner-only.
 */
export const PLANNER_ONLY_TRANSITIONS: Partial<Record<JobStatus, JobStatus[]>> = {
  accepted:  ['pending'],
  cancelled: ['pending', 'accepted', 'in_progress', 'arrived_pickup'],
};

// ── Derived constants — do NOT edit; update EVENT_DEFINITIONS instead ─────────

/**
 * Event types the sync endpoint will process (driver-triggerable only).
 * 'cancelled' is absent — it is planner-only (see PLANNER_ONLY_TRANSITIONS).
 */
export const SUPPORTED_EVENT_TYPES = Object.keys(EVENT_DEFINITIONS) as EventType[];

export type SupportedEventType = EventType;

/**
 * Maps eventType string → resulting Job.status.
 * Derived from EVENT_DEFINITIONS.
 *
 * A.5: formerly maintained by hand in parallel with EVENT_TYPE_MAP. Now derived.
 */
export const STATUS_BY_EVENT_TYPE: Record<SupportedEventType, JobStatus> =
  Object.fromEntries(
    (Object.entries(EVENT_DEFINITIONS) as [EventType, { resultingStatus: JobStatus }][])
      .map(([ev, def]) => [ev, def.resultingStatus]),
  ) as Record<SupportedEventType, JobStatus>;

/**
 * Maps Job.status → the eventType string that produced it.
 * Also includes cancelled → 'cancelled' for planner-facing code.
 * Derived from EVENT_DEFINITIONS (inverse) + planner cancelled entry.
 *
 * A.5: formerly maintained by hand as the inverse of STATUS_BY_EVENT_TYPE. Now derived.
 * A.6: stale model name in comment fixed — model is Job, not the old name.
 */
export const EVENT_TYPE_MAP: Record<string, string> = {
  ...Object.fromEntries(
    (Object.entries(EVENT_DEFINITIONS) as [EventType, { resultingStatus: JobStatus }][])
      .map(([ev, def]) => [def.resultingStatus, ev]),
  ),
  cancelled: 'cancelled',   // planner-only — not in SUPPORTED_EVENT_TYPES
};

/**
 * Maps Job.status → the complete set of statuses it may transition to.
 * Derived as the union of driver-event transitions and planner-only transitions.
 *
 * E.1 note: 'cancelled' entries here are for PLANNER use only.
 * TASK 2.3 (applyJobEvent) enforces the role restriction at runtime.
 */
export const ALLOWED_JOB_TRANSITIONS: Record<string, string[]> = (() => {
  const trans: Record<string, Set<string>> = {
    pending:         new Set(),
    accepted:        new Set(),
    in_progress:     new Set(),
    arrived_pickup:  new Set(),
    collected:       new Set(),
    arrived_dropoff: new Set(),
    completed:       new Set(),
    cancelled:       new Set(),
  };

  // Driver-triggerable transitions from EVENT_DEFINITIONS
  for (const def of Object.values(EVENT_DEFINITIONS)) {
    for (const from of def.allowedFromStatuses) {
      trans[from].add(def.resultingStatus);
    }
  }

  // Planner-only transitions
  for (const [target, sources] of Object.entries(PLANNER_ONLY_TRANSITIONS)) {
    for (const from of sources ?? []) {
      trans[from].add(target);
    }
  }

  return Object.fromEntries(
    Object.entries(trans).map(([k, v]) => [k, [...v]]),
  );
})();

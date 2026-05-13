/**
 * Rules for flagging sync events that need planner review.
 * Single source of truth — referenced by sync service only.
 * Change values here to affect all review logic.
 */
export const SYNC_REVIEW_RULES = {
  MAX_EVENT_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  MAX_EVENT_AGE_REASON: 'event_older_than_7d',
  MAX_FUTURE_DRIFT_MS: 60 * 60 * 1000,
  MAX_FUTURE_DRIFT_REASON: 'event_future_dated',
} as const;

/**
 * Event types the sync endpoint will process.
 * Phase 1: collected only.
 * All other types are rejected with a clear error — not silently ignored.
 * Add types here as phases are built out.
 *
 * These strings must match exactly what the mobile app sends as eventType.
 * Source of truth: mobile/src/constants/jobStatuses.ts EVENT_TYPE_LABELS
 */
export const SUPPORTED_EVENT_TYPES = [
  'started',
  'arrived_pickup',
  'collected',
  'arrived_dropoff',
  'completed',
] as const;

export type SupportedEventType = typeof SUPPORTED_EVENT_TYPES[number];

export const STATUS_BY_EVENT_TYPE: Record<SupportedEventType, string> = {
  started:         'in_progress',
  arrived_pickup:  'arrived_pickup',
  collected:       'collected',
  arrived_dropoff: 'arrived_dropoff',
  completed:       'completed',
};

// Maps PlannedJob.status values to the eventType string stored in JobExecutionEvent.
// PlannedJob.status (arrived_pickup, arrived_dropoff) differs from JobStop.type (collection, delivery).
export const EVENT_TYPE_MAP: Record<string, string> = {
  in_progress:     "started",
  arrived_pickup:  "arrived_pickup",
  collected:       "collected",
  arrived_dropoff: "arrived_dropoff",
  completed:       "completed",
  cancelled:       "cancelled",
};

export const ALLOWED_JOB_TRANSITIONS: Record<string, string[]> = {
  pending:         ['accepted', 'in_progress', 'cancelled'],
  accepted:        ['in_progress', 'cancelled'],
  in_progress:     ['arrived_pickup', 'cancelled'],
  arrived_pickup:  ['collected', 'cancelled'],
  collected:       ['arrived_dropoff'],
  arrived_dropoff: ['completed'],
  completed:       [],
  cancelled:       [],
};

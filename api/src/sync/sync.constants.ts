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
export const SUPPORTED_EVENT_TYPES = ['collected'] as const;

export type SupportedEventType = typeof SUPPORTED_EVENT_TYPES[number];

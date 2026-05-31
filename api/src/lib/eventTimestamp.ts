/**
 * Client event timestamp validation helper.
 *
 * A.3 fix: previously the online path rejected stale timestamps with 400,
 * while the sync path flagged them with needsReview=true. This helper
 * implements a single consistent policy.
 *
 * E.4 decision (2026-05-31): flag everywhere, never reject.
 * A stale or future-dated timestamp produces { valid: true, needsReview: true }
 * so the event is saved and routed to the planner review queue. Neither path
 * silently drops events from drivers who were offline for extended periods.
 */

import { SYNC_REVIEW_RULES } from '../sync/sync.constants.js';

export type TimestampValidationResult =
  | { valid: true;  date: Date; needsReview: boolean; reviewReason?: string }
  | { valid: false; reason: string };

/**
 * Validate a clientTimestamp ISO string.
 *
 * Returns:
 *   { valid: false, reason }        — missing or unparseable string
 *   { valid: true, date, needsReview: false }
 *                                   — clean timestamp within the acceptable window
 *   { valid: true, date, needsReview: true, reviewReason }
 *                                   — stale (> 7 days) or future-dated (> 1h ahead);
 *                                     E.4: save with planner review flag, do not reject
 */
export function validateClientTimestamp(
  iso: string | undefined | null,
): TimestampValidationResult {
  if (!iso || typeof iso !== 'string') {
    return { valid: false, reason: 'clientTimestamp is required' };
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, reason: 'clientTimestamp must be a valid ISO date string' };
  }

  const now = Date.now();
  const eventTime = date.getTime();

  if (now - eventTime > SYNC_REVIEW_RULES.MAX_EVENT_AGE_MS) {
    return {
      valid:        true,
      date,
      needsReview:  true,
      reviewReason: SYNC_REVIEW_RULES.MAX_EVENT_AGE_REASON,
    };
  }

  if (eventTime - now > SYNC_REVIEW_RULES.MAX_FUTURE_DRIFT_MS) {
    return {
      valid:        true,
      date,
      needsReview:  true,
      reviewReason: SYNC_REVIEW_RULES.MAX_FUTURE_DRIFT_REASON,
    };
  }

  return { valid: true, date, needsReview: false };
}

/**
 * notificationVocab — the notification type registry (S14).
 *
 * One status-string registry per concept (CLAUDE.md). Every Notification.type
 * value comes from here; DATA_DICTIONARY.md → Notification documents the same
 * list. api-only (not part of the byte-mirrored loadVocab group).
 */

const NOTIFICATION_TYPES = [
  'run_published',    // driver: a run was published to you
  'run_recalled',     // driver: a published run was recalled
  'delay_reported',   // planner: driver reported a delay (B8)
  'breakdown',        // planner: vehicle breakdown (B9)
  'delivery_refused', // planner: consignee refused delivery (B11)
  'damage_reported',  // planner: damage reported (B13)
  'damage_writeoff',  // planner: load written off (B13)
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];

/** Execution event types that dispatch a planner notification when accepted. */
export const EXCEPTION_NOTIFY_EVENTS = [
  'delay_reported',
  'breakdown',
  'delivery_refused',
  'damage_reported',
  'damage_writeoff',
] as const satisfies readonly NotificationType[];

/**
 * Run status registry — TASK 4.5 / C.7 / Commandment (one status string registry).
 *
 * All Run.status values must come from this file. Magic strings in route
 * handlers are forbidden. If you need a new status, add it here and update
 * the transition table.
 */

export const RUN_STATUSES = [
  'draft',       // created, not yet assigned to a driver
  'assigned',    // driver assigned + published
  'in_progress', // driver has started the run (first job in_progress)
  'completed',   // all jobs completed
  'cancelled',   // planner cancelled
] as const;

export type RunStatus = typeof RUN_STATUSES[number];

/**
 * Allowed status transitions for Run.
 * Keys: current status. Values: statuses that may follow.
 *
 * Transitions enforced by Zod validation in PATCH /planning/runs/:id and
 * PATCH /runs/:id. Hard-coding these prevents "banana" statuses.
 */
// Allowed transitions — not yet enforced in routes but documented here.
// Export when route-level transition validation is added.
const ALLOWED_RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  draft:       ['assigned', 'cancelled'],
  assigned:    ['draft', 'in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   [],
};

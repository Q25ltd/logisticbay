/**
 * runService — shared run-lifecycle operations.
 *
 * TASK 2.4: extract cancelRun to fix A.7 (duplicate cancel logic across
 * routes/runs.ts and routes/planning.ts) and B.4 (LoadTrack hard-delete
 * disabled — custody history must be preserved per SAFETY §7).
 */

import { Prisma } from '../generated/client.js';
import { syncJobPlanningStatuses } from '../lib/jobUtils.js';

type TxClient = Prisma.TransactionClient;

export interface CancelRunInput {
  runId:       number;
  companyId:   number;
  actorUserId: number;
  /** Human-readable reason stored on every removed RunAssignment and AuditLog */
  reason:      string;
}

export interface CancelRunResult {
  /** The run id that was cancelled */
  runId:            number;
  /** Job ids whose planning status was recalculated */
  affectedJobIds:   number[];
}

/**
 * Cancel a run — single function used by DELETE /runs/:id and
 * PATCH /planning/runs/:id (status=cancelled).
 *
 * Must be called inside a prisma.$transaction callback.
 *
 * What it does (all inside the caller's transaction):
 *   1. Marks all active RunAssignments removedAt=now, sets removalReason.
 *   2. Updates Run.status to 'cancelled'.
 *   3. Calls syncJobPlanningStatuses so affected jobs revert to ready_to_plan.
 *   4. Writes an AuditLog entry for the cancel.
 *
 * What it does NOT do:
 *   - Does NOT delete LoadTrack rows (B.4 / SAFETY §7 — custody history is
 *     operational data; hard-delete is forbidden). TASK 4.3 will add soft-delete
 *     fields if archiving is needed.
 *   - Does NOT hard-delete the Run or RunAssignment rows — that is a separate
 *     operation for the "already-cancelled, confirm hard-delete" path in
 *     DELETE /runs/:id.
 */
export async function cancelRun(
  tx: TxClient,
  input: CancelRunInput,
): Promise<CancelRunResult> {
  const { runId, companyId, actorUserId, reason } = input;

  // Collect affected job IDs before removing assignments
  const assignments = await tx.runAssignment.findMany({
    where:  { runId, companyId, removedAt: null },
    select: { jobId: true },
  });
  const affectedJobIds = [...new Set(assignments.map(a => a.jobId))];

  // 1. Soft-remove all active assignments
  await tx.runAssignment.updateMany({
    where: { runId, companyId, removedAt: null },
    data: {
      removedAt:     new Date(),
      removedBy:     actorUserId,
      removalReason: reason,
    },
  });

  // 2. Cancel the run
  await tx.run.update({
    where: { id: runId },
    data:  { status: 'cancelled' },
  });

  // 3. Revert affected jobs to ready_to_plan if they have no remaining active assignments
  await syncJobPlanningStatuses(affectedJobIds, companyId, tx);

  // 4. Audit log
  await tx.auditLog.create({
    data: {
      companyId,
      actorId:    actorUserId,
      entityType: 'Run',
      entityId:   runId,
      action:     'status_change',
      field:      'status',
      newValue:   { status: 'cancelled' } as import('../generated/client.js').Prisma.InputJsonValue,
      note:       reason,
    },
  });

  return { runId, affectedJobIds };
}

/**
 * reconcileLoadState — the SINGLE writer of derived Job.status and Run.status.
 *
 * LOAD_MOVEMENT_PLAN.md §A6 / Step 3 / STATUS P0.14. Rolls up dimension 2
 * (RunAssignment execution states) and dimension 3 (LoadTrack custody) into the
 * derived planning status (dimension 1) the office sees. This is what removes
 * the D1=A interim freeze where Job.status stayed `planned` during execution.
 *
 * Ownership / invariant 7: drivers never write Job.status; this function is the
 * only writer of the DERIVED statuses. It never touches planner-owned statuses
 * (draft, pending_review, ready_to_plan) or the terminal `cancelled`, and never
 * demotes a `completed` run.
 *
 * Idempotent: only writes when a value actually changes; running twice is a
 * no-op. Call inside a transaction (from applyJobEvent and the nightly sweep).
 */

import { Prisma } from '../generated/client.js';
import { custodyBaseOf } from '../constants/loadVocab.js';

type TxClient = Prisma.TransactionClient;

/**
 * Job.status values the reconciler is allowed to transition FROM. Anything else
 * (draft / pending_review / ready_to_plan / cancelled) is planner-owned and left
 * untouched. `planned` is accepted as an entry point even though nothing sets it
 * yet (deferred planning-tier task) — harmless.
 */
const RECONCILER_ENTRY_STATUSES = new Set<string>([
  'in_planning',
  'planned',
  'in_execution',
  'partially_collected',
  'collected',
  'partially_delivered',
  'attention_needed',
  'completed',
]);

/** Execution states that mean "this part has been collected (is past pickup)". */
const COLLECTED_STATES = new Set<string>(['loaded', 'en_route_dropoff', 'at_dropoff', 'delivered']);

/**
 * Derive the rolled-up Job.status from a job's assignment execution states.
 * Returns null when there is nothing to assert (no started execution).
 */
export function deriveJobStatus(states: string[]): string | null {
  const total = states.length;
  if (total === 0) return null;

  if (states.includes('exception')) return 'attention_needed';

  const delivered = states.filter(s => s === 'delivered').length;
  const collected = states.filter(s => COLLECTED_STATES.has(s)).length;
  const started   = states.filter(s => s !== 'not_started').length;

  if (delivered === total) return 'completed';
  if (delivered > 0)       return 'partially_delivered';
  if (collected === total) return 'collected';
  if (collected > 0)       return 'partially_collected';
  if (started > 0)         return 'in_execution';
  return null;
}

export interface ReconcileInput {
  jobId:     number;
  companyId: number;
}

/**
 * Reconcile one job (and the runs its parts ride on) inside the caller's tx.
 */
export async function reconcileLoadState(
  tx: TxClient,
  { jobId, companyId }: ReconcileInput,
): Promise<void> {
  const now = new Date();

  const job = await tx.job.findFirst({
    where:  { id: jobId, companyId },
    select: { id: true, status: true },
  });
  if (!job) return;

  const assignments = await tx.runAssignment.findMany({
    where:  { jobId, companyId, removedAt: null },
    select: { status: true, runId: true },
  });
  if (assignments.length === 0) return;

  // ── 1. Derive + apply Job.status (only from reconciler-owned statuses) ───────
  let derived = deriveJobStatus(assignments.map(a => a.status));

  // Step 6 (D6.2): custody guard. An assignment can be 'delivered' for its leg
  // while the physical load is still in a yard / on a vehicle (relay). Don't
  // report the job delivered until its latest custody is the customer (or a
  // terminal write-off). Keeps a relay at 'collected' until the final deliver.
  if (derived === 'completed' || derived === 'partially_delivered') {
    const latest = await tx.loadTrack.findFirst({
      where:   { jobId, companyId, deletedAt: null },
      orderBy: { id: 'desc' },
      select:  { toCustody: true },
    });
    const base = latest ? custodyBaseOf(latest.toCustody) : null;
    if (base != null && base !== 'customer_dest' && base !== 'written_off') {
      derived = 'collected';
    }
  }

  if (
    derived &&
    derived !== job.status &&
    RECONCILER_ENTRY_STATUSES.has(job.status)
  ) {
    await tx.job.update({ where: { id: jobId }, data: { status: derived } });
  }

  // ── 2. Roll up Run.status for each run this job's parts ride on ──────────────
  // A run may carry assignments from several jobs, so re-read ALL active
  // assignments on each affected run — not just this job's.
  const runIds = [...new Set(assignments.map(a => a.runId))];
  for (const runId of runIds) {
    const run = await tx.run.findFirst({
      where:  { id: runId, companyId },
      select: { id: true, status: true, actualStartTime: true, actualEndTime: true },
    });
    if (!run || run.status === 'cancelled') continue;

    const runAssignments = await tx.runAssignment.findMany({
      where:  { runId, companyId, removedAt: null },
      select: { status: true },
    });
    if (runAssignments.length === 0) continue;

    const allDelivered = runAssignments.every(a => a.status === 'delivered');
    const anyStarted   = runAssignments.some(a => a.status !== 'not_started');

    const data: Prisma.RunUpdateInput = {};

    if (allDelivered) {
      if (run.status !== 'completed') data.status = 'completed';
      if (!run.actualEndTime) data.actualEndTime = now;
    } else if (anyStarted && run.status !== 'completed') {
      if (run.status !== 'in_progress') data.status = 'in_progress';
    }
    if (anyStarted && !run.actualStartTime) data.actualStartTime = now;

    if (Object.keys(data).length > 0) {
      await tx.run.update({ where: { id: runId }, data });
    }
  }
}

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

const isCollectionType = (t: string): boolean => t === 'collection' || t === 'pickup';
const isDeliveryType   = (t: string): boolean => t === 'delivery'   || t === 'dropoff';

export interface PartCustodyInfo {
  /** JobPart.type — only collection/pickup and delivery/dropoff feed the rollup. */
  type: string;
  /** Base of the latest LoadTrack row for this part, or null if none written yet. */
  custodyBase: string | null;
}

/**
 * Derive the rolled-up Job.status from a job's assignment execution states
 * (dimension 2 — for the exception override and the "has anything started"
 * floor) plus each JobPart's latest custody base (dimension 3 — the ONLY
 * correct signal for "has this part actually reached the customer").
 *
 * Why not count RunAssignment.status === 'delivered' (the pre-2026-07-22
 * approach)? Because 'delivered' is an EXECUTION-state value that is
 * deliberately overloaded (A4: "handed to consignee (final) OR dropped at
 * yard (interim)") and because a job's parts do not always map 1:1 with the
 * assignment(s) that carried them — a relay leg or an ambiguous event
 * resolution can leave a sibling assignment at 'not_started' forever while
 * the physical load has genuinely reached the customer (proven empirically:
 * driverAssignmentsExposed.test.ts). The custody ledger is written per
 * JobPart by `applyJobEvent` regardless of which assignment row absorbed the
 * state transition, so it is the one honest source for "did the freight
 * arrive" — this is what LOAD_MOVEMENT_PLAN.md §A6 step 2 specifies ("read
 * the latest LoadTrack custody per part") and what makes this correct for
 * direct, relay, and multi-drop jobs without any special-casing.
 */
export function deriveJobStatus(executionStates: string[], parts: PartCustodyInfo[]): string | null {
  if (executionStates.length === 0) return null;

  if (executionStates.includes('exception')) return 'attention_needed';

  const deliveryParts   = parts.filter(p => isDeliveryType(p.type));
  const collectionParts = parts.filter(p => isCollectionType(p.type));

  const deliveredCount = deliveryParts.filter(p => p.custodyBase === 'customer_dest').length;
  const collectedCount = collectionParts.filter(p => p.custodyBase != null && p.custodyBase !== 'customer_origin').length;

  if (deliveryParts.length > 0 && deliveredCount === deliveryParts.length) return 'completed';
  if (deliveredCount > 0) return 'partially_delivered';
  if (collectionParts.length > 0 && collectedCount === collectionParts.length) return 'collected';
  if (collectedCount > 0) return 'partially_collected';

  const started = executionStates.filter(s => s !== 'not_started').length;
  if (started > 0) return 'in_execution';
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
  // Custody-based (2026-07-22, task #28): read each JobPart's own latest custody
  // row (dimension 3) rather than counting RunAssignment.status (dimension 2).
  // This also supersedes the former "D6.2 custody guard", which patched the same
  // relay false-positive by re-checking the job's single latest LoadTrack row
  // after the fact — unnecessary now that "delivered" is read per delivery-type
  // part directly (a yard drop never writes to a delivery part's custody, so the
  // false positive this guarded against cannot occur here in the first place).
  const parts = await tx.jobPart.findMany({
    where:  { jobId, companyId },
    select: { id: true, type: true },
  });
  const custodyRows = await tx.loadTrack.findMany({
    where:   { jobId, companyId, deletedAt: null },
    orderBy: { id: 'asc' },
    select:  { jobPartId: true, toCustody: true },
  });
  const latestCustodyByPart = new Map<number, string>();
  for (const row of custodyRows) latestCustodyByPart.set(row.jobPartId, row.toCustody);
  const partCustody = parts.map(p => {
    const custody = latestCustodyByPart.get(p.id);
    return { type: p.type, custodyBase: custody != null ? custodyBaseOf(custody) : null };
  });

  const derived = deriveJobStatus(assignments.map(a => a.status), partCustody);

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

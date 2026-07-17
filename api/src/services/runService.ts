/**
 * runService — shared run-lifecycle operations.
 *
 * TASK 2.4: extract cancelRun to fix A.7 (duplicate cancel logic across
 * routes/runs.ts and routes/planning.ts) and B.4 (LoadTrack hard-delete
 * disabled — custody history must be preserved per SAFETY §7).
 */

import { Prisma } from '../generated/client.js';
import { syncJobPlanningStatuses } from '../lib/jobUtils.js';
import { recomputeRunCompatibility } from '../lib/runCompatibility.js';
import { appendLoadTrack } from '../lib/loadTrack.js';
import { custodyBaseOf, customAt } from '../constants/loadVocab.js';

type TxClient = Prisma.TransactionClient;

/** S12 (B14): how load stranded on the cancelled run's vehicle is dispositioned. */
export type CustodyDisposition = 'return_to_origin' | 'leave_at_yard';

export interface CancelRunInput {
  runId:       number;
  companyId:   number;
  actorUserId: number;
  /** Human-readable reason stored on every removed RunAssignment and AuditLog */
  reason:      string;
  /**
   * S12 (B14): REQUIRED when a load's latest custody is on this run's vehicle —
   * a cancel must never strand a load (invariant 1). Without it, cancelRun
   * throws CUSTODY_DISPOSITION_REQUIRED (409) listing the affected jobs.
   */
  custodyDisposition?: CustodyDisposition;
  /** Yard label/id for `leave_at_yard` (defaults to 'unspecified'). */
  dispositionYardRef?: string;
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
  const { runId, companyId, actorUserId, reason, custodyDisposition, dispositionYardRef } = input;

  // Collect affected job IDs before removing assignments
  const assignments = await tx.runAssignment.findMany({
    where:  { runId, companyId, removedAt: null },
    select: { jobId: true },
  });
  const affectedJobIds = [...new Set(assignments.map(a => a.jobId))];

  // 0. S12 (B14): a cancel must never strand a load. Find jobs whose LATEST
  //    custody is on THIS run's vehicle — those cannot just vanish; the planner
  //    must choose a disposition ("stop and ask" made mechanical).
  const latestRows = await Promise.all(affectedJobIds.map(jobId =>
    tx.loadTrack.findFirst({ where: { jobId, companyId, deletedAt: null }, orderBy: { id: 'desc' } }),
  ));
  const stranded = latestRows.filter(
    (r): r is NonNullable<typeof r> => r != null && r.runId === runId && custodyBaseOf(r.toCustody) === 'on_vehicle',
  );

  if (stranded.length > 0 && !custodyDisposition) {
    const jobIds = stranded.map(r => r.jobId).join(', ');
    throw Object.assign(
      new Error(`This run is carrying load for job(s) ${jobIds} — cancelling would strand it. Choose what happens to the load: return to origin, or leave at a yard.`),
      { statusCode: 409, code: 'CUSTODY_DISPOSITION_REQUIRED', details: { jobIds: stranded.map(r => r.jobId) } },
    );
  }

  // Write the compensating custody row per stranded load, caused by a planner
  // 'cancelled' event (invariant 5 — no orphan custody; invariant 4 — new rows,
  // never edits). LoadTrack itself stays preserved as before.
  if (stranded.length > 0 && custodyDisposition) {
    const now = new Date();
    for (const row of stranded) {
      const cancelEvent = await tx.jobExecutionEvent.create({
        data: {
          jobId:           row.jobId,
          companyId,
          driverId:        actorUserId, // legacy twin of actorUserId (Migration C pending)
          actorUserId,
          eventType:       'cancelled',
          note:            `Run cancelled with load on board — disposition: ${custodyDisposition}`,
          clientEventId:   `run-cancel-${runId}-job-${row.jobId}-${now.getTime()}`,
          clientTimestamp: now,
          needsReview:     false,
          runId,
          runAssignmentId: row.runAssignmentId,
          jobPartId:       row.jobPartId,
        },
        select: { id: true },
      });
      await appendLoadTrack(tx, {
        companyId,
        jobId:           row.jobId,
        jobPartId:       row.jobPartId,
        runId,
        runAssignmentId: row.runAssignmentId,
        eventId:         cancelEvent.id,
        transactionType: custodyDisposition === 'return_to_origin' ? 'refuse_return' : 'drop_at_yard',
        quantity:        Number(row.quantity),
        unit:            row.unit,
        fromCustody:     row.toCustody,
        toCustody:       custodyDisposition === 'return_to_origin'
          ? customAt.returned(row.jobPartId)
          : customAt.yard((dispositionYardRef ?? '').trim() || 'unspecified'),
        driverId:        actorUserId,
        trailerId:       row.trailerId,
        timestamp:       now,
        notes:           `disposition on run cancel: ${custodyDisposition}`,
      });
    }
  }

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

// ── S13 — dependency lock (invariant 8) ───────────────────────────────────────

export interface DependencyFeedStatus {
  dependsOnRunId:      number | null;
  /** true when there is no dependency, or the feeding leg has produced the load. */
  fed:                 boolean;
  feedingRunReference: string | null;
}

/**
 * S13: has the feeding leg of a dependent run produced the load yet?
 *
 * "Fed" means the feeding run has any of:
 *   - a drop_at_yard / trailer_swap / handover custody row (the load left it), or
 *   - a handover_offered event (B3: the handover custody row is only authored at
 *     ACCEPT, and the receiver cannot accept an unpublished run — the offer is
 *     the earliest honest feed signal, so requiring the row here would deadlock), or
 *   - status 'completed'.
 *
 * A dangling dependsOnRunId (feeder deleted) counts as fed — a stale pointer
 * must not brick a run. Used by both publish routes; the event-time halves of
 * invariant 8 live in applyJobEvent (pick/accept feeder-scoped guards).
 */
export async function dependencyFeedStatus(
  db: TxClient,
  { runId, companyId }: { runId: number; companyId: number },
): Promise<DependencyFeedStatus> {
  const run = await db.run.findFirst({ where: { id: runId, companyId }, select: { dependsOnRunId: true } });
  const depId = run?.dependsOnRunId ?? null;
  if (depId == null) return { dependsOnRunId: null, fed: true, feedingRunReference: null };

  const feeder = await db.run.findFirst({ where: { id: depId, companyId }, select: { runReference: true, status: true } });
  if (!feeder) return { dependsOnRunId: depId, fed: true, feedingRunReference: null };
  if (feeder.status === 'completed') return { dependsOnRunId: depId, fed: true, feedingRunReference: feeder.runReference };

  const custodyFeed = await db.loadTrack.findFirst({
    where:  { runId: depId, companyId, deletedAt: null, transactionType: { in: ['drop_at_yard', 'trailer_swap', 'handover'] } },
    select: { id: true },
  });
  if (custodyFeed) return { dependsOnRunId: depId, fed: true, feedingRunReference: feeder.runReference };

  const offer = await db.jobExecutionEvent.findFirst({
    where:  { runId: depId, companyId, eventType: 'handover_offered' },
    select: { id: true },
  });
  return { dependsOnRunId: depId, fed: offer != null, feedingRunReference: feeder.runReference };
}

// ── S12 (B10) — pre-start driver reassignment ─────────────────────────────────

export interface GuardDriverReassignmentInput {
  runId:       number;
  companyId:   number;
  actorUserId: number;
  oldDriverId: number | null;
  newDriverId: number | null;
}

/**
 * Guard + reset for changing the driver on a run (B10). Call inside the same
 * transaction as the run update, BEFORE writing assignedDriverId. Shared by
 * PATCH /runs/:id and PATCH /planning/runs/:id (one implementation).
 *
 * - No previous driver, or same driver → nothing to do (fresh assignment).
 * - Custody exists for this run → REFUSED (RUN_HAS_CUSTODY): the load is on or
 *   was moved by the old driver's vehicle; silently repointing the run would
 *   strand it (invariant 1). The rescue paths are handover (S8) or yard relay
 *   (S6/S7), which keep the ledger honest.
 * - No custody: any started assignment (en_route/at_pickup — or exception from a
 *   pre-collection breakdown, B9 resolution b) resets to not_started for the new
 *   driver, and the reset is audited.
 */
export async function guardDriverReassignment(
  tx: TxClient,
  input: GuardDriverReassignmentInput,
): Promise<{ resetCount: number }> {
  const { runId, companyId, actorUserId, oldDriverId, newDriverId } = input;
  if (oldDriverId == null || oldDriverId === newDriverId) return { resetCount: 0 };

  const custody = await tx.loadTrack.findFirst({
    where:  { runId, companyId, deletedAt: null },
    select: { id: true, jobId: true },
  });
  if (custody) {
    throw Object.assign(
      new Error('This run has already moved load — reassigning the driver would strand it. Set up a handover or yard relay instead.'),
      { statusCode: 409, code: 'RUN_HAS_CUSTODY' },
    );
  }

  const started = await tx.runAssignment.findMany({
    where:  { runId, companyId, removedAt: null, status: { not: 'not_started' } },
    select: { id: true },
  });
  if (started.length > 0) {
    await tx.runAssignment.updateMany({
      where: { id: { in: started.map(s => s.id) }, companyId },
      data:  { status: 'not_started' },
    });
  }

  await tx.auditLog.create({
    data: {
      companyId,
      actorId:    actorUserId,
      entityType: 'Run',
      entityId:   runId,
      action:     'driver_reassigned',
      field:      'assignedDriverId',
      newValue:   { oldDriverId, newDriverId, resetAssignments: started.length } as Prisma.InputJsonValue,
      note:       started.length > 0
        ? `Driver reassigned before any custody — ${started.length} started assignment(s) reset to not_started`
        : 'Driver reassigned before execution started',
    },
  });

  return { resetCount: started.length };
}

// ── Derived run requirements — recalculated whenever assignments change ───────
// Single implementation shared by routes/runs.ts and routes/planning.ts (the
// former duplicate in planning.ts read stop-level columns nothing wrote).
// Load requirements come from the JOB-level intake fields — the intake forms
// capture hazard / temperature / oversized / weight there (four-intake-gates).
export async function recalculateDerivedRequirements(
  runId: number,
  companyId: number,
  tx: TxClient,
): Promise<void> {
  const activeAssignments = await tx.runAssignment.findMany({
    where:   { runId, companyId, removedAt: null },
    select:  { quantityAssigned: true, jobPart: { select: {
      handlingMethods: true,
      job: { select: { id: true, hazardClass: true, tempControlled: true, specialRequirements: true, weight: true, quantity: true } },
    } } },
  });

  const parts = activeAssignments.map(a => a.jobPart);
  const specialReqs = (j: { specialRequirements: unknown }): string[] =>
    Array.isArray(j.specialRequirements) ? (j.specialRequirements as string[]) : [];

  const hasHazardous       = parts.some(p => !!p.job.hazardClass?.trim() || specialReqs(p.job).includes('dangerous_goods'));
  const hasTemperatureLoad = parts.some(p => p.job.tempControlled);
  const hasOversized       = parts.some(p => specialReqs(p.job).includes('oversized'));

  // Weight: each job's declared weight counted once — a job's collect + deliver
  // stops on the same run must not double-count its load. When the job is
  // SPLIT across runs (assignment share < job quantity), this run only carries
  // its share of the weight: weight × (share ÷ total quantity). Without this,
  // a 30-pallet/13.5t job split 26/4 showed 13.5t on BOTH runs.
  const jobWeightById = new Map<number, number>();
  for (const a of activeAssignments) {
    const j = a.jobPart.job;
    if (j.weight == null) continue;
    const total = j.quantity != null ? Number(j.quantity) : null;
    const share = Number(a.quantityAssigned);
    const weight = (total && total > 0 && share > 0 && share < total)
      ? Number(j.weight) * (share / total)
      : Number(j.weight);
    // collect + deliver of the same job on one run carry the SAME share — keep the max
    jobWeightById.set(j.id, Math.max(jobWeightById.get(j.id) ?? 0, weight));
  }
  const totalWeight   = [...jobWeightById.values()].reduce((a, b) => a + b, 0);
  const maxLoadWeight = totalWeight > 0 ? Math.round(totalWeight) : null;

  // Required trailer type: temperature wins, then hazardous (ADR needs an open
  // body — no fume build-up), then oversized.
  let requiredTrailerType: string | null = null;
  if (hasTemperatureLoad)  requiredTrailerType = 'temperature_controlled';
  else if (hasHazardous)   requiredTrailerType = 'curtainsider_or_flatbed';
  else if (hasOversized)   requiredTrailerType = 'curtainsider_or_flatbed';

  // Required equipment: union of all handling methods from all parts
  const equipmentSet = new Set<string>();
  for (const p of parts) {
    if (Array.isArray(p.handlingMethods)) {
      for (const m of p.handlingMethods as string[]) equipmentSet.add(m);
    }
  }
  const requiredEquipment = equipmentSet.size > 0 ? [...equipmentSet] : null;

  await tx.run.update({
    where: { id: runId },
    data: {
      hasHazardous,
      hasTemperatureLoad,
      hasOversized,
      maxLoadWeight,
      requiredTrailerType,
      requiredEquipment: requiredEquipment != null ? (requiredEquipment as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });

  // Requirements just changed — recompute trailer/vehicle compatibility (S5).
  await recomputeRunCompatibility(tx, runId, companyId);
}


// ── Part quantity ledger — total vs already-on-runs ──────────────────────────
// total is FORM-BORN (stop quantityRequired, else job quantity). Assigning the
// same stop to several runs is how splits and multi-trip (same driver, several
// trips) work — the ledger guarantees shares never exceed the total and the
// remainder stays visible on the planning board.

export interface PartQuantityLedger {
  total:     number | null;
  assigned:  number;
  remaining: number | null;
  breakdown: { runReference: string; quantityAssigned: number }[];
}

export async function partQuantityLedger(
  tx: TxClient,
  companyId: number,
  jobPartId: number,
): Promise<PartQuantityLedger | null> {
  const part = await tx.jobPart.findFirst({
    where:  { id: jobPartId, companyId },
    select: {
      quantityRequired: true,
      job: { select: { quantity: true } },
      runAssignments: {
        where:  { removedAt: null },
        select: { quantityAssigned: true, run: { select: { runReference: true } } },
      },
    },
  });
  if (!part) return null;
  const total = part.quantityRequired != null ? Number(part.quantityRequired)
              : part.job.quantity     != null ? Number(part.job.quantity) : null;
  const breakdown = part.runAssignments.map(a => ({
    runReference: a.run.runReference, quantityAssigned: Number(a.quantityAssigned),
  }));
  const assigned  = breakdown.reduce((s, b) => s + b.quantityAssigned, 0);
  const remaining = total != null ? Math.max(total - assigned, 0) : null;
  return { total, assigned, remaining, breakdown };
}

/** Human breakdown for error messages: "26 on RUN-2026-000016, 4 on RUN-2026-000023". */
export function ledgerBreakdownText(ledger: PartQuantityLedger): string {
  return ledger.breakdown.map(b => `${b.quantityAssigned} on ${b.runReference}`).join(', ');
}

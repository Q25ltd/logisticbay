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

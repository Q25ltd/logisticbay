/**
 * reconcileWorker — periodic safety-net reconcile of in-flight jobs.
 *
 * LOAD_MOVEMENT_PLAN.md Step 3 (D3.4) / STATUS P0.14. The per-event reconcile in
 * applyJobEvent is the primary path; this sweep catches anything missed (e.g. a
 * crash between writing an event and committing, or out-of-band data fixes).
 *
 * Mirrors autoCleanupWorker: per-tenant loop, pg_advisory_lock for single-
 * instance execution, setInterval lives here (not in a route).
 *
 * Sentry TODO (RELEASE_READINESS P0.2): replace log.error with
 *   Sentry.captureException once Sentry is wired up.
 */

import type { PrismaClient } from '../generated/client.js';
import type { FastifyBaseLogger } from 'fastify';
import { reconcileLoadState } from '../lib/reconcileLoadState.js';

// Stable advisory lock key for this worker — distinct from autoCleanupWorker.
const LOCK_KEY    = 7720114503n;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

// Jobs in these statuses are mid-flight and worth reconciling. Terminal
// (completed/cancelled) and pre-planning (draft/pending_review/ready_to_plan)
// jobs are skipped — the reconciler would not change them anyway.
const IN_FLIGHT_STATUSES = [
  'in_planning',
  'planned',
  'in_execution',
  'partially_collected',
  'collected',
  'partially_delivered',
  'attention_needed',
];

async function runReconcileSweep(
  prisma: PrismaClient,
  log:    FastifyBaseLogger,
): Promise<void> {
  const lockRows = await prisma.$queryRaw<[{ lock_obtained: boolean }]>`
    SELECT pg_try_advisory_lock(${LOCK_KEY}) AS lock_obtained
  `;
  if (!(lockRows[0]?.lock_obtained ?? false)) {
    log.info('reconcileSweep: another instance holds the lock — skipping this run');
    return;
  }

  try {
    const companies = await prisma.company.findMany({ select: { id: true } });

    for (const { id: companyId } of companies) {
      try {
        const jobs = await prisma.job.findMany({
          where:  { companyId, status: { in: IN_FLIGHT_STATUSES } },
          select: { id: true },
        });

        for (const { id: jobId } of jobs) {
          await prisma.$transaction(tx => reconcileLoadState(tx, { jobId, companyId }));
        }

        if (jobs.length > 0) {
          log.info({ companyId, count: jobs.length }, 'reconcileSweep: reconciled in-flight jobs');
        }
      } catch (err) {
        log.error({ err, companyId }, 'reconcileSweep: per-tenant reconcile failed');
        // TODO(RELEASE_READINESS P0.2): Sentry.captureException(err, { extra: { companyId } })
      }
    }
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
  }
}

/**
 * Start the reconcile worker. Call once from server.ts after app.listen().
 * Runs immediately then every 24 hours.
 */
export function startReconcileWorker(
  prisma: PrismaClient,
  log:    FastifyBaseLogger,
): void {
  const run = () =>
    runReconcileSweep(prisma, log).catch(err =>
      log.error(err, 'reconcileSweep: run failed'),
    );

  void run();
  setInterval(run, INTERVAL_MS);
}

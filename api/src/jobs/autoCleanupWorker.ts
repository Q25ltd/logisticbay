/**
 * autoCleanupWorker — periodic per-tenant shift soft-deletion.
 *
 * TASK 3.5 / B.2 fix:
 *   - Previously autoCleanupOldShifts() lived inside shiftRoutes() and was
 *     scheduled with setInterval. It ran cross-tenant (no companyId filter)
 *     and on every Railway instance simultaneously.
 *   - This module fixes all three issues:
 *       1. Per-tenant loop with explicit companyId.
 *       2. pg_advisory_lock prevents multi-instance duplicate execution.
 *       3. setInterval lives here, not in a route file.
 *
 * Sentry TODO (RELEASE_READINESS P0.2): replace app.log.error with
 *   Sentry.captureException once Sentry is wired up.
 */

import type { PrismaClient } from '../generated/client.js';
import type { FastifyBaseLogger } from 'fastify';

// Advisory lock key — stable int8 identifying this worker across instances.
// Any two instances racing on the same DB will see the lock and the second
// will skip its run cleanly.
const LOCK_KEY = 3055381517n; // arbitrary stable bigint

const CUTOFF_14_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const CUTOFF_33_DAYS_MS = 33 * 24 * 60 * 60 * 1000;
const INTERVAL_MS        = 24 * 60 * 60 * 1000;

/**
 * Run one cleanup pass.
 *
 * Acquires pg_advisory_lock — if another instance holds it, logs and returns
 * immediately. Always releases the lock in the finally block.
 */
async function runAutoCleanup(
  prisma: PrismaClient,
  log:    FastifyBaseLogger,
): Promise<void> {
  // Try to acquire single-instance advisory lock
  const lockRows = await prisma.$queryRaw<[{ lock_obtained: boolean }]>`
    SELECT pg_try_advisory_lock(${LOCK_KEY}) AS lock_obtained
  `;
  const lockObtained = lockRows[0]?.lock_obtained ?? false;

  if (!lockObtained) {
    log.info('autoCleanup: another instance holds the lock — skipping this run');
    return;
  }

  try {
    const now      = Date.now();
    const cutoff14 = new Date(now - CUTOFF_14_DAYS_MS);
    const cutoff33 = new Date(now - CUTOFF_33_DAYS_MS);

    // Iterate tenants so failures are isolated and logs are attributable
    const companies = await prisma.company.findMany({ select: { id: true } });

    for (const { id: companyId } of companies) {
      try {
        // Soft-delete draft / failed shifts older than 14 days
        const r14 = await prisma.shift.updateMany({
          where: { companyId, createdAt: { lt: cutoff14 }, status: { in: ['draft', 'failed'] } },
          data:  { status: 'deleted' },
        });
        if (r14.count > 0) {
          log.info({ companyId, count: r14.count }, 'autoCleanup: soft-deleted old draft/failed shifts');
        }

        // Soft-delete completed / submitted shifts older than 33 days
        const r33 = await prisma.shift.updateMany({
          where: { companyId, createdAt: { lt: cutoff33 }, status: { in: ['completed', 'submitted'] } },
          data:  { status: 'deleted' },
        });
        if (r33.count > 0) {
          log.info({ companyId, count: r33.count }, 'autoCleanup: soft-deleted old completed/submitted shifts');
        }
      } catch (err) {
        // Per-tenant failure is non-fatal — log with companyId context and continue
        log.error({ err, companyId }, 'autoCleanup: per-tenant cleanup failed');
        // TODO(RELEASE_READINESS P0.2): Sentry.captureException(err, { extra: { companyId } })
      }
    }
  } finally {
    // Always release — even if the loop threw
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
  }
}

/**
 * Start the cleanup worker. Call once from server.ts after app.listen().
 * Runs immediately then every 24 hours.
 */
export function startAutoCleanupWorker(
  prisma: PrismaClient,
  log:    FastifyBaseLogger,
): void {
  const run = () =>
    runAutoCleanup(prisma, log).catch(err =>
      log.error(err, 'autoCleanup: run failed'),
    );

  // Immediate first run
  void run();

  // Scheduled runs every 24 h
  setInterval(run, INTERVAL_MS);
}

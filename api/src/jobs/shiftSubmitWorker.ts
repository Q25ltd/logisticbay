/**
 * shiftSubmitWorker — drains the ShiftSubmitJob outbox.
 *
 * TASK 3.1 / B.1 fix:
 *   Previously PATCH /shifts/:id/submit did PDF + email + working-time in
 *   setImmediate. On Railway redeploy the process is killed mid-flight and
 *   the shift stays in "submitted" forever with no PDF and no email.
 *
 *   This worker polls the ShiftSubmitJob outbox table (written in the same
 *   transaction as the submit) and processes jobs idempotently with retries.
 *
 * Idempotency: if a job has already moved past "submitted" it is skipped.
 * Retry policy: up to MAX_ATTEMPTS, with exponential backoff.
 * Single-instance: pg_advisory_lock prevents multi-Railway-pod double-process.
 */

import type { PrismaClient } from '../generated/client.js';
import type { FastifyBaseLogger } from 'fastify';
import { generateShiftPDF }    from '../pdf.js';
import { sendShiftReportEmail } from '../email.js';

const LOCK_KEY       = 3055381518n; // distinct from autoCleanupWorker's key
const MAX_ATTEMPTS   = 5;
const POLL_INTERVAL  = 30_000; // 30 s
const BACKOFF_BASE_S = 60;     // first retry after 60 s, doubles each time

async function processOne(
  prisma: PrismaClient,
  log:    FastifyBaseLogger,
  jobId:  number,
): Promise<void> {
  // Claim the job atomically — prevents concurrent workers from double-processing
  const claimed = await prisma.shiftSubmitJob.updateMany({
    where: { id: jobId, status: 'pending' },
    data:  { status: 'processing' },
  });
  if (claimed.count === 0) return; // another worker got here first

  const outboxJob = await prisma.shiftSubmitJob.findUnique({ where: { id: jobId } });
  if (!outboxJob) return;

  const { shiftId, companyId, attempts } = outboxJob;

  // Load the shift with all relations needed for PDF generation
  const shift = await prisma.shift.findFirst({
    where:   { id: shiftId, companyId },
    include: {
      segments: { include: { deliveries: true }, orderBy: { segmentNumber: 'asc' } },
      company:  { select: { name: true } },
      driver:   { select: { name: true } },
    },
  });

  // Idempotency: if already completed/failed by another path, mark outbox done
  if (!shift || !['submitted', 'processing'].includes(shift.status)) {
    await prisma.shiftSubmitJob.update({ where: { id: jobId }, data: { status: 'completed' } });
    return;
  }

  try {
    // ── Generate PDF ──────────────────────────────────────────────────────────
    const pdfBuffer = await generateShiftPDF(shift as Parameters<typeof generateShiftPDF>[0]);

    // ── Send email (best-effort — failure does NOT mark shift failed) ─────────
    try {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (company?.reportEmailEnabled !== false) {
        await sendShiftReportEmail({
          shift:          shift as Parameters<typeof sendShiftReportEmail>[0]['shift'],
          pdfBuffer,
          recipientEmail: company?.reportEmail || undefined,
        });
      }
    } catch (emailErr) {
      log.error({ err: emailErr, shiftId }, 'shiftSubmitWorker: email failed — shift still completing');
    }

    // ── Update shift status to completed ──────────────────────────────────────
    await prisma.shift.updateMany({ where: { id: shiftId, companyId }, data: { status: 'completed' } });

    // ── Working-time summary ──────────────────────────────────────────────────
    try {
      if (shift.startTime && shift.endTime) {
        const [sh, sm] = shift.startTime.split(':').map(Number);
        const [eh, em] = shift.endTime.split(':').map(Number);
        const breakMins  = parseInt(shift.breakMins || '0', 10);
        const poaMins    = parseInt(shift.poaMins   || '0', 10);
        const totalHours = Math.max(0, ((eh * 60 + em) - (sh * 60 + sm) - breakMins - poaMins) / 60);

        const weekStart = new Date(shift.shiftDate);
        const day  = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        weekStart.setDate(diff);
        weekStart.setHours(0, 0, 0, 0);

        const profile = await prisma.driverProfile.findFirst({
          where: { companyId, userId: shift.driverId },
        });
        if (profile) {
          await prisma.driverWorkingTimeSummary.upsert({
            where: { driverProfileId_weekStartDate: { driverProfileId: profile.id, weekStartDate: weekStart } },
            update: { totalHours: { increment: totalHours }, shiftCount: { increment: 1 } },
            create: { companyId, driverProfileId: profile.id, weekStartDate: weekStart, totalHours, shiftCount: 1 },
          });
        }
      }
    } catch (wtErr) {
      log.error({ err: wtErr, shiftId }, 'shiftSubmitWorker: working-time update failed');
    }

    // Mark outbox job done
    await prisma.shiftSubmitJob.update({ where: { id: jobId }, data: { status: 'completed' } });
    log.info({ shiftId }, 'shiftSubmitWorker: shift processing completed');

  } catch (err) {
    const newAttempts = attempts + 1;
    const backoffSecs = BACKOFF_BASE_S * Math.pow(2, attempts); // 60s, 120s, 240s, 480s, 960s

    if (newAttempts >= MAX_ATTEMPTS) {
      // Exhausted retries — mark shift and outbox as failed
      await prisma.shift.updateMany({ where: { id: shiftId, companyId }, data: { status: 'failed' } });
      await prisma.shiftSubmitJob.update({
        where: { id: jobId },
        data:  { status: 'failed', attempts: newAttempts, lastError: String(err) },
      });
      log.error({ err, shiftId, attempts: newAttempts }, 'shiftSubmitWorker: max attempts reached — shift marked failed');
      // TODO(RELEASE_READINESS P0.2): Sentry.captureException(err, { extra: { shiftId } })
    } else {
      // Schedule retry with backoff
      const nextAttempt = new Date(Date.now() + backoffSecs * 1000);
      await prisma.shiftSubmitJob.update({
        where: { id: jobId },
        data: {
          status:        'pending',
          attempts:      newAttempts,
          lastError:     String(err),
          nextAttemptAt: nextAttempt,
        },
      });
      log.warn({ err, shiftId, attempt: newAttempts, retryAt: nextAttempt.toISOString() }, 'shiftSubmitWorker: job failed, will retry');
    }
  }
}

async function drainOutbox(prisma: PrismaClient, log: FastifyBaseLogger): Promise<void> {
  // Single-instance lock
  const [row] = await prisma.$queryRaw<[{ lock_obtained: boolean }]>`
    SELECT pg_try_advisory_lock(${LOCK_KEY}) AS lock_obtained
  `;
  if (!row.lock_obtained) return;

  try {
    const pending = await prisma.shiftSubmitJob.findMany({
      where:   { status: 'pending', nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: 'asc' },
      take:    10,
      select:  { id: true },
    });

    for (const { id } of pending) {
      await processOne(prisma, log, id).catch(err =>
        log.error({ err, outboxJobId: id }, 'shiftSubmitWorker: unexpected error in processOne'),
      );
    }
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
  }
}

export function startShiftSubmitWorker(prisma: PrismaClient, log: FastifyBaseLogger): void {
  const run = () => drainOutbox(prisma, log).catch(err => log.error(err, 'shiftSubmitWorker: drain failed'));

  void run(); // immediate first drain
  setInterval(run, POLL_INTERVAL);
}

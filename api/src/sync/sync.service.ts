import type { PrismaClient } from '../generated/client.js';
import { validateClientTimestamp } from '../lib/eventTimestamp.js';
import { applyJobEvent } from './applyJobEvent.js';
import { notifyExceptionEvent } from '../services/notificationService.js';

export interface IncomingEvent {
  clientEventId: string;
  eventType: string;
  jobId: number;
  clientTimestamp: string;
  appVersion?: string;
  note?: string;
  actualQuantity?: string;
  actualUnit?: string;
  collectionNote?: string;
  podNumber?: string;
  deliveryNote?: string;
  gpsLat?: number;
  gpsLng?: number;
  /** Step 6: yard reference for drop_at_yard / pick_from_yard (also the swap location for trailer_swap). */
  yardRef?: string;
  /** Step 7: registration of the trailer the run continues on after trailer_swap. */
  newTrailerReg?: string;
  /** The specific JobPart's assignment this event targets (job.runAssignments on
   *  the app side). Optional — when absent, applyJobEvent resolves the row whose
   *  current state is eligible for this event; see its own doc comment. */
  runAssignmentId?: number;
}

export interface SyncResult {
  clientEventId: string;
  status: 'accepted' | 'duplicate' | 'failed';
  failureReason?: string;
}




async function updateSyncLog(
  prisma: PrismaClient,
  clientEventId: string,
  companyId: number,
  status: string,
  failureReason: string | undefined,
): Promise<void> {
  try {
    await prisma.syncEventLog.updateMany({
      where: { clientEventId, companyId },
      data: { status, failureReason },
    });
  } catch {
    console.error('[sync] Failed to update SyncEventLog status for', clientEventId);
  }
}

export async function processSyncEvents(
  prisma: PrismaClient,
  events: IncomingEvent[],
  companyId: number,
  // NOTE: driverId here is User.id. TASK 4.1 backfill is complete:
  // actorUserId = driverId (same value). driverId dropped after 14-day soak (Migration C).
  driverId: number,
): Promise<SyncResult[]> {
  const sorted = [...events].sort(
    (a, b) => new Date(a.clientTimestamp).getTime() - new Date(b.clientTimestamp).getTime(),
  );

  const results: SyncResult[] = [];
  const driverProfile = await prisma.driverProfile.findFirst({
    where:  { companyId, userId: driverId, status: 'active' },
    select: { id: true, displayName: true },
  });

  for (const event of sorted) {
    // Best-effort audit log — written before processing so we have a record
    // even if subsequent steps fail.
    try {
      await prisma.syncEventLog.create({
        data: {
          companyId,
          clientEventId: event.clientEventId,
          eventType: event.eventType,
          status: 'pending',
          rawPayload: event as unknown as import('../generated/client.js').Prisma.InputJsonValue,
        },
      });
    } catch {
      console.error('[sync] Failed to write SyncEventLog for', event.clientEventId);
    }

    // ── Pre-flight (sync-specific, fail-fast before opening a transaction) ──

    // Timestamp parse + stale/future flag (E.4: flag not reject)
    const tsResult = validateClientTimestamp(event.clientTimestamp);
    if (!tsResult.valid) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'invalid_client_timestamp');
      results.push({ clientEventId: event.clientEventId, status: 'failed', failureReason: tsResult.reason });
      continue;
    }

    // Driver profile — sync path always requires an active DriverProfile
    if (!driverProfile) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'driver_profile_not_found');
      results.push({ clientEventId: event.clientEventId, status: 'failed', failureReason: 'Driver profile not found for this company' });
      continue;
    }

    // Job assignment — driver must be assigned to this job via a Run. This only
    // confirms SOME assignment exists; it must NOT be handed to applyJobEvent as
    // THE target (a job normally has 2+ assignments, one per JobPart — picking
    // "first found" here silently advanced the wrong JobPart's row on later
    // events in the same offline batch). If the queued event carries its own
    // runAssignmentId (the app knows which JobPart card it acted on), that's
    // validated and used; otherwise applyJobEvent resolves by eligibility.
    const assignmentWhere = event.runAssignmentId != null
      ? { id: event.runAssignmentId, jobId: event.jobId, companyId, removedAt: null, run: { assignedDriverId: driverProfile.id } }
      : { jobId: event.jobId, companyId, removedAt: null, run: { assignedDriverId: driverProfile.id } };
    const runAssignment = await prisma.runAssignment.findFirst({ where: assignmentWhere, select: { id: true } });
    if (!runAssignment) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'job_not_assigned_to_driver');
      results.push({ clientEventId: event.clientEventId, status: 'failed', failureReason: 'Job ' + event.jobId + ' is not assigned to this driver' });
      continue;
    }

    // ── Delegate to shared state machine ─────────────────────────────────────
    try {
      let applyResult: Awaited<ReturnType<typeof applyJobEvent>>;
      await prisma.$transaction(async (tx) => {
        applyResult = await applyJobEvent(tx, {
          companyId,
          actorUserId:     driverId,
          role:            'driver',
          jobId:           event.jobId,
          // Pass through ONLY the explicit id (if the app sent one) — leaving
          // this undefined when it didn't lets applyJobEvent's eligibility
          // resolution pick the right JobPart's assignment. `runAssignment`
          // above already proved the driver owns SOME assignment on this job.
          runAssignmentId: event.runAssignmentId,
          eventType:       event.eventType,
          clientEventId:   event.clientEventId,
          clientTimestamp: tsResult.date,
          needsReview:     tsResult.needsReview,
          reviewReason:    tsResult.reviewReason,
          gpsLat:          event.gpsLat,
          gpsLng:          event.gpsLng,
          note:            event.note,
          appVersion:      event.appVersion,
          actualQuantity:  event.actualQuantity,
          actualUnit:      event.actualUnit,
          yardRef:         event.yardRef,
          newTrailerReg:   event.newTrailerReg,
        });
      });

      // applyResult is always set because $transaction ran synchronously
      const r = applyResult!;

      if (r.status === 'accepted') {
        await updateSyncLog(prisma, event.clientEventId, companyId, 'accepted', undefined);
        results.push({ clientEventId: event.clientEventId, status: 'accepted' });
        // S14: exception events alert the planners — AFTER the transaction
        // committed, best-effort (notifyExceptionEvent never throws and no-ops
        // for non-exception event types).
        await notifyExceptionEvent(prisma, {
          companyId,
          jobId:      event.jobId,
          eventType:  event.eventType,
          driverName: driverProfile.displayName,
          note:       event.note,
        });
      } else if (r.status === 'duplicate') {
        await updateSyncLog(prisma, event.clientEventId, companyId, 'duplicate', undefined);
        results.push({ clientEventId: event.clientEventId, status: 'duplicate' });
      } else {
        await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', r.reason);
        results.push({ clientEventId: event.clientEventId, status: 'failed', failureReason: r.reason });
      }
    } catch (err) {
      console.error('[sync] Failed to save event', event.clientEventId, err);
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'db_write_error');
      results.push({ clientEventId: event.clientEventId, status: 'failed', failureReason: 'Failed to save event — please retry' });
    }
  }

  return results;
}

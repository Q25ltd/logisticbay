import type { PrismaClient } from '../generated/client.js';
import {
  ALLOWED_JOB_TRANSITIONS,
  STATUS_BY_EVENT_TYPE,
  SUPPORTED_EVENT_TYPES,
  SupportedEventType,
} from './sync.constants.js';
import { validateClientTimestamp } from '../lib/eventTimestamp.js';

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
}

export interface SyncResult {
  clientEventId: string;
  status: 'accepted' | 'duplicate' | 'failed';
  failureReason?: string;
}


function isSupportedEventType(eventType: string): eventType is SupportedEventType {
  return (SUPPORTED_EVENT_TYPES as readonly string[]).includes(eventType);
}

function buildJobUpdate(event: IncomingEvent): Record<string, unknown> {
  // Only update the job status — quantity/pod fields are now captured on
  // RunAssignment and LoadTrack, not on Job directly.
  return {
    status: STATUS_BY_EVENT_TYPE[event.eventType as SupportedEventType],
  };
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
  // NOTE: driverId here is User.id — JobExecutionEvent.driverId references User not DriverProfile.
  // TODO(phase-2): migrate JobExecutionEvent.driverId to reference DriverProfile instead of User.
  driverId: number,
): Promise<SyncResult[]> {
  const sorted = [...events].sort(
    (a, b) => new Date(a.clientTimestamp).getTime() - new Date(b.clientTimestamp).getTime(),
  );

  const results: SyncResult[] = [];
  const driverProfile = await prisma.driverProfile.findFirst({
    where:  { companyId, userId: driverId, status: 'active' },
    select: { id: true },
  });

  for (const event of sorted) {
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

    if (!isSupportedEventType(event.eventType)) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'unsupported_event_type:' + event.eventType);
      results.push({
        clientEventId: event.clientEventId,
        status: 'failed',
        failureReason: "Event type '" + event.eventType + "' is not supported in this version",
      });
      continue;
    }

    const tsResult = validateClientTimestamp(event.clientTimestamp);
    if (!tsResult.valid) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'invalid_client_timestamp');
      results.push({
        clientEventId: event.clientEventId,
        status: 'failed',
        failureReason: tsResult.reason,
      });
      continue;
    }
    const clientTimestamp = tsResult.date;

    const existing = await prisma.jobExecutionEvent.findUnique({
      where: { companyId_clientEventId: { companyId, clientEventId: event.clientEventId } },
    });

    if (existing) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'duplicate', undefined);
      results.push({ clientEventId: event.clientEventId, status: 'duplicate' });
      continue;
    }

    if (!driverProfile) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'driver_profile_not_found');
      results.push({
        clientEventId: event.clientEventId,
        status: 'failed',
        failureReason: 'Driver profile not found for this company',
      });
      continue;
    }

    const job = await prisma.job.findFirst({
      where: { id: event.jobId, companyId },
    });

    if (!job) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'job_not_found');
      results.push({
        clientEventId: event.clientEventId,
        status: 'failed',
        failureReason: 'Job ' + event.jobId + ' not found for this company',
      });
      continue;
    }

    // Check assignment via Run → RunAssignment (assignedDriverId now lives on Run)
    const runAssignment = await prisma.runAssignment.findFirst({
      where: {
        jobId:     event.jobId,
        companyId,
        removedAt: null,
        run:       { assignedDriverId: driverProfile.id },
      },
    });
    if (!runAssignment) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'job_not_assigned_to_driver');
      results.push({
        clientEventId: event.clientEventId,
        status: 'failed',
        failureReason: 'Job ' + event.jobId + ' is not assigned to this driver',
      });
      continue;
    }

    const nextStatus = STATUS_BY_EVENT_TYPE[event.eventType];
    const allowed = ALLOWED_JOB_TRANSITIONS[job.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'invalid_status_transition:' + job.status + '_to_' + nextStatus);
      results.push({
        clientEventId: event.clientEventId,
        status: 'failed',
        failureReason: 'Cannot move job ' + event.jobId + ' from ' + job.status + ' to ' + nextStatus,
      });
      continue;
    }

    const { needsReview, reviewReason } = tsResult;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.jobExecutionEvent.create({
          data: {
            jobId: event.jobId,
            companyId,
            driverId,
            eventType: event.eventType,
            note: event.note ?? '',
            clientEventId: event.clientEventId,
            clientTimestamp,
            appVersion: event.appVersion,
            gpsLat: event.gpsLat,
            gpsLng: event.gpsLng,
            needsReview,
            reviewReason,
          },
        });

        await tx.job.update({
          where: { id: event.jobId },
          data: buildJobUpdate(event),
        });
      });

      await updateSyncLog(prisma, event.clientEventId, companyId, 'accepted', undefined);
      results.push({ clientEventId: event.clientEventId, status: 'accepted' });
    } catch (err) {
      console.error('[sync] Failed to save event', event.clientEventId, err);
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'db_write_error');
      results.push({
        clientEventId: event.clientEventId,
        status: 'failed',
        failureReason: 'Failed to save event — please retry',
      });
    }
  }

  return results;
}

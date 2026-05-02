import type { PrismaClient } from '../generated/client.js';
import { SYNC_REVIEW_RULES, SUPPORTED_EVENT_TYPES, SupportedEventType } from './sync.constants.js';

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
}

export interface SyncResult {
  clientEventId: string;
  status: 'accepted' | 'duplicate' | 'failed';
  failureReason?: string;
}

function checkNeedsReview(clientTimestamp: Date): { needsReview: boolean; reviewReason?: string } {
  const now = Date.now();
  const eventTime = clientTimestamp.getTime();

  if (now - eventTime > SYNC_REVIEW_RULES.MAX_EVENT_AGE_MS) {
    return { needsReview: true, reviewReason: SYNC_REVIEW_RULES.MAX_EVENT_AGE_REASON };
  }

  if (eventTime - now > SYNC_REVIEW_RULES.MAX_FUTURE_DRIFT_MS) {
    return { needsReview: true, reviewReason: SYNC_REVIEW_RULES.MAX_FUTURE_DRIFT_REASON };
  }

  return { needsReview: false };
}

function isSupportedEventType(eventType: string): eventType is SupportedEventType {
  return (SUPPORTED_EVENT_TYPES as readonly string[]).includes(eventType);
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

    const clientTimestamp = new Date(event.clientTimestamp);

    if (isNaN(clientTimestamp.getTime())) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'failed', 'invalid_client_timestamp');
      results.push({
        clientEventId: event.clientEventId,
        status: 'failed',
        failureReason: 'clientTimestamp is not a valid ISO date',
      });
      continue;
    }

    const existing = await prisma.jobExecutionEvent.findUnique({
      where: { companyId_clientEventId: { companyId, clientEventId: event.clientEventId } },
    });

    if (existing) {
      await updateSyncLog(prisma, event.clientEventId, companyId, 'duplicate', undefined);
      results.push({ clientEventId: event.clientEventId, status: 'duplicate' });
      continue;
    }

    const job = await prisma.plannedJob.findFirst({
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

    const { needsReview, reviewReason } = checkNeedsReview(clientTimestamp);

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
            needsReview,
            reviewReason,
          },
        });

        await tx.plannedJob.update({
          where: { id: event.jobId },
          data: {
            status: 'collected',
            actualQuantity: event.actualQuantity ?? '',
            actualUnit: event.actualUnit ?? '',
            collectionNote: event.collectionNote ?? '',
          },
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

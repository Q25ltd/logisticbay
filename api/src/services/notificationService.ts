/**
 * notificationService — persist + dispatch notifications (S14).
 *
 * The Notification ROW is the durable record (what GET /notifications reads);
 * Expo push is best-effort delivery on top. dispatchNotification is called
 * AFTER the triggering business transaction commits — the push transport does
 * network I/O and must never sit inside a DB transaction or fail the caller
 * (it catches everything and logs).
 *
 * The transport is swappable via setPushTransport so tests can assert the send
 * call without touching the network (Step 14 exit criteria).
 */

import type { PrismaClient } from '../generated/client.js';
import { Prisma } from '../generated/client.js';
import { sendExpoPush, PushPayload } from '../lib/expoPush.js';
import { NotificationType, EXCEPTION_NOTIFY_EVENTS } from '../constants/notificationVocab.js';

type PushTransport = (tokens: string[], payload: PushPayload) => Promise<void>;

let pushTransport: PushTransport = sendExpoPush;

/** Test seam: replace the push transport (returns the previous one). */
export function setPushTransport(t: PushTransport): PushTransport {
  const prev = pushTransport;
  pushTransport = t;
  return prev;
}

export interface DispatchNotificationInput {
  companyId:        number;
  recipientUserIds: number[];
  type:             NotificationType;
  title:            string;
  body:             string;
  data?:            Record<string, unknown>;
}

/**
 * Persist one Notification row per recipient, then best-effort push to every
 * registered device of those recipients. Never throws.
 */
export async function dispatchNotification(
  prisma: PrismaClient,
  input: DispatchNotificationInput,
): Promise<void> {
  const { companyId, recipientUserIds, type, title, body, data } = input;
  const recipients = [...new Set(recipientUserIds)];
  if (recipients.length === 0) return;

  try {
    await prisma.notification.createMany({
      data: recipients.map(recipientUserId => ({
        companyId, recipientUserId, type, title, body,
        data: (data ?? {}) as Prisma.InputJsonValue,
      })),
    });

    const devices = await prisma.deviceToken.findMany({
      where:  { companyId, userId: { in: recipients } },
      select: { token: true },
    });
    if (devices.length > 0) {
      await pushTransport(devices.map(d => d.token), { title, body, data });
    }
  } catch (err) {
    console.error('[notify] dispatch failed:', err instanceof Error ? err.message : err);
  }
}

/** Active planner/owner user ids for a company — the exception audience. */
async function plannerUserIds(prisma: PrismaClient, companyId: number): Promise<number[]> {
  const memberships = await prisma.companyMembership.findMany({
    where:  { companyId, status: 'active', role: { in: ['company_owner', 'planner'] } },
    select: { userId: true },
  });
  return memberships.map(m => m.userId);
}

/** Resolve a run's assigned driver to their User id (null when unassigned). */
export async function runDriverUserId(prisma: PrismaClient, companyId: number, runId: number): Promise<number | null> {
  const run = await prisma.run.findFirst({ where: { id: runId, companyId }, select: { assignedDriverId: true } });
  if (run?.assignedDriverId == null) return null;
  const profile = await prisma.driverProfile.findFirst({ where: { id: run.assignedDriverId, companyId }, select: { userId: true } });
  return profile?.userId ?? null;
}

const EXCEPTION_TITLES: Record<string, string> = {
  delay_reported:   'Delay reported',
  breakdown:        'Vehicle breakdown',
  delivery_refused: 'Delivery refused',
  damage_reported:  'Damage reported',
  damage_writeoff:  'Load written off',
};

/**
 * Dispatch a planner notification for an accepted exception event (S11 events).
 * Called by the sync path after its transaction commits. No-op for
 * non-exception event types. Never throws.
 */
export async function notifyExceptionEvent(
  prisma: PrismaClient,
  input: { companyId: number; jobId: number; eventType: string; driverName?: string | null; note?: string | null },
): Promise<void> {
  const { companyId, jobId, eventType, driverName, note } = input;
  if (!(EXCEPTION_NOTIFY_EVENTS as readonly string[]).includes(eventType)) return;

  try {
    const [recipients, job] = await Promise.all([
      plannerUserIds(prisma, companyId),
      prisma.job.findFirst({ where: { id: jobId, companyId }, select: { jobReference: true, customerName: true } }),
    ]);
    const jobLabel = job?.jobReference ?? `job ${jobId}`;
    const who      = driverName ? `${driverName} — ` : '';
    await dispatchNotification(prisma, {
      companyId,
      recipientUserIds: recipients,
      type:  eventType as NotificationType,
      title: EXCEPTION_TITLES[eventType] ?? 'Exception',
      body:  `${who}${jobLabel}${job?.customerName ? ` (${job.customerName})` : ''}${note?.trim() ? `: ${note.trim()}` : ''}`,
      data:  { jobId, eventType },
    });
  } catch (err) {
    console.error('[notify] exception dispatch failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * applyJobEvent — single state machine for job execution events.
 *
 * Fixes A.1: the state machine was implemented twice (routes/jobs.ts online
 * path and sync/sync.service.ts offline drain). Both now delegate here.
 *
 * Fixes A.2: cancel-cascade TODO noted — cascade goes in the override endpoint
 * (TASK 3.8) because cancel is a planner-only exceptional action and is not
 * in SUPPORTED_EVENT_TYPES.
 *
 * Fixes B.5: clientEventId is required. No server-generated fallback. Callers
 * must provide a UUID from the client.
 *
 * E.1 decision (2026-05-31): drivers cannot cancel. cancel is not in
 * SUPPORTED_EVENT_TYPES so it can never reach here via the normal path.
 * An explicit safety check is included in case SUPPORTED_EVENT_TYPES is
 * extended in future.
 *
 * Two-path model (2026-05-31):
 *   Normal path   → this function. Planners follow EVENT_DEFINITIONS same as
 *                   drivers. Invalid transitions return { status: 'failed' }.
 *   Override path → POST /jobs/:id/status_override (TASK 3.8). Required for
 *                   cancel, reopen, force-close. Requires reason + audit log.
 */

import { Prisma } from '../generated/client.js';
import {
  EVENT_DEFINITIONS,
  SUPPORTED_EVENT_TYPES,
  EventType,
  JobStatus,
} from './sync.constants.js';

// Prisma.TransactionClient — the type injected by prisma.$transaction callbacks.
type TxClient = Prisma.TransactionClient;

// ── Input / output types ──────────────────────────────────────────────────────

export interface ApplyJobEventInput {
  companyId:       number;
  actorUserId:     number;
  /** JWT role string — used for E.1 safety assertion */
  role:            string;
  jobId:           number;
  /** Must be in SUPPORTED_EVENT_TYPES. 'cancelled' and other planner-only
   *  transitions are not valid here — use the override endpoint. */
  eventType:       string;
  /** Required. No server-generated fallback — caller must supply a UUID. */
  clientEventId:   string;
  clientTimestamp: Date;
  needsReview:     boolean;
  reviewReason?:   string;
  gpsLat?:         number | null;
  gpsLng?:         number | null;
  note?:           string;
  /** App version string from mobile SDK, if available */
  appVersion?:     string;
}

export type ApplyJobEventResult =
  | { status: 'accepted';  jobStatus: string; needsReview: boolean; reviewReason?: string }
  | { status: 'duplicate'; jobStatus: string }
  | { status: 'failed';    reason: string };

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Apply a single job execution event inside an existing transaction.
 *
 * The caller is responsible for:
 *   - Wrapping this call in `prisma.$transaction(async tx => ...)`.
 *   - Validating GPS pair and clientTimestamp BEFORE calling here
 *     (use validateGpsPair and validateClientTimestamp from lib/).
 *   - Returning 400 if clientEventId is missing or empty.
 *   - Sync-path-specific checks: driver profile exists, job assigned to driver.
 */
export async function applyJobEvent(
  tx: TxClient,
  input: ApplyJobEventInput,
): Promise<ApplyJobEventResult> {
  const {
    companyId, actorUserId, role, jobId,
    eventType, clientEventId, clientTimestamp,
    needsReview, reviewReason,
    gpsLat, gpsLng, note, appVersion,
  } = input;

  // ── 1. Validate event type ──────────────────────────────────────────────────
  if (!(SUPPORTED_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return {
      status: 'failed',
      reason: `Event type '${eventType}' is not supported via the normal status path. Use the override endpoint for exceptional changes (cancel, reopen, force-close).`,
    };
  }
  const ev  = eventType as EventType;
  const def = EVENT_DEFINITIONS[ev];

  // ── 2. E.1 safety assertion: drivers can never cancel ──────────────────────
  // cancel is not in SUPPORTED_EVENT_TYPES so this branch is only reachable if
  // SUPPORTED_EVENT_TYPES is extended with cancel in future. Keeps the intent visible.
  if (role === 'driver' && def.resultingStatus === 'cancelled') {
    return { status: 'failed', reason: 'Drivers cannot cancel jobs' };
  }

  // ── 3. Idempotency ─────────────────────────────────────────────────────────
  const existing = await tx.jobExecutionEvent.findUnique({
    where:  { companyId_clientEventId: { companyId, clientEventId } },
    select: { jobId: true },
  });
  if (existing) {
    const job = await tx.job.findFirst({
      where:  { id: jobId, companyId },
      select: { status: true },
    });
    return { status: 'duplicate', jobStatus: job?.status ?? 'unknown' };
  }

  // ── 4. Load job ─────────────────────────────────────────────────────────────
  const job = await tx.job.findFirst({ where: { id: jobId, companyId } });
  if (!job) {
    return { status: 'failed', reason: `Job ${jobId} not found` };
  }

  // ── 5. Transition validation ────────────────────────────────────────────────
  // Both driver and planner normal-path use EVENT_DEFINITIONS.allowedFromStatuses.
  // Planner exceptional transitions (cancel, reopen, force-close) go through the
  // override endpoint — they are not reachable here.
  if (!(def.allowedFromStatuses as readonly string[]).includes(job.status)) {
    return {
      status: 'failed',
      reason: `Cannot move job ${jobId} from '${job.status}' to '${def.resultingStatus}' via event '${eventType}'. Check ALLOWED_JOB_TRANSITIONS or use the override endpoint.`,
    };
  }

  // ── 6. Write (inside caller's transaction) ──────────────────────────────────
  await tx.job.update({
    where: { id: jobId },
    data:  { status: def.resultingStatus },
  });

  await tx.jobExecutionEvent.create({
    data: {
      jobId,
      companyId,
      // driverId kept until Migration C (drop after 14-day soak). actorUserId = canonical.
      driverId:        actorUserId,
      actorUserId:     actorUserId,
      eventType,
      note:            note ?? '',
      clientEventId,
      clientTimestamp,
      appVersion:      appVersion ?? null,
      gpsLat:          gpsLat   ?? null,
      gpsLng:          gpsLng   ?? null,
      needsReview,
      reviewReason:    reviewReason ?? null,
    },
  });

  return {
    status:       'accepted',
    jobStatus:    def.resultingStatus,
    needsReview,
    reviewReason,
  };
}

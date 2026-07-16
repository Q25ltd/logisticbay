/**
 * applyJobEvent — single state machine for job execution events.
 *
 * LOAD_MOVEMENT_PLAN.md Step 1 (status bridge): driver events advance the
 * per-RunAssignment EXECUTION state (dimension 2). They do NOT write Job.status
 * (dimension 1) — that is derived by the reconciler in Step 3.
 *
 * Step 2 (LoadTrack write path): `collected` and `completed` events also append
 * a custody row (dimension 3) via appendLoadTrack — collect (customer_origin →
 * on_vehicle) and deliver (on_vehicle → customer_dest). Custody is stop-aware
 * (D2.1): collect → collection stop, deliver → delivery stop.
 * Step 6 adds drop_at_yard / pick_from_yard (vehicle↔yard custody). Step 7 adds
 * trailer_swap (B4): the load left on the dropped trailer goes on_vehicle→yard
 * and the run continues on the new trailer (assignedTrailerId updated). Step 8
 * adds handover_offered / handover_accepted (B3): one handover custody row
 * (vehicleA→vehicleB) authored at accept; the offering leg ends 'delivered'.
 *
 * Both callers delegate here (A.1 — one state machine, not two):
 *   - routes/jobs.ts  PATCH /jobs/:id/status  (online path)
 *   - sync/sync.service.ts                     (offline drain)
 *
 * B.5: clientEventId is required. E.1: drivers cannot cancel.
 */

import {
  EVENT_DEFINITIONS,
  SUPPORTED_EVENT_TYPES,
  EventType,
} from './sync.constants.js';
import { customAt } from '../constants/loadVocab.js';
import { appendLoadTrack } from '../lib/loadTrack.js';
import { reconcileLoadState } from '../lib/reconcileLoadState.js';
import { Prisma } from '../generated/client.js';

// Prisma.TransactionClient — the type injected by prisma.$transaction callbacks.
type TxClient = Prisma.TransactionClient;

// ── Input / output types ──────────────────────────────────────────────────────

export interface ApplyJobEventInput {
  companyId:       number;
  actorUserId:     number;
  /** JWT role string — used for E.1 safety assertion */
  role:            string;
  jobId:           number;
  /**
   * The RunAssignment whose execution state this event advances. Callers resolve
   * it (job + driver's run). If omitted, the first active assignment for the job
   * is used (planner online path / single-assignment jobs).
   */
  runAssignmentId?: number | null;
  /** Must be in SUPPORTED_EVENT_TYPES. Planner-only actions use the override endpoint. */
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
  /** Quantity confirmed by the driver at collect/deliver (Step 2 custody). */
  actualQuantity?: string;
  actualUnit?:     string;
  /** Step 6: yard reference for drop_at_yard / pick_from_yard (location id or label). Step 7: also the trailer_swap drop location. */
  yardRef?:        string;
  /** Step 7: registration of the trailer the run continues on after trailer_swap. */
  newTrailerReg?:  string;
}

export type ApplyJobEventResult =
  | { status: 'accepted';  jobStatus: string; executionState: string; needsReview: boolean; reviewReason?: string }
  | { status: 'duplicate'; jobStatus: string; executionState: string }
  | { status: 'failed';    reason: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a wire quantity string to a finite number, or null if absent/invalid. */
function parseQuantity(actual?: string): number | null {
  if (actual == null) return null;
  const t = actual.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Apply a single job execution event inside an existing transaction.
 *
 * Caller responsibilities: wrap in prisma.$transaction; validate GPS pair and
 * clientTimestamp first; reject missing clientEventId; sync-path driver checks.
 */
export async function applyJobEvent(
  tx: TxClient,
  input: ApplyJobEventInput,
): Promise<ApplyJobEventResult> {
  const {
    companyId, actorUserId, role, jobId, runAssignmentId,
    eventType, clientEventId, clientTimestamp,
    needsReview, reviewReason,
    gpsLat, gpsLng, note, appVersion,
    actualQuantity, actualUnit, yardRef, newTrailerReg,
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
  if (role === 'driver' && (eventType as string) === 'cancelled') {
    return { status: 'failed', reason: 'Drivers cannot cancel jobs' };
  }

  // ── 3. Idempotency ─────────────────────────────────────────────────────────
  const existing = await tx.jobExecutionEvent.findUnique({
    where:  { companyId_clientEventId: { companyId, clientEventId } },
    select: { runAssignmentId: true },
  });
  if (existing) {
    const job = await tx.job.findFirst({ where: { id: jobId, companyId }, select: { status: true } });
    const asg = existing.runAssignmentId
      ? await tx.runAssignment.findFirst({ where: { id: existing.runAssignmentId, companyId }, select: { status: true } })
      : null;
    return { status: 'duplicate', jobStatus: job?.status ?? 'unknown', executionState: asg?.status ?? 'unknown' };
  }

  // ── 4. Load job (tenant-scoped) ─────────────────────────────────────────────
  const job = await tx.job.findFirst({ where: { id: jobId, companyId }, select: { status: true } });
  if (!job) {
    return { status: 'failed', reason: `Job ${jobId} not found` };
  }

  // ── 5. Resolve the RunAssignment this event advances ────────────────────────
  const assignment = runAssignmentId
    ? await tx.runAssignment.findFirst({ where: { id: runAssignmentId, companyId, jobId, removedAt: null } })
    : await tx.runAssignment.findFirst({ where: { jobId, companyId, removedAt: null }, orderBy: { sequenceNumber: 'asc' } });
  if (!assignment) {
    return { status: 'failed', reason: `No active run assignment for job ${jobId} — assign it to a run before execution.` };
  }

  // ── 6. Execution-state transition validation ────────────────────────────────
  if (!(def.allowedFromStates as readonly string[]).includes(assignment.status)) {
    return {
      status: 'failed',
      reason: `Cannot apply '${eventType}' to assignment ${assignment.id}: execution state is '${assignment.status}', expected one of [${def.allowedFromStates.join(', ')}].`,
    };
  }

  // ── 6b. Custody pre-resolution (Step 2/6/7) — done BEFORE any write so an invalid
  //        custody event fails cleanly without committing a partial transaction.
  const isCollect  = eventType === 'collected';
  const isDeliver  = eventType === 'completed';
  const isDropYard = eventType === 'drop_at_yard';
  const isPickYard = eventType === 'pick_from_yard';
  const isSwap     = eventType === 'trailer_swap';
  const isAccept   = eventType === 'handover_accepted';
  let custody:
    | { transactionType: 'collect' | 'deliver' | 'drop_at_yard' | 'pick_from_yard' | 'trailer_swap' | 'handover'; jobPartId: number; fromCustody: string; toCustody: string; quantity: number; unit: string; trailerId: string; notes?: string }
    | null = null;
  // Step 7: the trailer the run continues on after a swap (null = honest unknown).
  let swapNewTrailerId: number | null = null;
  let swapReviewReason: string | null = null;
  // Step 8: the offering driver's assignment — its leg ends when B accepts.
  let handoverOfferAssignmentId: number | null = null;

  if (isCollect || isDeliver || isDropYard || isPickYard || isSwap || isAccept) {
    const parts = await tx.jobPart.findMany({
      where:  { jobId, companyId },
      select: { id: true, type: true, quantityRequired: true, quantityUnit: true },
    });
    const collectionPart = parts.find(p => p.type === 'collection' || p.type === 'pickup');
    const deliveryPart   = parts.find(p => p.type === 'delivery'   || p.type === 'dropoff');
    const fallbackPart    = { id: assignment.jobPartId, quantityRequired: null as Prisma.Decimal | null, quantityUnit: null as string | null };

    const run = await tx.run.findFirst({
      where:  { id: assignment.runId, companyId },
      select: { assignedTrailerId: true, assignedTruckId: true },
    });
    // D2.3: on_vehicle uses assignedTrailerId first, assignedTruckId fallback.
    const vehicleId  = run?.assignedTrailerId ?? run?.assignedTruckId ?? null;
    const vehicleRef = vehicleId != null ? String(vehicleId) : `run${assignment.runId}`;
    const trailerId  = vehicleId != null ? String(vehicleId) : '';

    const qtyFor = (p: { quantityRequired: Prisma.Decimal | null }) =>
      parseQuantity(actualQuantity) ?? (p.quantityRequired != null ? Number(p.quantityRequired) : 0);
    const unitFor = (p: { quantityUnit: string | null }) => actualUnit ?? p.quantityUnit ?? '';

    // Step 6 (D6.4): yard ref — payload, else the run's yard waypoint, else run label.
    const resolveYardRef = async (): Promise<string> => {
      if (yardRef && yardRef.trim() !== '') return yardRef.trim();
      const wp = await tx.runWaypoint.findFirst({
        where:   { runId: assignment.runId, companyId, waypointType: { in: ['yard_pickup', 'hub_drop'] } },
        select:  { locationId: true, postcode: true, locationText: true },
        orderBy: { sequenceNumber: 'asc' },
      });
      if (wp?.locationId != null) return String(wp.locationId);
      if (wp?.postcode)           return wp.postcode;
      if (wp?.locationText)       return wp.locationText;
      return `run${assignment.runId}`;
    };

    if (isCollect) {
      const part = collectionPart ?? fallbackPart;
      custody = { transactionType: 'collect', jobPartId: part.id,
        fromCustody: customAt.customerOrigin(part.id), toCustody: customAt.onVehicle(vehicleRef),
        quantity: qtyFor(part), unit: unitFor(part), trailerId };
    } else if (isDropYard) {
      // Invariant 3: can't drop a load that was never collected.
      const priorCollect = await tx.loadTrack.findFirst({ where: { jobId, companyId, transactionType: 'collect', deletedAt: null }, select: { id: true } });
      if (!priorCollect) {
        return { status: 'failed', reason: `Cannot drop job ${jobId} at yard: no prior collection recorded.` };
      }
      const part = collectionPart ?? fallbackPart;
      custody = { transactionType: 'drop_at_yard', jobPartId: part.id,
        fromCustody: customAt.onVehicle(vehicleRef), toCustody: customAt.yard(await resolveYardRef()),
        quantity: qtyFor(part), unit: unitFor(part), trailerId };
    } else if (isPickYard) {
      // Invariant 8 stub (D6.5): can't pick from a yard nothing was dropped at.
      // Step 7: a trailer_swap row also leaves the load at a yard, so it counts as the drop.
      const priorDrop = await tx.loadTrack.findFirst({ where: { jobId, companyId, transactionType: { in: ['drop_at_yard', 'trailer_swap'] }, deletedAt: null }, select: { id: true } });
      if (!priorDrop) {
        return { status: 'failed', reason: `Cannot pick job ${jobId} from yard: no prior drop_at_yard recorded.` };
      }
      const part = collectionPart ?? deliveryPart ?? fallbackPart;
      custody = { transactionType: 'pick_from_yard', jobPartId: part.id,
        fromCustody: customAt.yard(await resolveYardRef()), toCustody: customAt.onVehicle(vehicleRef),
        quantity: qtyFor(part), unit: unitFor(part), trailerId };
    } else if (isSwap) {
      // Step 7 (B4): the load stays on the DROPPED trailer — custody must follow it
      // to the yard or invariant 1 breaks ("the dropped load is 'lost' if no row is
      // written"). Invariant 3: can't swap away a load that was never collected.
      const priorCollect = await tx.loadTrack.findFirst({ where: { jobId, companyId, transactionType: 'collect', deletedAt: null }, select: { id: true } });
      if (!priorCollect) {
        return { status: 'failed', reason: `Cannot trailer-swap job ${jobId}: no prior collection recorded.` };
      }
      const part = collectionPart ?? fallbackPart;
      custody = { transactionType: 'trailer_swap', jobPartId: part.id,
        fromCustody: customAt.onVehicle(vehicleRef), toCustody: customAt.yard(await resolveYardRef()),
        quantity: qtyFor(part), unit: unitFor(part), trailerId };

      // Resolve the trailer the run continues on. An unknown or missing reg NEVER
      // blocks the driver (offline-first, same rule as shift trailer ownership) —
      // the run's trailer becomes null (honest unknown) and the event is flagged
      // for planner review instead of inventing a fleet row.
      const reg = (newTrailerReg ?? '').trim().toUpperCase();
      if (reg === '') {
        swapReviewReason = 'trailer_swap_no_new_trailer_reg';
      } else {
        const newTrailer = await tx.fleetTrailer.findFirst({
          where:  { companyId, registration: reg, status: { not: 'deleted' } },
          select: { id: true },
        });
        if (newTrailer) swapNewTrailerId = newTrailer.id;
        else swapReviewReason = 'trailer_swap_new_trailer_not_in_fleet';
      }
    } else if (isAccept) {
      // Step 8 (B3): invariant 8 — B cannot accept before A offers. The single
      // handover custody row is authored HERE, at accept time (never at offer),
      // so custody can't double-count; both driver IDs + the offer event are
      // captured on the row for audit.
      const offer = await tx.jobExecutionEvent.findFirst({
        where:   { jobId, companyId, eventType: 'handover_offered' },
        orderBy: { id: 'desc' },
        select:  { id: true, runId: true, runAssignmentId: true, actorUserId: true },
      });
      if (!offer) {
        return { status: 'failed', reason: `Cannot accept handover for job ${jobId}: no prior handover_offered recorded.` };
      }
      // An offer is consumed by exactly one accept: any handover row caused by a
      // LATER event than this offer means it was already accepted.
      const consumed = await tx.loadTrack.findFirst({
        where:  { jobId, companyId, transactionType: 'handover', deletedAt: null, eventId: { gt: offer.id } },
        select: { id: true },
      });
      if (consumed) {
        return { status: 'failed', reason: `Cannot accept handover for job ${jobId}: the offer was already accepted.` };
      }
      const offerRun = offer.runId != null
        ? await tx.run.findFirst({ where: { id: offer.runId, companyId }, select: { assignedTrailerId: true, assignedTruckId: true } })
        : null;
      const fromVehicleId  = offerRun?.assignedTrailerId ?? offerRun?.assignedTruckId ?? null;
      const fromVehicleRef = fromVehicleId != null ? String(fromVehicleId) : `run${offer.runId}`;
      const part = collectionPart ?? deliveryPart ?? fallbackPart;
      custody = { transactionType: 'handover', jobPartId: part.id,
        fromCustody: customAt.onVehicle(fromVehicleRef), toCustody: customAt.onVehicle(vehicleRef),
        quantity: qtyFor(part), unit: unitFor(part), trailerId,
        notes: `handover fromDriverId=${offer.actorUserId ?? 'unknown'} toDriverId=${actorUserId} offerEventId=${offer.id}` };
      handoverOfferAssignmentId = offer.runAssignmentId;
    } else {
      // isDeliver — invariant 3: no deliver without a prior collect.
      const priorCollect = await tx.loadTrack.findFirst({ where: { jobId, companyId, transactionType: 'collect', deletedAt: null }, select: { id: true } });
      if (!priorCollect) {
        return { status: 'failed', reason: `Cannot deliver job ${jobId}: no prior collection recorded (invariant: no delivery before collection).` };
      }
      const part = deliveryPart ?? fallbackPart;
      custody = { transactionType: 'deliver', jobPartId: part.id,
        fromCustody: customAt.onVehicle(vehicleRef), toCustody: customAt.customerDest(part.id),
        quantity: qtyFor(part), unit: unitFor(part), trailerId };
    }
  }

  // ── 7. Write (inside caller's transaction) ──────────────────────────────────
  // Advance the assignment's execution state. Job.status is intentionally NOT
  // touched here — the reconciler (Step 3) derives it.
  await tx.runAssignment.update({
    where: { id: assignment.id },
    data:  { status: def.resultingState },
  });

  // Step 7: an unresolved swap trailer surfaces as a review flag on the event.
  const finalNeedsReview   = needsReview || swapReviewReason != null;
  const finalReviewReason  = reviewReason ?? swapReviewReason ?? null;

  const createdEvent = await tx.jobExecutionEvent.create({
    data: {
      jobId,
      companyId,
      // driverId kept until Migration C (drop after soak). actorUserId = canonical.
      driverId:        actorUserId,
      actorUserId:     actorUserId,
      eventType,
      note:            note ?? '',
      clientEventId,
      clientTimestamp,
      appVersion:      appVersion ?? null,
      gpsLat:          gpsLat   ?? null,
      gpsLng:          gpsLng   ?? null,
      needsReview:     finalNeedsReview,
      reviewReason:    finalReviewReason,
      runId:           assignment.runId,
      runAssignmentId: assignment.id,
      jobPartId:       assignment.jobPartId,
    },
    select: { id: true },
  });

  // Step 2: append the custody row caused by this event (invariant 5).
  if (custody) {
    await appendLoadTrack(tx, {
      companyId,
      jobId,
      jobPartId:       custody.jobPartId,
      runId:           assignment.runId,
      runAssignmentId: assignment.id,
      eventId:         createdEvent.id,
      transactionType: custody.transactionType,
      quantity:        custody.quantity,
      unit:            custody.unit,
      fromCustody:     custody.fromCustody,
      toCustody:       custody.toCustody,
      driverId:        actorUserId,
      trailerId:       custody.trailerId,
      timestamp:       clientTimestamp,
      gpsLat:          gpsLat ?? null,
      gpsLng:          gpsLng ?? null,
      notes:           custody.notes ?? null,
    });
  }

  // Step 7 (B4): the run continues on the new trailer. Written AFTER the custody
  // row so the ledger's on_vehicle ref captured the DROPPED trailer. updateMany
  // keyed on { id, companyId } — tenant scoping on writes (defence-in-depth).
  if (isSwap) {
    await tx.run.updateMany({
      where: { id: assignment.runId, companyId },
      data:  { assignedTrailerId: swapNewTrailerId },
    });
  }

  // Step 8 (B3): the offering leg ends when the receiver accepts — custody has
  // already moved to B's vehicle, so A's assignment is complete for its leg.
  if (isAccept && handoverOfferAssignmentId != null) {
    await tx.runAssignment.updateMany({
      where: { id: handoverOfferAssignmentId, companyId },
      data:  { status: 'delivered' },
    });
  }

  // Step 3: derive Job.status + Run.status rollups from the new execution/custody
  // state, atomically in this transaction. reconcileLoadState is the sole writer
  // of derived statuses; it leaves planner-owned/terminal statuses untouched.
  await reconcileLoadState(tx, { jobId, companyId });

  // Re-read the (possibly reconciled) Job.status for the response.
  const reconciledJob = await tx.job.findFirst({ where: { id: jobId, companyId }, select: { status: true } });

  return {
    status:         'accepted',
    jobStatus:      reconciledJob?.status ?? job.status,
    executionState: def.resultingState,    // the new assignment state (D2)
    needsReview:    finalNeedsReview,
    reviewReason:   finalReviewReason ?? undefined,
  };
}

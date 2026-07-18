/**
 * Live monitoring & reconciliation surface — LOAD_MOVEMENT_PLAN Step 15 (P0.13).
 *
 * GET  /live/needs-review             — planner queue: unresolved flagged events
 *                                       (needsReview) + exception events. "No
 *                                       exception is invisible to the planner."
 * POST /live/needs-review/:id/resolve — mark one item handled (reviewedAt/By)
 * GET  /live/runs?date=YYYY-MM-DD     — live run board: reconciled Run.status +
 *                                       per-assignment execution state + latest
 *                                       custody per job part
 */
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { parseIdParam } from "../lib/validate.js";
import { badRequest, notFound } from "../lib/errors.js";
import { dayRangeUtc } from "../lib/dateUtils.js";
import { EXCEPTION_NOTIFY_EVENTS } from "../constants/notificationVocab.js";

const plannerOnly = { preHandler: [authenticate, requireRole("company_owner", "planner")] };

export async function liveRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {

  // ── GET /live/needs-review ────────────────────────────────────────────────
  app.get("/live/needs-review", plannerOnly, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { limit?: string };
    const limit = Math.min(parseInt(q.limit ?? "100", 10) || 100, 200);

    // Queue = every unresolved event that either was flagged needsReview
    // (stale timestamps, quantity drift, unknown swap trailer, delay/damage)
    // or is an exception event (breakdown/refusal/writeoff — these drive
    // attention_needed and must never be invisible).
    const events = await prisma.jobExecutionEvent.findMany({
      where: {
        companyId,
        reviewedAt: null,
        OR: [
          { needsReview: true },
          { eventType: { in: [...EXCEPTION_NOTIFY_EVENTS] } },
        ],
      },
      orderBy: { id: "desc" },
      take:    limit,
      select: {
        id: true, jobId: true, eventType: true, note: true, reviewReason: true,
        clientTimestamp: true, serverReceivedAt: true, gpsLat: true, gpsLng: true,
        runId: true, actorUserId: true, driverId: true,
      },
    });

    // Attach job / run / actor context in bulk (no N+1).
    const jobIds  = [...new Set(events.map(e => e.jobId))];
    const runIds  = [...new Set(events.map(e => e.runId).filter((x): x is number => x != null))];
    const userIds = [...new Set(events.map(e => e.actorUserId ?? e.driverId))];
    const [jobs, runs, users] = await Promise.all([
      prisma.job.findMany({ where: { id: { in: jobIds }, companyId }, select: { id: true, jobReference: true, customerName: true, status: true } }),
      prisma.run.findMany({ where: { id: { in: runIds }, companyId }, select: { id: true, runReference: true } }),
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    ]);
    const jobById  = new Map(jobs.map(j => [j.id, j]));
    const runById  = new Map(runs.map(r => [r.id, r]));
    const userById = new Map(users.map(u => [u.id, u]));

    const items = events.map(e => {
      const job = jobById.get(e.jobId);
      return {
        id:            e.id,
        eventType:     e.eventType,
        reviewReason:  e.reviewReason,
        note:          e.note,
        occurredAt:    e.clientTimestamp,
        receivedAt:    e.serverReceivedAt,
        gpsLat:        e.gpsLat,
        gpsLng:        e.gpsLng,
        jobId:         e.jobId,
        jobReference:  job?.jobReference ?? null,
        customerName:  job?.customerName ?? null,
        jobStatus:     job?.status ?? null,
        runId:         e.runId,
        runReference:  e.runId != null ? runById.get(e.runId)?.runReference ?? null : null,
        actorName:     userById.get(e.actorUserId ?? e.driverId)?.name ?? null,
      };
    });

    return reply.send({ items, openCount: items.length });
  });

  // ── POST /live/needs-review/:id/resolve ───────────────────────────────────
  app.post("/live/needs-review/:id/resolve", plannerOnly, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId, userId } = request.user!;

    const updated = await prisma.jobExecutionEvent.updateMany({
      where: { id, companyId, reviewedAt: null },
      data:  { reviewedAt: new Date(), reviewedBy: userId },
    });
    if (updated.count === 0) return notFound(reply, "Review item");

    return reply.send({ ok: true });
  });

  // ── GET /live/runs?date=YYYY-MM-DD ────────────────────────────────────────
  app.get("/live/runs", plannerOnly, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { date?: string };
    const date = q.date ?? new Date().toISOString().slice(0, 10);

    const runs = await prisma.run.findMany({
      where: { companyId, plannedDate: dayRangeUtc(date, date), status: { not: "cancelled" } },
      orderBy: [{ id: "asc" }],
      select: {
        id: true, runReference: true, status: true, publishedToDriver: true,
        actualStartTime: true, actualEndTime: true, dependsOnRunId: true,
        driver: { select: { displayName: true } },
        assignments: {
          where:   { removedAt: null },
          orderBy: { sequenceNumber: "asc" },
          select: {
            id: true, status: true, quantityAssigned: true, quantityUnit: true, jobPartId: true,
            jobPart: { select: { type: true } },
            job:     { select: { id: true, jobReference: true, customerName: true, status: true } },
          },
        },
      },
    });

    // Latest custody per job part, in one query (invariant 1: the latest row per
    // part IS its current location).
    const partIds = [...new Set(runs.flatMap(r => r.assignments.map(a => a.jobPartId)))];
    const custodyRows = partIds.length > 0
      ? await prisma.loadTrack.findMany({
          where:   { companyId, jobPartId: { in: partIds }, deletedAt: null },
          orderBy: { id: "desc" },
          select:  { jobPartId: true, toCustody: true, transactionType: true, timestamp: true },
        })
      : [];
    const latestByPart = new Map<number, { toCustody: string; transactionType: string; timestamp: Date }>();
    for (const row of custodyRows) {
      if (!latestByPart.has(row.jobPartId)) latestByPart.set(row.jobPartId, row);
    }

    const board = runs.map(r => ({
      id:                r.id,
      runReference:      r.runReference,
      status:            r.status,
      publishedToDriver: r.publishedToDriver,
      driverName:        r.driver?.displayName ?? null,
      actualStartTime:   r.actualStartTime,
      actualEndTime:     r.actualEndTime,
      dependsOnRunId:    r.dependsOnRunId,
      stops: r.assignments.map(a => ({
        assignmentId:   a.id,
        executionState: a.status,
        stopType:       a.jobPart.type,
        quantity:       a.quantityAssigned != null ? Number(a.quantityAssigned) : null,
        quantityUnit:   a.quantityUnit,
        jobId:          a.job.id,
        jobReference:   a.job.jobReference,
        customerName:   a.job.customerName,
        jobStatus:      a.job.status,
        custody:        latestByPart.get(a.jobPartId) ?? null,
      })),
    }));

    return reply.send({ date, runs: board });
  });
}

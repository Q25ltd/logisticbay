import type { FastifyInstance } from "fastify";
import { PrismaClient, Prisma } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import {
  CreateJobSchema,
  PatchJobSchema,
  UpdateJobStatusSchema,
  AddJobNoteSchema,
} from "../schemas/jobs.js";
import { EVENT_TYPE_MAP } from "../sync/sync.constants.js";
import { appendPlannerReason } from "../lib/jobUtils.js";
import { createJob, patchJob } from "../services/jobService.js";
import { parseBody, parseIdParam } from "../lib/validate.js";
import { dayRangeUtc } from "../lib/dateUtils.js";
import { validateGpsPair } from "../lib/gps.js";
import { validateClientTimestamp } from "../lib/eventTimestamp.js";
import { applyJobEvent } from "../sync/applyJobEvent.js";
import { badRequest, conflict, forbidden, notFound, validationFailed } from "../lib/errors.js";

// Standard include for job detail views
const JOB_DETAIL_INCLUDE = {
  customer:    true,
  template:    true,
  stops:       { orderBy: { sequenceNumber: "asc" as const } },
  events:      { orderBy: { createdAt: "asc" as const } },
  runAssignments: {
    where:  { removedAt: null },
    select: { id: true, jobPartId: true, status: true },
  },
} satisfies Prisma.JobInclude;

type PlanningStatus = "no_stops" | "not_planned" | "partially_planned" | "planned" | "partially_done" | "done";

function computePlanningStatus(
  stops: { id?: number }[],
  assignments: { jobPartId: number; status: string }[]
): PlanningStatus {
  if (stops.length === 0) return "no_stops";
  const assignedPartIds = new Set(assignments.map((a) => a.jobPartId));
  const completedCount  = assignments.filter((a) => a.status === "completed").length;
  const assignedCount   = assignedPartIds.size;
  if (completedCount >= stops.length) return "done";
  if (completedCount > 0)             return "partially_done";
  if (assignedCount  >= stops.length) return "planned";
  if (assignedCount  > 0)             return "partially_planned";
  return "not_planned";
}

export async function jobRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /jobs — planner / driver view ─────────────────────────────────────
  app.get("/jobs", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, role, userId } = request.user!;
    const q = request.query as { date?: string; dateFrom?: string; dateTo?: string; driverId?: string; status?: string; limit?: string; cursor?: string };

    const where: Prisma.JobWhereInput = { companyId };

    // Driver filter: look up jobs via RunAssignment (driver is on Run, not Job)
    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile) return reply.send({ data: [], pagination: { limit: 200, nextCursor: null, hasNextPage: false } });
      const assignments = await prisma.runAssignment.findMany({
        where:  { companyId, removedAt: null, run: { assignedDriverId: profile.id } },
        select: { jobId: true },
        distinct: ["jobId"],
      });
      where.id = { in: assignments.map(a => a.jobId) };
    } else if (q.driverId) {
      const requestedDriverId = parseInt(q.driverId, 10);
      if (!Number.isInteger(requestedDriverId)) {
        return badRequest(reply, "BAD_REQUEST", "driverId must be a valid number");
      }
      const assignments = await prisma.runAssignment.findMany({
        where:  { companyId, removedAt: null, run: { assignedDriverId: requestedDriverId } },
        select: { jobId: true },
        distinct: ["jobId"],
      });
      where.id = { in: assignments.map(a => a.jobId) };
    }

    if (q.status) where.status = q.status;
    if (q.dateFrom && q.dateTo) {
      const { gte, lte } = dayRangeUtc(q.dateFrom, q.dateTo);
      // Primary: filter by collection stop's time window. Fallback: plannedDate for
      // legacy jobs that have plannedDate set but no stop timeWindowStart.
      where.OR = [
        { stops: { some: { type: { in: ["collection", "pickup"] }, timeWindowStart: { gte, lte } } } },
        {
          stops:       { none: { type: { in: ["collection", "pickup"] }, timeWindowStart: { not: null } } },
          plannedDate: { gte, lte },
        },
      ];
    } else if (q.date) {
      const { gte, lte } = dayRangeUtc(q.date, q.date);
      where.OR = [
        { stops: { some: { type: { in: ["collection", "pickup"] }, timeWindowStart: { gte, lte } } } },
        {
          stops:       { none: { type: { in: ["collection", "pickup"] }, timeWindowStart: { not: null } } },
          plannedDate: { gte, lte },
        },
      ];
    }

    // Pagination — cursor-based, backwards compatible (no params = max 200)
    const limit  = Math.min(parseInt(q.limit  ?? "200", 10) || 200, 200);
    const cursor = q.cursor ? parseInt(q.cursor, 10) : undefined;
    if (cursor && !Number.isInteger(cursor)) {
      return badRequest(reply, "BAD_REQUEST", "cursor must be a valid job id");
    }

    const jobs = await prisma.job.findMany({
      where,
      include: JOB_DETAIL_INCLUDE,
      orderBy: [{ plannedDate: "asc" }, { id: "asc" }],
      take:   limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNextPage = jobs.length > limit;
    const page        = hasNextPage ? jobs.slice(0, limit) : jobs;
    const nextCursor  = hasNextPage ? page[page.length - 1].id : null;

    const jobsWithStatus = page.map((job) => ({
      ...job,
      planningStatus: computePlanningStatus(job.stops ?? [], job.runAssignments ?? []),
    }));

    return reply.send({ data: jobsWithStatus, pagination: { limit, nextCursor, hasNextPage } });
  });

  // ── GET /jobs/my — driver's own jobs ──────────────────────────────────────
  app.get("/jobs/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.send({ data: [] });

    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const in7   = new Date(today);
    in7.setDate(today.getDate() + 7);

    // Find jobs for this driver via RunAssignment
    const assignments = await prisma.runAssignment.findMany({
      where: { companyId, removedAt: null, run: { assignedDriverId: profile.id } },
      select: { jobId: true },
      distinct: ["jobId"],
    });
    const jobIds = assignments.map(a => a.jobId);

    const jobs = await prisma.job.findMany({
      where: {
        companyId,
        id:     { in: jobIds },
        // Filter by collection stop time window (primary) or plannedDate fallback
        OR: [
          { stops: { some: { type: { in: ["collection", "pickup"] }, timeWindowStart: { gte: today, lt: in7 } } } },
          {
            stops:       { none: { type: { in: ["collection", "pickup"] }, timeWindowStart: { not: null } } },
            plannedDate: { gte: today, lt: in7 },
          },
        ],
        status: { not: "cancelled" },
      },
      include: {
        customer:    true,
        stops:       { orderBy: { sequenceNumber: "asc" } },
        events:      { orderBy: { createdAt: "asc" } },
        runAssignments: {
          where:  { removedAt: null },
          select: { id: true, jobPartId: true, status: true },
        },
      },
      orderBy: [{ plannedDate: "asc" }, { id: "asc" }],
    });

    // Segment by first collection stop's date (fallback: plannedDate)
    const todayStr = today.toISOString().split("T")[0];
    const getCollectDate = (job: (typeof jobs)[0]): string | null => {
      const coll = (job.stops ?? []).find(s => s.type === "collection" || s.type === "pickup");
      if (coll?.timeWindowStart) return (coll.timeWindowStart as Date).toISOString().split("T")[0];
      return job.plannedDate?.toISOString().split("T")[0] ?? null;
    };
    const todayJobs = jobs
      .filter(j => getCollectDate(j) === todayStr)
      .map((job) => ({ ...job, planningStatus: computePlanningStatus(job.stops ?? [], job.runAssignments ?? []) }));
    const upcomingJobs = jobs
      .filter(j => getCollectDate(j) !== todayStr)
      .map((job) => ({ ...job, planningStatus: computePlanningStatus(job.stops ?? [], job.runAssignments ?? []) }));

    return reply.send({ data: todayJobs, upcoming: upcomingJobs });
  });

  // ── GET /jobs/:id ─────────────────────────────────────────────────────────
  app.get("/jobs/:id", { preHandler: authenticate }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId, userId, role } = request.user!;

    const job = await prisma.job.findFirst({
      where:   { id, companyId },
      include: JOB_DETAIL_INCLUDE,
    });
    if (!job) return notFound(reply, "Job");

    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile) return forbidden(reply, "Not your job");
      const assignment = await prisma.runAssignment.findFirst({
        where: { jobId: id, companyId, removedAt: null, run: { assignedDriverId: profile.id } },
      });
      if (!assignment) return forbidden(reply, "Not your job");
    }

    return reply.send({
      ...job,
      planningStatus: computePlanningStatus(job.stops ?? [], job.runAssignments ?? []),
    });
  });

  // ── POST /jobs — create structured job ────────────────────────────────────
  app.post("/jobs", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const parsed = parseBody(CreateJobSchema, request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const { companyId, userId } = request.user!;
    const result = await createJob(prisma, { companyId, userId, body: parsed.data });
    if (!result.ok) return reply.status(result.status).send(result);
    return reply.status(201).send({ ...(result.job as object), validation: result.validation, quality: result.quality });
  });

  // ── PATCH /jobs/:id — edit structured job before execution ────────────────
  app.patch("/jobs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const parsed = parseBody(PatchJobSchema, request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const { companyId, userId } = request.user!;
    const job = await prisma.job.findFirst({
      where:   { id, companyId },
      include: { customer: true, stops: { orderBy: { sequenceNumber: "asc" } } },
    });
    if (!job) return notFound(reply, "Job");
    const result = await patchJob(prisma, { id, companyId, userId, body: parsed.data, job });
    if (!result.ok) return reply.status(result.status).send(result);
    return reply.send({ ...(result.job as object), validation: result.validation, quality: result.quality });
  });

  // ── DELETE /jobs/:id ──────────────────────────────────────────────────────
  app.delete("/jobs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId, userId } = request.user!;

    const job = await prisma.job.findFirst({ where: { id, companyId } });
    if (!job) return notFound(reply, "Job");
    if (job.status === "cancelled") return reply.status(204).send();

    const loadedTrailer = await prisma.fleetTrailer.findFirst({
      where:  { companyId, linkedJobId: id, status: "loaded" },
      select: { registration: true },
    });
    if (loadedTrailer) {
      return conflict(reply, "LOADED_TRAILER", `Loaded trailer ${loadedTrailer.registration} is still linked to this job. Replan or unload it before deleting the job.`);
    }

    // Cascade check: job assigned to active runs
    const activeAssignments = await prisma.runAssignment.findMany({
      where:  { companyId, jobId: id, removedAt: null },
      select: { run: { select: { id: true, status: true } } },
    });
    const affectedRunIds = [...new Set(activeAssignments.map(a => a.run.id))];

    await prisma.$transaction(async (tx) => {
      await tx.fleetTrailer.updateMany({
        where: { companyId, linkedJobId: id },
        data:  { linkedJobId: null },
      });
      await tx.job.update({
        where: { id },
        data: {
          status:       "cancelled",
          plannerNotes: appendPlannerReason(job.plannerNotes ?? "", "Job deleted by planner. Record kept as cancelled for audit and reporting."),
        },
      });
      await tx.jobAudit.create({
        data: {
          companyId,
          jobId:     id,
          changedBy: userId,
          action:    "deleted",
          field:     "job",
          oldValue:  { status: job.status },
          newValue:  { status: "cancelled" },
        },
      });
    });

    if (affectedRunIds.length > 0) {
      // Return 200 with warnings so the frontend can alert the planner
      return reply.status(200).send({
        cancelled: true,
        warnings:  [
          `This job was assigned to ${affectedRunIds.length} run(s) — remove it from those runs before dispatching.`,
        ],
        affectedRunIds,
      });
    }

    return reply.status(204).send();
  });

  // ── PATCH /jobs/:id/stop-times — planner edits per-stop timing ───────────
  app.patch("/jobs/:id/stop-times", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId, userId } = request.user!;
    const body = request.body as {
      stopTimes?: {
        jobPartId:                  number;
        bookedTime?:                string | null;
        earliestArrivalMinutes?:    number | null;
        unloadingAllowanceMinutes?: number | null;
      }[];
    };

    const job = await prisma.job.findFirst({ where: { id, companyId }, include: { stops: true } });
    if (!job) return notFound(reply, "Job");

    if (Array.isArray(body.stopTimes) && body.stopTimes.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const st of body.stopTimes!) {
          const patch: Record<string, unknown> = {};
          if ("bookedTime"                in st) patch.bookedTime                = st.bookedTime ? new Date(st.bookedTime) : null;
          if ("earliestArrivalMinutes"    in st) patch.earliestArrivalMinutes    = st.earliestArrivalMinutes ?? null;
          if ("unloadingAllowanceMinutes" in st) patch.unloadingAllowanceMinutes = st.unloadingAllowanceMinutes ?? null;
          if (Object.keys(patch).length > 0) {
            await tx.jobPart.updateMany({
              where: { id: st.jobPartId, jobId: id, companyId },
              data:  patch,
            });
          }
        }
        await tx.jobAudit.create({
          data: {
            companyId,
            jobId:     id,
            changedBy: userId,
            action:    "updated",
            field:     "stop_times",
            newValue:  JSON.parse(JSON.stringify(body.stopTimes)) as Prisma.InputJsonValue,
          },
        });
      });
    }

    const updated = await prisma.job.findFirst({
      where:   { id, companyId },
      include: { stops: { orderBy: { sequenceNumber: "asc" } } },
    });

    return reply.send(updated);
  });

  // ── PATCH /jobs/:id/status — driver / planner normal status path ─────────
  // Exceptional planner changes (cancel, reopen, force-close) → POST /jobs/:id/status_override (TASK 3.8).
  app.patch("/jobs/:id/status", { preHandler: authenticate }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const parsed = parseBody(UpdateJobStatusSchema, request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const body = parsed.data;
    const { companyId, userId, role } = request.user!;

    // B.5 fix: clientEventId is required — no server-generated fallback.
    if (!body.clientEventId?.trim()) {
      return badRequest(reply, "BAD_REQUEST", "clientEventId is required");
    }
    const clientEventId = body.clientEventId.trim();

    // Job must exist and belong to this company (tenant-scoped 404 before any role checks)
    const job = await prisma.job.findFirst({ where: { id, companyId } });
    if (!job) return notFound(reply, "Job");

    // Driver assignment guard (online path only — sync checks via driverProfile)
    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile) return forbidden(reply, "Not your job");
      const assignment = await prisma.runAssignment.findFirst({
        where: { jobId: id, companyId, removedAt: null, run: { assignedDriverId: profile.id } },
      });
      if (!assignment) return forbidden(reply, "Not your job");
    }

    // ready_to_plan gate: vehicle category required (planning-specific rule, not an event concern)
    if (body.status === "ready_to_plan" && !job.vehicleCategory) {
      return badRequest(reply, "VEHICLE_REQUIRED", "Vehicle type must be selected before this job can be marked as Ready to plan.");
    }

    // Timestamp and GPS validation (helpers from lib/ added in TASK 2.2)
    const tsResult = validateClientTimestamp(body.clientTimestamp ?? null);
    if (!tsResult.valid) {
      return badRequest(reply, "BAD_REQUEST", tsResult.reason);
    }
    const clientTs       = body.clientTimestamp ? tsResult.date : new Date();
    const tsNeedsReview  = body.clientTimestamp ? tsResult.needsReview  : false;
    const tsReviewReason = body.clientTimestamp ? tsResult.reviewReason : undefined;

    const gpsResult = validateGpsPair(body.gpsLat, body.gpsLng);
    if (!gpsResult.valid) {
      return badRequest(reply, "BAD_REQUEST", gpsResult.reason);
    }

    // Resolve the event type from the target status
    const eventType = EVENT_TYPE_MAP[body.status] ?? "note_added";

    // Delegate to the shared state machine
    let result: Awaited<ReturnType<typeof applyJobEvent>>;
    await prisma.$transaction(async (tx) => {
      result = await applyJobEvent(tx, {
        companyId,
        actorUserId:     userId,
        role,
        jobId:           id,
        eventType,
        clientEventId,
        clientTimestamp: clientTs,
        needsReview:     tsNeedsReview,
        reviewReason:    tsReviewReason,
        gpsLat:          body.gpsLat,
        gpsLng:          body.gpsLng,
        note:            body.note,
      });
    });

    // result is always assigned because $transaction runs synchronously w.r.t. result
    const r = result!;

    if (r.status === 'failed') {
      return badRequest(reply, "TRANSITION_FAILED", r.reason);
    }
    if (r.status === 'duplicate') {
      return reply.send({ status: r.jobStatus, id, duplicate: true });
    }
    return reply.send({ status: r.jobStatus, id });
  });

  // ── POST /jobs/:id/note ───────────────────────────────────────────────────
  app.post("/jobs/:id/note", { preHandler: authenticate }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const parsed = parseBody(AddJobNoteSchema, request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const body = parsed.data;
    const { companyId, userId } = request.user!;

    const job = await prisma.job.findFirst({ where: { id, companyId } });
    if (!job) return notFound(reply, "Job");

    await prisma.jobExecutionEvent.create({
      data: {
        jobId:           id,
        companyId,
        driverId:        userId,
        eventType:       "note_added",
        note:            body.note.trim(),
        clientEventId:   `server-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        clientTimestamp: new Date(),
      },
    });

    return reply.status(201).send({ ok: true });
  });

  // ── POST /jobs/:id/repeat ──────────────────────────────────────────────────
  // Creates a new job by copying an existing one.
  // Only the date, per-stop times/refs, and customerRef are replaced.
  // Everything else (customer, addresses, load, vehicle, etc.) copies silently.
  app.post("/jobs/:id/repeat", {
    preHandler: [authenticate, requireRole("company_owner", "planner")],
  }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId } = request.user!;

    const source = await prisma.job.findFirst({
      where:   { id, companyId },
      include: { stops: { orderBy: { sequenceNumber: "asc" } } },
    });
    if (!source) return notFound(reply, "Job");

    interface StopOverride {
      sequenceNumber:    number;
      timeWindowStart?:  string;
      timeWindowEnd?:    string;
      bookedTime?:       string;
      referenceNumber?:  string;
      bookingRef?:       string;
      quantityRequired?: number;
    }
    const body = request.body as {
      plannedDate:  string;
      customerRef?: string;
      quantity?:    number;
      weight?:      number;
      stops?:       StopOverride[];
    };

    if (!body.plannedDate) {
      return badRequest(reply, "BAD_REQUEST", "plannedDate is required");
    }

    // Block duplicate repeats: one non-cancelled copy per source job per date
    const existing = await prisma.job.findFirst({
      where: {
        companyId,
        parentJobId: id,
        plannedDate: new Date(body.plannedDate),
        status: { notIn: ["cancelled"] },
      },
      select: { id: true },
    });
    if (existing) {
      return conflict(reply, "DUPLICATE_REPEAT", `A repeat of this job already exists for ${body.plannedDate} (Job #${existing.id}). Cancel that job first if you need to replace it.`);
    }

    // Build stop overrides indexed by sequenceNumber
    const stopOverrides: Record<number, StopOverride> = {};
    if (Array.isArray(body.stops)) {
      for (const s of body.stops) stopOverrides[s.sequenceNumber] = s;
    }

    // Create the new job
    const newJob = await prisma.job.create({
      data: {
        companyId,
        createdByUserId:      request.user!.userId,
        parentJobId:          id,   // track which job this was repeated from
        customerId:           source.customerId,
        customerName:         source.customerName,
        bookingContactName:   source.bookingContactName,
        bookingContactPhone:  source.bookingContactPhone,
        bookingContactEmail:  source.bookingContactEmail,
        customerRef:          body.customerRef ?? source.customerRef,
        plannedDate:          new Date(body.plannedDate),
        goodsType:            source.goodsType,
        goodsDescription:     source.goodsDescription,
        quantity:             body.quantity != null ? body.quantity : source.quantity,
        quantityUnit:         source.quantityUnit,
        weight:               body.weight  != null ? body.weight  : source.weight,
        tempControlled:       source.tempControlled,
        hazardClass:          source.hazardClass,
        tunnelCode:           source.tunnelCode,
        vehicleCategory:      source.vehicleCategory,
        loadData:             source.loadData ?? Prisma.JsonNull,
        specialRequirements:  source.specialRequirements ?? Prisma.JsonNull,
        declaredGoodsValue:   source.declaredGoodsValue,
        purchaseOrderNumber:  source.purchaseOrderNumber,
        billingReference:     source.billingReference,
        plannerNotes:         source.plannerNotes,
        status:               "draft",
        stops: {
          create: source.stops.map(s => {
            const ov = stopOverrides[s.sequenceNumber] ?? {};
            return {
              companyId,
              sequenceNumber:   s.sequenceNumber,
              type:             s.type,
              siteName:         s.siteName,
              street:           s.street,
              addressLine2:     s.addressLine2,
              town:             s.town,
              postcode:         s.postcode,
              country:          s.country,
              savedLocationId:  s.savedLocationId,
              timeWindowStart:  ov.timeWindowStart  ? new Date(ov.timeWindowStart)  : s.timeWindowStart,
              timeWindowEnd:    ov.timeWindowEnd    ? new Date(ov.timeWindowEnd)    : s.timeWindowEnd,
              bookedTime:       ov.bookedTime       ? new Date(ov.bookedTime)       : s.bookedTime,
              referenceNumber:  ov.referenceNumber  ?? null,
              bookingRequired:  s.bookingRequired,
              bookingRef:       ov.bookingRef       ?? null,
              quantityRequired: ov.quantityRequired != null ? ov.quantityRequired : s.quantityRequired,
              contactName:      s.contactName,
              contactPhone:     s.contactPhone,
              contactEmail:     s.contactEmail,
              stopNotes:        s.stopNotes,
            };
          }),
        },
      },
      include: { stops: { orderBy: { sequenceNumber: "asc" } } },
    });

    return reply.status(201).send(newJob);
  });

}


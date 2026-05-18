import type { FastifyInstance } from "fastify";
import type { ZodType } from "zod";
import { PrismaClient, Prisma } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import {
  CreateJobSchema,
  PatchJobSchema,
  UpdateJobStatusSchema,
  AddJobNoteSchema,
} from "../schemas/jobs.js";
import { ALLOWED_JOB_TRANSITIONS, SYNC_REVIEW_RULES, EVENT_TYPE_MAP } from "../sync/sync.constants.js";
import { appendPlannerReason } from "../lib/jobUtils.js";
import { createJob, patchJob } from "../services/jobService.js";

// ── Parse helper ──────────────────────────────────────────────────────────────

function parseBody<T>(schema: ZodType<T>, body: unknown): { data: T } | { error: string; errors: string[] } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map(e => `${e.path.map(p => String(p)).join(".")}: ${e.message}`);
    return { error: errors[0] ?? "Invalid request body", errors };
  }
  return { data: result.data };
}

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
        return reply.status(400).send({ error: "driverId must be a valid number" });
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
      where.plannedDate = {
        gte: new Date(`${q.dateFrom}T00:00:00.000Z`),
        lte: new Date(`${q.dateTo}T23:59:59.999Z`),
      };
    } else if (q.date) {
      where.plannedDate = {
        gte: new Date(`${q.date}T00:00:00.000Z`),
        lt:  new Date(`${q.date}T23:59:59.999Z`),
      };
    }

    // Pagination — cursor-based, backwards compatible (no params = max 200)
    const limit  = Math.min(parseInt(q.limit  ?? "200", 10) || 200, 200);
    const cursor = q.cursor ? parseInt(q.cursor, 10) : undefined;
    if (cursor && !Number.isInteger(cursor)) {
      return reply.status(400).send({ error: "cursor must be a valid job id" });
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
        id:          { in: jobIds },
        plannedDate: { gte: today, lt: in7 },
        status:      { not: "cancelled" },
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

    const todayStr     = today.toISOString().split("T")[0];
    const datedJobs    = jobs.filter(j => j.plannedDate !== null);
    const todayJobs    = datedJobs.filter(j => j.plannedDate!.toISOString().split("T")[0] === todayStr)
      .map((job) => ({ ...job, planningStatus: computePlanningStatus(job.stops ?? [], job.runAssignments ?? []) }));
    const upcomingJobs = datedJobs.filter(j => j.plannedDate!.toISOString().split("T")[0] !== todayStr)
      .map((job) => ({ ...job, planningStatus: computePlanningStatus(job.stops ?? [], job.runAssignments ?? []) }));

    return reply.send({ data: todayJobs, upcoming: upcomingJobs });
  });

  // ── GET /jobs/:id ─────────────────────────────────────────────────────────
  app.get("/jobs/:id", { preHandler: authenticate }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId, userId, role } = request.user!;

    const job = await prisma.job.findFirst({
      where:   { id, companyId },
      include: JOB_DETAIL_INCLUDE,
    });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile) return reply.status(403).send({ error: "Not your job" });
      const assignment = await prisma.runAssignment.findFirst({
        where: { jobId: id, companyId, removedAt: null, run: { assignedDriverId: profile.id } },
      });
      if (!assignment) return reply.status(403).send({ error: "Not your job" });
    }

    return reply.send({
      ...job,
      planningStatus: computePlanningStatus(job.stops ?? [], job.runAssignments ?? []),
    });
  });

  // ── POST /jobs — create structured job ────────────────────────────────────
  app.post("/jobs", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const parsed = parseBody(CreateJobSchema, request.body);
    if ("error" in parsed) return reply.status(400).send(parsed);
    const { companyId, userId } = request.user!;
    const result = await createJob(prisma, { companyId, userId, body: parsed.data });
    if (!result.ok) return reply.status(result.status).send(result);
    return reply.status(201).send({ ...(result.job as object), validation: result.validation, quality: result.quality });
  });

  // ── PATCH /jobs/:id — edit structured job before execution ────────────────
  app.patch("/jobs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const parsed = parseBody(PatchJobSchema, request.body);
    if ("error" in parsed) return reply.status(400).send(parsed);
    const { companyId, userId } = request.user!;
    const job = await prisma.job.findFirst({
      where:   { id, companyId },
      include: { customer: true, stops: { orderBy: { sequenceNumber: "asc" } } },
    });
    if (!job) return reply.status(404).send({ error: "Job not found" });
    const result = await patchJob(prisma, { id, companyId, userId, body: parsed.data, job });
    if (!result.ok) return reply.status(result.status).send(result);
    return reply.send({ ...(result.job as object), validation: result.validation, quality: result.quality });
  });

  // ── DELETE /jobs/:id ──────────────────────────────────────────────────────
  app.delete("/jobs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId, userId } = request.user!;

    const job = await prisma.job.findFirst({ where: { id, companyId } });
    if (!job) return reply.status(404).send({ error: "Job not found" });
    if (job.status === "cancelled") return reply.status(204).send();

    const loadedTrailer = await prisma.fleetTrailer.findFirst({
      where:  { companyId, linkedJobId: id, status: "loaded" },
      select: { registration: true },
    });
    if (loadedTrailer) {
      return reply.status(409).send({
        error:   "Cannot delete a job with a loaded linked trailer",
        message: `Loaded trailer ${loadedTrailer.registration} is still linked to this job. Replan or unload it before deleting the job.`,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.fleetTrailer.updateMany({
        where: { companyId, linkedJobId: id },
        data:  { linkedJobId: null },
      });
      await tx.job.update({
        where: { id },
        data: {
          status:       "cancelled",
          plannerNotes: appendPlannerReason(job.plannerNotes, "Job deleted by planner. Record kept as cancelled for audit and reporting."),
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

    return reply.status(204).send();
  });

  // ── PATCH /jobs/:id/stop-times — planner edits per-stop timing ───────────
  app.patch("/jobs/:id/stop-times", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const { companyId, userId } = request.user!;
    const body = request.body as {
      stopTimes?: {
        stopId:                     number;
        bookedTime?:                string | null;
        earliestArrivalMinutes?:    number | null;
        unloadingAllowanceMinutes?: number | null;
      }[];
    };

    const job = await prisma.job.findFirst({ where: { id, companyId }, include: { stops: true } });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    if (Array.isArray(body.stopTimes) && body.stopTimes.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const st of body.stopTimes!) {
          const patch: Record<string, unknown> = {};
          if ("bookedTime"                in st) patch.bookedTime                = st.bookedTime ? new Date(st.bookedTime) : null;
          if ("earliestArrivalMinutes"    in st) patch.earliestArrivalMinutes    = st.earliestArrivalMinutes ?? null;
          if ("unloadingAllowanceMinutes" in st) patch.unloadingAllowanceMinutes = st.unloadingAllowanceMinutes ?? null;
          if (Object.keys(patch).length > 0) {
            await tx.jobPart.updateMany({
              where: { id: st.stopId, jobId: id, companyId },
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

  // ── PATCH /jobs/:id/status — driver updates job status ────────────────────
  app.patch("/jobs/:id/status", { preHandler: authenticate }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const parsed = parseBody(UpdateJobStatusSchema, request.body);
    if ("error" in parsed) return reply.status(400).send(parsed);
    const body = parsed.data;
    const { companyId, userId, role } = request.user!;

    const job = await prisma.job.findFirst({ where: { id, companyId } });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile) return reply.status(403).send({ error: "Not your job" });
      const assignment = await prisma.runAssignment.findFirst({
        where: { jobId: id, companyId, removedAt: null, run: { assignedDriverId: profile.id } },
      });
      if (!assignment) return reply.status(403).send({ error: "Not your job" });
    }

    const clientEventId = body.clientEventId?.trim() || `server-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const duplicateEvent = await prisma.jobExecutionEvent.findUnique({
      where: { companyId_clientEventId: { companyId, clientEventId } },
    });
    if (duplicateEvent) {
      return reply.send({ status: job.status, id, duplicate: true });
    }

    const allowed = ALLOWED_JOB_TRANSITIONS[job.status] ?? [];
    if (!allowed.includes(body.status)) {
      return reply.status(400).send({ error: `Cannot move from ${job.status} to ${body.status}` });
    }

    let clientTs = new Date();
    if (body.clientTimestamp) {
      const parsedClientTs = new Date(body.clientTimestamp);
      const parsedTime = parsedClientTs.getTime();
      if (Number.isNaN(parsedTime)) {
        return reply.status(400).send({ error: "BAD_REQUEST", message: "clientTimestamp must be a valid ISO date" });
      }
      const now = Date.now();
      if (now - parsedTime > SYNC_REVIEW_RULES.MAX_EVENT_AGE_MS) {
        return reply.status(400).send({ error: "BAD_REQUEST", message: "clientTimestamp is older than 7 days" });
      }
      if (parsedTime - now > SYNC_REVIEW_RULES.MAX_FUTURE_DRIFT_MS) {
        return reply.status(400).send({ error: "BAD_REQUEST", message: "clientTimestamp is more than 1 hour in the future" });
      }
      clientTs = parsedClientTs;
    }

    if (
      (body.gpsLat !== undefined && body.gpsLng === undefined) ||
      (body.gpsLat === undefined && body.gpsLng !== undefined)
    ) {
      return reply.status(400).send({ error: "BAD_REQUEST", message: "gpsLat and gpsLng must be provided together" });
    }

    await prisma.$transaction([
      prisma.job.update({ where: { id }, data: { status: body.status } }),
      prisma.jobExecutionEvent.create({
        data: {
          jobId:           id,
          companyId,
          driverId:        userId,
          eventType:       EVENT_TYPE_MAP[body.status] ?? "note_added",
          note:            body.note ?? "",
          clientEventId,
          clientTimestamp: clientTs,
          gpsLat:          body.gpsLat,
          gpsLng:          body.gpsLng,
        },
      }),
    ]);

    return reply.send({ status: body.status, id });
  });

  // ── POST /jobs/:id/note ───────────────────────────────────────────────────
  app.post("/jobs/:id/note", { preHandler: authenticate }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const parsed = parseBody(AddJobNoteSchema, request.body);
    if ("error" in parsed) return reply.status(400).send(parsed);
    const body = parsed.data;
    const { companyId, userId } = request.user!;

    const job = await prisma.job.findFirst({ where: { id, companyId } });
    if (!job) return reply.status(404).send({ error: "Job not found" });

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

}


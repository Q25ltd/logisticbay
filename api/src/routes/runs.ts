import type { FastifyInstance } from "fastify";
import { PrismaClient, Prisma } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { syncJobPlanningStatuses } from "../lib/jobUtils.js";

// ── Run reference generation ──────────────────────────────────────────────────
async function generateRunReference(
  companyId: number,
  year: number,
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
): Promise<string> {
  const company = await tx.company.update({
    where:  { id: companyId },
    data:   { nextRunSequence: { increment: 1 } },
    select: { nextRunSequence: true },
  });
  const seq = (company.nextRunSequence - 1).toString().padStart(6, "0");
  return `RUN-${year}-${seq}`;
}

// ── Derived requirements — recalculated whenever assignments change ────────────
async function recalculateDerivedRequirements(
  runId: number,
  companyId: number,
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
): Promise<void> {
  // Fetch all active (non-removed) assignments with their JobPart
  const activeAssignments = await tx.runAssignment.findMany({
    where:   { runId, companyId, removedAt: null },
    include: { jobPart: true },
  });

  const parts = activeAssignments.map(a => a.jobPart);

  const hasHazardous      = parts.some(p => p.hazardous);
  const hasTemperatureLoad = parts.some(p => p.tempControlled);
  const hasOversized       = parts.some(p => p.oversized);

  // Max load weight: sum of stop weights where provided
  const totalWeight = parts.reduce((sum, p) => {
    return p.stopWeight ? sum + Number(p.stopWeight) : sum;
  }, 0);
  const maxLoadWeight = totalWeight > 0 ? totalWeight : null;

  // Required trailer type: temperature wins, then hazardous, then oversized
  let requiredTrailerType: string | null = null;
  if (hasTemperatureLoad) {
    requiredTrailerType = "temperature_controlled";
  } else if (hasOversized) {
    requiredTrailerType = "curtainsider_or_flatbed";
  }

  // Required equipment: union of all handling methods from all parts
  const equipmentSet = new Set<string>();
  for (const p of parts) {
    if (Array.isArray(p.handlingMethods)) {
      for (const m of p.handlingMethods as string[]) {
        equipmentSet.add(m);
      }
    }
  }
  const requiredEquipment = equipmentSet.size > 0 ? [...equipmentSet] : null;

  await tx.run.update({
    where: { id: runId },
    data: {
      hasHazardous,
      hasTemperatureLoad,
      hasOversized,
      maxLoadWeight:      maxLoadWeight != null ? maxLoadWeight : null,
      requiredTrailerType,
      requiredEquipment:  requiredEquipment != null ? (requiredEquipment as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
}

// ── Driver conflict check ─────────────────────────────────────────────────────
// Returns the conflicting run if the driver is already assigned to a non-cancelled
// run on the same planned date (excluding the run being updated, if any).
async function findDriverConflict(
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  companyId:    number,
  driverId:     number,
  plannedDate:  Date,
  excludeRunId: number | null = null,
): Promise<{ id: number; runReference: string } | null> {
  return tx.run.findFirst({
    where: {
      companyId,
      assignedDriverId: driverId,
      plannedDate,
      status: { notIn: ["cancelled"] },
      ...(excludeRunId != null ? { id: { not: excludeRunId } } : {}),
    },
    select: { id: true, runReference: true },
  });
}

// ── Standard run include ──────────────────────────────────────────────────────
const RUN_DETAIL_INCLUDE = {
  driver: {
    include: { user: { select: { name: true, email: true } } },
  },
  assignments: {
    where:   { removedAt: null },
    orderBy: { sequenceNumber: "asc" as const },
    include: {
      jobPart: true,
      job:     {
        select: {
          id:          true,
          jobReference: true,
          customerName: true,
          plannedDate:  true,
          status:           true,
          goodsDescription: true,
          plannerNotes:     true,
        },
      },
    },
  },
} satisfies Prisma.RunInclude;

export async function runRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── POST /runs — create a new run ─────────────────────────────────────────
  app.post("/runs", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as {
      assignedDriverId?:    number | null;
      assignedTruckId?:     number | null;
      assignedTrailerId?:   number | null;
      plannedDate?:         string | null;
      estimatedStartTime?:  string | null;
      estimatedEndTime?:    string | null;
      plannerNotes?:        string;
      endInstruction?:      string | null;
      endInstructionNote?:  string | null;
      returnToBase?:        boolean;
      returnToBaseNote?:    string | null;
    };
    const { companyId, userId } = request.user!;

    const year = body.plannedDate
      ? new Date(body.plannedDate).getFullYear()
      : new Date().getFullYear();

    const plannedDate = body.plannedDate ? new Date(body.plannedDate) : null;

    let driverWarning: string | null = null;

    const run = await prisma.$transaction(async (tx) => {
      if (body.assignedDriverId != null) {
        const driver = await tx.driverProfile.findFirst({
          where: { id: body.assignedDriverId, companyId, status: "active" },
        });
        if (!driver) {
          throw Object.assign(new Error("Driver not found or inactive"), { statusCode: 400, code: "DRIVER_NOT_FOUND" });
        }

        if (plannedDate) {
          const conflict = await findDriverConflict(tx, companyId, body.assignedDriverId, plannedDate);
          if (conflict) {
            driverWarning = `Driver already has run ${conflict.runReference} on this date — make sure the times don't overlap.`;
          }
        }
      }

      const runReference = await generateRunReference(companyId, year, tx);

      return tx.run.create({
        data: {
          companyId,
          runReference,
          status:              "draft",
          assignedDriverId:    body.assignedDriverId ?? null,
          assignedTruckId:     body.assignedTruckId  ?? null,
          assignedTrailerId:   body.assignedTrailerId ?? null,
          plannedDate:         body.plannedDate ? new Date(body.plannedDate) : null,
          estimatedStartTime:  body.estimatedStartTime  ?? null,
          estimatedEndTime:    body.estimatedEndTime    ?? null,
          plannerNotes:        body.plannerNotes ?? "",
          endInstruction:      body.endInstruction ?? null,
          endInstructionNote:  body.endInstructionNote ?? null,
          returnToBase:        body.returnToBase ?? false,
          returnToBaseNote:    body.returnToBaseNote ?? null,
          createdBy:           userId,
        },
        include: RUN_DETAIL_INCLUDE,
      });
    });

    return reply.status(201).send(driverWarning ? { ...run, warning: driverWarning } : run);
  });

  // ── GET /runs — list runs ─────────────────────────────────────────────────
  app.get("/runs", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as {
      date?:     string;
      dateFrom?: string;
      dateTo?:   string;
      driverId?: string;
      status?:   string;
      limit?:    string;
      cursor?:   string;
    };

    const where: Prisma.RunWhereInput = { companyId };

    if (q.status)   where.status = q.status;
    if (q.driverId) where.assignedDriverId = parseInt(q.driverId, 10);

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

    const limit  = Math.min(parseInt(q.limit ?? "100", 10) || 100, 200);
    const cursor = q.cursor ? parseInt(q.cursor, 10) : undefined;

    const runs = await prisma.run.findMany({
      where,
      include: RUN_DETAIL_INCLUDE,
      orderBy: [{ plannedDate: "asc" }, { id: "asc" }],
      take:    limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNextPage = runs.length > limit;
    const page        = hasNextPage ? runs.slice(0, limit) : runs;
    const nextCursor  = hasNextPage ? page[page.length - 1].id : null;

    return reply.send({ data: page, pagination: { limit, nextCursor, hasNextPage } });
  });

  // ── GET /runs/:id ─────────────────────────────────────────────────────────
  app.get("/runs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId } = request.user!;

    const run = await prisma.run.findFirst({
      where:   { id, companyId },
      include: RUN_DETAIL_INCLUDE,
    });
    if (!run) return reply.status(404).send({ error: "Run not found" });

    return reply.send(run);
  });

  // ── PATCH /runs/:id — update run metadata / assignment ───────────────────
  app.patch("/runs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as {
      assignedDriverId?:            number | null;
      assignedTruckId?:             number | null;
      assignedTrailerId?:           number | null;
      plannedDate?:                 string | null;
      estimatedStartTime?:          string | null;
      estimatedEndTime?:            string | null;
      plannerNotes?:                string;
      endInstruction?:              string | null;
      endInstructionNote?:          string | null;
      returnToBase?:                boolean;
      returnToBaseNote?:            string | null;
      status?:                      string;
      compatibilityOverridden?:     boolean;
      compatibilityOverrideReason?: string | null;
    };
    const { companyId } = request.user!;

    const run = await prisma.run.findFirst({ where: { id, companyId } });
    if (!run) return reply.status(404).send({ error: "Run not found" });

    // Determine the effective driver + date after this patch (may not be changing)
    const newDriverId  = "assignedDriverId" in body ? (body.assignedDriverId ?? null) : run.assignedDriverId;
    const newDate      = "plannedDate"      in body
      ? (body.plannedDate ? new Date(body.plannedDate) : null)
      : run.plannedDate;

    // Use Record to avoid Prisma's InputType union confusion between relation and scalar forms
    const updateData: Record<string, unknown> = {};

    if ("assignedDriverId"            in body) updateData.assignedDriverId            = body.assignedDriverId   ?? null;
    if ("assignedTruckId"             in body) updateData.assignedTruckId             = body.assignedTruckId    ?? null;
    if ("assignedTrailerId"           in body) updateData.assignedTrailerId           = body.assignedTrailerId  ?? null;
    if ("plannedDate"                 in body) updateData.plannedDate                 = body.plannedDate ? new Date(body.plannedDate) : null;
    if ("estimatedStartTime"          in body) updateData.estimatedStartTime          = body.estimatedStartTime ?? null;
    if ("estimatedEndTime"            in body) updateData.estimatedEndTime            = body.estimatedEndTime   ?? null;
    if ("plannerNotes"                in body) updateData.plannerNotes                = body.plannerNotes;
    if ("endInstruction"              in body) updateData.endInstruction              = body.endInstruction     ?? null;
    if ("endInstructionNote"          in body) updateData.endInstructionNote          = body.endInstructionNote ?? null;
    if ("returnToBase"                in body) updateData.returnToBase                = body.returnToBase;
    if ("returnToBaseNote"            in body) updateData.returnToBaseNote            = body.returnToBaseNote   ?? null;
    if ("status"                      in body) updateData.status                      = body.status;
    if ("compatibilityOverridden"     in body) updateData.compatibilityOverridden     = body.compatibilityOverridden;
    if ("compatibilityOverrideReason" in body) updateData.compatibilityOverrideReason = body.compatibilityOverrideReason ?? null;

    let driverWarning: string | null = null;

    const updated = await prisma.$transaction(async (tx) => {
      // Validate driver exists and is active
      if (newDriverId != null && "assignedDriverId" in body) {
        const driver = await tx.driverProfile.findFirst({
          where: { id: newDriverId, companyId, status: "active" },
        });
        if (!driver) {
          throw Object.assign(new Error("Driver not found or inactive"), { statusCode: 400, code: "DRIVER_NOT_FOUND" });
        }
      }

      // Warn (don't block) if this driver already has another run on the same date
      if (newDriverId != null && newDate != null) {
        const conflict = await findDriverConflict(tx, companyId, newDriverId, newDate, id);
        if (conflict) {
          driverWarning = `Driver already has run ${conflict.runReference} on this date — make sure the times don't overlap.`;
        }
      }

      return tx.run.update({
        where:   { id },
        data:    updateData,
        include: RUN_DETAIL_INCLUDE,
      });
    });

    return reply.send(driverWarning ? { ...updated, warning: driverWarning } : updated);
  });

  // ── DELETE /runs/:id — cancel (non-cancelled) or hard-delete (cancelled) ──
  app.delete("/runs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId, userId } = request.user!;

    const run = await prisma.run.findFirst({ where: { id, companyId } });
    if (!run) return reply.status(404).send({ error: "Run not found" });

    if (run.status === "completed") {
      return reply.status(409).send({ error: "Cannot delete a completed run" });
    }

    if (run.status === "cancelled") {
      // Hard delete — collect job IDs before deleting so we can sync their statuses
      const affectedJobIds = (await prisma.runAssignment.findMany({
        where:  { runId: id },
        select: { jobId: true },
      })).map(a => a.jobId);

      await prisma.$transaction(async (tx) => {
        await tx.loadTrack.deleteMany({ where: { runId: id } });
        await tx.runAssignment.deleteMany({ where: { runId: id } });
        await tx.run.delete({ where: { id } });
        // After hard-delete all assignments are gone — sync affected jobs
        await syncJobPlanningStatuses([...new Set(affectedJobIds)], companyId, tx);
      });
      return reply.status(204).send();
    }

    // Not yet cancelled — soft cancel first
    const affectedJobIds = (await prisma.runAssignment.findMany({
      where:  { runId: id, companyId, removedAt: null },
      select: { jobId: true },
    })).map(a => a.jobId);

    await prisma.$transaction(async (tx) => {
      await tx.runAssignment.updateMany({
        where: { runId: id, companyId, removedAt: null },
        data:  { removedAt: new Date(), removedBy: userId, removalReason: "run_cancelled" },
      });
      await tx.run.update({
        where: { id },
        data:  { status: "cancelled" },
      });
      // Revert any in_planning/planned jobs whose last stop just got released
      await syncJobPlanningStatuses([...new Set(affectedJobIds)], companyId, tx);
    });

    return reply.status(204).send();
  });

  // ── POST /runs/:id/publish — publish run to driver ───────────────────────
  app.post("/runs/:id/publish", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId } = request.user!;

    const run = await prisma.run.findFirst({
      where:   { id, companyId },
      include: { assignments: { where: { removedAt: null } } },
    });
    if (!run) return reply.status(404).send({ error: "Run not found" });

    if (!run.assignedDriverId) {
      return reply.status(400).send({ error: "Cannot publish: no driver assigned" });
    }
    if (run.assignments.length === 0) {
      return reply.status(400).send({ error: "Cannot publish: run has no job assignments" });
    }
    if (!run.compatibilityOverridden && (!run.trailerCompatible || !run.vehicleCompatible)) {
      return reply.status(400).send({
        error:               "Cannot publish: compatibility check failed",
        trailerCompatible:   run.trailerCompatible,
        vehicleCompatible:   run.vehicleCompatible,
        overrideAllowed:     true,
      });
    }

    const updated = await prisma.run.update({
      where:   { id },
      data:    { publishedToDriver: true, status: run.status === "draft" ? "assigned" : run.status },
      include: RUN_DETAIL_INCLUDE,
    });

    return reply.send(updated);
  });

  // ── POST /runs/:id/assignments — add a JobPart to the run ────────────────
  app.post("/runs/:id/assignments", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const runId = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as {
      jobPartId:         number;
      jobId:             number;
      sequenceNumber?:   number;
      quantityAssigned?: number;
      quantityUnit?:     string;
      notes?:            string;
    };
    const { companyId, userId } = request.user!;

    if (!body.jobPartId || !body.jobId) {
      return reply.status(400).send({ error: "jobPartId and jobId are required" });
    }

    const run = await prisma.run.findFirst({ where: { id: runId, companyId } });
    if (!run) return reply.status(404).send({ error: "Run not found" });

    if (run.status === "completed" || run.status === "cancelled") {
      return reply.status(400).send({ error: `Cannot add assignments to a ${run.status} run` });
    }

    // Verify JobPart and Job belong to this company
    const [jobPart, job] = await Promise.all([
      prisma.jobPart.findFirst({ where: { id: body.jobPartId, companyId } }),
      prisma.job.findFirst({ where: { id: body.jobId, companyId } }),
    ]);
    if (!jobPart) return reply.status(400).send({ error: "JobPart not found" });
    if (!job)    return reply.status(400).send({ error: "Job not found" });
    if (jobPart.jobId !== body.jobId) return reply.status(400).send({ error: "JobPart does not belong to this Job" });

    // Check for existing active assignment of this JobPart on any run
    const existingAssignment = await prisma.runAssignment.findFirst({
      where: { jobPartId: body.jobPartId, companyId, removedAt: null },
    });
    if (existingAssignment) {
      return reply.status(409).send({
        error:              "This job part is already assigned to a run",
        existingRunId:      existingAssignment.runId,
        existingAssignmentId: existingAssignment.id,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Determine sequence number
      let sequenceNumber = body.sequenceNumber;
      if (sequenceNumber == null) {
        const maxSeq = await tx.runAssignment.aggregate({
          where:  { runId, removedAt: null },
          _max:   { sequenceNumber: true },
        });
        sequenceNumber = (maxSeq._max.sequenceNumber ?? 0) + 1;
      }

      const assignment = await tx.runAssignment.create({
        data: {
          companyId,
          runId,
          jobPartId:        body.jobPartId,
          jobId:            body.jobId,
          sequenceNumber,
          quantityAssigned: body.quantityAssigned ?? 0,
          quantityUnit:     body.quantityUnit ?? "",
          status:           "pending",
          addedBy:          userId,
          notes:            body.notes ?? null,
        },
        include: { jobPart: true, job: { select: { id: true, jobReference: true, customerName: true, status: true } } },
      });

      await recalculateDerivedRequirements(runId, companyId, tx);
      // Advance job to in_planning now it has at least one active run assignment
      await syncJobPlanningStatuses([body.jobId], companyId, tx);

      return assignment;
    });

    return reply.status(201).send(result);
  });

  // ── PATCH /runs/:id/assignments/:assignmentId — update an assignment ──────
  app.patch("/runs/:id/assignments/:assignmentId", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const runId        = parseInt((request.params as { id: string; assignmentId: string }).id, 10);
    const assignmentId = parseInt((request.params as { id: string; assignmentId: string }).assignmentId, 10);
    const body = request.body as {
      sequenceNumber?:   number;
      quantityAssigned?: number;
      quantityUnit?:     string;
      status?:           string;
      notes?:            string | null;
    };
    const { companyId } = request.user!;

    const assignment = await prisma.runAssignment.findFirst({
      where: { id: assignmentId, runId, companyId, removedAt: null },
    });
    if (!assignment) return reply.status(404).send({ error: "Assignment not found" });

    // Sequence number change: swap with whoever currently holds the target number
    if (body.sequenceNumber != null && body.sequenceNumber !== assignment.sequenceNumber) {
      const target = body.sequenceNumber;
      const incumbent = await prisma.runAssignment.findFirst({
        where: { runId, sequenceNumber: target, removedAt: null },
      });

      await prisma.$transaction(async (tx) => {
        if (incumbent) {
          // Swap: move incumbent to a temp sequence, then assign target to this, then temp→old
          const tempSeq = -assignmentId; // guaranteed unique negative sentinel
          await tx.runAssignment.update({ where: { id: incumbent.id },  data: { sequenceNumber: tempSeq } });
          await tx.runAssignment.update({ where: { id: assignmentId },  data: { sequenceNumber: target } });
          await tx.runAssignment.update({ where: { id: incumbent.id },  data: { sequenceNumber: assignment.sequenceNumber } });
        } else {
          await tx.runAssignment.update({ where: { id: assignmentId }, data: { sequenceNumber: target } });
        }
      });
    }

    const updated = await prisma.runAssignment.update({
      where: { id: assignmentId },
      data: {
        ...(body.quantityAssigned != null ? { quantityAssigned: body.quantityAssigned } : {}),
        ...(body.quantityUnit     != null ? { quantityUnit:     body.quantityUnit }     : {}),
        ...(body.status           != null ? { status:           body.status }           : {}),
        ...(body.notes !== undefined      ? { notes:            body.notes }            : {}),
      },
      include: { jobPart: true, job: { select: { id: true, jobReference: true, customerName: true, status: true } } },
    });

    return reply.send(updated);
  });

  // ── DELETE /runs/:id/assignments/:assignmentId — remove assignment ─────────
  app.delete("/runs/:id/assignments/:assignmentId", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const runId        = parseInt((request.params as { id: string; assignmentId: string }).id, 10);
    const assignmentId = parseInt((request.params as { id: string; assignmentId: string }).assignmentId, 10);
    const body = request.body as { reason?: string } | undefined;
    const { companyId, userId } = request.user!;

    const assignment = await prisma.runAssignment.findFirst({
      where: { id: assignmentId, runId, companyId, removedAt: null },
    });
    if (!assignment) return reply.status(404).send({ error: "Assignment not found" });

    await prisma.$transaction(async (tx) => {
      await tx.runAssignment.update({
        where: { id: assignmentId },
        data: {
          removedAt:      new Date(),
          removedBy:      userId,
          removalReason:  body?.reason ?? null,
        },
      });
      await recalculateDerivedRequirements(runId, companyId, tx);
      // Revert job to ready_to_plan if this was its last active assignment
      await syncJobPlanningStatuses([assignment.jobId], companyId, tx);
    });

    return reply.status(204).send();
  });

  // ── POST /runs/:id/assignments/resequence — reorder all at once ───────────
  app.post("/runs/:id/assignments/resequence", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const runId = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as { order: number[] }; // array of assignmentIds in desired order
    const { companyId } = request.user!;

    const run = await prisma.run.findFirst({ where: { id: runId, companyId } });
    if (!run) return reply.status(404).send({ error: "Run not found" });

    if (!Array.isArray(body.order) || body.order.length === 0) {
      return reply.status(400).send({ error: "order must be a non-empty array of assignment ids" });
    }

    // Verify all ids belong to this run
    const activeAssignments = await prisma.runAssignment.findMany({
      where:  { runId, companyId, removedAt: null },
      select: { id: true },
    });
    const activeIds = new Set(activeAssignments.map(a => a.id));
    if (!body.order.every(id => activeIds.has(id))) {
      return reply.status(400).send({ error: "order contains invalid or inactive assignment ids" });
    }

    // Apply new sequence in a transaction using temp negative values to avoid unique conflicts
    await prisma.$transaction(async (tx) => {
      // Step 1: move all to negative temps
      for (let i = 0; i < body.order.length; i++) {
        await tx.runAssignment.update({
          where: { id: body.order[i] },
          data:  { sequenceNumber: -(i + 1) },
        });
      }
      // Step 2: move to final positive values
      for (let i = 0; i < body.order.length; i++) {
        await tx.runAssignment.update({
          where: { id: body.order[i] },
          data:  { sequenceNumber: i + 1 },
        });
      }
    });

    const updated = await prisma.run.findFirst({
      where:   { id: runId, companyId },
      include: RUN_DETAIL_INCLUDE,
    });

    return reply.send(updated);
  });
}

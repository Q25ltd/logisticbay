import type { FastifyInstance } from "fastify";
import { parseBody, parseIdParam } from "../lib/validate.js";
import type { TxClient } from "../lib/types.js";
import { dayRangeUtc } from "../lib/dateUtils.js";
import { PrismaClient, Prisma } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { syncJobPlanningStatuses } from "../lib/jobUtils.js";
import { cancelRun, guardDriverReassignment, dependencyFeedStatus, recalculateDerivedRequirements, partQuantityLedger, ledgerBreakdownText, CustodyDisposition } from "../services/runService.js";
import { RUN_STATUSES, type RunStatus } from "../sync/runStatuses.js";
import { badRequest, conflict, notFound, validationFailed } from "../lib/errors.js";
import { recomputeRunCompatibility, validateFleetAssignment } from "../lib/runCompatibility.js";
import { loadRunReadiness } from "../services/runReadinessService.js";
import { computeRunCandidates } from "../services/runCandidatesService.js";
import { SplitRunSchema } from "../schemas/runs.js";

// ── Run reference generation ──────────────────────────────────────────────────
async function generateRunReference(
  companyId: number,
  year: number,
  tx: TxClient,
): Promise<string> {
  const company = await tx.company.update({
    where:  { id: companyId },
    data:   { nextRunSequence: { increment: 1 } },
    select: { nextRunSequence: true },
  });
  const seq = (company.nextRunSequence - 1).toString().padStart(6, "0");
  return `RUN-${year}-${seq}`;
}

// ── Driver conflict check ─────────────────────────────────────────────────────
// Returns the conflicting run if the driver is already assigned to a non-cancelled
// run on the same planned date (excluding the run being updated, if any).
async function findDriverConflict(
  tx: TxClient,
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

      // Step 5: validate truck/trailer belong to this company before creating.
      if (body.assignedTruckId != null || body.assignedTrailerId != null) {
        const fv = await validateFleetAssignment(tx, companyId, body.assignedTruckId ?? null, body.assignedTrailerId ?? null);
        if (!fv.ok) throw Object.assign(new Error(fv.message!), { statusCode: 400, code: fv.code });
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
      where.plannedDate = dayRangeUtc(q.dateFrom, q.dateTo);
    } else if (q.date) {
      where.plannedDate = dayRangeUtc(q.date, q.date);
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
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId } = request.user!;

    const run = await prisma.run.findFirst({
      where:   { id, companyId },
      include: RUN_DETAIL_INCLUDE,
    });
    if (!run) return notFound(reply, "Run");

    return reply.send(run);
  });

  // ── GET /runs/:id/readiness — B1: resource readiness + publish gate ───────
  app.get("/runs/:id/readiness", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId } = request.user!;

    const loaded = await loadRunReadiness(prisma, companyId, id);
    if (!loaded) return notFound(reply, "Run");

    // Assigned-asset labels so the Runs table can render Driver/Trailer/Vehicle
    // columns from this one call (Run has no truck/trailer relation to include).
    return reply.send({
      ...loaded.readiness,
      assigned: loaded.assigned,
    });
  });

  // ── GET /runs/:id/candidates — B4: available + suitable assets to allocate ─
  app.get("/runs/:id/candidates", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId } = request.user!;

    const run = await prisma.run.findFirst({
      where:   { id, companyId },
      select:  { id: true, plannedDate: true, estimatedStartTime: true, estimatedEndTime: true, assignedDriverId: true, assignments: { where: { removedAt: null }, select: { jobId: true } } },
    });
    if (!run) return notFound(reply, "Run");

    const arr = (v: unknown): string[] | null =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
    const jobIds = [...new Set(run.assignments.map(a => a.jobId))];

    const [trailers, trucks, driverRows, jobs, otherRuns] = await Promise.all([
      prisma.fleetTrailer.findMany({ where: { companyId, status: { notIn: ["disposed"] } }, select: { id: true, registration: true, trailerType: true, bodyType: true, status: true, linkedJobId: true }, orderBy: { registration: "asc" } }),
      prisma.fleetUnit.findMany({ where: { companyId, status: { notIn: ["disposed"] } }, select: { id: true, registration: true, gvwClass: true, status: true }, orderBy: { registration: "asc" } }),
      prisma.driverProfile.findMany({ where: { companyId }, select: { id: true, displayName: true, status: true, licenceClass: true, canDriveCategories: true, adrAllowed: true, canUseTrailer: true, trailerTypesAllowed: true, preferredShiftHours: true, defaultTruckReg: true }, orderBy: { displayName: "asc" } }),
      jobIds.length ? prisma.job.findMany({ where: { companyId, id: { in: jobIds } }, select: { hazardClass: true, tempControlled: true, vehicleCategory: true, bodyTypes: true, trailersAllowed: true } }) : Promise.resolve([]),
      run.plannedDate
        ? prisma.run.findMany({ where: { companyId, plannedDate: run.plannedDate, status: { notIn: ["cancelled"] }, id: { not: id } }, select: { runReference: true, assignedDriverId: true, assignedTruckId: true, assignedTrailerId: true } })
        : Promise.resolve([]),
    ]);

    // Busy = assigned to another non-cancelled run on the same date.
    const busy = { trailers: {} as Record<number, string>, trucks: {} as Record<number, string>, drivers: {} as Record<number, string> };
    for (const r of otherRuns) {
      if (r.assignedTrailerId) busy.trailers[r.assignedTrailerId] = r.runReference;
      if (r.assignedTruckId)   busy.trucks[r.assignedTruckId]     = r.runReference;
      if (r.assignedDriverId)  busy.drivers[r.assignedDriverId]   = r.runReference;
    }

    // Planned run duration from estimated start/end ("HH:MM") — theoretical, for
    // the shift-fit check only. No live hours here (that's the Live phase).
    const toMin = (t?: string | null) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    const sMin = toMin(run.estimatedStartTime), eMin = toMin(run.estimatedEndTime);
    const runDurationHours = sMin != null && eMin != null && eMin > sMin ? (eMin - sMin) / 60 : null;

    // Driver↔vehicle attachment: the assigned driver's usual unit + which driver
    // each unit usually belongs to (so picking someone else's is a visible choice).
    const usualDriverByReg: Record<string, string> = {};
    for (const d of driverRows) {
      const reg = (d.defaultTruckReg ?? "").trim().toUpperCase();
      if (reg) usualDriverByReg[reg] = d.displayName;
    }
    const assignedDriver = run.assignedDriverId ? driverRows.find(d => d.id === run.assignedDriverId) : null;

    const ctx = {
      hazardous:      jobs.some(j => !!(j.hazardClass && j.hazardClass.trim())),
      tempControlled: jobs.some(j => j.tempControlled),
      needsTrailer:   jobs.some(j => ["artic", "tractor", "drawbar"].includes((j.vehicleCategory ?? "").toLowerCase())),
      // ALL acceptable bodies across the run's loads — the trailer must match ANY (not just the first).
      // Tractor/artic jobs carry their allowed trailer bodies in `trailersAllowed`
      // (bodyTypes is the rigid's own body) — reading only bodyTypes left the
      // trailer check empty and let a flatbed pass for a fridge-only job.
      acceptableBodyTypes: [...new Set(jobs.flatMap(j => [...(arr(j.bodyTypes) ?? []), ...(arr(j.trailersAllowed) ?? [])]))],
      runDurationHours,
      runJobIds: jobIds,
      assignedDriverUsualReg: assignedDriver?.defaultTruckReg ?? null,
      usualDriverByReg,
    };

    const candidates = computeRunCandidates(ctx, {
      trailers,
      trucks,
      drivers: driverRows.map(d => ({ ...d, canDriveCategories: arr(d.canDriveCategories), trailerTypesAllowed: arr(d.trailerTypesAllowed), preferredShiftHours: d.preferredShiftHours })),
    }, busy);

    return reply.send(candidates);
  });

  // ── POST /runs/:id/split — split an over-capacity load into a second run ──
  // This run keeps `keepQuantity`; the remainder of each over-size stop moves to
  // a NEW split run. Stays one Job (PRODUCT #2 — splitting distributes quantity
  // across RunAssignments, not new Jobs); the quantity ledger stays balanced.
  app.post("/runs/:id/split", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId, userId } = request.user!;
    const parsedSplit = parseBody(SplitRunSchema, request.body);
    if (!parsedSplit.ok) return validationFailed(reply, parsedSplit.errors);
    const keep = parsedSplit.data.keepQuantity;

    const outcome = await prisma.$transaction(async (tx) => {
      const run = await tx.run.findFirst({
        where:  { id, companyId },
        select: {
          id: true, runReference: true, plannedDate: true,
          assignments: { where: { removedAt: null }, select: { id: true, jobPartId: true, jobId: true, quantityAssigned: true, quantityUnit: true, sequenceNumber: true } },
        },
      });
      if (!run) return { kind: "notfound" as const };

      const toMove = run.assignments
        .map(a => ({ a, qty: Number(a.quantityAssigned) }))
        .filter(x => x.qty > keep);
      if (toMove.length === 0) return { kind: "nothing" as const };

      const year   = (run.plannedDate ?? new Date()).getUTCFullYear();
      const newRef = await generateRunReference(companyId, year, tx);
      const newRun = await tx.run.create({
        data: {
          companyId, runReference: newRef, status: "draft", runType: "split",
          plannedDate: run.plannedDate, plannerNotes: `Split from ${run.runReference}`, createdBy: userId,
        },
        select: { id: true },
      });

      for (const { a, qty } of toMove) {
        await tx.runAssignment.update({ where: { id: a.id }, data: { quantityAssigned: keep } });
        await tx.runAssignment.create({
          data: {
            companyId, runId: newRun.id, jobPartId: a.jobPartId, jobId: a.jobId,
            sequenceNumber: a.sequenceNumber, quantityAssigned: qty - keep,
            quantityUnit: a.quantityUnit ?? "", status: "not_started", addedBy: userId,
          },
        });
      }

      await recalculateDerivedRequirements(run.id, companyId, tx);
      await recalculateDerivedRequirements(newRun.id, companyId, tx);
      return { kind: "ok" as const, newRunId: newRun.id, moved: toMove.length };
    });

    if (outcome.kind === "notfound") return notFound(reply, "Run");
    if (outcome.kind === "nothing")  return badRequest(reply, "NOTHING_TO_SPLIT", `No load on this run carries more than ${keep} — there is nothing to move to a second run. Lower the "keep" amount below the largest assigned quantity.`);

    const [original, newRun] = await Promise.all([
      prisma.run.findFirst({ where: { id, companyId }, include: RUN_DETAIL_INCLUDE }),
      prisma.run.findFirst({ where: { id: outcome.newRunId, companyId }, include: RUN_DETAIL_INCLUDE }),
    ]);
    return reply.send({ run: original, newRun });
  });

  // ── PATCH /runs/:id — update run metadata / assignment ───────────────────
  app.patch("/runs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
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
    const { companyId, userId } = request.user!;

    const run = await prisma.run.findFirst({ where: { id, companyId } });
    if (!run) return notFound(reply, "Run");

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
    if ("status" in body) {
      if (!RUN_STATUSES.includes(body.status as RunStatus)) {
        return badRequest(reply, "INVALID_RUN_STATUS", `status must be one of: ${RUN_STATUSES.join(", ")}`);
      }
      updateData.status = body.status;
    }
    if ("compatibilityOverridden"     in body) updateData.compatibilityOverridden     = body.compatibilityOverridden;
    if ("compatibilityOverrideReason" in body) updateData.compatibilityOverrideReason = body.compatibilityOverrideReason ?? null;

    const warnings: string[] = [];
    const vehicleChanged = "assignedTruckId" in body || "assignedTrailerId" in body;

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

      // S12 (B10): changing the driver on a run that has custody is refused;
      // with no custody, started assignments reset to not_started (audited).
      if ("assignedDriverId" in body && run.assignedDriverId != null && (body.assignedDriverId ?? null) !== run.assignedDriverId) {
        await guardDriverReassignment(tx, {
          runId: id, companyId, actorUserId: userId,
          oldDriverId: run.assignedDriverId, newDriverId: body.assignedDriverId ?? null,
        });
      }

      // Step 5: validate truck/trailer belong to this company (status → warning).
      if (vehicleChanged) {
        const fv = await validateFleetAssignment(
          tx, companyId,
          "assignedTruckId"   in body ? (body.assignedTruckId   ?? null) : undefined,
          "assignedTrailerId" in body ? (body.assignedTrailerId ?? null) : undefined,
        );
        if (!fv.ok) throw Object.assign(new Error(fv.message!), { statusCode: 400, code: fv.code });
        warnings.push(...fv.warnings);
      }

      // Warn (don't block) if this driver already has another run on the same date
      if (newDriverId != null && newDate != null) {
        const conflict = await findDriverConflict(tx, companyId, newDriverId, newDate, id);
        if (conflict) {
          warnings.push(`Driver already has run ${conflict.runReference} on this date — make sure the times don't overlap.`);
        }
      }

      // Warn (don't block) on same-day double-booking of the truck or trailer —
      // sequenced reuse is legitimate, but never silent.
      const newTruckId   = "assignedTruckId"   in body ? (body.assignedTruckId   ?? null) : run.assignedTruckId;
      const newTrailerId = "assignedTrailerId" in body ? (body.assignedTrailerId ?? null) : run.assignedTrailerId;
      if (newDate != null && (newTruckId != null || newTrailerId != null)) {
        const clashes = await tx.run.findMany({
          where: {
            companyId, plannedDate: newDate, status: { notIn: ["cancelled"] }, id: { not: id },
            OR: [
              ...(newTruckId   != null ? [{ assignedTruckId:   newTruckId }] : []),
              ...(newTrailerId != null ? [{ assignedTrailerId: newTrailerId }] : []),
            ],
          },
          select: { runReference: true, assignedTruckId: true, assignedTrailerId: true },
        });
        for (const c of clashes) {
          if (newTruckId   != null && c.assignedTruckId   === newTruckId)   warnings.push(`Truck is already on run ${c.runReference} that day.`);
          if (newTrailerId != null && c.assignedTrailerId === newTrailerId) warnings.push(`Trailer is already on run ${c.runReference} that day.`);
        }
      }

      // Warn immediately when the trailer being pinned is full with a different job
      // (publish will hard-block on it — tell the planner NOW, not at publish).
      if ("assignedTrailerId" in body && body.assignedTrailerId != null) {
        const t = await tx.fleetTrailer.findFirst({
          where: { id: body.assignedTrailerId, companyId },
          select: { registration: true, status: true, linkedJobId: true },
        });
        if (t && (t.status ?? "").toLowerCase() === "loaded") {
          const ourJobs = await tx.runAssignment.findMany({ where: { runId: id, removedAt: null }, select: { jobId: true } });
          const loadedWithOurs = t.linkedJobId != null && ourJobs.some(a => a.jobId === t.linkedJobId);
          if (!loadedWithOurs) {
            warnings.push(`Trailer ${t.registration} is loaded${t.linkedJobId != null ? " with another job" : ""} — it's full. Publish will be blocked.`);
          }
        }
      }

      await tx.run.update({ where: { id }, data: updateData });

      // Step 5: recompute compatibility if the truck/trailer changed.
      if (vehicleChanged) await recomputeRunCompatibility(tx, id, companyId);

      return (await tx.run.findFirst({ where: { id }, include: RUN_DETAIL_INCLUDE }))!;
    });

    return reply.send(warnings.length ? { ...updated, warning: warnings.join(" ") } : updated);
  });

  // ── DELETE /runs/:id — cancel (non-cancelled) or hard-delete (cancelled) ──
  app.delete("/runs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId, userId } = request.user!;

    const run = await prisma.run.findFirst({ where: { id, companyId } });
    if (!run) return notFound(reply, "Run");

    if (run.status === "completed") {
      return conflict(reply, "CONFLICT", "Cannot delete a completed run");
    }

    if (run.status === "cancelled") {
      // Run already cancelled — hard-delete the Run shell and its soft-deleted assignments.
      // RunAssignment rows were already soft-deleted by cancelRun() — their audit info
      //   (removedAt, removedBy, removalReason) is captured. We must hard-delete them here
      //   because RunAssignment.runId is NOT NULL with no CASCADE, so deleting the Run
      //   without removing child rows first causes a FK constraint error (bug fix).
      // LoadTrack rows: PRESERVED — no deleteMany here; deletedAt available via TASK 4.3.
      await prisma.$transaction(async (tx) => {
        await tx.runAssignment.deleteMany({ where: { runId: id } });
        await tx.run.deleteMany({ where: { id, companyId } });
      });
      return reply.status(204).send();
    }

    // Not yet cancelled — delegate to shared cancelRun service. S12 (B14): when a
    // load's latest custody is on this run's vehicle, the body must carry a
    // custodyDisposition or cancelRun throws CUSTODY_DISPOSITION_REQUIRED (409).
    const delBody = (request.body ?? {}) as { custodyDisposition?: CustodyDisposition; dispositionYardRef?: string };
    await prisma.$transaction(async (tx) => {
      await cancelRun(tx, {
        runId: id, companyId, actorUserId: userId, reason: "run_cancelled",
        custodyDisposition: delBody.custodyDisposition,
        dispositionYardRef: delBody.dispositionYardRef,
      });
    });

    return reply.status(204).send();
  });

  // ── POST /runs/:id/publish — publish run to driver ───────────────────────
  app.post("/runs/:id/publish", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId } = request.user!;

    const run = await prisma.run.findFirst({
      where:   { id, companyId },
      include: { assignments: { where: { removedAt: null } } },
    });
    if (!run) return notFound(reply, "Run");

    if (!run.assignedDriverId) {
      return badRequest(reply, "BAD_REQUEST", "Cannot publish: no driver assigned");
    }
    if (run.assignments.length === 0) {
      return badRequest(reply, "BAD_REQUEST", "Cannot publish: run has no job assignments");
    }
    if (!run.compatibilityOverridden && (!run.trailerCompatible || !run.vehicleCompatible)) {
      return badRequest(reply, "COMPATIBILITY_FAILED", "Cannot publish: compatibility check failed", { trailerCompatible: run.trailerCompatible, vehicleCompatible: run.vehicleCompatible, overrideAllowed: true });
    }

    // S13 — dependency lock (invariant 8): a dependent relay leg cannot be
    // published before its feeding leg has produced the load (drop/swap/offer).
    const feed = await dependencyFeedStatus(prisma, { runId: id, companyId });
    if (!feed.fed) {
      return conflict(reply, "DEPENDENCY_NOT_READY",
        `Cannot publish: this run waits on ${feed.feedingRunReference ?? `run ${feed.dependsOnRunId}`} — the load has not been dropped, swapped, or offered yet.`);
    }

    // B5 — hard resource gate: publish is refused while any HARD readiness check
    // fails (driver inactive, no ADR on hazmat, not trailer-rated, missing trailer…).
    // Soft/unknown checks never block; the S5 compat override is honoured inside.
    const loaded = await loadRunReadiness(prisma, companyId, id);
    if (loaded && !loaded.readiness.ready) {
      return badRequest(reply, "RESOURCE_NOT_READY",
        `Cannot publish: ${loaded.readiness.blockers.join(" · ") || "run is not ready"}`,
        { blockers: loaded.readiness.blockers });
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
    const runId = parseIdParam(request.params);
    if (runId === null) return badRequest(reply, "BAD_REQUEST", "runId must be a valid integer");
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
      return badRequest(reply, "BAD_REQUEST", "jobPartId and jobId are required");
    }

    const run = await prisma.run.findFirst({ where: { id: runId, companyId } });
    if (!run) return notFound(reply, "Run");

    if (run.status === "completed" || run.status === "cancelled") {
      return badRequest(reply, "INVALID_RUN_STATUS", `Cannot add assignments to a ${run.status} run`);
    }

    // Verify JobPart and Job belong to this company
    const [jobPart, job] = await Promise.all([
      prisma.jobPart.findFirst({ where: { id: body.jobPartId, companyId } }),
      prisma.job.findFirst({ where: { id: body.jobId, companyId } }),
    ]);
    if (!jobPart) return badRequest(reply, "BAD_REQUEST", "JobPart not found");
    if (!job)    return badRequest(reply, "BAD_REQUEST", "Job not found");
    if (jobPart.jobId !== body.jobId) return badRequest(reply, "BAD_REQUEST", "JobPart does not belong to this Job");

    // Quantity ledger: a part may sit on SEVERAL runs (split / multi-trip —
    // same driver, several trips) as long as the shares never exceed the
    // form-born total and the same run doesn't get the part twice.
    const dupOnThisRun = await prisma.runAssignment.findFirst({
      where: { jobPartId: body.jobPartId, runId, companyId, removedAt: null },
    });
    if (dupOnThisRun) return conflict(reply, "ALREADY_ON_RUN", "This stop is already on this run");

    const ledger = await partQuantityLedger(prisma, companyId, body.jobPartId);
    if (!ledger) return badRequest(reply, "BAD_REQUEST", "JobPart not found");
    if (ledger.total == null && ledger.breakdown.length > 0) {
      // No quantity to apportion — a second assignment would just duplicate the stop.
      return conflict(reply, "ALREADY_ASSIGNED", `This stop is already on ${ledger.breakdown[0].runReference} and has no quantity to split.`);
    }
    if (ledger.total != null && (ledger.remaining ?? 0) <= 0) {
      return conflict(reply, "FULLY_ASSIGNED", `All ${ledger.total} ${job.quantityUnit || "units"} of this stop are already on runs (${ledgerBreakdownText(ledger)}).`);
    }
    const requestedQty = body.quantityAssigned ?? ledger.remaining ?? Number(jobPart.quantityRequired ?? job.quantity ?? 0);
    if (ledger.total != null && requestedQty > (ledger.remaining ?? 0)) {
      return badRequest(reply, "OVER_ASSIGNED", `Only ${ledger.remaining} of ${ledger.total} ${job.quantityUnit || "units"} remain unassigned (${ledgerBreakdownText(ledger)}) — cannot assign ${requestedQty}.`);
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
          // Share = requested amount, else the unassigned REMAINDER (so a
          // second trip automatically takes what's left of the load).
          quantityAssigned: requestedQty,
          quantityUnit:     body.quantityUnit ?? jobPart.quantityUnit ?? job.quantityUnit ?? "",
          status:           "not_started",   // EXECUTION_STATES initial (Step 1)
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
    const runId        = parseIdParam(request.params);
    if (runId === null) return badRequest(reply, "BAD_REQUEST", "runId must be a valid integer");
    const assignmentId = parseIdParam(request.params, "assignmentId");
    if (assignmentId === null) return badRequest(reply, "BAD_REQUEST", "assignmentId must be a valid integer");
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
    if (!assignment) return notFound(reply, "Assignment");

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
    const runId        = parseIdParam(request.params);
    if (runId === null) return badRequest(reply, "BAD_REQUEST", "runId must be a valid integer");
    const assignmentId = parseIdParam(request.params, "assignmentId");
    if (assignmentId === null) return badRequest(reply, "BAD_REQUEST", "assignmentId must be a valid integer");
    const body = request.body as { reason?: string } | undefined;
    const { companyId, userId } = request.user!;

    const assignment = await prisma.runAssignment.findFirst({
      where: { id: assignmentId, runId, companyId, removedAt: null },
    });
    if (!assignment) return notFound(reply, "Assignment");

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
    const runId = parseIdParam(request.params);
    if (runId === null) return badRequest(reply, "BAD_REQUEST", "runId must be a valid integer");
    const body = request.body as { order: number[] }; // array of assignmentIds in desired order
    const { companyId } = request.user!;

    const run = await prisma.run.findFirst({ where: { id: runId, companyId } });
    if (!run) return notFound(reply, "Run");

    if (!Array.isArray(body.order) || body.order.length === 0) {
      return badRequest(reply, "BAD_REQUEST", "order must be a non-empty array of assignment ids");
    }

    // Verify all ids belong to this run
    const activeAssignments = await prisma.runAssignment.findMany({
      where:  { runId, companyId, removedAt: null },
      select: { id: true },
    });
    const activeIds = new Set(activeAssignments.map(a => a.id));
    if (!body.order.every(id => activeIds.has(id))) {
      return badRequest(reply, "BAD_REQUEST", "order contains invalid or inactive assignment ids");
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

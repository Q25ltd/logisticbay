import type { FastifyInstance } from "fastify";
import { PrismaClient, Prisma } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { ALL_TRUCK_KEYS, TRAILER_CHECK_KEYS } from "../constants.js";
import { generateShiftPDF } from "../pdf.js";

import { validateSegmentChecks, validateCreateSegment } from "../validation.js";
import type {
  CreateShiftBody,
  CreateSegmentBody,
  CreateDeliveryBody,
  SubmitShiftBody,
} from "../types/requests.js";
import {
  CreateShiftSchema,
  CreateSegmentSchema,
  CreateDeliverySchema,
  SubmitShiftSchema,
} from "../schemas/shifts.js";
import { parseBody, parseIdParam } from "../lib/validate.js";
import { normalizeShiftVehicleClass } from "../lib/vehicleCompat.js";
import { badRequest, conflict, forbidden, notFound, validationFailed } from "../lib/errors.js";

export async function shiftRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── POST /shifts ────────────────────────────────────────────────────────────
  app.post("/shifts", { preHandler: authenticate }, async (request, reply) => {
    const parsed = parseBody(CreateShiftSchema, request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const body = parsed.data as CreateShiftBody;
    const { userId, companyId } = request.user!;

    const driver = await prisma.user.findUnique({
      where:   { id: userId },
      include: { memberships: { include: { company: true }, take: 1 } },
    });
    if (!driver) return notFound(reply, "Driver");

    const shift = await prisma.shift.create({
      data: {
        companyId,
        driverId:   userId,
        driverName: driver.name,
        shiftDate:  body.shiftDate ? new Date(body.shiftDate) : new Date(),
        startTime:  body.startTime ?? "",
        status:     "draft",
      },
    });

    app.log.info({ shiftId: shift.id, driverId: userId }, "Shift created");
    return reply.status(201).send({ id: shift.id, status: shift.status });
  });

  // ── POST /shifts/:id/segments ───────────────────────────────────────────────
  app.post("/shifts/:id/segments", { preHandler: authenticate }, async (request, reply) => {
    const shiftId = parseIdParam(request.params);
    if (shiftId === null) return badRequest(reply, "BAD_REQUEST", "shiftId must be a valid integer");
    const zodParsed = parseBody(CreateSegmentSchema, request.body);
    if (!zodParsed.ok) return validationFailed(reply, zodParsed.errors);
    const body    = zodParsed.data as CreateSegmentBody;
    const { userId, companyId } = request.user!;

    const segValidation = validateCreateSegment(body);
    if (!segValidation.valid) {
      return validationFailed(reply, segValidation.errors);
    }

    const shift = await prisma.shift.findFirst({
      where:   { id: shiftId, companyId, driverId: userId, status: "draft" },
      include: { segments: { orderBy: { segmentNumber: "asc" } } },
    });
    if (!shift) return notFound(reply, "Shift or not in draft");

    const truckErrors = validateSegmentChecks(body.truckChecks ?? [], ALL_TRUCK_KEYS, "truckChecks");
    if (truckErrors.length) return validationFailed(reply, truckErrors);

    if (body.trailerReg && body.trailerChecks) {
      const trailerErrors = validateSegmentChecks(body.trailerChecks, TRAILER_CHECK_KEYS, "trailerChecks");
      if (trailerErrors.length) return validationFailed(reply, trailerErrors);
    }

    const prevSegment = shift.segments[shift.segments.length - 1];
    if (prevSegment && !prevSegment.endTime) {
      await prisma.shiftSegment.update({
        where: { id: prevSegment.id },
        data: {
          endTime: new Date(),
          ...(body.prevOdometerEnd != null ? { odometerEnd: body.prevOdometerEnd } : {}),
        },
      });
    }

    const segmentNumber = shift.segments.length + 1;
    const odometerStart = body.odometerStart != null
      ? body.odometerStart
      : prevSegment?.odometerStart ?? 0;

    const segment = await prisma.shiftSegment.create({
      data: {
        companyId,
        shiftId,
        segmentNumber,
        vehicleClass:      normalizeShiftVehicleClass(body.vehicleClass),
        needsTruckCheck:   body.needsTruckCheck   ?? true,
        needsTrailerCheck: body.needsTrailerCheck ?? true,
        truckReg:          body.truckReg.trim().toUpperCase(),
        trailerReg:        body.trailerReg?.trim().toUpperCase() ?? null,
        odometerStart,
        truckChecks:       (body.truckChecks ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
        trailerChecks:     (body.trailerReg ? (body.trailerChecks ?? Prisma.JsonNull) : Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
        startTime:         new Date(),
      },
    });

    const isFailed = (c: { result?: string; ok?: boolean }) => c.result === "fail" || c.ok === false;
    const failedTruck   = (body.truckChecks   ?? []).filter(isFailed).map(c => c.key);
    const failedTrailer = (body.trailerChecks ?? []).filter(isFailed).map(c => c.key);

    if (failedTruck.length || failedTrailer.length) {
      app.log.warn({ failedTruck, failedTrailer, shiftId }, "Segment has failed checks");
    }

    return reply.status(201).send({
      segmentId:     segment.id,
      segmentNumber: segment.segmentNumber,
      hasDefects:    failedTruck.length > 0 || failedTrailer.length > 0,
      failedItems:   { truck: failedTruck, trailer: failedTrailer },
    });
  });

  // ── POST /shifts/:id/segments/:segId/deliveries ─────────────────────────────
  app.post("/shifts/:id/segments/:segId/deliveries", { preHandler: authenticate }, async (request, reply) => {
    const shiftId   = parseIdParam(request.params);
    if (shiftId === null) return badRequest(reply, "BAD_REQUEST", "shiftId must be a valid integer");
    const segmentId = parseIdParam(request.params, "segId");
    if (segmentId === null) return badRequest(reply, "BAD_REQUEST", "segmentId must be a valid integer");
    const zodParsed = parseBody(CreateDeliverySchema, request.body);
    if (!zodParsed.ok) return validationFailed(reply, zodParsed.errors);
    const body      = zodParsed.data as CreateDeliveryBody;
    const { userId, companyId } = request.user!;

    const segment = await prisma.shiftSegment.findFirst({
      where: { id: segmentId, shiftId, shift: { companyId, driverId: userId } },
    });
    if (!segment) return notFound(reply, "Segment");

    const delivery = await prisma.deliveryTask.create({
      data: {
        companyId,
        shiftId,
        segmentId,
        materials:   body.materials   ?? "",
        collectFrom: body.collectFrom ?? "",
        deliverTo:   body.deliverTo   ?? "",
        ticketNo:    body.ticketNo    ?? "",
        startTime:   body.startTime   ?? "",
        finishTime:  body.finishTime  ?? "",
        hours:       body.hours       ?? "",
        mileage:     body.mileage     ?? "",
        tonnes:      body.tonnes      ?? "",
        kgs:         body.kgs         ?? "",
        notes:       body.notes       ?? "",
        loadType:    body.loadType    ?? "weight",
        pallets:     body.pallets     ?? "",
      },
    });

    return reply.status(201).send({ id: delivery.id });
  });

  // ── PATCH /shifts/:id/submit ────────────────────────────────────────────────
  app.patch("/shifts/:id/submit", { preHandler: authenticate }, async (request, reply) => {
    const shiftId = parseIdParam(request.params);
    if (shiftId === null) return badRequest(reply, "BAD_REQUEST", "shiftId must be a valid integer");
    const zodParsed = parseBody(SubmitShiftSchema, request.body);
    if (!zodParsed.ok) return validationFailed(reply, zodParsed.errors);
    const body    = zodParsed.data as SubmitShiftBody;
    const { userId, companyId } = request.user!;

    const shift = await prisma.shift.findFirst({
      where:   { id: shiftId, companyId, driverId: userId, status: "draft" },
      include: {
        segments: { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        driver:   { select: { name: true } },
        company:  { select: { name: true } },
      },
    });
    if (!shift) return notFound(reply, "Shift or already submitted");

    // Spare drivers have no segments — that is valid, skip the segment close-out
    const lastSeg = shift.segments[shift.segments.length - 1];
    if (lastSeg) {
      await prisma.shiftSegment.update({
        where: { id: lastSeg.id },
        data: {
          endTime:     new Date(),
          odometerEnd: body.odometerEnd ?? null,
          notes:       body.segmentNotes ?? lastSeg.notes,
        },
      });
    }

    // Write shift fields + outbox job atomically (B.1 fix).
    // The worker drains the outbox idempotently with retries.
    await prisma.$transaction(async (tx) => {
      await tx.shift.updateMany({
        where: { id: shiftId, companyId },
        data: {
          nightOut:    body.nightOut    ?? false,
          expenses:    body.expenses    ?? "",
          delaysNote:  body.delaysNote  ?? "",
          defectsNote: body.defectsNote ?? "",
          endTime:     body.endTime     ?? "",
          totalHours:  body.totalHours  ?? "",
          breakMins:   body.breakMins   ? String(body.breakMins) : "",
          poaMins:     body.poaMins     ? String(body.poaMins)   : "",
          fuelDrawn:   body.fuelDrawn   ?? "",
          adBlueDrawn: body.adBlueDrawn ?? "",
          status:      "submitted",
          submittedAt: new Date(),
        },
      });
      await tx.shiftSubmitJob.create({ data: { shiftId, companyId } });
    });

    app.log.info({ shiftId }, "Shift queued for processing");
    reply.status(200).send({ status: "queued", id: shiftId });
  });

  // ── POST /shifts/:id/retry — re-trigger PDF+email for failed shifts ─────────
  app.post("/shifts/:id/retry", { preHandler: authenticate }, async (request, reply) => {
    const { userId, companyId } = request.user!;
    const shiftId = parseIdParam(request.params);
    if (shiftId === null) return badRequest(reply, "BAD_REQUEST", "shiftId must be a valid integer");

    const shift = await prisma.shift.findFirst({
      where:   { id: shiftId, companyId, driverId: userId, status: "failed" },
      include: {
        segments: { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        company:  { select: { name: true } },
        driver:   { select: { name: true } },
      },
    });
    if (!shift) return notFound(reply, "Shift or not in failed state");

    // Re-enqueue via the same outbox so the worker processes it with retries
    await prisma.$transaction(async (tx) => {
      await tx.shift.updateMany({ where: { id: shiftId, companyId }, data: { status: "submitted" } });
      await tx.shiftSubmitJob.create({ data: { shiftId, companyId } });
    });
    reply.status(202).send({ status: "retrying", id: shiftId });
  });

  // ── GET /shifts ─────────────────────────────────────────────────────────────
  app.get("/shifts", { preHandler: authenticate }, async (request, reply) => {
    const { userId, companyId, role } = request.user!;
    const q = request.query as { limit?: string; offset?: string; status?: string };

    const limit  = Math.min(parseInt(q.limit  ?? "50", 10), 100);
    const offset = Math.max(parseInt(q.offset ?? "0",  10), 0);

    const where = {
      companyId,
      ...(role === "driver" ? { driverId: userId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };

    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take:    limit,
        skip:    offset,
        include: {
          segments: { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        },
      }),
      prisma.shift.count({ where }),
    ]);

    return reply.send({
      data: shifts,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  });

  // ── GET /shifts/:id ─────────────────────────────────────────────────────────
  app.get("/shifts/:id", { preHandler: authenticate }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { userId, companyId, role } = request.user!;

    const shift = await prisma.shift.findFirst({
      where: { id, companyId, ...(role === "driver" ? { driverId: userId } : {}) },
      include: {
        segments: { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        company:  { select: { name: true } },
        driver:   { select: { name: true } },
      },
    });

    if (!shift) return notFound(reply, "Shift");
    return reply.send(shift);
  });

  // ── GET /shifts/:id/pdf ─────────────────────────────────────────────────────
  app.get("/shifts/:id/pdf", { preHandler: authenticate }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { userId, companyId, role } = request.user!;

    const shift = await prisma.shift.findFirst({
      where: { id, companyId, ...(role === "driver" ? { driverId: userId } : {}) },
      include: {
        segments: { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        company:  { select: { name: true } },
        driver:   { select: { name: true } },
      },
    });

    if (!shift) return notFound(reply, "Shift");

    try {
      const pdfBuffer = await generateShiftPDF(shift as any);
      const filename  = `shift-report-${shift.id}-${new Date(shift.shiftDate).toISOString().split("T")[0]}.pdf`;
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .header("Content-Length", pdfBuffer.length)
        .send(pdfBuffer);
    } catch (err) {
      app.log.error(err, "PDF generation failed");
      return reply.status(500).send({ error: "Failed to generate PDF" });
    }
  });

  // ── DELETE /shifts/:id — soft delete ─────────────────────────────────────
  // Admin: can delete any shift in their company.
  // Driver: can only delete their own completed shifts.
  app.delete(
    "/shifts/:id",
    { preHandler: [authenticate, requireRole("company_owner", "driver")] },
    async (request, reply) => {
      const id   = parseIdParam(request.params);
      if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
      const user = request.user!;

      const shift = await prisma.shift.findFirst({ where: { id, companyId: user.companyId } });
      if (!shift)                     return notFound(reply, "Shift");
      if (shift.status === "deleted") return conflict(reply, "CONFLICT", "Already deleted");

      if (user.role === "driver") {
        if (shift.driverId !== user.userId)                return forbidden(reply, "Not your shift");
        if (!["draft", "failed"].includes(shift.status))   return forbidden(reply, "Only draft or failed shifts can be deleted");
      }

      await prisma.shift.updateMany({ where: { id, companyId: user.companyId }, data: { status: "deleted" } });
      app.log.info({ id, deletedBy: user.role }, "Shift soft-deleted");
      return reply.send({ status: "deleted", id });
    }
  );


  // ── DEV: reset all shifts for testing ─────────────────────────────────────
  app.delete("/dev/reset-shifts", { preHandler: [authenticate, requireRole("company_owner")] }, async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      return notFound(reply, "Not found");
    }
    const { companyId } = request.user!;
    await prisma.shift.updateMany({ where: { companyId }, data: { status: "deleted" } });
    return reply.send({ ok: true });
  });
}

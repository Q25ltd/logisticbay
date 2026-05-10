import type { FastifyInstance } from "fastify";
import { PrismaClient, Prisma } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { ALL_TRUCK_KEYS, TRAILER_CHECK_KEYS } from "../constants.js";
import { generateShiftPDF } from "../pdf.js";
import { sendShiftReportEmail } from "../email.js";
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
import { parseBody } from "../lib/validate.js";

function normalizeShiftVehicleClass(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "van") return "van";
  if (text === "rigid" || /^class\s*2$/.test(text)) return "rigid";
  if (text === "tractor" || text === "artic" || /^class\s*1$/.test(text)) return "tractor";
  return "tractor";
}

export async function shiftRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── POST /shifts ────────────────────────────────────────────────────────────
  app.post("/shifts", { preHandler: authenticate }, async (request, reply) => {
    const parsed = parseBody(CreateShiftSchema, request.body);
    if (!parsed.ok) return reply.status(400).send({ error: "Validation failed", details: parsed.errors });
    const body = parsed.data as CreateShiftBody;
    const { userId, companyId } = request.user!;

    const driver = await prisma.user.findUnique({
      where:   { id: userId },
      include: { memberships: { include: { company: true }, take: 1 } },
    });
    if (!driver) return reply.status(404).send({ error: "Driver not found" });

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
    const shiftId = parseInt((request.params as { id: string }).id, 10);
    const zodParsed = parseBody(CreateSegmentSchema, request.body);
    if (!zodParsed.ok) return reply.status(400).send({ error: "Validation failed", details: zodParsed.errors });
    const body    = zodParsed.data as CreateSegmentBody;
    const { userId, companyId } = request.user!;

    const segValidation = validateCreateSegment(body);
    if (!segValidation.valid) {
      return reply.status(400).send({ error: "Validation failed", details: segValidation.errors });
    }

    const shift = await prisma.shift.findFirst({
      where:   { id: shiftId, companyId, driverId: userId, status: "draft" },
      include: { segments: { orderBy: { segmentNumber: "asc" } } },
    });
    if (!shift) return reply.status(404).send({ error: "Shift not found or not in draft" });

    const truckErrors = validateSegmentChecks(body.truckChecks ?? [], ALL_TRUCK_KEYS, "truckChecks");
    if (truckErrors.length) return reply.status(400).send({ error: "Validation failed", details: truckErrors });

    if (body.trailerReg && body.trailerChecks) {
      const trailerErrors = validateSegmentChecks(body.trailerChecks, TRAILER_CHECK_KEYS, "trailerChecks");
      if (trailerErrors.length) return reply.status(400).send({ error: "Validation failed", details: trailerErrors });
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
    const shiftId   = parseInt((request.params as { id: string; segId: string }).id, 10);
    const segmentId = parseInt((request.params as { id: string; segId: string }).segId, 10);
    const zodParsed = parseBody(CreateDeliverySchema, request.body);
    if (!zodParsed.ok) return reply.status(400).send({ error: "Validation failed", details: zodParsed.errors });
    const body      = zodParsed.data as CreateDeliveryBody;
    const { userId, companyId } = request.user!;

    const segment = await prisma.shiftSegment.findFirst({
      where: { id: segmentId, shiftId, shift: { companyId, driverId: userId } },
    });
    if (!segment) return reply.status(404).send({ error: "Segment not found" });

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
    const shiftId = parseInt((request.params as { id: string }).id, 10);
    const zodParsed = parseBody(SubmitShiftSchema, request.body);
    if (!zodParsed.ok) return reply.status(400).send({ error: "Validation failed", details: zodParsed.errors });
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
    if (!shift) return reply.status(404).send({ error: "Shift not found or already submitted" });

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

    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
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
      include: {
        segments: { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        company:  { select: { name: true } },
        driver:   { select: { name: true } },
      },
    });

    app.log.info({ shiftId }, "Shift submitted");
    reply.status(200).send({ status: "submitted", id: shiftId });

    // Background: PDF + email + working time update
    setImmediate(async () => {
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generateShiftPDF(updatedShift as any);
      } catch (err) {
        app.log.error({ err, shiftId }, "PDF generation failed — shift marked failed");
        await prisma.shift.update({ where: { id: shiftId }, data: { status: "failed" } }).catch(() => {});
        return;
      }

      // Email is best-effort — a failure here must NOT mark the shift as failed
      try {
        const company = await prisma.company.findUnique({ where: { id: updatedShift.companyId } });
        if (company?.reportEmailEnabled !== false) {
          const recipientEmail = company?.reportEmail || undefined;
          await sendShiftReportEmail({ shift: updatedShift as any, pdfBuffer, recipientEmail });
        }
      } catch (err) {
        app.log.error({ err, shiftId }, "Shift email failed — shift still marked completed");
      }

      await prisma.shift.update({ where: { id: shiftId }, data: { status: "completed" } });

      try {
        const shiftData = await prisma.shift.findUnique({ where: { id: shiftId } });
        if (shiftData?.startTime && shiftData?.endTime) {
          const [sh, sm] = shiftData.startTime.split(":").map(Number);
          const [eh, em] = shiftData.endTime.split(":").map(Number);
          const breakMins  = parseInt(shiftData.breakMins || "0", 10);
          const poaMins    = parseInt(shiftData.poaMins   || "0", 10);
          const totalHours = Math.max(0, ((eh * 60 + em) - (sh * 60 + sm) - breakMins - poaMins) / 60);

          const weekStart = new Date(shiftData.shiftDate);
          const day  = weekStart.getDay();
          const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
          weekStart.setDate(diff);
          weekStart.setHours(0, 0, 0, 0);

          const profile = await prisma.driverProfile.findFirst({
            where: { companyId: shiftData.companyId, userId: shiftData.driverId },
          });

          if (profile) {
            await prisma.driverWorkingTimeSummary.upsert({
              where: { driverProfileId_weekStartDate: { driverProfileId: profile.id, weekStartDate: weekStart } },
              update: { totalHours: { increment: totalHours }, shiftCount: { increment: 1 } },
              create: { companyId: shiftData.companyId, driverProfileId: profile.id, weekStartDate: weekStart, totalHours, shiftCount: 1 },
            });
          }
        }
      } catch (e) { app.log.error({ err: e }, "Working time update failed"); }

      app.log.info({ shiftId }, "Shift completed");
    });
  });

  // ── POST /shifts/:id/retry — re-trigger PDF+email for failed shifts ─────────
  app.post("/shifts/:id/retry", { preHandler: authenticate }, async (request, reply) => {
    const { userId, companyId } = request.user!;
    const shiftId = parseInt((request.params as { id: string }).id, 10);

    const shift = await prisma.shift.findFirst({
      where:   { id: shiftId, companyId, driverId: userId, status: "failed" },
      include: {
        segments: { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        company:  { select: { name: true } },
        driver:   { select: { name: true } },
      },
    });
    if (!shift) return reply.status(404).send({ error: "Shift not found or not in failed state" });

    await prisma.shift.update({ where: { id: shiftId }, data: { status: "submitted" } });
    reply.status(202).send({ status: "retrying", id: shiftId });

    setImmediate(async () => {
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generateShiftPDF(shift as any);
      } catch (err) {
        app.log.error({ err, shiftId }, "Retry PDF generation failed");
        await prisma.shift.update({ where: { id: shiftId }, data: { status: "failed" } }).catch(() => {});
        return;
      }

      try {
        const company = await prisma.company.findUnique({ where: { id: shift.companyId } });
        if (company?.reportEmailEnabled !== false) {
          const recipientEmail = company?.reportEmail || undefined;
          await sendShiftReportEmail({ shift: shift as any, pdfBuffer, recipientEmail });
        }
      } catch (err) {
        app.log.error({ err, shiftId }, "Retry email failed — shift still marked completed");
      }

      await prisma.shift.update({ where: { id: shiftId }, data: { status: "completed" } });
      app.log.info({ shiftId }, "Shift retry succeeded");
    });
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
    const id = parseInt((request.params as { id: string }).id, 10);
    const { userId, companyId, role } = request.user!;

    const shift = await prisma.shift.findFirst({
      where: { id, companyId, ...(role === "driver" ? { driverId: userId } : {}) },
      include: {
        segments: { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        company:  { select: { name: true } },
        driver:   { select: { name: true } },
      },
    });

    if (!shift) return reply.status(404).send({ error: "Shift not found" });
    return reply.send(shift);
  });

  // ── GET /shifts/:id/pdf ─────────────────────────────────────────────────────
  app.get("/shifts/:id/pdf", { preHandler: authenticate }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { userId, companyId, role } = request.user!;

    const shift = await prisma.shift.findFirst({
      where: { id, companyId, ...(role === "driver" ? { driverId: userId } : {}) },
      include: {
        segments: { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        company:  { select: { name: true } },
        driver:   { select: { name: true } },
      },
    });

    if (!shift) return reply.status(404).send({ error: "Shift not found" });

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
      const id   = parseInt((request.params as { id: string }).id, 10);
      const user = request.user!;

      const shift = await prisma.shift.findFirst({ where: { id, companyId: user.companyId } });
      if (!shift)                     return reply.status(404).send({ error: "Shift not found" });
      if (shift.status === "deleted") return reply.status(409).send({ error: "Already deleted" });

      if (user.role === "driver") {
        if (shift.driverId !== user.userId)                return reply.status(403).send({ error: "Not your shift" });
        if (!["draft", "failed"].includes(shift.status))   return reply.status(403).send({ error: "Only draft or failed shifts can be deleted" });
      }

      await prisma.shift.update({ where: { id }, data: { status: "deleted" } });
      app.log.info({ id, deletedBy: user.role }, "Shift soft-deleted");
      return reply.send({ status: "deleted", id });
    }
  );

  // ── Auto-cleanup ────────────────────────────────────────────────────────────
  async function autoCleanupOldShifts() {
    try {
      const now = Date.now();

      // Soft-delete draft and failed shifts older than 14 days
      const cutoff14 = new Date(now - 14 * 24 * 60 * 60 * 1000);
      const result14 = await prisma.shift.updateMany({
        where: {
          createdAt: { lt: cutoff14 },
          status: { in: ["draft", "failed"] },
        },
        data: { status: "deleted" },
      });
      if (result14.count > 0) {
        app.log.info({ count: result14.count }, "Auto-soft-deleted draft/failed shifts older than 14 days");
      }

      // Soft-delete completed and submitted shifts older than 33 days
      const cutoff33 = new Date(now - 33 * 24 * 60 * 60 * 1000);
      const result33 = await prisma.shift.updateMany({
        where: {
          createdAt: { lt: cutoff33 },
          status: { in: ["completed", "submitted"] },
        },
        data: { status: "deleted" },
      });
      if (result33.count > 0) {
        app.log.info({ count: result33.count }, "Auto-soft-deleted completed/submitted shifts older than 33 days");
      }
    } catch (err) {
      app.log.error(err, "Auto-cleanup failed");
    }
  }

  autoCleanupOldShifts();
  setInterval(autoCleanupOldShifts, 24 * 60 * 60 * 1000);

  // ── DEV: reset all shifts for testing ─────────────────────────────────────
  app.delete("/dev/reset-shifts", { preHandler: [authenticate, requireRole("company_owner")] }, async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.status(404).send({ error: "Not found" });
    }
    const { companyId } = request.user!;
    await prisma.shift.updateMany({ where: { companyId }, data: { status: "deleted" } });
    return reply.send({ ok: true });
  });
}

import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { ALL_TRUCK_KEYS, TRAILER_CHECK_KEYS } from "../constants.js";
import { generateShiftPDF } from "../pdf.js";
import { sendShiftReportEmail } from "../email.js";

function validateChecks(checks: any[], allowedKeys: string[], name: string): string[] {
  const errors: string[] = [];
  if (!Array.isArray(checks)) { errors.push(`${name} must be an array`); return errors; }
  checks.forEach((c, i) => {
    if (!allowedKeys.includes(c.key)) errors.push(`${name}[${i}]: unknown key "${c.key}"`);
    // Accept both old boolean ok and new three-state result field
    const isFail = c.result === "fail" || c.ok === false;
    if (isFail && !c.note?.trim()) errors.push(`${name}[${i}]: note required when check fails (${c.key})`);
  });
  return errors;
}

export async function shiftRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── POST /shifts ────────────────────────────────────────────────────────────

  app.post("/shifts", { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as any;
    const { userId, companyId } = request.user!;

    const driver = await prisma.user.findUnique({
      where:   { id: userId },
      include: { memberships: { include: { company: true }, take: 1 } },
    });
    if (!driver) return reply.status(404).send({ error: "Driver not found" });

    const shift = await prisma.shift.create({
      data: {
        companyId,
        driverId:        userId,
        driverName:      driver.name,
        shiftDate:       body.shiftDate ? new Date(body.shiftDate) : new Date(),
        startTime:       body.startTime   ?? "",
        status:          "draft",
      },
    });

    app.log.info({ shiftId: shift.id, driverId: userId }, "Shift created");
    return reply.status(201).send({ id: shift.id, status: shift.status });
  });

  // ── POST /shifts/:id/segments ───────────────────────────────────────────────

  app.post("/shifts/:id/segments", { preHandler: authenticate }, async (request, reply) => {
    const shiftId = parseInt((request.params as any).id, 10);
    const body    = request.body as any;
    const { userId, companyId } = request.user!;

    const shift = await prisma.shift.findFirst({
      where:   { id: shiftId, companyId, driverId: userId, status: "draft" },
      include: { segments: { orderBy: { segmentNumber: "asc" } } },
    });
    if (!shift) return reply.status(404).send({ error: "Shift not found or not in draft" });

    // Validate truck checks
    const truckErrors = validateChecks(body.truckChecks ?? [], ALL_TRUCK_KEYS, "truckChecks");
    if (truckErrors.length) return reply.status(400).send({ error: "Validation failed", details: truckErrors });

    // Validate trailer checks if provided
    if (body.trailerReg && body.trailerChecks) {
      const trailerErrors = validateChecks(body.trailerChecks, TRAILER_CHECK_KEYS, "trailerChecks");
      if (trailerErrors.length) return reply.status(400).send({ error: "Validation failed", details: trailerErrors });
    }

    // Close previous segment if open
    const prevSegment = shift.segments[shift.segments.length - 1];
    if (prevSegment && !prevSegment.endTime) {
      await prisma.shiftSegment.update({
        where: { id: prevSegment.id },
        data: {
          endTime:     new Date(),
          // Only update odometerEnd if provided (truck change) — trailer change skips this
          ...(body.prevOdometerEnd != null ? { odometerEnd: body.prevOdometerEnd } : {}),
        },
      });
    }

    const segmentNumber = shift.segments.length + 1;

    // odometerStart:
    // - If truck changed: use the value sent from mobile
    // - If trailer only changed: carry over from previous segment's start (truck didn't move)
    // - First segment: use value sent
    const odometerStart = body.odometerStart != null
      ? body.odometerStart
      : prevSegment?.odometerStart ?? 0;

    const segment = await prisma.shiftSegment.create({
      data: {
        shiftId,
        segmentNumber,
        vehicleClass:      body.vehicleClass      ?? "class1",
        needsTruckCheck:   body.needsTruckCheck   ?? true,
        needsTrailerCheck: body.needsTrailerCheck ?? true,
        truckReg:      body.truckReg.trim().toUpperCase(),
        trailerReg:    body.trailerReg?.trim().toUpperCase() ?? null,
        odometerStart,
        truckChecks:   body.truckChecks,
        trailerChecks: body.trailerReg ? (body.trailerChecks ?? null) : null,
        startTime:     new Date(),
      },
    });

    const isFailed = (c: any) => c.result === "fail" || c.ok === false;
    const failedTruck   = (body.truckChecks   ?? []).filter(isFailed).map((c: any) => c.key);
    const failedTrailer = (body.trailerChecks ?? []).filter(isFailed).map((c: any) => c.key);

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
    const shiftId   = parseInt((request.params as any).id, 10);
    const segmentId = parseInt((request.params as any).segId, 10);
    const body      = request.body as any;
    const { userId, companyId } = request.user!;

    const segment = await prisma.shiftSegment.findFirst({
      where: { id: segmentId, shiftId, shift: { companyId, driverId: userId } },
    });
    if (!segment) return reply.status(404).send({ error: "Segment not found" });

    const delivery = await prisma.deliveryTask.create({
      data: {
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
    const shiftId = parseInt((request.params as any).id, 10);
    const body    = request.body as any;
    const { userId, companyId } = request.user!;

    const shift = await prisma.shift.findFirst({
      where:   { id: shiftId, companyId, driverId: userId, status: "draft" },
      include: {
        segments:  { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        company:   { select: { name: true } },
        driver:    { select: { name: true } },
      },
    });
    if (!shift)                  return reply.status(404).send({ error: "Shift not found or already submitted" });
    if (!shift.segments.length)  return reply.status(400).send({ error: "Shift has no segments" });

    // Close final segment
    const lastSeg = shift.segments[shift.segments.length - 1];
    await prisma.shiftSegment.update({
      where: { id: lastSeg.id },
      data: {
        endTime:     new Date(),
        odometerEnd: body.odometerEnd ?? null,
        notes:       body.segmentNotes ?? lastSeg.notes,
      },
    });

    // Save end-of-shift summary
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
        fuelDrawn:   body.fuelDrawn   ?? "",
        adBlueDrawn: body.adBlueDrawn ?? "",
        status:      "submitted",
        submittedAt: new Date(),
      },
      include: {
        segments:  { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        company:   { select: { name: true } },
        driver:    { select: { name: true } },
      },
    });

    app.log.info({ shiftId }, "Shift submitted");
    reply.status(200).send({ status: "submitted", id: shiftId });

    // Background: PDF + email
    setImmediate(async () => {
      try {
        const pdfBuffer = await generateShiftPDF(updatedShift as any);
        const company = await prisma.company.findUnique({ where: { id: updatedShift.companyId } });
        if (company?.reportEmailEnabled !== false) {
          const recipientEmail = company?.reportEmail || undefined;
          await sendShiftReportEmail({ shift: updatedShift as any, pdfBuffer, recipientEmail });
        }
        await prisma.shift.update({ where: { id: shiftId }, data: { status: "completed" } });
        app.log.info({ shiftId }, "Shift PDF sent and marked completed");
      } catch (err) {
        app.log.error({ err, shiftId }, "Failed to send shift report");
        await prisma.shift.update({ where: { id: shiftId }, data: { status: "failed" } }).catch(() => {});
      }
    });
  });

  // ── GET /shifts ─────────────────────────────────────────────────────────────

  app.get("/shifts", { preHandler: authenticate }, async (request, reply) => {
    const { userId, companyId, role } = request.user!;
    const q = request.query as { limit?: string; offset?: string; status?: string };

    const limit  = Math.min(parseInt(q.limit  ?? "50", 10), 100);
    const offset = Math.max(parseInt(q.offset ?? "0",  10), 0);

    const where: any = {
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
          segments: {
            include: { deliveries: true },
            orderBy: { segmentNumber: "asc" },
          },
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
    const id = parseInt((request.params as any).id, 10);
    const { userId, companyId, role } = request.user!;

    const shift = await prisma.shift.findFirst({
      where: { id, companyId, ...(role === "driver" ? { driverId: userId } : {}) },
      include: {
        segments:  { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        company:   { select: { name: true } },
        driver:    { select: { name: true } },
      },
    });

    if (!shift) return reply.status(404).send({ error: "Shift not found" });
    return reply.send(shift);
  });

  // ── GET /shifts/:id/pdf ─────────────────────────────────────────────────────

  app.get("/shifts/:id/pdf", { preHandler: authenticate }, async (request, reply) => {
    const id = parseInt((request.params as any).id, 10);
    const { userId, companyId, role } = request.user!;

    const shift = await prisma.shift.findFirst({
      where: { id, companyId, ...(role === "driver" ? { driverId: userId } : {}) },
      include: {
        segments:  { include: { deliveries: true }, orderBy: { segmentNumber: "asc" } },
        company:   { select: { name: true } },
        driver:    { select: { name: true } },
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

  // ── DELETE /shifts/:id ──────────────────────────────────────────────────────

  // ── DELETE /shifts/:id — admin only ────────────────────────────────────────
  app.delete(
    "/shifts/:id",
    { preHandler: [authenticate, requireRole("company_admin")] },
    async (request, reply) => {
      const id    = parseInt((request.params as any).id, 10);
      const shift = await prisma.shift.findFirst({ where: { id, companyId: request.user!.companyId } });
      if (!shift)                     return reply.status(404).send({ error: "Shift not found" });
      if (shift.status === "deleted") return reply.status(409).send({ error: "Already deleted" });
      await prisma.shift.update({ where: { id }, data: { status: "deleted" } });
      app.log.info({ id }, "Shift deleted by admin");
      return reply.send({ status: "deleted", id });
    }
  );

  // ── Auto-cleanup: delete shifts older than 90 days ─────────────────────────
  // Run once on startup, then every 24 hours
  async function autoCleanupOldShifts() {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const result = await prisma.shift.updateMany({
        where: {
          createdAt: { lt: cutoff },
          status:    { not: "deleted" },
        },
        data: { status: "deleted" },
      });
      if (result.count > 0) {
        app.log.info({ count: result.count }, "Auto-deleted shifts older than 90 days");
      }
    } catch (err) {
      app.log.error(err, "Auto-cleanup failed");
    }
  }

  // Run cleanup on startup and every 24 hours
  autoCleanupOldShifts();
  setInterval(autoCleanupOldShifts, 24 * 60 * 60 * 1000);
}

import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { validateHolidayRequest, validatePatchHoliday } from "../validation.js";
import type {
  SetAvailabilityBody,
  SetShiftPreferenceBody,
  HolidayRequestBody,
  PatchHolidayBody,
} from "../types/requests.js";
import {
  HolidayRequestSchema,
  PatchHolidaySchema,
  SetAvailabilitySchema,
  SetShiftPreferenceSchema,
} from "../schemas/availability.js";
import { parseBody, parseIdParam } from "../lib/validate.js";
import { writeAudit } from "../lib/audit.js";
import { toISODate, isWorkingDay, getWeekStart, checkRestPeriod } from "../lib/dateUtils.js";
import { badRequest, notFound, validationFailed } from "../lib/errors.js";

export async function availabilityRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /availability/my ───────────────────────────────────────────────────
  app.get("/availability/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const q = request.query as { weekStart?: string };

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return notFound(reply, "Driver profile");

    const weekStart = q.weekStart ? new Date(q.weekStart) : getWeekStart(new Date());

    const availability = await prisma.driverAvailability.findUnique({
      where: { driverProfileId_weekStartDate: { driverProfileId: profile.id, weekStartDate: weekStart } },
    });

    return reply.send({ data: availability, weekStart });
  });

  // ── POST /availability/my ──────────────────────────────────────────────────
  app.post("/availability/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const zodParsed = parseBody(SetAvailabilitySchema, request.body);
    if (!zodParsed.ok) return validationFailed(reply, zodParsed.errors);
    const body = zodParsed.data as SetAvailabilityBody;

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return notFound(reply, "Driver profile");

    const weekStart = body.weekStart ? new Date(body.weekStart) : getWeekStart(new Date());

    const dayPrefs = {
      monPref: body.monPref ?? "normal",  tuePref: body.tuePref ?? "normal",
      wedPref: body.wedPref ?? "normal",  thuPref: body.thuPref ?? "normal",
      friPref: body.friPref ?? "normal",  satPref: body.satPref ?? "unavailable",
      sunPref: body.sunPref ?? "unavailable",
      monNote: body.monNote ?? "",        tueNote: body.tueNote ?? "",
      wedNote: body.wedNote ?? "",        thuNote: body.thuNote ?? "",
      friNote: body.friNote ?? "",        satNote: body.satNote ?? "",
      sunNote: body.sunNote ?? "",
      status:  "submitted" as const,
      submittedAt: new Date(),
    };

    const availability = await prisma.driverAvailability.upsert({
      where: { driverProfileId_weekStartDate: { driverProfileId: profile.id, weekStartDate: weekStart } },
      update: dayPrefs,
      create: { companyId, driverProfileId: profile.id, weekStartDate: weekStart, ...dayPrefs },
    });

    return reply.status(201).send(availability);
  });

  // ── GET /availability — planner sees all drivers ───────────────────────────
  app.get("/availability", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { weekStart?: string };
    const weekStart = q.weekStart ? new Date(q.weekStart) : getWeekStart(new Date());

    const availability = await prisma.driverAvailability.findMany({
      where:   { companyId, weekStartDate: weekStart },
      include: { driverProfile: { select: { id: true, displayName: true, minHoursPerDay: true } } },
    });

    return reply.send({ data: availability, weekStart });
  });

  // ── POST /availability/:id/approve ────────────────────────────────────────
  app.post("/availability/:id/approve", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId } = request.user!;

    const avail = await prisma.driverAvailability.findFirst({ where: { id, companyId } });
    if (!avail) return notFound(reply, "Not found");

    const updated = await prisma.driverAvailability.update({
      where: { id },
      data:  { status: "approved", approvedAt: new Date() },
    });

    return reply.send(updated);
  });

  // ── POST /shift-preferences ────────────────────────────────────────────────
  app.post("/shift-preferences", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const zodParsed = parseBody(SetShiftPreferenceSchema, request.body);
    if (!zodParsed.ok) return validationFailed(reply, zodParsed.errors);
    const body = zodParsed.data as SetShiftPreferenceBody;

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return notFound(reply, "Driver profile");

    const shiftDate = new Date();
    shiftDate.setHours(0, 0, 0, 0);

    const lastShift = await prisma.shift.findFirst({
      where:   { companyId, driverId: userId, status: { in: ["completed", "submitted"] } },
      orderBy: { updatedAt: "desc" },
    });

    const warnings: string[] = [];
    let restCheck = null;
    if (lastShift?.endTime) {
      const lastEnd = new Date(`${lastShift.shiftDate.toISOString().split("T")[0]}T${lastShift.endTime}`);
      const requestedStart = body.startTime
        ? new Date(`${shiftDate.toISOString().split("T")[0]}T${body.startTime}`)
        : new Date();
      restCheck = checkRestPeriod(lastEnd, requestedStart);

      if (!restCheck.allowed) {
        warnings.push(`⚠️ ${restCheck.message}`);
      } else if (restCheck.isReduced) {
        warnings.push(`⚠️ Reduced rest period (${restCheck.restHours.toFixed(1)}h). Maximum 3 per week.`);
      }
    }

    const weekStart = getWeekStart(new Date());
    const summary = await prisma.driverWorkingTimeSummary.findUnique({
      where: { driverProfileId_weekStartDate: { driverProfileId: profile.id, weekStartDate: weekStart } },
    });

    const weeklyHours = summary?.totalHours ?? 0;
    if (weeklyHours >= 60) {
      return badRequest(reply, "HOURS_LIMIT_EXCEEDED", `You cannot start this shift. You have worked ${weeklyHours.toFixed(1)}h this week. The legal maximum is 60h in any single week. Please speak to your planner.`);
    } else if (weeklyHours >= 55) {
      warnings.push(`⚠️ You have worked ${weeklyHours.toFixed(1)}h this week. Approaching the 60h weekly legal maximum. Speak to your planner.`);
    } else if (weeklyHours >= 48) {
      warnings.push(`⚠️ You have worked ${weeklyHours.toFixed(1)}h this week. Above 48h average — your planner should review your 17-week reference period.`);
    }

    if (restCheck?.isReduced) warnings.push(restCheck.message);

    const pref = await prisma.shiftPreference.create({
      data: {
        companyId,
        driverProfileId: profile.id,
        shiftDate,
        preferenceType:  body.preferenceType ?? "normal",
        requestedHours:  body.requestedHours  ?? null,
        finishByTime:    body.finishByTime    ?? null,
        shortDayReason:  body.shortDayReason  ?? "",
        shortDayNote:    body.shortDayNote    ?? "",
        overtimeHours:   body.overtimeHours   ?? null,
        gpsLat:          body.gpsLat          ?? null,
        gpsLng:          body.gpsLng          ?? null,
        status:          body.preferenceType === "short_day" ? "pending" : "approved",
      },
    });

    return reply.status(201).send({ data: pref, warnings });
  });

  // ── GET /shift-preferences ─────────────────────────────────────────────────
  app.get("/shift-preferences", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { date?: string };
    const date = q.date ? new Date(q.date) : new Date();
    date.setHours(0, 0, 0, 0);

    const prefs = await prisma.shiftPreference.findMany({
      where:   { companyId, shiftDate: date },
      include: { driverProfile: { select: { id: true, displayName: true, minHoursPerDay: true } } },
      orderBy: { createdAt: "asc" },
    });

    return reply.send({ data: prefs });
  });

  // ── GET /holiday-requests/availability — day-by-day slot check ──────────────
  app.get("/holiday-requests/availability", { preHandler: authenticate }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { start?: string; end?: string };

    if (!q.start || !q.end) return badRequest(reply, "BAD_REQUEST", "start and end query params required (YYYY-MM-DD)");

    const start = new Date(q.start);
    const end   = new Date(q.end);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return badRequest(reply, "BAD_REQUEST", "Invalid date format");
    if (start > end) return badRequest(reply, "BAD_REQUEST", "start must be before end");

    const company   = await prisma.company.findUnique({ where: { id: companyId } });
    const maxPerDay = (company as any).maxHolidaysPerDay ?? 2;

    const days: { date: string; count: number; available: boolean; overLimit: boolean; slotsLeft: number }[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      if (isWorkingDay(cur)) {
        const daySnap = new Date(cur); daySnap.setHours(12, 0, 0, 0);
        const count = await prisma.holidayRequest.count({
          where: { companyId, status: { in: ["pending", "approved"] }, startDate: { lte: daySnap }, endDate: { gte: daySnap } },
        });
        days.push({
          date:      toISODate(cur),
          count,
          available: count < maxPerDay,
          overLimit: count >= maxPerDay,
          slotsLeft: Math.max(0, maxPerDay - count),
        });
      }
      cur.setDate(cur.getDate() + 1);
    }

    return reply.send({ days, maxPerDay, allAvailable: days.every(d => d.available) });
  });

  // ── GET /holiday-requests/my ───────────────────────────────────────────────
  app.get("/holiday-requests/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return notFound(reply, "Driver profile");

    const requests = await prisma.holidayRequest.findMany({
      where:   { companyId, driverProfileId: profile.id, status: { not: "deleted" } },
      orderBy: { startDate: "desc" },
    });

    const company = await prisma.company.findUnique({ where: { id: companyId } });

    return reply.send({
      data:             requests,
      holidayAllowance: profile.holidayAllowance,
      holidayUsed:      profile.holidayUsed,
      holidayRemaining: profile.holidayAllowance - profile.holidayUsed,
      maxPerDay:        (company as any).maxHolidaysPerDay ?? 2,
    });
  });

  // ── POST /holiday-requests ────────────────────────────────────────────────
  app.post("/holiday-requests", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const zodParsed = parseBody(HolidayRequestSchema, request.body);
    if (!zodParsed.ok) return validationFailed(reply, zodParsed.errors);
    const body = zodParsed.data as HolidayRequestBody;

    const v = validateHolidayRequest(body);
    if (!v.valid) return validationFailed(reply, v.errors);

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return notFound(reply, "Driver profile");

    const start = new Date(body.startDate);
    const end   = new Date(body.endDate);
    start.setHours(12, 0, 0, 0);
    end.setHours(12, 0, 0, 0);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (start < today) return badRequest(reply, "BAD_REQUEST", "Start date cannot be in the past");
    if (end   < today) return badRequest(reply, "BAD_REQUEST", "End date cannot be in the past");
    if (start > end)   return badRequest(reply, "BAD_REQUEST", "Start date must be on or before end date");

    let totalDays = 0;
    const current = new Date(start);
    while (current <= end) {
      if (isWorkingDay(current)) totalDays++;
      current.setDate(current.getDate() + 1);
    }

    if (totalDays === 0) {
      return badRequest(reply, "BAD_REQUEST", "Selected range contains no working days (weekends and bank holidays are excluded)");
    }

    if (totalDays > profile.holidayAllowance - profile.holidayUsed) {
      return badRequest(reply, "INSUFFICIENT_HOLIDAY", `Insufficient holiday allowance. You have ${profile.holidayAllowance - profile.holidayUsed} days remaining.`);
    }

    const company   = await prisma.company.findUnique({ where: { id: companyId } });
    const maxPerDay = (company as any).maxHolidaysPerDay ?? 2;

    const conflicts: string[] = [];
    const checkDate = new Date(start);
    while (checkDate <= end) {
      if (isWorkingDay(checkDate)) {
        const snap = new Date(checkDate); snap.setHours(12, 0, 0, 0);
        const count = await prisma.holidayRequest.count({
          where: { companyId, status: { in: ["pending", "approved"] }, startDate: { lte: snap }, endDate: { gte: snap } },
        });
        if (count >= maxPerDay) conflicts.push(checkDate.toLocaleDateString("en-GB"));
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }

    const holidayRequest = await prisma.holidayRequest.create({
      data: {
        companyId,
        driverProfileId: profile.id,
        startDate: start,
        endDate:   end,
        totalDays,
        reason:    body.reason ?? "",
        note:      body.note   ?? "",
        status:    "pending",
      },
    });

    await writeAudit(prisma, {
      companyId,
      actorId:    userId,
      entityType: "HolidayRequest",
      entityId:   holidayRequest.id,
      action:     "create",
      newValue:   { startDate: body.startDate, endDate: body.endDate, totalDays, status: "pending" },
      note:       `Driver created holiday request for ${totalDays} day(s)`,
      request,
    });

    return reply.status(201).send({
      ...holidayRequest,
      warning: conflicts.length > 0
        ? `Holiday limit warning: ${maxPerDay} driver(s) already pending/approved on ${conflicts.join(", ")}. Planner can still approve as an exception.`
        : null,
    });
  });

  // ── GET /holiday-requests — planner sees all ───────────────────────────────
  app.get("/holiday-requests", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string };

    const requests = await prisma.holidayRequest.findMany({
      where:   { companyId, ...(q.status ? { status: q.status } : { status: { not: "deleted" } }) },
      include: { driverProfile: { select: { id: true, displayName: true, holidayAllowance: true, holidayUsed: true } } },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ data: requests });
  });

  // ── PATCH /holiday-requests/:id ───────────────────────────────────────────
  app.patch("/holiday-requests/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const zodParsed = parseBody(PatchHolidaySchema, request.body);
    if (!zodParsed.ok) return validationFailed(reply, zodParsed.errors);
    const body = zodParsed.data as PatchHolidayBody;
    const { companyId, userId } = request.user!;

    const v = validatePatchHoliday(body);
    if (!v.valid) return validationFailed(reply, v.errors);

    const req = await prisma.holidayRequest.findFirst({ where: { id, companyId, status: { not: "deleted" } } });
    if (!req) return notFound(reply, "Holiday request");

    const previousStatus = req.status;
    const nextStatus = body.status;

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.holidayRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          plannerNote: body.plannerNote ?? "",
          approvedById: nextStatus === "approved" ? userId : null,
          approvedAt: nextStatus === "approved" ? new Date() : null,
        },
      });

      if (previousStatus !== "approved" && nextStatus === "approved") {
        await tx.driverProfile.update({
          where: { id: req.driverProfileId },
          data: { holidayUsed: { increment: req.totalDays } },
        });
      }

      if (previousStatus === "approved" && nextStatus !== "approved") {
        await tx.driverProfile.update({
          where: { id: req.driverProfileId },
          data: { holidayUsed: { decrement: req.totalDays } },
        });
      }

      return saved;
    });

    await writeAudit(prisma, {
      companyId,
      actorId:    userId,
      entityType: "HolidayRequest",
      entityId:   id,
      action:     "status_change",
      field:      "status",
      oldValue:   { status: previousStatus },
      newValue:   { status: nextStatus, plannerNote: body.plannerNote ?? "" },
      note:       `Planner changed holiday request status from ${previousStatus} to ${nextStatus}`,
      request,
    });

    return reply.send(updated);
  });

  // ── GET /working-time/my ───────────────────────────────────────────────────
  app.get("/working-time/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return notFound(reply, "Driver profile");

    const weekStart   = getWeekStart(new Date());
    const summary     = await prisma.driverWorkingTimeSummary.findUnique({
      where: { driverProfileId_weekStartDate: { driverProfileId: profile.id, weekStartDate: weekStart } },
    });

    const weeklyHours     = summary?.totalHours     ?? 0;
    const reducedRestUsed = summary?.reducedRestUsed ?? 0;
    const remaining       = Math.max(0, 60 - weeklyHours);

    return reply.send({
      weekStart,
      weeklyHours,
      reducedRestUsed,
      remainingHours: remaining,
      isNearLimit:    weeklyHours >= 55,
      isAtLimit:      weeklyHours >= 60,
      warnings: weeklyHours >= 60
        ? [`🚫 You have reached the 60h weekly legal maximum (${weeklyHours.toFixed(1)}h). Cannot start shift.`]
        : weeklyHours >= 55
        ? [`⚠️ You have worked ${weeklyHours.toFixed(1)}h this week. Approaching the 60h legal maximum. Speak to your planner.`]
        : weeklyHours >= 48
        ? [`⚠️ You have worked ${weeklyHours.toFixed(1)}h this week. Above 48h average over 17 weeks — planner should consider shorter days or a day off.`]
        : [],
    });
  });
}

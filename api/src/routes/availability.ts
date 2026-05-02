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

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function checkRestPeriod(lastShiftEnd: Date, requestedStart: Date): {
  allowed: boolean;
  restHours: number;
  isReduced: boolean;
  message: string;
} {
  const restMs    = requestedStart.getTime() - lastShiftEnd.getTime();
  const restHours = restMs / (1000 * 60 * 60);

  if (restHours >= 11) {
    return { allowed: true, restHours, isReduced: false, message: "" };
  }
  if (restHours >= 9) {
    return {
      allowed:   true,
      restHours,
      isReduced: true,
      message:   `Reduced rest period (${restHours.toFixed(1)}h). Maximum 3 per week.`,
    };
  }
  return {
    allowed:   false,
    restHours,
    isReduced: false,
    message:   `Insufficient rest. You need at least 9 hours between shifts. Last shift ended at ${lastShiftEnd.toLocaleTimeString("en-GB")}. Earliest start: ${new Date(lastShiftEnd.getTime() + 9 * 60 * 60 * 1000).toLocaleTimeString("en-GB")}.`,
  };
}

export async function availabilityRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /availability/my ───────────────────────────────────────────────────
  app.get("/availability/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const q = request.query as { weekStart?: string };

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.status(404).send({ error: "Driver profile not found" });

    const weekStart = q.weekStart ? new Date(q.weekStart) : getWeekStart(new Date());

    const availability = await prisma.driverAvailability.findUnique({
      where: { driverProfileId_weekStartDate: { driverProfileId: profile.id, weekStartDate: weekStart } },
    });

    return reply.send({ data: availability, weekStart });
  });

  // ── POST /availability/my ──────────────────────────────────────────────────
  app.post("/availability/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const body = request.body as SetAvailabilityBody;

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.status(404).send({ error: "Driver profile not found" });

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
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId } = request.user!;

    const avail = await prisma.driverAvailability.findFirst({ where: { id, companyId } });
    if (!avail) return reply.status(404).send({ error: "Not found" });

    const updated = await prisma.driverAvailability.update({
      where: { id },
      data:  { status: "approved", approvedAt: new Date() },
    });

    return reply.send(updated);
  });

  // ── POST /shift-preferences ────────────────────────────────────────────────
  app.post("/shift-preferences", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const body = request.body as SetShiftPreferenceBody;

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.status(404).send({ error: "Driver profile not found" });

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
      return reply.status(400).send({
        error: `You cannot start this shift. You have worked ${weeklyHours.toFixed(1)}h this week. The legal maximum is 60h in any single week. Please speak to your planner.`,
      });
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

  // ── GET /holiday-requests/my ───────────────────────────────────────────────
  app.get("/holiday-requests/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.status(404).send({ error: "Driver profile not found" });

    const requests = await prisma.holidayRequest.findMany({
      where:   { companyId, driverProfileId: profile.id },
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
    const body = request.body as HolidayRequestBody;

    const v = validateHolidayRequest(body);
    if (!v.valid) return reply.status(400).send({ error: v.errors.join(", ") });

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.status(404).send({ error: "Driver profile not found" });

    const start = new Date(body.startDate);
    const end   = new Date(body.endDate);

    let totalDays = 0;
    const current = new Date(start);
    while (current <= end) {
      if (current.getDay() !== 0 && current.getDay() !== 6) totalDays++;
      current.setDate(current.getDate() + 1);
    }

    if (totalDays > profile.holidayAllowance - profile.holidayUsed) {
      return reply.status(400).send({
        error: `Insufficient holiday allowance. You have ${profile.holidayAllowance - profile.holidayUsed} days remaining.`,
      });
    }

    const company   = await prisma.company.findUnique({ where: { id: companyId } });
    const maxPerDay = (company as any).maxHolidaysPerDay ?? 2;

    const conflicts: string[] = [];
    const checkDate = new Date(start);
    while (checkDate <= end) {
      if (checkDate.getDay() !== 0 && checkDate.getDay() !== 6) {
        const count = await prisma.holidayRequest.count({
          where: { companyId, status: "approved", startDate: { lte: checkDate }, endDate: { gte: checkDate } },
        });
        if (count >= maxPerDay) conflicts.push(checkDate.toLocaleDateString("en-GB"));
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }

    if (conflicts.length > 0) {
      return reply.status(400).send({
        error: `Maximum ${maxPerDay} drivers can be on holiday on: ${conflicts.join(", ")}. Please choose different dates.`,
      });
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

    return reply.status(201).send(holidayRequest);
  });

  // ── GET /holiday-requests — planner sees all ───────────────────────────────
  app.get("/holiday-requests", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string };

    const requests = await prisma.holidayRequest.findMany({
      where:   { companyId, ...(q.status ? { status: q.status } : {}) },
      include: { driverProfile: { select: { id: true, displayName: true, holidayAllowance: true, holidayUsed: true } } },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ data: requests });
  });

  // ── PATCH /holiday-requests/:id ───────────────────────────────────────────
  app.patch("/holiday-requests/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchHolidayBody;
    const { companyId, userId } = request.user!;

    const v = validatePatchHoliday(body);
    if (!v.valid) return reply.status(400).send({ error: v.errors.join(", ") });

    const req = await prisma.holidayRequest.findFirst({ where: { id, companyId } });
    if (!req) return reply.status(404).send({ error: "Holiday request not found" });

    const updated = await prisma.holidayRequest.update({
      where: { id },
      data: {
        status:       body.status,
        plannerNote:  body.plannerNote ?? "",
        approvedById: userId,
        approvedAt:   new Date(),
      },
    });

    if (body.status === "approved") {
      await prisma.driverProfile.update({
        where: { id: req.driverProfileId },
        data:  { holidayUsed: { increment: req.totalDays } },
      });
    }

    if (body.status === "rejected" && req.status === "approved") {
      await prisma.driverProfile.update({
        where: { id: req.driverProfileId },
        data:  { holidayUsed: { decrement: req.totalDays } },
      });
    }

    return reply.send(updated);
  });

  // ── GET /working-time/my ───────────────────────────────────────────────────
  app.get("/working-time/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.status(404).send({ error: "Driver profile not found" });

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

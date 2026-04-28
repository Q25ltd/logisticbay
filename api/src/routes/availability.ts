import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";

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
    return { allowed: true, restHours, isReduced: true, message: `Reduced rest period (${restHours.toFixed(1)}h). Maximum 3 per week.` };
  }
  return {
    allowed:   false,
    restHours,
    isReduced: false,
    message:   `Insufficient rest. You need at least 9 hours between shifts. Last shift ended at ${lastShiftEnd.toLocaleTimeString("en-GB")}. Earliest start: ${new Date(lastShiftEnd.getTime() + 9 * 60 * 60 * 1000).toLocaleTimeString("en-GB")}.`,
  };
}

export async function availabilityRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /availability/my — driver gets their availability ─────────────────
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

  // ── POST /availability/my — driver sets weekly availability ───────────────
  app.post("/availability/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const body = request.body as any;

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.status(404).send({ error: "Driver profile not found" });

    const weekStart = body.weekStart ? new Date(body.weekStart) : getWeekStart(new Date());

    const availability = await prisma.driverAvailability.upsert({
      where: { driverProfileId_weekStartDate: { driverProfileId: profile.id, weekStartDate: weekStart } },
      update: {
        monPref: body.monPref ?? "normal", tuePref: body.tuePref ?? "normal",
        wedPref: body.wedPref ?? "normal", thuPref: body.thuPref ?? "normal",
        friPref: body.friPref ?? "normal", satPref: body.satPref ?? "unavailable",
        sunPref: body.sunPref ?? "unavailable",
        monNote: body.monNote ?? "", tueNote: body.tueNote ?? "",
        wedNote: body.wedNote ?? "", thuNote: body.thuNote ?? "",
        friNote: body.friNote ?? "", satNote: body.satNote ?? "",
        sunNote: body.sunNote ?? "",
        status:  "submitted", submittedAt: new Date(),
      },
      create: {
        companyId, driverProfileId: profile.id, weekStartDate: weekStart,
        monPref: body.monPref ?? "normal", tuePref: body.tuePref ?? "normal",
        wedPref: body.wedPref ?? "normal", thuPref: body.thuPref ?? "normal",
        friPref: body.friPref ?? "normal", satPref: body.satPref ?? "unavailable",
        sunPref: body.sunPref ?? "unavailable",
        monNote: body.monNote ?? "", tueNote: body.tueNote ?? "",
        wedNote: body.wedNote ?? "", thuNote: body.thuNote ?? "",
        friNote: body.friNote ?? "", satNote: body.satNote ?? "",
        sunNote: body.sunNote ?? "",
        status:  "submitted", submittedAt: new Date(),
      },
    });

    return reply.status(201).send(availability);
  });

  // ── GET /availability — planner sees all drivers availability ─────────────
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

  // ── POST /availability/:id/approve — planner approves ────────────────────
  app.post("/availability/:id/approve", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as any).id, 10);
    const { companyId } = request.user!;

    const avail = await prisma.driverAvailability.findFirst({ where: { id, companyId } });
    if (!avail) return reply.status(404).send({ error: "Not found" });

    const updated = await prisma.driverAvailability.update({
      where: { id },
      data:  { status: "approved", approvedAt: new Date() },
    });

    return reply.send(updated);
  });

  // ── POST /shift-preferences — driver sets today's preference ──────────────
  app.post("/shift-preferences", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const body = request.body as any;

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.status(404).send({ error: "Driver profile not found" });

    const shiftDate = new Date();
    shiftDate.setHours(0, 0, 0, 0);

    // Check rest period from last shift
    const lastShift = await prisma.shift.findFirst({
      where:   { companyId, driverId: userId, status: { in: ["completed", "submitted"] } },
      orderBy: { updatedAt: "desc" },
    });

    let restCheck = null;
    if (lastShift?.endTime) {
      const lastEnd = new Date(`${lastShift.shiftDate.toISOString().split("T")[0]}T${lastShift.endTime}`);
      const requestedStart = body.startTime
        ? new Date(`${shiftDate.toISOString().split("T")[0]}T${body.startTime}`)
        : new Date();
      restCheck = checkRestPeriod(lastEnd, requestedStart);

      // Count reduced rest this week
      if (restCheck.isReduced) {
        const weekStart = getWeekStart(new Date());
        const summary = await prisma.driverWorkingTimeSummary.findUnique({
          where: { driverProfileId_weekStartDate: { driverProfileId: profile.id, weekStartDate: weekStart } },
        });
        if ((summary?.reducedRestUsed ?? 0) >= 3) {
          return reply.status(400).send({
            error: "Cannot use reduced rest — you have already used 3 reduced rest periods this week. Minimum 11 hours rest required.",
          });
        }
      }

      if (!restCheck.allowed) {
        return reply.status(400).send({ error: restCheck.message });
      }
    }

    // Check weekly hours
    const weekStart = getWeekStart(new Date());
    const summary = await prisma.driverWorkingTimeSummary.findUnique({
      where: { driverProfileId_weekStartDate: { driverProfileId: profile.id, weekStartDate: weekStart } },
    });

    const weeklyHours = summary?.totalHours ?? 0;
    const warnings: string[] = [];

    if (weeklyHours >= 48) {
      warnings.push(`⚠️ You have reached the 48h weekly limit (${weeklyHours.toFixed(1)}h worked). Please speak to your planner.`);
    } else if (weeklyHours >= 42) {
      warnings.push(`⚠️ You have worked ${weeklyHours.toFixed(1)}h this week. Approaching the 48h legal limit.`);
    }

    if (restCheck?.isReduced) {
      warnings.push(restCheck.message);
    }

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

  // ── GET /shift-preferences — planner sees today's preferences ─────────────
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

    // Get company holiday limit
    const company = await prisma.company.findUnique({ where: { id: companyId } });

    return reply.send({
      data:             requests,
      holidayAllowance: profile.holidayAllowance,
      holidayUsed:      profile.holidayUsed,
      holidayRemaining: profile.holidayAllowance - profile.holidayUsed,
      maxPerDay:        (company as any).maxHolidaysPerDay ?? 2,
    });
  });

  // ── POST /holiday-requests — driver submits holiday request ───────────────
  app.post("/holiday-requests", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const body = request.body as any;

    if (!body.startDate || !body.endDate) return reply.status(400).send({ error: "Start and end date required" });

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.status(404).send({ error: "Driver profile not found" });

    const start = new Date(body.startDate);
    const end   = new Date(body.endDate);

    // Calculate working days
    let totalDays = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) totalDays++;
      current.setDate(current.getDate() + 1);
    }

    if (totalDays > profile.holidayAllowance - profile.holidayUsed) {
      return reply.status(400).send({ error: `Insufficient holiday allowance. You have ${profile.holidayAllowance - profile.holidayUsed} days remaining.` });
    }

    // Check max drivers on holiday same days
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    const maxPerDay = (company as any).maxHolidaysPerDay ?? 2;

    // Check each day in range
    const conflicts: string[] = [];
    const checkDate = new Date(start);
    while (checkDate <= end) {
      const day = checkDate.getDay();
      if (day !== 0 && day !== 6) {
        const count = await prisma.holidayRequest.count({
          where: {
            companyId,
            status:    "approved",
            startDate: { lte: checkDate },
            endDate:   { gte: checkDate },
          },
        });
        if (count >= maxPerDay) {
          conflicts.push(checkDate.toLocaleDateString("en-GB"));
        }
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }

    if (conflicts.length > 0) {
      return reply.status(400).send({
        error: `Maximum ${maxPerDay} drivers can be on holiday on: ${conflicts.join(", ")}. Please choose different dates.`,
      });
    }

    const request2 = await prisma.holidayRequest.create({
      data: {
        companyId,
        driverProfileId: profile.id,
        startDate: start,
        endDate:   end,
        totalDays,
        reason:    body.reason   ?? "",
        note:      body.note     ?? "",
        status:    "pending",
      },
    });

    return reply.status(201).send(request2);
  });

  // ── GET /holiday-requests — planner sees all requests ─────────────────────
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

  // ── PATCH /holiday-requests/:id — planner approves/rejects ───────────────
  app.patch("/holiday-requests/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as any).id, 10);
    const body = request.body as any;
    const { companyId, userId } = request.user!;

    if (!["approved", "rejected"].includes(body.status)) {
      return reply.status(400).send({ error: "Status must be approved or rejected" });
    }

    const req = await prisma.holidayRequest.findFirst({ where: { id, companyId } });
    if (!req) return reply.status(404).send({ error: "Holiday request not found" });

    const updated = await prisma.holidayRequest.update({
      where: { id },
      data: {
        status:      body.status,
        plannerNote: body.plannerNote ?? "",
        approvedById: userId,
        approvedAt:  new Date(),
      },
    });

    // If approved — deduct from driver's allowance
    if (body.status === "approved") {
      await prisma.driverProfile.update({
        where: { id: req.driverProfileId },
        data:  { holidayUsed: { increment: req.totalDays } },
      });
    }

    // If rejecting a previously approved request — refund days
    if (body.status === "rejected" && req.status === "approved") {
      await prisma.driverProfile.update({
        where: { id: req.driverProfileId },
        data:  { holidayUsed: { decrement: req.totalDays } },
      });
    }

    return reply.send(updated);
  });

  // ── GET /working-time/my — driver sees their hours summary ────────────────
  app.get("/working-time/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.status(404).send({ error: "Driver profile not found" });

    const weekStart = getWeekStart(new Date());

    const summary = await prisma.driverWorkingTimeSummary.findUnique({
      where: { driverProfileId_weekStartDate: { driverProfileId: profile.id, weekStartDate: weekStart } },
    });

    const weeklyHours    = summary?.totalHours     ?? 0;
    const reducedRestUsed = summary?.reducedRestUsed ?? 0;
    const remaining      = Math.max(0, 48 - weeklyHours);

    return reply.send({
      weekStart,
      weeklyHours,
      reducedRestUsed,
      remainingHours: remaining,
      isNearLimit:    weeklyHours >= 42,
      isAtLimit:      weeklyHours >= 48,
      warnings:       weeklyHours >= 48
        ? ["You have reached the 48h weekly working time limit."]
        : weeklyHours >= 42
        ? [`You have worked ${weeklyHours.toFixed(1)}h this week. Approaching the 48h legal limit.`]
        : [],
    });
  });
}

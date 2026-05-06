import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticate, requireRole } from "../middleware.js";
import {
  validateRegisterCompany,
  validateCreateDriver,
  validatePatchDriverStatus,
} from "../validation.js";
import type {
  RegisterCompanyBody,
  PatchCompanyBody,
  CreateDriverBody,
  PatchDriverBody,
  PatchDriverStatusBody,
} from "../types/requests.js";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}


function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function optionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function driverProfileData(body: CreateDriverBody | PatchDriverBody) {
  return {
    ...(body.displayName !== undefined ? { displayName: optionalString(body.displayName) ?? "" } : {}),
    ...(body.employmentStartDate !== undefined ? { employmentStartDate: optionalDate(body.employmentStartDate) } : {}),
    ...(body.employeeNumber !== undefined ? { employeeNumber: optionalString(body.employeeNumber) || null } : {}),
    ...(body.phoneNumber !== undefined ? { phoneNumber: optionalString(body.phoneNumber) || null, contactPhone: optionalString(body.phoneNumber) || null } : {}),
    ...(body.defaultTruckReg   !== undefined ? { defaultTruckReg:   optionalString(body.defaultTruckReg)   ?? "" } : {}),
    ...(body.defaultTrailerReg !== undefined ? { defaultTrailerReg: optionalString(body.defaultTrailerReg) ?? "" } : {}),
    ...(body.driverType !== undefined ? { driverType: optionalString(body.driverType) || "permanent" } : {}),
    ...(body.licenceClass !== undefined ? { licenceClass: optionalString(body.licenceClass) ?? "" } : {}),
    ...(body.canUseTrailer !== undefined ? { canUseTrailer: Boolean(body.canUseTrailer) } : {}),
    ...(body.trailerTypesAllowed !== undefined ? { trailerTypesAllowed: Array.isArray(body.trailerTypesAllowed) ? body.trailerTypesAllowed : [] } : {}),
    ...(body.adrAllowed !== undefined ? { adrAllowed: Boolean(body.adrAllowed) } : {}),
    ...(body.hiabAllowed !== undefined ? { hiabAllowed: Boolean(body.hiabAllowed) } : {}),
    ...(body.moffettAllowed !== undefined ? { moffettAllowed: Boolean(body.moffettAllowed) } : {}),
    ...(body.manualHandlingAllowed !== undefined ? { manualHandlingAllowed: Boolean(body.manualHandlingAllowed) } : {}),
    ...(body.preferredStartTime !== undefined ? { preferredStartTime: optionalString(body.preferredStartTime) ?? "" } : {}),
    ...(body.earliestStartTime !== undefined ? { earliestStartTime: optionalString(body.earliestStartTime) ?? "" } : {}),
    ...(body.latestFinishTime !== undefined ? { latestFinishTime: optionalString(body.latestFinishTime) ?? "" } : {}),
    ...(body.preferredShiftHours !== undefined ? { preferredShiftHours: optionalNumber(body.preferredShiftHours) ?? null } : {}),
    ...(body.normalWorkingDays !== undefined ? { normalWorkingDays: Array.isArray(body.normalWorkingDays) ? body.normalWorkingDays : [] } : {}),
    ...(body.weekendAvailable !== undefined ? { weekendAvailable: Boolean(body.weekendAvailable) } : {}),
    ...(body.nightWorkAllowed !== undefined ? { nightWorkAllowed: Boolean(body.nightWorkAllowed) } : {}),
    ...(body.nightsOutAllowed !== undefined ? { nightsOutAllowed: Boolean(body.nightsOutAllowed) } : {}),
    ...(body.overtimeAllowed !== undefined ? { overtimeAllowed: Boolean(body.overtimeAllowed) } : {}),
    ...(body.baseLocation !== undefined ? { baseLocation: optionalString(body.baseLocation) ?? "" } : {}),
    ...(body.operatingArea !== undefined ? { operatingArea: optionalString(body.operatingArea) ?? "" } : {}),
    ...(body.avoidAreas !== undefined ? { avoidAreas: optionalString(body.avoidAreas) ?? "" } : {}),
    ...(body.plannerNotes !== undefined ? { plannerNotes: optionalString(body.plannerNotes) ?? "" } : {}),
    ...(body.holidayAllowance !== undefined ? { holidayAllowance: Math.max(0, Math.round(optionalNumber(body.holidayAllowance) ?? 28)) } : {}),
    ...(
      body.driverType !== undefined && optionalString(body.driverType) !== "permanent"
        ? { holidayAllowance: 0, holidayUsed: 0 }
        : {}
    ),
  };
}

function holidayDates(input: { startDate: string; endDate: string }) {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  start.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  return { start, end };
}

function generateToken(payload: object): string {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET!, { expiresIn: "7d" });
}

function generateRefreshToken(payload: object): string {
  return jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET!,
    { expiresIn: "30d" },
  );
}

export async function companyRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── POST /auth/register-company ────────────────────────────────────────────
  app.post("/auth/register-company", async (request, reply) => {
    const body = request.body as RegisterCompanyBody;

    const v = validateRegisterCompany(body);
    if (!v.valid) return reply.status(400).send({ error: v.errors.join(", ") });

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) return reply.status(409).send({ error: "Email already registered" });

    let slug = slugify(body.companyName.trim());
    const slugExists = await prisma.company.findUnique({ where: { slug } });
    if (slugExists) slug = `${slug}-${Date.now()}`;

    const passwordHash = await bcrypt.hash(body.password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: body.companyName.trim(), slug, status: "trial" },
      });

      const user = await tx.user.create({
        data: {
          name:         body.name.trim(),
          email:        body.email.toLowerCase().trim(),
          passwordHash,
          status:       "active",
        },
      });

      await tx.companyMembership.create({
        data: { companyId: company.id, userId: user.id, role: "company_owner", status: "active" },
      });

      return { company, user };
    });

    const tokenPayload = {
      userId:    result.user.id,
      companyId: result.company.id,
      role:      "company_owner",
    };

    return reply.status(201).send({
      accessToken:  generateToken(tokenPayload),
      refreshToken: generateRefreshToken(tokenPayload),
      companyId:    result.company.id,
      userId:       result.user.id,
      user: {
        id:        result.user.id,
        name:      result.user.name,
        email:     result.user.email,
        companyId: result.company.id,
        role:      "company_owner",
      },
    });
  });

  // ── PATCH /company ─────────────────────────────────────────────────────────
  app.patch("/company", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const body = request.body as PatchCompanyBody;

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        ...(body.name               !== undefined ? { name: body.name }                           : {}),
        ...(body.reportEmail        !== undefined ? { reportEmail: body.reportEmail }              : {}),
        ...(body.reportEmailEnabled !== undefined ? { reportEmailEnabled: body.reportEmailEnabled } : {}),
        ...(body.holidayYearResetMonth !== undefined ? { holidayYearResetMonth: Math.min(12, Math.max(1, Math.round(optionalNumber(body.holidayYearResetMonth) ?? 1))) } : {}),
        ...(body.holidayYearResetDay !== undefined ? { holidayYearResetDay: Math.min(31, Math.max(1, Math.round(optionalNumber(body.holidayYearResetDay) ?? 1))) } : {}),
        ...(body.holidayWarnDaysBefore !== undefined ? { holidayWarnDaysBefore: Math.max(0, Math.round(optionalNumber(body.holidayWarnDaysBefore) ?? 30)) } : {}),
        ...(body.maxHolidaysPerDay !== undefined ? { maxHolidaysPerDay: Math.max(0, Math.round(optionalNumber(body.maxHolidaysPerDay) ?? 2)) } : {}),
        ...(body.holidayCarryOverAllowed !== undefined ? { holidayCarryOverAllowed: Boolean(body.holidayCarryOverAllowed) } : {}),
        ...(body.holidayCarryOverMaxDays !== undefined ? { holidayCarryOverMaxDays: Math.max(0, Math.round(optionalNumber(body.holidayCarryOverMaxDays) ?? 0)) } : {}),
        ...(body.baseHolidayAllowanceDays !== undefined ? { baseHolidayAllowanceDays: Math.max(0, Math.round(optionalNumber(body.baseHolidayAllowanceDays) ?? 28)) } : {}),
        ...(body.holidaySeniorityEnabled !== undefined ? { holidaySeniorityEnabled: Boolean(body.holidaySeniorityEnabled) } : {}),
        ...(body.holidaySeniorityYears !== undefined ? { holidaySeniorityYears: Math.max(0, Math.round(optionalNumber(body.holidaySeniorityYears) ?? 5)) } : {}),
        ...(body.holidaySeniorityExtraDays !== undefined ? { holidaySeniorityExtraDays: Math.max(0, Math.round(optionalNumber(body.holidaySeniorityExtraDays) ?? 1)) } : {}),
        ...(body.holidaySeniorityMaxExtraDays !== undefined ? { holidaySeniorityMaxExtraDays: Math.max(0, Math.round(optionalNumber(body.holidaySeniorityMaxExtraDays) ?? 5)) } : {}),
      },
    });
    return reply.send(updated);
  });

  // ── GET /company ───────────────────────────────────────────────────────────
  app.get("/company", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return reply.status(404).send({ error: "Company not found" });
    return reply.send(company);
  });

  // ── GET /drivers ───────────────────────────────────────────────────────────
  app.get("/drivers", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string };

    const drivers = await prisma.driverProfile.findMany({
      where: { companyId, ...(q.status ? { status: q.status } : {}) },
      include: { user: { select: { id: true, email: true, name: true, status: true } }, holidayRequests: { orderBy: { startDate: "asc" } } },
      orderBy: { displayName: "asc" },
    });

    return reply.send({ data: drivers });
  });

  // ── POST /drivers ──────────────────────────────────────────────────────────
  app.post("/drivers", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateDriverBody;
    const { companyId } = request.user!;

    const v = validateCreateDriver(body);
    if (!v.valid) return reply.status(400).send({ error: v.errors.join(", ") });

    let userId: number | null = null;
    let isNewUser = false;
    const DEFAULT_PIN = "123456";

    if (body.email?.trim()) {
      const emailLower = body.email.toLowerCase().trim();

      const existingInCompany = await prisma.driverProfile.findFirst({
        where: { companyId, contactEmail: emailLower },
      });
      if (existingInCompany) {
        return reply.status(409).send({ error: "A driver with this email already exists in your company" });
      }

      let targetUser = await prisma.user.findUnique({ where: { email: emailLower } });

      if (targetUser) {
        const existingMembership = await prisma.companyMembership.findFirst({
          where: { companyId, userId: targetUser.id },
        });
        if (!existingMembership) {
          await prisma.companyMembership.create({
            data: { companyId, userId: targetUser.id, role: "driver", status: "active" },
          });
        }
        userId = targetUser.id;
      } else {
        isNewUser = true;
        const passwordHash = await bcrypt.hash(DEFAULT_PIN, 12);
        targetUser = await prisma.user.create({
          data: { name: body.displayName.trim(), email: emailLower, passwordHash, status: "active" },
        });
        await prisma.companyMembership.create({
          data: { companyId, userId: targetUser.id, role: "driver", status: "active" },
        });
        userId = targetUser.id;
      }

      const driver = await prisma.driverProfile.create({
        data: {
          companyId,
          userId,
          ...driverProfileData(body),
          displayName: body.displayName.trim(),
          contactEmail: emailLower,
          status: "active",
        },
      });

      return reply.status(201).send({
        ...driver,
        defaultPin:     isNewUser ? DEFAULT_PIN : null,
        loginEmail:     emailLower,
        isAgencyDriver: !isNewUser,
        message: isNewUser
          ? "Driver created — default PIN is 123456"
          : "Agency driver linked — they keep their existing PIN",
      });
    }

    // No email — create profile without login
    const driver = await prisma.driverProfile.create({
      data: {
        companyId,
        userId,
        ...driverProfileData(body),
        displayName: body.displayName.trim(),
        status: "active",
      },
    });
    return reply.status(201).send(driver);
  });

  // ── PATCH /drivers/:id ─────────────────────────────────────────────────────
  app.patch("/drivers/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchDriverBody;
    const { companyId } = request.user!;

    const driver = await prisma.driverProfile.findFirst({ where: { id, companyId } });
    if (!driver) return reply.status(404).send({ error: "Driver not found" });

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.driverProfile.update({
        where: { id },
        data: driverProfileData(body),
      });

      if (Array.isArray(body.holidayRequests)) {
        await tx.holidayRequest.deleteMany({ where: { companyId, driverProfileId: id } });

        for (const holiday of body.holidayRequests) {
          if (!holiday.startDate || !holiday.endDate) continue;

          const { start, end } = holidayDates(holiday);
          if (start > end) continue;

          const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);

          await tx.holidayRequest.create({
            data: {
              companyId,
              driverProfileId: id,
              startDate: start,
              endDate: end,
              totalDays,
              reason: holiday.reason ?? "holiday",
              note: holiday.note ?? "",
              status: holiday.status ?? "approved",
            },
          });
        }
      }

      return tx.driverProfile.findUnique({
        where: { id: saved.id },
        include: {
          user: { select: { id: true, email: true, name: true, status: true } },
          holidayRequests: { orderBy: { startDate: "asc" } },
        },
      });
    });

    return reply.send(updated);
  });

  // ── PATCH /drivers/:id/status ──────────────────────────────────────────────
  app.patch("/drivers/:id/status", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchDriverStatusBody;
    const { companyId } = request.user!;

    const v = validatePatchDriverStatus(body);
    if (!v.valid) return reply.status(400).send({ error: v.errors.join(", ") });

    const driver = await prisma.driverProfile.findFirst({ where: { id, companyId } });
    if (!driver) return reply.status(404).send({ error: "Driver not found" });

    const updated = await prisma.driverProfile.update({
      where: { id },
      data:  { status: body.status },
    });

    return reply.send(updated);
  });

  // ── POST /drivers/:id/reset-password ──────────────────────────────────────
  app.post("/drivers/:id/reset-password", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId } = request.user!;

    const driver = await prisma.driverProfile.findFirst({
      where: { id, companyId },
      include: { user: true },
    });
    if (!driver)        return reply.status(404).send({ error: "Driver not found" });
    if (!driver.userId) return reply.status(400).send({ error: "Driver has no login account" });

    const activeMembershipCount = await prisma.companyMembership.count({
      where: { userId: driver.userId, status: "active" },
    });
    if (activeMembershipCount > 1) {
      return reply.status(409).send({
        error: "This driver account is shared with another company. Ask the driver to change their PIN, or create a company-only driver login before resetting it.",
      });
    }

    const DEFAULT_PIN  = "123456";
    const passwordHash = await bcrypt.hash(DEFAULT_PIN, 12);

    await prisma.user.update({ where: { id: driver.userId }, data: { passwordHash } });

    return reply.send({
      ok:         true,
      defaultPin: DEFAULT_PIN,
      loginEmail: driver.user!.email,
      message:    "PIN reset to default — driver must change on next login",
    });
  });
}

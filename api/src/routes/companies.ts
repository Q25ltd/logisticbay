import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import bcrypt from "bcryptjs";
import { authenticate, requireRole } from "../middleware.js";
import { generateAccessToken, generateRefreshToken, storeRefreshToken, createEmailVerificationToken } from "../lib/tokens.js";
import { env } from "../lib/env.js";
import { sendEmailVerificationEmail } from "../email.js";
import type {
  RegisterCompanyBody,
  PatchCompanyBody,
  CreateDriverBody,
  PatchDriverBody,
  PatchDriverStatusBody,
} from "../types/requests.js";
import {
  CreateDriverSchema,
  PatchDriverSchema,
  PatchDriverStatusSchema,
} from "../schemas/drivers.js";
import { RegisterCompanySchema } from "../schemas/auth.js";
import { parseBody, parseIdParam } from "../lib/validate.js";
import { writeAudit } from "../lib/audit.js";
import { driverProfileData } from "../lib/driverUtils.js";
import { optionalNumber } from "../lib/coerce.js";
import { badRequest, conflict, notFound, validationFailed } from "../lib/errors.js";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function holidayDates(input: { startDate: string; endDate: string }) {
  const start = new Date(input.startDate);
  const end   = new Date(input.endDate);
  start.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  return { start, end };
}


export async function companyRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── POST /auth/register-company ────────────────────────────────────────────
  app.post("/auth/register-company", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    const zodParsed = parseBody(RegisterCompanySchema, request.body);
    if (!zodParsed.ok) return validationFailed(reply, zodParsed.errors);
    const body = zodParsed.data as RegisterCompanyBody;

    // Ticker validation (business rule — not expressible as a static Zod enum)
    const RESERVED_TICKERS = new Set(["ADMIN","API","APP","NULL","ROOT","SYSTEM","TEST","USER","JOB","DRAFT"]);
    const tickerVal = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
    if (!tickerVal) return badRequest(reply, "TICKER_REQUIRED", "ticker is required");
    if (!/^[A-Z]{2,5}$/.test(tickerVal)) return badRequest(reply, "TICKER_INVALID", "Ticker must be 2–5 letters only, for example LGB.");
    if (RESERVED_TICKERS.has(tickerVal)) return badRequest(reply, "TICKER_RESERVED", "This ticker is reserved. Please choose another one.");
    if (body.password !== body.confirmPassword) return badRequest(reply, "PASSWORD_MISMATCH", "passwords do not match");

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) return conflict(reply, "CONFLICT", "Email already registered");

    const companyNameTrimmed = body.companyName.trim();
    const nameExists = await prisma.company.findFirst({ where: { name: { equals: companyNameTrimmed, mode: "insensitive" } } });
    if (nameExists) return conflict(reply, "COMPANYNAME_CONFLICT", "A company with this name is already registered. Please use a different name.");

    const ticker = body.ticker.trim().toUpperCase();
    const tickerExists = await prisma.company.findUnique({ where: { ticker } });
    if (tickerExists) return conflict(reply, "TICKER_CONFLICT", "This ticker is already taken. Please choose another one.");

    let slug = slugify(companyNameTrimmed);
    let slugSuffix = 2;
    while (await prisma.company.findUnique({ where: { slug } })) {
      slug = `${slugify(companyNameTrimmed)}-${slugSuffix++}`;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    // When email is not configured, skip verification and activate immediately
    const companyStatus = env.EMAIL_ENABLED ? "pending" : "trial";

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name:            companyNameTrimmed,
          slug,
          ticker,
          nextJobSequence: 1,
          jobSequenceYear: new Date().getFullYear(),
          status:          companyStatus,
        },
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

    if (env.EMAIL_ENABLED) {
      const rawToken = await createEmailVerificationToken(prisma, result.user.id);
      const verifyUrl = `${env.APP_URL}/verify-email?token=${rawToken}`;
      try {
        await sendEmailVerificationEmail(result.user.email, result.user.name, verifyUrl);
      } catch {
        // Log but don't block registration
      }
      return reply.status(201).send({
        requiresVerification: true,
        email: result.user.email,
        companyId: result.company.id,
        userId:    result.user.id,
      });
    }

    // Email disabled — issue tokens directly so registration works without SendGrid
    const tokenPayload = { userId: result.user.id, companyId: result.company.id, role: "company_owner" };
    const accessToken  = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    await storeRefreshToken(prisma, {
      userId:    result.user.id,
      companyId: result.company.id,
      token:     refreshToken,
      userAgent: request.headers["user-agent"] ?? "",
    });

    return reply.status(201).send({
      accessToken,
      refreshToken,
      companyId: result.company.id,
      userId:    result.user.id,
      user: {
        id:        result.user.id,
        name:      result.user.name,
        email:     result.user.email,
        companyId: result.company.id,
        companyName: result.company.name,
        role:      "company_owner",
      },
    });
  });

  // ── PATCH /company ─────────────────────────────────────────────────────────
  app.patch("/company", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const body = request.body as PatchCompanyBody;

    if (body.ticker !== undefined) {
      const t = body.ticker.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (t) {
        const tickerConflict = await prisma.company.findFirst({ where: { ticker: t, id: { not: companyId } } });
        if (tickerConflict) return conflict(reply, "CONFLICT", "That ticker is already taken. Choose another.");
      }
    }

    await prisma.company.update({
      where: { id: companyId },
      data: {
        ...(body.ticker !== undefined ? { ticker: body.ticker.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || null } : {}),
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
        ...(body.depotLocationId !== undefined ? { depotLocationId: body.depotLocationId ? Number(body.depotLocationId) : null } : {}),
      },
    });
    const updated = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        depotLocation: {
          select: { id: true, name: true, siteName: true, postcode: true, lat: true, lng: true, town: true },
        },
      },
    });
    return reply.send(updated);
  });

  // ── GET /company ───────────────────────────────────────────────────────────
  app.get("/company", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        depotLocation: {
          select: { id: true, name: true, siteName: true, postcode: true, lat: true, lng: true, town: true },
        },
      },
    });
    if (!company) return notFound(reply, "Company");
    return reply.send(company);
  });

  // ── GET /drivers ───────────────────────────────────────────────────────────
  app.get("/drivers", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string };

    const drivers = await prisma.driverProfile.findMany({
      where: { companyId, ...(q.status ? { status: q.status } : {}) },
      include: {
        user: { select: { id: true, email: true, name: true, status: true } },
        holidayRequests: { where: { status: { not: "deleted" } }, orderBy: { startDate: "asc" } },
      },
      orderBy: { displayName: "asc" },
    });

    return reply.send({ data: drivers });
  });

  // ── POST /drivers ──────────────────────────────────────────────────────────
  app.post("/drivers", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const zodParsed = parseBody(CreateDriverSchema, request.body);
    if (!zodParsed.ok) return validationFailed(reply, zodParsed.errors);
    const body = zodParsed.data as CreateDriverBody;
    const { companyId, userId: actorId } = request.user!;

    // displayName.min(1) already enforced by CreateDriverSchema above

    let userId: number | null = null;
    let isNewUser = false;
    const DEFAULT_PIN = "123456";

    if (body.email?.trim()) {
      const emailLower = body.email.toLowerCase().trim();

      const existingInCompany = await prisma.driverProfile.findFirst({
        where: { companyId, contactEmail: emailLower },
      });
      if (existingInCompany) {
        return conflict(reply, "CONFLICT", "A driver with this email already exists in your company");
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

      await writeAudit(prisma, {
        companyId, actorId,
        entityType: "Driver", entityId: driver.id,
        action: "create",
        newValue: { displayName: driver.displayName, email: emailLower },
        note: isNewUser ? "Driver created with new login" : "Agency driver linked",
        request,
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

    await writeAudit(prisma, {
      companyId, actorId,
      entityType: "Driver", entityId: driver.id,
      action: "create",
      newValue: { displayName: driver.displayName },
      note: "Driver created without login account",
      request,
    });

    return reply.status(201).send(driver);
  });

  // ── PATCH /drivers/:id ─────────────────────────────────────────────────────
  app.patch("/drivers/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const zodParsed = parseBody(PatchDriverSchema, request.body);
    if (!zodParsed.ok) return validationFailed(reply, zodParsed.errors);
    const body = zodParsed.data as PatchDriverBody;
    const { companyId, userId: actorId } = request.user!;

    const driver = await prisma.driverProfile.findFirst({
      where: { id, companyId },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!driver) return notFound(reply, "Driver");

    // Validate new email before entering the transaction
    const newEmail = body.email?.toLowerCase().trim();
    if (newEmail && driver.user && newEmail !== driver.user.email) {
      const emailConflict = await prisma.user.findUnique({ where: { email: newEmail } });
      if (emailConflict && emailConflict.id !== driver.user.id) {
        return conflict(reply, "CONFLICT", "A login account with this email already exists");
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.driverProfile.update({
        where: { id },
        data: {
          ...driverProfileData(body),
          ...(newEmail ? { contactEmail: newEmail } : {}),
        },
      });

      // Keep User.email in sync so the driver can log in with the updated address
      if (newEmail && driver.userId && driver.user && newEmail !== driver.user.email) {
        await tx.user.update({ where: { id: driver.userId }, data: { email: newEmail } });
      }

      if (Array.isArray(body.holidayRequests)) {
        await tx.holidayRequest.updateMany({
          where: { companyId, driverProfileId: id, status: { not: "deleted" } },
          data:  { status: "deleted" },
        });

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
          holidayRequests: { where: { status: { not: "deleted" } }, orderBy: { startDate: "asc" } },
        },
      });
    });

    await writeAudit(prisma, {
      companyId, actorId,
      entityType: "Driver", entityId: id,
      action: "update",
      newValue: body,
      note: "Driver profile updated",
      request,
    });

    return reply.send(updated);
  });

  // ── PATCH /drivers/:id/status ──────────────────────────────────────────────
  app.patch("/drivers/:id/status", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const zodParsed = parseBody(PatchDriverStatusSchema, request.body);
    if (!zodParsed.ok) return validationFailed(reply, zodParsed.errors);
    const body = zodParsed.data as PatchDriverStatusBody;
    const { companyId, userId: actorId } = request.user!;

    // status enum already enforced by PatchDriverStatusSchema above

    const driver = await prisma.driverProfile.findFirst({ where: { id, companyId } });
    if (!driver) return notFound(reply, "Driver");

    const oldStatus = driver.status;
    const updated = await prisma.driverProfile.update({
      where: { id },
      data:  { status: body.status },
    });

    await writeAudit(prisma, {
      companyId, actorId,
      entityType: "Driver", entityId: id,
      action: "status_change", field: "status",
      oldValue: { status: oldStatus },
      newValue: { status: body.status },
      note: `Driver status changed from ${oldStatus} to ${body.status}`,
      request,
    });

    return reply.send(updated);
  });

  // ── POST /drivers/:id/reset-password ──────────────────────────────────────
  app.post("/drivers/:id/reset-password", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId } = request.user!;

    const driver = await prisma.driverProfile.findFirst({
      where: { id, companyId },
      include: { user: true },
    });
    if (!driver)        return notFound(reply, "Driver");
    if (!driver.userId) return badRequest(reply, "BAD_REQUEST", "Driver has no login account");

    const activeMembershipCount = await prisma.companyMembership.count({
      where: { userId: driver.userId, status: "active" },
    });
    if (activeMembershipCount > 1) {
      return conflict(reply, "MULTI_COMPANY_DRIVER", "This driver belongs to multiple companies. Ask the driver to change their PIN directly.");
    }

    const DEFAULT_PIN  = "123456";
    const passwordHash = await bcrypt.hash(DEFAULT_PIN, 12);

    // User has no companyId column — safe: driver.userId fetched via companyId-scoped driverProfile lookup above
    await prisma.user.update({ where: { id: driver.userId }, data: { passwordHash } });

    return reply.send({
      ok:         true,
      defaultPin: DEFAULT_PIN,
      loginEmail: driver.user!.email,
      message:    "PIN reset to default — driver must change on next login",
    });
  });
}

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

function generateToken(payload: object): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "7d" });
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
      },
    });
    return reply.send(updated);
  });

  // ── GET /company ───────────────────────────────────────────────────────────
  app.get("/company", { preHandler: authenticate }, async (request, reply) => {
    const { companyId } = request.user!;
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return reply.status(404).send({ error: "Company not found" });
    return reply.send(company);
  });

  // ── GET /drivers ───────────────────────────────────────────────────────────
  app.get("/drivers", { preHandler: authenticate }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string };

    const drivers = await prisma.driverProfile.findMany({
      where: { companyId, ...(q.status ? { status: q.status } : {}) },
      include: { user: { select: { id: true, email: true, name: true, status: true } } },
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
          displayName:    body.displayName.trim(),
          employeeNumber: body.employeeNumber ?? null,
          phoneNumber:    body.phoneNumber    ?? null,
          contactEmail:   emailLower,
          contactPhone:   body.phoneNumber    ?? null,
          status:         "active",
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
        displayName:    body.displayName.trim(),
        employeeNumber: body.employeeNumber ?? null,
        phoneNumber:    body.phoneNumber    ?? null,
        status:         "active",
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

    const updated = await prisma.driverProfile.update({
      where: { id },
      data: {
        displayName:    body.displayName    ?? driver.displayName,
        employeeNumber: body.employeeNumber ?? driver.employeeNumber,
        phoneNumber:    body.phoneNumber    ?? driver.phoneNumber,
      },
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

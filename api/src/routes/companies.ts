import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticate, requireRole } from "../middleware.js";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function generateToken(payload: object): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "7d" });
}

export async function companyRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── POST /auth/register-company ────────────────────────────────────────────
  app.post("/auth/register-company", async (request, reply) => {
    const body = request.body as any;
    const { companyName, name, email, password, confirmPassword } = body;

    // Validation
    const errors: string[] = [];
    if (!companyName?.trim())         errors.push("Company name is required");
    if (!name?.trim())                errors.push("Your name is required");
    if (!email?.trim())               errors.push("Email is required");
    if (!password || password.length < 8) errors.push("Password must be at least 8 characters");
    if (password !== confirmPassword) errors.push("Passwords do not match");
    if (errors.length) return reply.status(400).send({ error: errors.join(", ") });

    // Check email unique
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return reply.status(409).send({ error: "Email already registered" });

    // Create slug — ensure unique
    let slug = slugify(companyName.trim());
    const slugExists = await prisma.company.findUnique({ where: { slug } });
    if (slugExists) slug = `${slug}-${Date.now()}`;

    const passwordHash = await bcrypt.hash(password, 12);

    // Create company + user + membership in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: companyName.trim(), slug, status: "trial" },
      });

      const user = await tx.user.create({
        data: {
          name: name.trim(),
          email: email.toLowerCase().trim(),
          passwordHash,
          status: "active",
        },
      });

      await tx.companyMembership.create({
        data: {
          companyId: company.id,
          userId:    user.id,
          role:      "company_owner",
          status:    "active",
        },
      });

      return { company, user };
    });

    const token = generateToken({
      userId:    result.user.id,
      companyId: result.company.id,
      role:      "company_owner",
    });

    return reply.status(201).send({
      token,
      companyId: result.company.id,
      userId:    result.user.id,
      user: {
        id:        result.user.id,
        name:      result.user.name,
        email:     result.user.email,
        companyId: result.company.id,
        role:      "company_owner",
      },
    });
  });

  // ── GET /company — get current company info ────────────────────────────────
  app.get("/company", { preHandler: authenticate }, async (request, reply) => {
    const { companyId } = request.user!;
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return reply.status(404).send({ error: "Company not found" });
    return reply.send(company);
  });

  // ── GET /drivers — list company drivers ───────────────────────────────────
  app.get("/drivers", { preHandler: authenticate }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string };

    const drivers = await prisma.driverProfile.findMany({
      where: {
        companyId,
        ...(q.status ? { status: q.status } : {}),
      },
      include: { user: { select: { id: true, email: true, name: true, status: true } } },
      orderBy: { displayName: "asc" },
    });

    return reply.send({ data: drivers });
  });

  // ── POST /drivers — create driver ─────────────────────────────────────────
  app.post("/drivers", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as any;
    const { companyId } = request.user!;

    if (!body.displayName?.trim()) return reply.status(400).send({ error: "Driver name is required" });

    // If email provided — create a user account and link it
    let userId: number | null = null;

    if (body.email?.trim()) {
      const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
      if (existing) return reply.status(409).send({ error: "Email already in use" });

      const DEFAULT_PIN = "123456";
      const passwordHash = await bcrypt.hash(DEFAULT_PIN, 12);

      const newUser = await prisma.user.create({
        data: {
          name:         body.displayName.trim(),
          email:        body.email.toLowerCase().trim(),
          passwordHash,
          status:       "active",
        },
      });

      await prisma.companyMembership.create({
        data: {
          companyId,
          userId: newUser.id,
          role:   "driver",
          status: "active",
        },
      });

      userId = newUser.id;

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

      return reply.status(201).send({
        ...driver,
        defaultPin:  DEFAULT_PIN,
        loginEmail:  body.email.toLowerCase().trim(),
        message:     "Driver created with default PIN",
      });
    }

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

  // ── PATCH /drivers/:id — update driver ────────────────────────────────────
  app.patch("/drivers/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id        = parseInt((request.params as any).id, 10);
    const body      = request.body as any;
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

  // ── PATCH /drivers/:id/status — activate/deactivate ───────────────────────
  // ── POST /drivers/:id/reset-password — admin resets driver password ─────────
  app.post("/drivers/:id/reset-password", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as any).id, 10);
    const { companyId } = request.user!;

    const driver = await prisma.driverProfile.findFirst({
      where: { id, companyId },
      include: { user: true },
    });
    if (!driver)       return reply.status(404).send({ error: "Driver not found" });
    if (!driver.userId) return reply.status(400).send({ error: "Driver has no login account" });

    const DEFAULT_PIN = "123456";
    const passwordHash = await bcrypt.hash(DEFAULT_PIN, 12);

    await prisma.user.update({
      where: { id: driver.userId },
      data:  { passwordHash },
    });

    return reply.send({
      ok:         true,
      defaultPin: DEFAULT_PIN,
      loginEmail: driver.user!.email,
      message:    "PIN reset to default — driver must change on next login",
    });
  });

  app.patch("/drivers/:id/status", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id        = parseInt((request.params as any).id, 10);
    const body      = request.body as any;
    const { companyId } = request.user!;

    if (!["active","inactive"].includes(body.status)) {
      return reply.status(400).send({ error: "Status must be active or inactive" });
    }

    const driver = await prisma.driverProfile.findFirst({ where: { id, companyId } });
    if (!driver) return reply.status(404).send({ error: "Driver not found" });

    const updated = await prisma.driverProfile.update({
      where: { id },
      data:  { status: body.status },
    });

    return reply.send(updated);
  });
}

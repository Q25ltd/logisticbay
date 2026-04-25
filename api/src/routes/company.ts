import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import { hashPassword, verifyPassword } from "../auth.js";
import { authenticate, requireRole } from "../middleware.js";
import { validateCreateDriver, validateChangePassword } from "../validation.js";
import { USER_STATUSES } from "../constants.js";

export async function companyRoutes(app: FastifyInstance, prisma: PrismaClient) {

  const adminOnly = [authenticate, requireRole("company_admin")];

  // ── POST /company/drivers ──────────────────────────────────────────────────
  // Admin creates a new driver account under their company.

  app.post("/company/drivers", { preHandler: adminOnly }, async (request, reply) => {
    const body = request.body as any;
    const { valid, errors } = validateCreateDriver(body);
    if (!valid) return reply.status(400).send({ error: "Validation failed", details: errors });

    const email = body.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: "A user with this email already exists" });
    }

    const passwordHash = await hashPassword(body.password);

    const driver = await prisma.user.create({
      data: {
        companyId:    request.user!.companyId,
        name:         body.name.trim(),
        email,
        passwordHash,
        role:         "driver",
        status:       "active",
      },
      select: {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        status:    true,
        companyId: true,
        createdAt: true,
      },
    });

    app.log.info(
      { driverId: driver.id, companyId: request.user!.companyId },
      "Driver created"
    );

    return reply.status(201).send(driver);
  });

  // ── GET /company/drivers ───────────────────────────────────────────────────
  // Admin lists all drivers in their company.
  // Optionally filter by status: ?status=active|inactive|deleted

  app.get("/company/drivers", { preHandler: adminOnly }, async (request, reply) => {
    const q = request.query as { status?: string };

    if (q.status && !USER_STATUSES.includes(q.status as any)) {
      return reply.status(400).send({
        error: `Invalid status. Allowed: ${USER_STATUSES.join(", ")}`,
      });
    }

    const drivers = await prisma.user.findMany({
      where: {
        companyId: request.user!.companyId,
        role:      "driver",
        ...(q.status ? { status: q.status } : {}),
      },
      select: {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        status:    true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });

    return reply.send({ data: drivers, total: drivers.length });
  });

  // ── GET /company/drivers/:id ───────────────────────────────────────────────
  // Admin gets a single driver by ID (must be in same company).

  app.get("/company/drivers/:id", { preHandler: adminOnly }, async (request, reply) => {
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: "Driver ID must be a number" });

    const driver = await prisma.user.findFirst({
      where: { id, companyId: request.user!.companyId, role: "driver" },
      select: {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        status:    true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!driver) return reply.status(404).send({ error: "Driver not found" });

    return reply.send(driver);
  });

  // ── PATCH /company/drivers/:id/status ─────────────────────────────────────
  // Admin sets driver status: active | inactive | deleted

  app.patch("/company/drivers/:id/status", { preHandler: adminOnly }, async (request, reply) => {
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: "Driver ID must be a number" });

    const { status } = request.body as any;

    if (!status || !USER_STATUSES.includes(status)) {
      return reply.status(400).send({
        error: `status must be one of: ${USER_STATUSES.join(", ")}`,
      });
    }

    // Ensure driver belongs to this company
    const driver = await prisma.user.findFirst({
      where: { id, companyId: request.user!.companyId, role: "driver" },
    });

    if (!driver) return reply.status(404).send({ error: "Driver not found" });

    const updated = await prisma.user.update({
      where: { id },
      data:  { status },
      select: {
        id:     true,
        name:   true,
        email:  true,
        status: true,
      },
    });

    app.log.info(
      { driverId: id, from: driver.status, to: status, companyId: request.user!.companyId },
      "Driver status updated"
    );

    return reply.send(updated);
  });

  // ── POST /company/drivers/:id/reset-password ───────────────────────────────
  // Admin resets a driver's password directly (no current password needed).

  app.post("/company/drivers/:id/reset-password", { preHandler: adminOnly }, async (request, reply) => {
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: "Driver ID must be a number" });

    const { newPassword } = request.body as any;
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return reply.status(400).send({ error: "newPassword must be at least 8 characters" });
    }

    const driver = await prisma.user.findFirst({
      where: { id, companyId: request.user!.companyId, role: "driver" },
    });

    if (!driver) return reply.status(404).send({ error: "Driver not found" });

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id }, data: { passwordHash } });

    app.log.info({ driverId: id, companyId: request.user!.companyId }, "Driver password reset by admin");

    return reply.send({ status: "password reset" });
  });
}

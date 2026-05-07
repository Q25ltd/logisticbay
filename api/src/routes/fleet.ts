import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";

// ── Fleet Units ──────────────────────────────────────────────────────────────

interface CreateUnitBody {
  registration: string;
  vehicleClass:  string;
  status?:       string;
  notes?:        string;
  yardLocation?: string;
}

interface PatchUnitBody {
  registration?: string;
  vehicleClass?:  string;
  status?:        string;
  notes?:         string;
  yardLocation?:  string;
}

// ── Fleet Trailers ───────────────────────────────────────────────────────────

interface CreateTrailerBody {
  registration: string;
  trailerType:   string;
  status?:       string;
  notes?:        string;
  yardLocation?: string;
}

interface PatchTrailerBody {
  registration?: string;
  trailerType?:   string;
  status?:        string;
  notes?:         string;
  yardLocation?:  string;
}

export async function fleetRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /fleet/units ─────────────────────────────────────────────────────
  app.get("/fleet/units", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string };

    const where: Record<string, unknown> = { companyId };
    if (q.status) where.status = q.status;
    else where.status = { not: "deleted" };

    const units = await prisma.fleetUnit.findMany({
      where,
      orderBy: { registration: "asc" },
    });

    return reply.send({ data: units });
  });

  // ── POST /fleet/units ────────────────────────────────────────────────────
  app.post("/fleet/units", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateUnitBody;
    const { companyId } = request.user!;

    if (!body.registration?.trim()) return reply.status(400).send({ error: "Registration is required" });
    if (!body.vehicleClass?.trim())  return reply.status(400).send({ error: "Vehicle class is required" });

    const unit = await prisma.fleetUnit.create({
      data: {
        companyId,
        registration: body.registration.trim(),
        vehicleClass:  body.vehicleClass.trim(),
        status:        body.status ?? "available",
        notes:         body.notes?.trim() ?? null,
        yardLocation:  body.yardLocation?.trim() ?? null,
      },
    });

    return reply.status(201).send(unit);
  });

  // ── PATCH /fleet/units/:id ───────────────────────────────────────────────
  app.patch("/fleet/units/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchUnitBody;
    const { companyId } = request.user!;

    const unit = await prisma.fleetUnit.findFirst({ where: { id, companyId, status: { not: "deleted" } } });
    if (!unit) return reply.status(404).send({ error: "Fleet unit not found" });

    const updated = await prisma.fleetUnit.update({
      where: { id },
      data: {
        registration: body.registration?.trim() ?? unit.registration,
        vehicleClass:  body.vehicleClass?.trim()  ?? unit.vehicleClass,
        status:        body.status                 ?? unit.status,
        notes:         body.notes !== undefined    ? (body.notes?.trim() || null) : unit.notes,
        yardLocation:  body.yardLocation !== undefined ? (body.yardLocation?.trim() || null) : unit.yardLocation,
      },
    });

    return reply.send(updated);
  });

  // ── DELETE /fleet/units/:id ──────────────────────────────────────────────
  app.delete("/fleet/units/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId } = request.user!;

    const unit = await prisma.fleetUnit.findFirst({ where: { id, companyId } });
    if (!unit) return reply.status(404).send({ error: "Fleet unit not found" });
    if (unit.status === "deleted") return reply.status(204).send();

    await prisma.fleetUnit.update({
      where: { id },
      data: {
        status:           "deleted",
        assignedDriverId: null,
        currentTrailerId: null,
        notes:            [unit.notes?.trim(), "Deleted by planner. Record kept for audit/history."].filter(Boolean).join("\n"),
      },
    });
    return reply.status(204).send();
  });

  // ── GET /fleet/trailers ──────────────────────────────────────────────────
  app.get("/fleet/trailers", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string };

    const where: Record<string, unknown> = { companyId };
    if (q.status) where.status = q.status;
    else where.status = { not: "deleted" };

    const trailers = await prisma.fleetTrailer.findMany({
      where,
      orderBy: { registration: "asc" },
    });

    return reply.send({ data: trailers });
  });

  // ── POST /fleet/trailers ─────────────────────────────────────────────────
  app.post("/fleet/trailers", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateTrailerBody;
    const { companyId } = request.user!;

    if (!body.registration?.trim()) return reply.status(400).send({ error: "Registration is required" });
    if (!body.trailerType?.trim())  return reply.status(400).send({ error: "Trailer type is required" });

    const trailer = await prisma.fleetTrailer.create({
      data: {
        companyId,
        registration: body.registration.trim(),
        trailerType:   body.trailerType.trim(),
        status:        body.status ?? "available",
        notes:         body.notes?.trim() ?? null,
        yardLocation:  body.yardLocation?.trim() ?? null,
      },
    });

    return reply.status(201).send(trailer);
  });

  // ── PATCH /fleet/trailers/:id ────────────────────────────────────────────
  app.patch("/fleet/trailers/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchTrailerBody;
    const { companyId } = request.user!;

    const trailer = await prisma.fleetTrailer.findFirst({ where: { id, companyId, status: { not: "deleted" } } });
    if (!trailer) return reply.status(404).send({ error: "Fleet trailer not found" });

    const updated = await prisma.fleetTrailer.update({
      where: { id },
      data: {
        registration: body.registration?.trim() ?? trailer.registration,
        trailerType:   body.trailerType?.trim()   ?? trailer.trailerType,
        status:        body.status                 ?? trailer.status,
        notes:         body.notes !== undefined    ? (body.notes?.trim() || null) : trailer.notes,
        yardLocation:  body.yardLocation !== undefined ? (body.yardLocation?.trim() || null) : trailer.yardLocation,
      },
    });

    return reply.send(updated);
  });

  // ── DELETE /fleet/trailers/:id ───────────────────────────────────────────
  app.delete("/fleet/trailers/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId } = request.user!;

    const trailer = await prisma.fleetTrailer.findFirst({ where: { id, companyId } });
    if (!trailer) return reply.status(404).send({ error: "Fleet trailer not found" });
    if (trailer.status === "deleted") return reply.status(204).send();
    if (trailer.status === "loaded" && trailer.linkedJobId) {
      return reply.status(409).send({
        error: "Cannot delete a loaded trailer",
        message: `Trailer ${trailer.registration} is loaded and linked to job #${trailer.linkedJobId}. Replan or unload it before deleting.`,
      });
    }

    await prisma.fleetTrailer.update({
      where: { id },
      data: {
        status:         "deleted",
        attachedUnitId: null,
        linkedJobId:    null,
        notes:          [trailer.notes?.trim(), "Deleted by planner. Record kept for audit/history."].filter(Boolean).join("\n"),
      },
    });
    return reply.status(204).send();
  });
}

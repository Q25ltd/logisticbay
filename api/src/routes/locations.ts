import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { validateCreateLocation } from "../validation.js";
import type { CreateLocationBody, PatchLocationBody } from "../types/requests.js";

export async function locationRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /locations ──────────────────────────────────────────────────────────
  app.get("/locations", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const locs = await prisma.savedLocation.findMany({
      where:   { companyId },
      orderBy: { name: "asc" },
    });
    return reply.send({ data: locs });
  });

  // ── POST /locations ─────────────────────────────────────────────────────────
  app.post("/locations", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateLocationBody;
    const { companyId } = request.user!;

    const v = validateCreateLocation(body);
    if (!v.valid) return reply.status(400).send({ error: v.errors.join(", ") });

    const locationTextSnapshot = (body.locationTextSnapshot ?? body.addressText ?? "").trim();
    const lat = body.lat ?? body.latitude ?? null;
    const lng = body.lng ?? body.longitude ?? null;

    const loc = await prisma.savedLocation.create({
      data: {
        companyId,
        name:         body.name.trim(),
        siteName:     body.siteName?.trim() ?? "",
        unitName:     body.unitName?.trim() ?? "",
        locationTextSnapshot,
        street:       body.street?.trim() ?? "",
        town:         body.town?.trim() ?? "",
        postcode:     body.postcode?.trim() ?? "",
        lat,
        lng,
        gateLat:      body.gateLat ?? null,
        gateLng:      body.gateLng ?? null,
        contactName:  body.contactName?.trim() ?? "",
        contactPhone: body.contactPhone?.trim() ?? "",
        instructions: body.instructions?.trim() ?? "",
        internalNotes: (body.internalNotes ?? body.notes ?? "").trim(),
      },
    });

    return reply.status(201).send(loc);
  });

  // ── PATCH /locations/:id ────────────────────────────────────────────────────
  app.patch("/locations/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchLocationBody;
    const { companyId } = request.user!;

    const loc = await prisma.savedLocation.findFirst({ where: { id, companyId } });
    if (!loc) return reply.status(404).send({ error: "Location not found" });

    const updated = await prisma.savedLocation.update({
      where: { id },
      data: {
        name:         body.name?.trim() ?? loc.name,
        siteName:     body.siteName?.trim() ?? loc.siteName,
        unitName:     body.unitName?.trim() ?? loc.unitName,
        locationTextSnapshot: (body.locationTextSnapshot ?? body.addressText)?.trim() ?? loc.locationTextSnapshot,
        street:       body.street?.trim() ?? loc.street,
        town:         body.town?.trim() ?? loc.town,
        postcode:     body.postcode?.trim() ?? loc.postcode,
        lat:          body.lat ?? body.latitude ?? loc.lat,
        lng:          body.lng ?? body.longitude ?? loc.lng,
        gateLat:      body.gateLat ?? loc.gateLat,
        gateLng:      body.gateLng ?? loc.gateLng,
        contactName:  body.contactName?.trim() ?? loc.contactName,
        contactPhone: body.contactPhone?.trim() ?? loc.contactPhone,
        instructions: body.instructions?.trim() ?? loc.instructions,
        internalNotes: (body.internalNotes ?? body.notes)?.trim() ?? loc.internalNotes,
      },
    });

    return reply.send(updated);
  });
}

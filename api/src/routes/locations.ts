import type { FastifyInstance } from "fastify";
import { parseIdParam } from "../lib/validate.js";
import { PrismaClient } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { validateCreateLocation } from "../validation.js";
import type { CreateLocationBody, PatchLocationBody } from "../types/requests.js";
import { badRequest, notFound, validationFailed } from "../lib/errors.js";

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
    if (!v.valid) return validationFailed(reply, v.errors);

    const lat = body.lat ?? null;
    const lng = body.lng ?? null;

    const loc = await prisma.savedLocation.create({
      data: {
        companyId,
        name:                 body.name.trim(),
        siteName:             body.siteName?.trim() || null,
        unitName:             body.unitName?.trim() || null,
        locationTextSnapshot: body.locationTextSnapshot?.trim() || null,
        street:               body.street?.trim() || null,
        town:                 body.town?.trim() || null,
        postcode:             body.postcode?.trim() || null,
        lat,
        lng,
        gateLat:      body.gateLat ?? null,
        gateLng:      body.gateLng ?? null,
        contactName:  body.contactName?.trim() || null,
        contactPhone: body.contactPhone?.trim() || null,
        instructions: body.instructions?.trim() || null,
        internalNotes: body.internalNotes?.trim() || null,
      },
    });

    return reply.status(201).send(loc);
  });

  // ── PATCH /locations/:id ────────────────────────────────────────────────────
  app.patch("/locations/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const body = request.body as PatchLocationBody;
    const { companyId } = request.user!;

    const loc = await prisma.savedLocation.findFirst({ where: { id, companyId } });
    if (!loc) return notFound(reply, "Location");

    const updated = await prisma.savedLocation.update({
      where: { id },
      data: {
        name:                 body.name?.trim() ?? loc.name,
        siteName:             body.siteName             !== undefined ? (body.siteName?.trim()             || null) : loc.siteName,
        unitName:             body.unitName             !== undefined ? (body.unitName?.trim()             || null) : loc.unitName,
        locationTextSnapshot: body.locationTextSnapshot !== undefined ? (body.locationTextSnapshot?.trim() || null) : loc.locationTextSnapshot,
        street:               body.street               !== undefined ? (body.street?.trim()               || null) : loc.street,
        town:                 body.town                 !== undefined ? (body.town?.trim()                 || null) : loc.town,
        postcode:             body.postcode             !== undefined ? (body.postcode?.trim()             || null) : loc.postcode,
        lat:                  body.lat     ?? loc.lat,
        lng:                  body.lng     ?? loc.lng,
        gateLat:              body.gateLat ?? loc.gateLat,
        gateLng:              body.gateLng ?? loc.gateLng,
        contactName:          body.contactName  !== undefined ? (body.contactName?.trim()  || null) : loc.contactName,
        contactPhone:         body.contactPhone !== undefined ? (body.contactPhone?.trim() || null) : loc.contactPhone,
        instructions:         body.instructions !== undefined ? (body.instructions?.trim() || null) : loc.instructions,
        internalNotes:        body.internalNotes !== undefined ? (body.internalNotes?.trim() || null) : loc.internalNotes,
      },
    });

    return reply.send(updated);
  });
}

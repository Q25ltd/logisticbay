import type { FastifyInstance } from "fastify";
import { PrismaClient, Prisma } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { validateCreateTemplate } from "../validation.js";
import type { CreateTemplateBody, PatchTemplateBody } from "../types/requests.js";

export async function templateRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /job-templates ──────────────────────────────────────────────────────
  app.get("/job-templates", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string };

    const templates = await prisma.jobTemplate.findMany({
      where: {
        companyId,
        status: q.status ?? "active",
      },
      include: {
        pickupLocation:  true,
        dropoffLocation: true,
      },
      orderBy: { name: "asc" },
    });

    return reply.send({ data: templates });
  });

  // ── POST /job-templates ─────────────────────────────────────────────────────
  app.post("/job-templates", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateTemplateBody;
    const { companyId } = request.user!;

    const v = validateCreateTemplate(body);
    if (!v.valid) return reply.status(400).send({ error: v.errors.join(", ") });

    let pickupText  = body.pickupTextSnapshot  ?? "";
    let dropoffText = body.dropoffTextSnapshot ?? "";

    if (body.pickupLocationId) {
      const loc = await prisma.savedLocation.findFirst({ where: { id: body.pickupLocationId, companyId } });
      if (!loc) return reply.status(400).send({ error: "Pickup location not found" });
      pickupText = loc.locationTextSnapshot;
    }
    if (body.dropoffLocationId) {
      const loc = await prisma.savedLocation.findFirst({ where: { id: body.dropoffLocationId, companyId } });
      if (!loc) return reply.status(400).send({ error: "Dropoff location not found" });
      dropoffText = loc.locationTextSnapshot;
    }

    const template = await prisma.jobTemplate.create({
      data: {
        companyId,
        name:                body.name.trim(),
        pickupLocationId:    body.pickupLocationId  ?? null,
        dropoffLocationId:   body.dropoffLocationId ?? null,
        pickupTextSnapshot:  pickupText,
        dropoffTextSnapshot: dropoffText,
        defaultReference:    body.defaultReference    ?? "",
        defaultNotes:        body.defaultNotes        ?? "",
        defaultMaterialType: body.defaultMaterialType ?? "",
        defaultStops:        body.defaultStops        ?? undefined,
        defaultLoadDetails:  body.defaultLoadDetails  ?? undefined,
        defaultJobData:      body.defaultJobData      ?? undefined,
        trailerTypesAllowed: body.trailerTypesAllowed ?? [],
        status:              "active",
      },
    });

    return reply.status(201).send(template);
  });

  // ── PATCH /job-templates/:id ────────────────────────────────────────────────
  app.patch("/job-templates/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchTemplateBody;
    const { companyId } = request.user!;

    const template = await prisma.jobTemplate.findFirst({ where: { id, companyId } });
    if (!template) return reply.status(404).send({ error: "Template not found" });

    const updated = await prisma.jobTemplate.update({
      where: { id },
      data: {
        name:                body.name                ?? template.name,
        defaultReference:    body.defaultReference    ?? template.defaultReference,
        defaultNotes:        body.defaultNotes        ?? template.defaultNotes,
        defaultMaterialType: body.defaultMaterialType ?? template.defaultMaterialType,
        defaultStops:        (body.defaultStops        !== undefined ? body.defaultStops        : template.defaultStops)        as Prisma.InputJsonValue | undefined,
        defaultLoadDetails:  (body.defaultLoadDetails  !== undefined ? body.defaultLoadDetails  : template.defaultLoadDetails)  as Prisma.InputJsonValue | undefined,
        defaultJobData:      (body.defaultJobData      !== undefined ? body.defaultJobData      : template.defaultJobData)      as Prisma.InputJsonValue | undefined,
        trailerTypesAllowed: (body.trailerTypesAllowed !== undefined ? body.trailerTypesAllowed : template.trailerTypesAllowed) as Prisma.InputJsonValue | undefined,
        status:              body.status              ?? template.status,
      },
    });

    return reply.send(updated);
  });

  // ── DELETE /job-templates/:id ───────────────────────────────────────────────
  app.delete("/job-templates/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId } = request.user!;

    const template = await prisma.jobTemplate.findFirst({ where: { id, companyId } });
    if (!template) return reply.status(404).send({ error: "Template not found" });

    // Soft-delete: archive so existing job history (templateId FK) stays intact
    await prisma.jobTemplate.update({ where: { id }, data: { status: "archived" } });
    return reply.send({ ok: true });
  });
}

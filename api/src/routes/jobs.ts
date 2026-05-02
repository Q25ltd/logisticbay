import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import {
  validateCreateLocation,
  validateCreateTemplate,
  validateCreateJob,
  validateUpdateJobStatus,
  validateAddJobNote,
} from "../validation.js";
import type {
  CreateLocationBody,
  PatchLocationBody,
  CreateTemplateBody,
  PatchTemplateBody,
  CreateJobBody,
  PatchJobBody,
  UpdateJobStatusBody,
  AddJobNoteBody,
} from "../types/requests.js";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:         ["accepted", "in_progress", "cancelled"],
  accepted:        ["in_progress", "cancelled"],
  in_progress:     ["arrived_pickup", "cancelled"],
  arrived_pickup:  ["collected", "cancelled"],
  collected:       ["arrived_dropoff"],
  arrived_dropoff: ["completed"],
  completed:       [],
  cancelled:       [],
};

const EVENT_TYPE_MAP: Record<string, string> = {
  in_progress:     "started",
  arrived_pickup:  "arrived_pickup",
  collected:       "collected",
  arrived_dropoff: "arrived_dropoff",
  completed:       "completed",
  cancelled:       "cancelled",
};

export async function jobRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /locations ─────────────────────────────────────────────────────────
  app.get("/locations", { preHandler: authenticate }, async (request, reply) => {
    const { companyId } = request.user!;
    const locs = await prisma.savedLocation.findMany({
      where:   { companyId },
      orderBy: { name: "asc" },
    });
    return reply.send({ data: locs });
  });

  // ── POST /locations ────────────────────────────────────────────────────────
  app.post("/locations", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateLocationBody;
    const { companyId } = request.user!;

    const v = validateCreateLocation(body);
    if (!v.valid) return reply.status(400).send({ error: v.errors.join(", ") });

    const loc = await prisma.savedLocation.create({
      data: {
        companyId,
        name:        body.name.trim(),
        addressText: body.addressText.trim(),
        postcode:    body.postcode?.trim()  ?? "",
        notes:       body.notes?.trim()     ?? "",
        latitude:    body.latitude          ?? null,
        longitude:   body.longitude         ?? null,
      },
    });

    return reply.status(201).send(loc);
  });

  // ── PATCH /locations/:id ───────────────────────────────────────────────────
  app.patch("/locations/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchLocationBody;
    const { companyId } = request.user!;

    const loc = await prisma.savedLocation.findFirst({ where: { id, companyId } });
    if (!loc) return reply.status(404).send({ error: "Location not found" });

    const updated = await prisma.savedLocation.update({
      where: { id },
      data: {
        name:        body.name        ?? loc.name,
        addressText: body.addressText ?? loc.addressText,
        postcode:    body.postcode    ?? loc.postcode,
        notes:       body.notes       ?? loc.notes,
      },
    });

    return reply.send(updated);
  });

  // ── GET /job-templates ─────────────────────────────────────────────────────
  app.get("/job-templates", { preHandler: authenticate }, async (request, reply) => {
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

  // ── POST /job-templates ────────────────────────────────────────────────────
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
      pickupText = loc.addressText;
    }
    if (body.dropoffLocationId) {
      const loc = await prisma.savedLocation.findFirst({ where: { id: body.dropoffLocationId, companyId } });
      if (!loc) return reply.status(400).send({ error: "Dropoff location not found" });
      dropoffText = loc.addressText;
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
        status:              "active",
      },
    });

    return reply.status(201).send(template);
  });

  // ── PATCH /job-templates/:id ───────────────────────────────────────────────
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
        status:              body.status              ?? template.status,
      },
    });

    return reply.send(updated);
  });

  // ── GET /jobs — planner / driver view ─────────────────────────────────────
  app.get("/jobs", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, role, userId } = request.user!;
    const q = request.query as { date?: string; driverId?: string; status?: string };

    let driverProfileId: number | undefined;
    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile) return reply.send({ data: [] });
      driverProfileId = profile.id;
    }

    const where = {
      companyId,
      ...(driverProfileId    ? { assignedDriverId: driverProfileId }           : {}),
      ...(q.driverId         ? { assignedDriverId: parseInt(q.driverId, 10) }  : {}),
      ...(q.status           ? { status: q.status }                             : {}),
      ...(q.date ? {
        plannedDate: {
          gte: new Date(`${q.date}T00:00:00.000Z`),
          lt:  new Date(`${q.date}T23:59:59.999Z`),
        },
      } : {}),
    };

    const jobs = await prisma.plannedJob.findMany({
      where,
      include: {
        assignedDriver:  true,
        template:        true,
        pickupLocation:  true,
        dropoffLocation: true,
        events:          { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ plannedDate: "asc" }, { sequence: "asc" }],
    });

    return reply.send({ data: jobs });
  });

  // ── GET /jobs/my — driver's own jobs ──────────────────────────────────────
  app.get("/jobs/my", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;

    const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
    if (!profile) return reply.send({ data: [] });

    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const in7   = new Date(today);
    in7.setDate(today.getDate() + 7);

    const jobs = await prisma.plannedJob.findMany({
      where: {
        companyId,
        assignedDriverId: profile.id,
        plannedDate: { gte: today, lt: in7 },
        status: { not: "cancelled" },
      },
      include: {
        pickupLocation:  true,
        dropoffLocation: true,
        events:          { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ plannedDate: "asc" }, { sequence: "asc" }],
    });

    const todayStr     = today.toISOString().split("T")[0];
    const todayJobs    = jobs.filter(j => j.plannedDate.toISOString().split("T")[0] === todayStr);
    const upcomingJobs = jobs.filter(j => j.plannedDate.toISOString().split("T")[0] !== todayStr);

    return reply.send({ data: todayJobs, upcoming: upcomingJobs });
  });

  // ── GET /jobs/:id ─────────────────────────────────────────────────────────
  app.get("/jobs/:id", { preHandler: authenticate }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId, userId, role } = request.user!;

    const job = await prisma.plannedJob.findFirst({
      where: { id, companyId },
      include: {
        assignedDriver:  true,
        pickupLocation:  true,
        dropoffLocation: true,
        events:          { orderBy: { createdAt: "asc" } },
      },
    });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile || job.assignedDriverId !== profile.id) {
        return reply.status(403).send({ error: "Not your job" });
      }
    }

    return reply.send(job);
  });

  // ── POST /jobs — create job ───────────────────────────────────────────────
  app.post("/jobs", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateJobBody;
    const { companyId, userId } = request.user!;

    const v = validateCreateJob(body);
    if (!v.valid) return reply.status(400).send({ error: v.errors.join(", ") });

    const driver = await prisma.driverProfile.findFirst({
      where: { id: body.assignedDriverId, companyId, status: "active" },
    });
    if (!driver) return reply.status(400).send({ error: "Driver not found or inactive" });

    let pickupText  = body.pickupTextSnapshot  ?? "";
    let dropoffText = body.dropoffTextSnapshot ?? "";

    if (body.templateId) {
      const template = await prisma.jobTemplate.findFirst({ where: { id: body.templateId, companyId } });
      if (!template) return reply.status(400).send({ error: "Template not found" });
      pickupText  = pickupText  || template.pickupTextSnapshot;
      dropoffText = dropoffText || template.dropoffTextSnapshot;
    }

    if (!pickupText && body.pickupLocationId) {
      const loc = await prisma.savedLocation.findFirst({ where: { id: body.pickupLocationId, companyId } });
      if (loc) pickupText = loc.addressText;
    }
    if (!dropoffText && body.dropoffLocationId) {
      const loc = await prisma.savedLocation.findFirst({ where: { id: body.dropoffLocationId, companyId } });
      if (loc) dropoffText = loc.addressText;
    }

    if (!pickupText || !dropoffText) {
      return reply.status(400).send({ error: "Pickup and dropoff are required" });
    }

    const job = await prisma.plannedJob.create({
      data: {
        companyId,
        templateId:          body.templateId         ?? null,
        assignedDriverId:    body.assignedDriverId,
        createdByUserId:     userId,
        plannedDate:         new Date(body.plannedDate),
        sequence:            body.sequence            ?? 0,
        pickupLocationId:    body.pickupLocationId    ?? null,
        dropoffLocationId:   body.dropoffLocationId   ?? null,
        pickupTextSnapshot:  pickupText,
        dropoffTextSnapshot: dropoffText,
        referenceNumber:     body.referenceNumber     ?? "",
        materialType:        body.materialType        ?? "",
        quantityExpected:    body.quantityExpected    ?? "",
        quantityUnit:        body.quantityUnit        ?? "",
        plannerNotes:        body.plannerNotes        ?? "",
        assignedTruck:       body.assignedTruck       ?? "",
        assignedTrailer:     body.assignedTrailer     ?? "",
        vehicleClass:        body.vehicleClass        ?? "",
        requireCollection:   body.requireCollection   ?? false,
        requirePOD:          body.requirePOD          ?? false,
        requireDeliveryQty:  body.requireDeliveryQty  ?? false,
        status:              "pending",
      },
      include: { assignedDriver: true },
    });

    if (body.saveAsTemplate && body.templateName) {
      await prisma.jobTemplate.create({
        data: {
          companyId,
          name:                body.templateName,
          pickupLocationId:    body.pickupLocationId  ?? null,
          dropoffLocationId:   body.dropoffLocationId ?? null,
          pickupTextSnapshot:  pickupText,
          dropoffTextSnapshot: dropoffText,
          defaultReference:    body.referenceNumber   ?? "",
          defaultNotes:        body.plannerNotes      ?? "",
          defaultMaterialType: body.materialType      ?? "",
          status:              "active",
        },
      });
    }

    return reply.status(201).send(job);
  });

  // ── PATCH /jobs/:id — edit job (before started) ───────────────────────────
  app.patch("/jobs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchJobBody;
    const { companyId } = request.user!;

    const job = await prisma.plannedJob.findFirst({ where: { id, companyId } });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    if (!["pending", "accepted"].includes(job.status)) {
      return reply.status(403).send({ error: "Cannot edit a job that has already started" });
    }

    const updated = await prisma.plannedJob.update({
      where: { id },
      data: {
        pickupTextSnapshot:  body.pickupTextSnapshot  ?? job.pickupTextSnapshot,
        dropoffTextSnapshot: body.dropoffTextSnapshot ?? job.dropoffTextSnapshot,
        referenceNumber:     body.referenceNumber     ?? job.referenceNumber,
        materialType:        body.materialType        ?? job.materialType,
        quantityExpected:    body.quantityExpected    ?? job.quantityExpected,
        quantityUnit:        body.quantityUnit        ?? job.quantityUnit,
        plannerNotes:        body.plannerNotes        ?? job.plannerNotes,
        assignedTruck:       body.assignedTruck       ?? job.assignedTruck,
        assignedTrailer:     body.assignedTrailer     ?? job.assignedTrailer,
        vehicleClass:        body.vehicleClass        ?? job.vehicleClass,
        requireCollection:   body.requireCollection   ?? job.requireCollection,
        requirePOD:          body.requirePOD          ?? job.requirePOD,
        requireDeliveryQty:  body.requireDeliveryQty  ?? job.requireDeliveryQty,
        sequence:            body.sequence            ?? job.sequence,
        plannedDate:         body.plannedDate ? new Date(body.plannedDate) : job.plannedDate,
        assignedDriverId:    body.assignedDriverId    ?? job.assignedDriverId,
      },
    });

    return reply.send(updated);
  });

  // ── PATCH /jobs/:id/status — driver updates job status ────────────────────
  app.patch("/jobs/:id/status", { preHandler: authenticate }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as UpdateJobStatusBody;
    const { companyId, userId, role } = request.user!;

    const v = validateUpdateJobStatus(body);
    if (!v.valid) return reply.status(400).send({ error: v.errors.join(", ") });

    const job = await prisma.plannedJob.findFirst({
      where:   { id, companyId },
      include: { assignedDriver: true },
    });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile || job.assignedDriverId !== profile.id) {
        return reply.status(403).send({ error: "Not your job" });
      }
    }

    const allowed = ALLOWED_TRANSITIONS[job.status] ?? [];
    if (!allowed.includes(body.status)) {
      return reply.status(400).send({
        error: `Cannot move from ${job.status} to ${body.status}`,
      });
    }

    const updateData: Record<string, unknown> = { status: body.status };
    if (body.status === "collected") {
      if (body.actualQuantity !== undefined) updateData.actualQuantity = String(body.actualQuantity);
      if (body.actualUnit)                   updateData.actualUnit     = body.actualUnit;
      if (body.collectionNote)               updateData.collectionNote = body.collectionNote;
    }
    if (body.status === "completed" || body.status === "arrived_dropoff") {
      if (body.podNumber)    updateData.podNumber    = body.podNumber;
      if (body.deliveryNote) updateData.deliveryNote = body.deliveryNote;
    }

    await prisma.plannedJob.update({ where: { id }, data: updateData });

    await prisma.jobExecutionEvent.create({
      data: {
        jobId:          id,
        companyId,
        driverId:       userId,
        eventType:      EVENT_TYPE_MAP[body.status] ?? "note_added",
        note:           body.note ?? "",
        clientEventId:  `server-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        clientTimestamp: new Date(),
      },
    });

    return reply.send({ status: body.status, id });
  });

  // ── POST /jobs/:id/note ───────────────────────────────────────────────────
  app.post("/jobs/:id/note", { preHandler: authenticate }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as AddJobNoteBody;
    const { companyId, userId } = request.user!;

    const v = validateAddJobNote(body);
    if (!v.valid) return reply.status(400).send({ error: v.errors.join(", ") });

    const job = await prisma.plannedJob.findFirst({ where: { id, companyId } });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    await prisma.jobExecutionEvent.create({
      data: {
        jobId:           id,
        companyId,
        driverId:        userId,
        eventType:       "note_added",
        note:            body.note.trim(),
        clientEventId:   `server-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        clientTimestamp: new Date(),
      },
    });

    return reply.status(201).send({ ok: true });
  });
}

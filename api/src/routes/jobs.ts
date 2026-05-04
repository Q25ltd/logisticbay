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
import {
  validateStructuredJob,
  type StructuredJobStopInput,
  type StructuredLoadDetailsInput,
} from "../services/jobValidation.js";
import { scoreStructuredJob } from "../services/jobQuality.js";

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

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hasLoadDetailsInput(loadDetails: StructuredLoadDetailsInput | null | undefined): boolean {
  if (!loadDetails) return false;
  return Object.values(loadDetails).some(v => v !== undefined && v !== null && v !== "");
}

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

    const addressText = (body.addressText ?? body.locationTextSnapshot ?? "").trim();
    const latitude    = body.latitude ?? body.lat ?? null;
    const longitude   = body.longitude ?? body.lng ?? null;

    const loc = await prisma.savedLocation.create({
      data: {
        companyId,
        name:         body.name.trim(),
        siteName:     body.siteName?.trim() ?? "",
        unitName:     body.unitName?.trim() ?? "",
        addressText,
        street:       body.street?.trim() ?? "",
        town:         body.town?.trim() ?? "",
        postcode:     body.postcode?.trim() ?? "",
        latitude,
        longitude,
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
        name:         body.name?.trim() ?? loc.name,
        siteName:     body.siteName?.trim() ?? loc.siteName,
        unitName:     body.unitName?.trim() ?? loc.unitName,
        addressText:  (body.addressText ?? body.locationTextSnapshot)?.trim() ?? loc.addressText,
        street:       body.street?.trim() ?? loc.street,
        town:         body.town?.trim() ?? loc.town,
        postcode:     body.postcode?.trim() ?? loc.postcode,
        latitude:     body.latitude ?? body.lat ?? loc.latitude,
        longitude:    body.longitude ?? body.lng ?? loc.longitude,
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
        customer:        true,
        assignedDriver:  true,
        template:        true,
        pickupLocation:  true,
        dropoffLocation: true,
        stops:           { orderBy: { sequenceNumber: "asc" } },
        loadDetails:     true,
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
        customer:        true,
        pickupLocation:  true,
        dropoffLocation: true,
        stops:           { orderBy: { sequenceNumber: "asc" } },
        loadDetails:     true,
        events:          { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ plannedDate: "asc" }, { sequence: "asc" }],
    });

    const todayStr     = today.toISOString().split("T")[0];
    const datedJobs    = jobs.filter(j => j.plannedDate !== null);
    const todayJobs    = datedJobs.filter(j => j.plannedDate!.toISOString().split("T")[0] === todayStr);
    const upcomingJobs = datedJobs.filter(j => j.plannedDate!.toISOString().split("T")[0] !== todayStr);

    return reply.send({ data: todayJobs, upcoming: upcomingJobs });
  });

  // ── GET /jobs/:id ─────────────────────────────────────────────────────────
  app.get("/jobs/:id", { preHandler: authenticate }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId, userId, role } = request.user!;

    const job = await prisma.plannedJob.findFirst({
      where: { id, companyId },
      include: {
        customer:        true,
        assignedDriver:  true,
        pickupLocation:  true,
        dropoffLocation: true,
        stops:           { orderBy: { sequenceNumber: "asc" } },
        loadDetails:     true,
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

  // ── POST /jobs — create structured job ────────────────────────────────────
  app.post("/jobs", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateJobBody;
    const { companyId, userId } = request.user!;
    const saveMode = body.saveMode ?? "draft";

    const legacyValidation = validateCreateJob(body);
    if (!legacyValidation.valid) return reply.status(400).send({ error: legacyValidation.errors.join(", ") });

    if (body.assignedDriverId !== undefined) {
      const driver = await prisma.driverProfile.findFirst({
        where: { id: body.assignedDriverId, companyId, status: "active" },
      });
      if (!driver) return reply.status(400).send({ error: "Driver not found or inactive" });
    }

    let template: Awaited<ReturnType<typeof prisma.jobTemplate.findFirst>> = null;
    if (body.templateId) {
      template = await prisma.jobTemplate.findFirst({ where: { id: body.templateId, companyId } });
      if (!template) return reply.status(400).send({ error: "Template not found" });
    }

    let legacyPickupText  = body.pickupTextSnapshot  ?? template?.pickupTextSnapshot  ?? "";
    let legacyDropoffText = body.dropoffTextSnapshot ?? template?.dropoffTextSnapshot ?? "";

    if (!legacyPickupText && body.pickupLocationId) {
      const loc = await prisma.savedLocation.findFirst({ where: { id: body.pickupLocationId, companyId } });
      if (loc) legacyPickupText = loc.addressText;
    }
    if (!legacyDropoffText && body.dropoffLocationId) {
      const loc = await prisma.savedLocation.findFirst({ where: { id: body.dropoffLocationId, companyId } });
      if (loc) legacyDropoffText = loc.addressText;
    }

    const stops: StructuredJobStopInput[] = Array.isArray(body.stops) && body.stops.length > 0
      ? body.stops
      : [
          ...(legacyPickupText ? [{
            sequenceNumber:       1,
            type:                 "pickup",
            savedLocationId:      body.pickupLocationId ?? null,
            locationTextSnapshot: legacyPickupText,
            referenceNumber:      body.referenceNumber ?? "",
          }] : []),
          ...(legacyDropoffText ? [{
            sequenceNumber:       2,
            type:                 "dropoff",
            savedLocationId:      body.dropoffLocationId ?? null,
            locationTextSnapshot: legacyDropoffText,
            referenceNumber:      body.referenceNumber ?? "",
          }] : []),
        ];

    const firstPickup = [...stops]
      .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0))
      .find(s => s.type === "pickup");
    const lastDropoff = [...stops]
      .sort((a, b) => (b.sequenceNumber ?? 0) - (a.sequenceNumber ?? 0))
      .find(s => s.type === "dropoff");

    const pickupText  = typeof firstPickup?.locationTextSnapshot === "string" ? firstPickup.locationTextSnapshot.trim() : "";
    const dropoffText = typeof lastDropoff?.locationTextSnapshot === "string" ? lastDropoff.locationTextSnapshot.trim() : "";

    const loadDetails: StructuredLoadDetailsInput | null = body.loadDetails ?? (
      body.quantityExpected || body.quantityUnit || body.materialType
        ? {
            quantity:     body.quantityExpected ?? null,
            unit:         body.quantityUnit ?? "",
            materialType: body.materialType ?? "",
          }
        : null
    );

    let customerName = body.customerName ?? "";
    if (body.customerId && !customerName) {
      const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId } });
      if (!customer) return reply.status(400).send({ error: "Customer not found" });
      customerName = customer.name;
    }

    const structuredValidation = validateStructuredJob({
      saveMode,
      customerId:            body.customerId ?? null,
      plannedDate:           body.plannedDate,
      vehicleClassRequired:  body.vehicleClassRequired,
      trailerTypesAllowed:   body.trailerTypesAllowed,
      stops,
      loadDetails,
    });

    if (saveMode === "ready_to_plan" && !structuredValidation.isValid) {
      return reply.status(400).send({
        error: "Job is not ready to plan",
        errors: structuredValidation.errors,
        warnings: structuredValidation.warnings,
      });
    }

    const quality = scoreStructuredJob({ stops, loadDetails });

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.plannedJob.create({
        data: {
          companyId,
          customerId:            body.customerId ?? null,
          customerName,
          templateId:            body.templateId ?? null,
          assignedDriverId:      body.assignedDriverId ?? null,
          createdByUserId:       userId,
          plannedDate:           body.plannedDate ? new Date(body.plannedDate) : null,
          sequence:              body.sequence ?? 0,
          pickupLocationId:      firstPickup?.savedLocationId ?? body.pickupLocationId ?? null,
          dropoffLocationId:     lastDropoff?.savedLocationId ?? body.dropoffLocationId ?? null,
          pickupTextSnapshot:    pickupText,
          dropoffTextSnapshot:   dropoffText,
          referenceNumber:       body.referenceNumber ?? (typeof firstPickup?.referenceNumber === "string" ? firstPickup.referenceNumber : ""),
          materialType:          loadDetails?.materialType?.toString() ?? "",
          quantityExpected:      loadDetails?.quantity !== undefined && loadDetails?.quantity !== null ? String(loadDetails.quantity) : "",
          quantityUnit:          loadDetails?.unit?.toString() ?? "",
          plannerNotes:          body.plannerNotes ?? "",
          assignedTruck:         body.assignedTruck ?? "",
          assignedTrailer:       body.assignedTrailer ?? "",
          vehicleClass:          body.vehicleClass ?? "",
          vehicleClassRequired:  body.vehicleClassRequired ?? "",
          trailerTypesAllowed:   body.trailerTypesAllowed ?? [],
          priority:              body.priority ?? "normal",
          serviceType:           body.serviceType ?? "",
          internalNotes:         body.internalNotes ?? "",
          validationStatus:      structuredValidation.validationStatus,
          qualityScore:          quality.score,
          requireCollection:     body.requireCollection ?? false,
          requirePOD:            body.requirePOD ?? false,
          requireDeliveryQty:    body.requireDeliveryQty ?? false,
          status:                "pending",
          stops: {
            create: stops.map((s) => ({
              companyId,
              sequenceNumber:       s.sequenceNumber ?? 0,
              type:                 String(s.type ?? ""),
              savedLocationId:      s.savedLocationId ?? null,
              siteName:             typeof s.siteName === "string" ? s.siteName.trim() : "",
              unitName:             typeof s.unitName === "string" ? s.unitName.trim() : "",
              street:               typeof s.street === "string" ? s.street.trim() : "",
              town:                 typeof s.town === "string" ? s.town.trim() : "",
              postcode:             typeof s.postcode === "string" ? s.postcode.trim().toUpperCase() : "",
              locationTextSnapshot: String(s.locationTextSnapshot ?? "").trim(),
              lat:                  s.lat ?? null,
              lng:                  s.lng ?? null,
              gateLat:              s.gateLat ?? null,
              gateLng:              s.gateLng ?? null,
              timeWindowStart:      toNullableDate(s.timeWindowStart),
              timeWindowEnd:        toNullableDate(s.timeWindowEnd),
              contactName:          typeof s.contactName === "string" ? s.contactName.trim() : "",
              contactPhone:         typeof s.contactPhone === "string" ? s.contactPhone.trim() : "",
              referenceNumber:      typeof s.referenceNumber === "string" ? s.referenceNumber.trim() : "",
              instructions:         typeof s.instructions === "string" ? s.instructions.trim() : "",
              status:               "pending",
            })),
          },
          ...(hasLoadDetailsInput(loadDetails) ? {
            loadDetails: {
              create: {
                companyId,
                quantity:     toNullableNumber(loadDetails?.quantity),
                unit:         loadDetails?.unit?.toString() ?? "",
                weight:       toNullableNumber(loadDetails?.weight),
                volume:       toNullableNumber(loadDetails?.volume),
                materialType: loadDetails?.materialType?.toString() ?? "",
                hazardClass:  loadDetails?.hazardClass?.toString() ?? "",
                notes:        loadDetails?.notes?.toString() ?? "",
              },
            },
          } : {}),
          audits: {
            create: {
              companyId,
              changedBy: userId,
              action:    "created",
              field:     "job",
              newValue:  {
                saveMode,
                validationStatus: structuredValidation.validationStatus,
                qualityScore: quality.score,
              },
            },
          },
        },
        include: {
          assignedDriver: true,
          stops:          { orderBy: { sequenceNumber: "asc" } },
          loadDetails:    true,
          audits:         { orderBy: { createdAt: "desc" }, take: 5 },
        },
      });

      if (body.saveAsTemplate && body.templateName) {
        await tx.jobTemplate.create({
          data: {
            companyId,
            name:                body.templateName,
            pickupLocationId:    firstPickup?.savedLocationId ?? null,
            dropoffLocationId:   lastDropoff?.savedLocationId ?? null,
            pickupTextSnapshot:  pickupText,
            dropoffTextSnapshot: dropoffText,
            defaultReference:    body.referenceNumber ?? "",
            defaultNotes:        body.plannerNotes ?? "",
            defaultMaterialType: loadDetails?.materialType?.toString() ?? "",
            trailerTypesAllowed: body.trailerTypesAllowed ?? [],
            defaultStops:        JSON.parse(JSON.stringify(stops)),
            defaultLoadDetails:  JSON.parse(JSON.stringify(loadDetails ?? {})),
            qualityScore:        quality.score,
            status:              "active",
          },
        });
      }

      return created;
    });

    return reply.status(201).send({
      ...job,
      validation: structuredValidation,
      quality,
    });
  });

  // ── PATCH /jobs/:id — edit structured job before execution ────────────────
  app.patch("/jobs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchJobBody;
    const { companyId, userId } = request.user!;

    const job = await prisma.plannedJob.findFirst({
      where: { id, companyId },
      include: {
        customer:    true,
        stops:       { orderBy: { sequenceNumber: "asc" } },
        loadDetails: true,
      },
    });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    if (body.assignedDriverId !== undefined && body.assignedDriverId !== null) {
      const driver = await prisma.driverProfile.findFirst({
        where: { id: body.assignedDriverId, companyId, status: "active" },
      });
      if (!driver) return reply.status(400).send({ error: "Driver not found or inactive" });
    }

    let legacyPickupText  = body.pickupTextSnapshot  ?? job.pickupTextSnapshot;
    let legacyDropoffText = body.dropoffTextSnapshot ?? job.dropoffTextSnapshot;

    const existingStops: StructuredJobStopInput[] = job.stops.map(s => ({
      sequenceNumber:       s.sequenceNumber,
      type:                 s.type,
      savedLocationId:      s.savedLocationId,
      siteName:             s.siteName,
      unitName:             s.unitName,
      street:               s.street,
      town:                 s.town,
      postcode:             s.postcode,
      locationTextSnapshot: s.locationTextSnapshot,
      lat:                  s.lat,
      lng:                  s.lng,
      gateLat:              s.gateLat,
      gateLng:              s.gateLng,
      timeWindowStart:      s.timeWindowStart,
      timeWindowEnd:        s.timeWindowEnd,
      contactName:          s.contactName,
      contactPhone:         s.contactPhone,
      referenceNumber:      s.referenceNumber,
      instructions:         s.instructions,
    }));

    const legacyStops: StructuredJobStopInput[] = [
      ...(legacyPickupText ? [{
        sequenceNumber:       1,
        type:                 "pickup",
        savedLocationId:      job.pickupLocationId ?? null,
        locationTextSnapshot: legacyPickupText,
        referenceNumber:      body.referenceNumber ?? job.referenceNumber,
      }] : []),
      ...(legacyDropoffText ? [{
        sequenceNumber:       2,
        type:                 "dropoff",
        savedLocationId:      job.dropoffLocationId ?? null,
        locationTextSnapshot: legacyDropoffText,
        referenceNumber:      body.referenceNumber ?? job.referenceNumber,
      }] : []),
    ];

    const stops: StructuredJobStopInput[] = Array.isArray(body.stops)
      ? body.stops
      : existingStops.length > 0
        ? existingStops
        : legacyStops;

    const firstPickup = [...stops]
      .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0))
      .find(s => s.type === "pickup");
    const lastDropoff = [...stops]
      .sort((a, b) => (b.sequenceNumber ?? 0) - (a.sequenceNumber ?? 0))
      .find(s => s.type === "dropoff");

    const pickupText  = typeof firstPickup?.locationTextSnapshot === "string" ? firstPickup.locationTextSnapshot.trim() : "";
    const dropoffText = typeof lastDropoff?.locationTextSnapshot === "string" ? lastDropoff.locationTextSnapshot.trim() : "";

    const existingLoadDetails: StructuredLoadDetailsInput | null = job.loadDetails
      ? {
          quantity:     job.loadDetails.quantity,
          unit:         job.loadDetails.unit,
          weight:       job.loadDetails.weight,
          volume:       job.loadDetails.volume,
          materialType: job.loadDetails.materialType,
          hazardClass:  job.loadDetails.hazardClass,
          notes:        job.loadDetails.notes,
        }
      : null;

    const legacyLoadDetails: StructuredLoadDetailsInput | null =
      body.quantityExpected !== undefined || body.quantityUnit !== undefined || body.materialType !== undefined
        ? {
            quantity:     body.quantityExpected ?? job.quantityExpected,
            unit:         body.quantityUnit ?? job.quantityUnit,
            materialType: body.materialType ?? job.materialType,
          }
        : null;

    const loadDetails: StructuredLoadDetailsInput | null =
      body.loadDetails !== undefined
        ? body.loadDetails
        : legacyLoadDetails ?? existingLoadDetails;

    const saveMode = body.saveMode ?? (job.validationStatus === "ready_to_plan" ? "ready_to_plan" : "draft");

    const effectiveCustomerId = body.customerId !== undefined ? body.customerId : job.customerId;

    let patchCustomerName = job.customerName;
    if (body.customerId !== undefined && body.customerId !== null) {
      const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId } });
      if (!customer) return reply.status(400).send({ error: "Customer not found" });
      patchCustomerName = customer.name;
    } else if (body.customerId === null) {
      patchCustomerName = "";
    }

    const structuredValidation = validateStructuredJob({
      saveMode,
      customerId:            effectiveCustomerId,
      plannedDate:           body.plannedDate ?? job.plannedDate ?? undefined,
      vehicleClassRequired:  body.vehicleClassRequired ?? job.vehicleClassRequired,
      trailerTypesAllowed:   body.trailerTypesAllowed ?? (Array.isArray(job.trailerTypesAllowed) ? job.trailerTypesAllowed : []),
      stops,
      loadDetails,
    });

    if (saveMode === "ready_to_plan" && !structuredValidation.isValid) {
      return reply.status(400).send({
        error: "Job is not ready to plan",
        errors: structuredValidation.errors,
        warnings: structuredValidation.warnings,
      });
    }

    const quality = scoreStructuredJob({ stops, loadDetails });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.jobStop.deleteMany({ where: { jobId: id, companyId } });

      if (stops.length > 0) {
        await tx.jobStop.createMany({
          data: stops.map(s => ({
            companyId,
            jobId:                id,
            sequenceNumber:       s.sequenceNumber ?? 0,
            type:                 String(s.type ?? ""),
            savedLocationId:      s.savedLocationId ?? null,
            siteName:             typeof s.siteName === "string" ? s.siteName.trim() : "",
            unitName:             typeof s.unitName === "string" ? s.unitName.trim() : "",
            street:               typeof s.street === "string" ? s.street.trim() : "",
            town:                 typeof s.town === "string" ? s.town.trim() : "",
            postcode:             typeof s.postcode === "string" ? s.postcode.trim().toUpperCase() : "",
            locationTextSnapshot: String(s.locationTextSnapshot ?? "").trim(),
            lat:                  s.lat ?? null,
            lng:                  s.lng ?? null,
            gateLat:              s.gateLat ?? null,
            gateLng:              s.gateLng ?? null,
            timeWindowStart:      toNullableDate(s.timeWindowStart),
            timeWindowEnd:        toNullableDate(s.timeWindowEnd),
            contactName:          typeof s.contactName === "string" ? s.contactName.trim() : "",
            contactPhone:         typeof s.contactPhone === "string" ? s.contactPhone.trim() : "",
            referenceNumber:      typeof s.referenceNumber === "string" ? s.referenceNumber.trim() : "",
            instructions:         typeof s.instructions === "string" ? s.instructions.trim() : "",
            status:               "pending",
          })),
        });
      }

      if (body.loadDetails === null) {
        await tx.loadDetails.deleteMany({ where: { jobId: id, companyId } });
      } else if (hasLoadDetailsInput(loadDetails)) {
        await tx.loadDetails.upsert({
          where: { jobId: id },
          create: {
            companyId,
            jobId:        id,
            quantity:     toNullableNumber(loadDetails?.quantity),
            unit:         loadDetails?.unit?.toString() ?? "",
            weight:       toNullableNumber(loadDetails?.weight),
            volume:       toNullableNumber(loadDetails?.volume),
            materialType: loadDetails?.materialType?.toString() ?? "",
            hazardClass:  loadDetails?.hazardClass?.toString() ?? "",
            notes:        loadDetails?.notes?.toString() ?? "",
          },
          update: {
            quantity:     toNullableNumber(loadDetails?.quantity),
            unit:         loadDetails?.unit?.toString() ?? "",
            weight:       toNullableNumber(loadDetails?.weight),
            volume:       toNullableNumber(loadDetails?.volume),
            materialType: loadDetails?.materialType?.toString() ?? "",
            hazardClass:  loadDetails?.hazardClass?.toString() ?? "",
            notes:        loadDetails?.notes?.toString() ?? "",
          },
        });
      }

      await tx.jobAudit.create({
        data: {
          companyId,
          jobId:     id,
          changedBy: userId,
          action:    "updated",
          field:     "job",
          oldValue:  {
            validationStatus: job.validationStatus,
            qualityScore: job.qualityScore,
          },
          newValue:  {
            validationStatus: structuredValidation.validationStatus,
            qualityScore: quality.score,
          },
        },
      });

      return tx.plannedJob.update({
        where: { id },
        data: {
          customerId:            effectiveCustomerId ?? null,
          customerName:  patchCustomerName,
          pickupLocationId:      firstPickup?.savedLocationId ?? job.pickupLocationId,
          dropoffLocationId:     lastDropoff?.savedLocationId ?? job.dropoffLocationId,
          pickupTextSnapshot:    pickupText,
          dropoffTextSnapshot:   dropoffText,
          referenceNumber:       body.referenceNumber ?? (typeof firstPickup?.referenceNumber === "string" ? firstPickup.referenceNumber : job.referenceNumber),
          materialType:          loadDetails?.materialType?.toString() ?? "",
          quantityExpected:      loadDetails?.quantity !== undefined && loadDetails?.quantity !== null ? String(loadDetails.quantity) : "",
          quantityUnit:          loadDetails?.unit?.toString() ?? "",
          plannerNotes:          body.plannerNotes ?? job.plannerNotes,
          assignedTruck:         body.assignedTruck ?? job.assignedTruck,
          assignedTrailer:       body.assignedTrailer ?? job.assignedTrailer,
          vehicleClass:          body.vehicleClass ?? job.vehicleClass,
          vehicleClassRequired:  body.vehicleClassRequired ?? job.vehicleClassRequired,
          trailerTypesAllowed:   body.trailerTypesAllowed ?? JSON.parse(JSON.stringify(job.trailerTypesAllowed ?? [])),
          priority:              body.priority ?? job.priority,
          serviceType:           body.serviceType ?? job.serviceType,
          internalNotes:         body.internalNotes ?? job.internalNotes,
          validationStatus:      structuredValidation.validationStatus,
          qualityScore:          quality.score,
          requireCollection:     body.requireCollection ?? job.requireCollection,
          requirePOD:            body.requirePOD ?? job.requirePOD,
          requireDeliveryQty:    body.requireDeliveryQty ?? job.requireDeliveryQty,
          sequence:              body.sequence ?? job.sequence,
          plannedDate:           body.plannedDate ? new Date(body.plannedDate) : job.plannedDate,
          assignedDriverId:      body.assignedDriverId === undefined ? job.assignedDriverId : body.assignedDriverId,
        },
        include: {
          assignedDriver: true,
          stops:          { orderBy: { sequenceNumber: "asc" } },
          loadDetails:    true,
          audits:         { orderBy: { createdAt: "desc" }, take: 5 },
        },
      });
    });

    return reply.send({
      ...updated,
      validation: structuredValidation,
      quality,
    });
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

    let clientTs = new Date();
    if (body.clientTimestamp) {
      const parsedClientTs = new Date(body.clientTimestamp);
      if (!isNaN(parsedClientTs.getTime())) {
        clientTs = parsedClientTs;
      }
    }

    if (
      (body.gpsLat !== undefined && body.gpsLng === undefined) ||
      (body.gpsLat === undefined && body.gpsLng !== undefined)
    ) {
      return reply.status(400).send({
        error: "BAD_REQUEST",
        message: "gpsLat and gpsLng must be provided together",
      });
    }

    if (body.gpsLat !== undefined) {
      if (
        typeof body.gpsLat !== "number" ||
        !Number.isFinite(body.gpsLat) ||
        body.gpsLat < -90 ||
        body.gpsLat > 90
      ) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "gpsLat must be a number between -90 and 90",
        });
      }
    }

    if (body.gpsLng !== undefined) {
      if (
        typeof body.gpsLng !== "number" ||
        !Number.isFinite(body.gpsLng) ||
        body.gpsLng < -180 ||
        body.gpsLng > 180
      ) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "gpsLng must be a number between -180 and 180",
        });
      }
    }

    await prisma.$transaction([
      prisma.plannedJob.update({ where: { id }, data: updateData }),
      prisma.jobExecutionEvent.create({
        data: {
          jobId:           id,
          companyId,
          driverId:        userId,
          eventType:       EVENT_TYPE_MAP[body.status] ?? "note_added",
          note:            body.note ?? "",
          clientEventId:   `server-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          clientTimestamp: clientTs,
          gpsLat:          body.gpsLat,
          gpsLng:          body.gpsLng,
        },
      }),
    ]);

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

import type { FastifyInstance } from "fastify";
import { PrismaClient, Prisma } from "../generated/client.js";
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
import { ALLOWED_JOB_TRANSITIONS, SYNC_REVIEW_RULES } from "../sync/sync.constants.js";
import { generateJobReference } from "../lib/jobReference.js";

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

function appendPlannerReason(existing: string, reason: string): string {
  const cleanReason = reason.trim();
  if (!cleanReason) return existing;
  const stamp = new Date().toISOString();
  return [existing?.trim(), `[Planner allocation ${stamp}] ${cleanReason}`].filter(Boolean).join("\n");
}

async function findInvalidStopLocationId(
  prisma: PrismaClient,
  companyId: number,
  stops: StructuredJobStopInput[],
): Promise<number | null> {
  const stopLocationIds = [...new Set(stops
    .map(s => s.savedLocationId)
    .filter((id): id is number => typeof id === "number"))];

  if (stopLocationIds.length === 0) return null;

  const validLocs = await prisma.savedLocation.findMany({
    where:  { id: { in: stopLocationIds }, companyId },
    select: { id: true },
  });
  const validIds = new Set(validLocs.map(l => l.id));
  return stopLocationIds.find(id => !validIds.has(id)) ?? null;
}

export async function jobRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /locations ─────────────────────────────────────────────────────────
  app.get("/locations", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
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
        defaultStops:        body.defaultStops        ?? undefined,
        defaultLoadDetails:  body.defaultLoadDetails  ?? undefined,
        defaultJobData:      body.defaultJobData      ?? undefined,
        trailerTypesAllowed: body.trailerTypesAllowed ?? [],
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
        defaultStops:        (body.defaultStops        !== undefined ? body.defaultStops        : template.defaultStops)        as Prisma.InputJsonValue | undefined,
        defaultLoadDetails:  (body.defaultLoadDetails  !== undefined ? body.defaultLoadDetails  : template.defaultLoadDetails)  as Prisma.InputJsonValue | undefined,
        defaultJobData:      (body.defaultJobData      !== undefined ? body.defaultJobData      : template.defaultJobData)      as Prisma.InputJsonValue | undefined,
        trailerTypesAllowed: (body.trailerTypesAllowed !== undefined ? body.trailerTypesAllowed : template.trailerTypesAllowed) as Prisma.InputJsonValue | undefined,
        status:              body.status              ?? template.status,
      },
    });

    return reply.send(updated);
  });

  // ── DELETE /job-templates/:id ──────────────────────────────────────────────
  app.delete("/job-templates/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId } = request.user!;

    const template = await prisma.jobTemplate.findFirst({ where: { id, companyId } });
    if (!template) return reply.status(404).send({ error: "Template not found" });

    // Soft-delete: archive so existing job history (templateId FK) stays intact
    await prisma.jobTemplate.update({ where: { id }, data: { status: "archived" } });
    return reply.send({ ok: true });
  });

  // ── GET /jobs — planner / driver view ─────────────────────────────────────
  app.get("/jobs", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, role, userId } = request.user!;
    const q = request.query as { date?: string; dateFrom?: string; dateTo?: string; driverId?: string; status?: string; limit?: string; cursor?: string };

    let driverProfileId: number | undefined;
    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile) return reply.send({ data: [] });
      driverProfileId = profile.id;
    }

    const where: Prisma.PlannedJobWhereInput = { companyId };

    if (role === "driver") {
      where.assignedDriverId = driverProfileId;
    } else if (q.driverId) {
      const requestedDriverId = parseInt(q.driverId, 10);
      if (!Number.isInteger(requestedDriverId)) {
        return reply.status(400).send({ error: "driverId must be a valid number" });
      }
      where.assignedDriverId = requestedDriverId;
    }

    if (q.status) where.status = q.status;
    if (q.dateFrom && q.dateTo) {
      where.plannedDate = {
        gte: new Date(`${q.dateFrom}T00:00:00.000Z`),
        lte: new Date(`${q.dateTo}T23:59:59.999Z`),
      };
    } else if (q.date) {
      where.plannedDate = {
        gte: new Date(`${q.date}T00:00:00.000Z`),
        lt:  new Date(`${q.date}T23:59:59.999Z`),
      };
    }

    // Pagination — cursor-based, backwards compatible (no params = max 200)
    const limit  = Math.min(parseInt(q.limit  ?? "200", 10) || 200, 200);
    const cursor = q.cursor ? parseInt(q.cursor, 10) : undefined;
    if (cursor && !Number.isInteger(cursor)) {
      return reply.status(400).send({ error: "cursor must be a valid job id" });
    }

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
      take:   limit + 1,                              // fetch one extra to know if there's a next page
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNextPage = jobs.length > limit;
    const page        = hasNextPage ? jobs.slice(0, limit) : jobs;
    const nextCursor  = hasNextPage ? page[page.length - 1].id : null;

    return reply.send({ data: page, pagination: { limit, nextCursor, hasNextPage } });
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

    let customerId = body.customerId ?? null;
    let customerName = body.customerName ?? "";
    if (customerId !== null) {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId } });
      if (!customer) return reply.status(400).send({ error: "Customer not found" });
      customerName = customer.name;
    }

    const structuredValidation = validateStructuredJob({
      saveMode,
      customerId,
      customerName,
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

    // Validate that any savedLocationId in stops belongs to this company
    const invalidStopLocationId = await findInvalidStopLocationId(prisma, companyId, stops);
    if (invalidStopLocationId !== null) return reply.status(400).send({ error: "Invalid location reference in stops" });

    const job = await prisma.$transaction(async (tx) => {
      const jobReference = saveMode === "ready_to_plan"
        ? await generateJobReference(companyId, tx)
        : null;

      const created = await tx.plannedJob.create({
        data: {
          companyId,
          customerId,
          customerName,
          jobReference,
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
          jobType:                   body.jobType ?? "",
          jobTitle:                  body.jobTitle ?? "",
          customerRef:               body.customerRef ?? "",
          purchaseOrderNumber:       body.purchaseOrderNumber ?? "",
          bookingContactName:        body.bookingContactName ?? "",
          bookingContactPhone:       body.bookingContactPhone ?? "",
          bookingContactEmail:       body.bookingContactEmail ?? "",
          billingNotes:              body.billingNotes ?? "",
          customerInstructions:      body.customerInstructions ?? "",
          custRefRequired:           body.custRefRequired ?? false,
          poRequired:                body.poRequired ?? false,
          minVehicleSize:            body.minVehicleSize ?? "",
          trailerTypesForbidden:     body.trailerTypesForbidden ?? [],
          equipmentRequired:         body.equipmentRequired ?? [],
          driverQualificationsReq:   body.driverQualificationsReq ?? [],
          heightRestriction:         body.heightRestriction ?? "",
          weightRestriction:         body.weightRestriction ?? "",
          lengthRestriction:         body.lengthRestriction ?? "",
          vehicleAccessNotes:        body.vehicleAccessNotes ?? "",
          failureAction:             body.failureAction ?? "call_assistance",
          assistancePhone:           body.assistancePhone ?? "",
          assistanceNote:            body.assistanceNote ?? "",
          returnDestination:         body.returnDestination ?? "",
          altAddress:                body.altAddress ? (body.altAddress as Prisma.InputJsonValue) : Prisma.DbNull,
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
              sequenceNumber:            s.sequenceNumber ?? 0,
              type:                      String(s.type ?? ""),
              savedLocationId:           s.savedLocationId ?? null,
              siteName:                  typeof s.siteName === "string" ? s.siteName.trim() : "",
              unitName:                  typeof s.unitName === "string" ? s.unitName.trim() : "",
              street:                    typeof s.street === "string" ? s.street.trim() : "",
              town:                      typeof s.town === "string" ? s.town.trim() : "",
              postcode:                  typeof s.postcode === "string" ? s.postcode.trim().toUpperCase() : "",
              locationTextSnapshot:      String(s.locationTextSnapshot ?? "").trim(),
              lat:                       s.lat ?? null,
              lng:                       s.lng ?? null,
              gateLat:                   s.gateLat ?? null,
              gateLng:                   s.gateLng ?? null,
              timeWindowStart:           toNullableDate(s.timeWindowStart),
              timeWindowEnd:             toNullableDate(s.timeWindowEnd),
              bookedTime:                toNullableDate(s.bookedTime),
              earliestArrivalMinutes:    s.earliestArrivalMinutes != null ? Math.round(Number(s.earliestArrivalMinutes)) : null,
              unloadingAllowanceMinutes: s.unloadingAllowanceMinutes != null ? Math.round(Number(s.unloadingAllowanceMinutes)) : null,
              contactName:               typeof s.contactName === "string" ? s.contactName.trim() : "",
              contactPhone:              typeof s.contactPhone === "string" ? s.contactPhone.trim() : "",
              referenceNumber:           typeof s.referenceNumber === "string" ? s.referenceNumber.trim() : "",
              instructions:              typeof s.instructions === "string" ? s.instructions.trim() : "",
              contactEmail:              typeof s.contactEmail === "string" ? s.contactEmail.trim() : "",
              bookingRequired:           s.bookingRequired ?? false,
              bookingRef:                typeof s.bookingRef === "string" ? s.bookingRef.trim() : "",
              openingHours:              typeof s.openingHours === "string" ? s.openingHours.trim() : "",
              locationType:              typeof s.locationType === "string" ? s.locationType.trim() : "",
              navigationInstructions:    typeof s.navigationInstructions === "string" ? s.navigationInstructions.trim() : "",
              numPallets:                s.numPallets != null ? Math.round(Number(s.numPallets)) : null,
              internalNotes:             typeof s.internalNotes === "string" ? s.internalNotes.trim() : "",
              country:                   typeof s.country === "string" ? s.country.trim() : "United Kingdom",
              addressLine2:              typeof s.addressLine2 === "string" ? s.addressLine2.trim() : "",
              countyRegion:              typeof s.countyRegion === "string" ? s.countyRegion.trim() : "",
              status:                    "pending",
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
                dimensions:            loadDetails?.dimensions?.toString() ?? "",
                fragile:               loadDetails?.fragile ?? false,
                stackable:             loadDetails?.stackable ?? false,
                tempControlled:        loadDetails?.tempControlled ?? false,
                tempRange:             loadDetails?.tempRange?.toString() ?? "",
                photosRequired:        loadDetails?.photosRequired ?? false,
                weighbridgeRequired:   loadDetails?.weighbridgeRequired ?? false,
                forkliftRequired:      loadDetails?.forkliftRequired ?? false,
                tailLiftRequired:      loadDetails?.tailLiftRequired ?? false,
                craneRequired:         loadDetails?.craneRequired ?? false,
                loadingMethod:         loadDetails?.loadingMethod?.toString() ?? "",
                unloadingMethod:       loadDetails?.unloadingMethod?.toString() ?? "",
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
        // Strip per-run variables from stops before storing as template
        const templateStops = (stops as unknown as Record<string, unknown>[]).map((s) => ({
          ...s,
          // Variables NOT stored in template: dates, times, ref numbers
          date:        undefined,
          timeType:    "anytime",
          bookedTime:  undefined,
          timeWindowStart: undefined,
          timeWindowEnd:   undefined,
          referenceNumber: undefined,
          bookingRef:      undefined,
        }));

        // Full non-variable job data
        const defaultJobData = {
          customerId:            body.customerId       ?? null,
          customerName:          body.customerName     ?? "",
          serviceType:           body.serviceType      ?? "",
          jobType:               body.jobType          ?? "",
          jobTitle:              body.jobTitle         ?? "",
          priority:              body.priority         ?? "normal",
          contactName:           body.bookingContactName  ?? "",
          contactPhone:          body.bookingContactPhone ?? "",
          contactEmail:          body.bookingContactEmail ?? "",
          billingNotes:          body.billingNotes        ?? "",
          custInstructions:      body.customerInstructions ?? "",
          custRefRequired:       body.custRefRequired  ?? false,
          poRequired:            body.poRequired       ?? false,
          materialDesc:          loadDetails?.materialType?.toString() ?? "",
          totalQty:              loadDetails?.quantity   != null ? String(loadDetails.quantity)  : "",
          qtyUnit:               loadDetails?.unit       ?? "",
          totalWeight:           loadDetails?.weight     != null ? String(loadDetails.weight)    : "",
          volume:                loadDetails?.volume     != null ? String(loadDetails.volume)    : "",
          dimensions:            loadDetails?.dimensions ?? "",
          adrClass:              loadDetails?.hazardClass ?? "",
          fragile:               loadDetails?.fragile     ?? false,
          stackable:             loadDetails?.stackable   ?? false,
          tempControlled:        loadDetails?.tempControlled ?? false,
          tempRange:             loadDetails?.tempRange   ?? "",
          forkliftReq:           loadDetails?.forkliftRequired  ?? false,
          tailLiftReq:           loadDetails?.tailLiftRequired  ?? false,
          craneReq:              loadDetails?.craneRequired     ?? false,
          loadingMethod:         loadDetails?.loadingMethod     ?? "",
          unloadingMethod:       loadDetails?.unloadingMethod   ?? "",
          loadNotes:             loadDetails?.notes     ?? "",
          photosRequired:        loadDetails?.photosRequired    ?? false,
          weighbridgeReq:        loadDetails?.weighbridgeRequired ?? false,
          podRequired:           body.requirePOD ?? true,
          vehicleType:           body.vehicleClassRequired ?? "",
          minSize:               body.minVehicleSize      ?? "",
          trailersAllowed:       body.trailerTypesAllowed  ?? [],
          trailersForbidden:     body.trailerTypesForbidden ?? [],
          equipmentReq:          body.equipmentRequired    ?? [],
          driverQuals:           body.driverQualificationsReq ?? [],
          heightRestriction:     body.heightRestriction  ?? "",
          weightRestriction:     body.weightRestriction  ?? "",
          lengthRestriction:     body.lengthRestriction  ?? "",
          accessNotes:           body.vehicleAccessNotes  ?? "",
          assignedTruck:         body.assignedTruck       ?? "",
          assignedTrailer:       body.assignedTrailer     ?? "",
          failureAction:         body.failureAction       ?? "call_assistance",
          assistancePhone:       body.assistancePhone     ?? "",
          assistanceNote:        body.assistanceNote      ?? "",
          returnDestination:     body.returnDestination   ?? "",
          altAddress:            body.altAddress          ?? null,
        };

        await tx.jobTemplate.create({
          data: {
            companyId,
            name:                body.templateName,
            pickupLocationId:    firstPickup?.savedLocationId ?? null,
            dropoffLocationId:   lastDropoff?.savedLocationId ?? null,
            pickupTextSnapshot:  pickupText,
            dropoffTextSnapshot: dropoffText,
            defaultReference:    "",  // reference numbers are per-run variables
            defaultNotes:        body.plannerNotes ?? "",
            defaultMaterialType: loadDetails?.materialType?.toString() ?? "",
            trailerTypesAllowed: body.trailerTypesAllowed ?? [],
            defaultStops:        JSON.parse(JSON.stringify(templateStops)),
            defaultLoadDetails:  JSON.parse(JSON.stringify(loadDetails ?? {})),
            defaultJobData:      JSON.parse(JSON.stringify(defaultJobData)),
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
      // Linked to an existing customer — use the DB name
      const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId } });
      if (!customer) return reply.status(400).send({ error: "Customer not found" });
      patchCustomerName = customer.name;
    } else if (body.customerId === null) {
      // Customer link cleared — use free-text name from body if provided
      patchCustomerName = body.customerName ?? "";
    } else if (body.customerName !== undefined) {
      // customerId not changed, but name was explicitly updated
      patchCustomerName = body.customerName ?? "";
    }

    const structuredValidation = validateStructuredJob({
      saveMode,
      customerId:            effectiveCustomerId,
      customerName:          patchCustomerName,
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

    const invalidStopLocationId = await findInvalidStopLocationId(prisma, companyId, stops);
    if (invalidStopLocationId !== null) return reply.status(400).send({ error: "Invalid location reference in stops" });

    const updated = await prisma.$transaction(async (tx) => {
      // Generate job reference if this is the first time the job becomes ready_to_plan
      const jobReference = (saveMode === "ready_to_plan" && !job.jobReference)
        ? await generateJobReference(companyId, tx)
        : undefined; // undefined = don't touch existing value

      await tx.jobStop.deleteMany({ where: { jobId: id, companyId } });

      if (stops.length > 0) {
        await tx.jobStop.createMany({
          data: stops.map(s => ({
            companyId,
            jobId:                     id,
            sequenceNumber:            s.sequenceNumber ?? 0,
            type:                      String(s.type ?? ""),
            savedLocationId:           s.savedLocationId ?? null,
            siteName:                  typeof s.siteName === "string" ? s.siteName.trim() : "",
            unitName:                  typeof s.unitName === "string" ? s.unitName.trim() : "",
            street:                    typeof s.street === "string" ? s.street.trim() : "",
            town:                      typeof s.town === "string" ? s.town.trim() : "",
            postcode:                  typeof s.postcode === "string" ? s.postcode.trim().toUpperCase() : "",
            locationTextSnapshot:      String(s.locationTextSnapshot ?? "").trim(),
            lat:                       s.lat ?? null,
            lng:                       s.lng ?? null,
            gateLat:                   s.gateLat ?? null,
            gateLng:                   s.gateLng ?? null,
            timeWindowStart:           toNullableDate(s.timeWindowStart),
            timeWindowEnd:             toNullableDate(s.timeWindowEnd),
            bookedTime:                toNullableDate(s.bookedTime),
            earliestArrivalMinutes:    s.earliestArrivalMinutes != null ? Math.round(Number(s.earliestArrivalMinutes)) : null,
            unloadingAllowanceMinutes: s.unloadingAllowanceMinutes != null ? Math.round(Number(s.unloadingAllowanceMinutes)) : null,
            contactName:               typeof s.contactName === "string" ? s.contactName.trim() : "",
            contactPhone:              typeof s.contactPhone === "string" ? s.contactPhone.trim() : "",
            referenceNumber:           typeof s.referenceNumber === "string" ? s.referenceNumber.trim() : "",
            instructions:              typeof s.instructions === "string" ? s.instructions.trim() : "",
            contactEmail:              typeof s.contactEmail === "string" ? s.contactEmail.trim() : "",
            bookingRequired:           s.bookingRequired ?? false,
            bookingRef:                typeof s.bookingRef === "string" ? s.bookingRef.trim() : "",
            openingHours:              typeof s.openingHours === "string" ? s.openingHours.trim() : "",
            locationType:              typeof s.locationType === "string" ? s.locationType.trim() : "",
            navigationInstructions:    typeof s.navigationInstructions === "string" ? s.navigationInstructions.trim() : "",
            numPallets:                s.numPallets != null ? Math.round(Number(s.numPallets)) : null,
            internalNotes:             typeof s.internalNotes === "string" ? s.internalNotes.trim() : "",
            country:                   typeof s.country === "string" ? s.country.trim() : "United Kingdom",
            addressLine2:              typeof s.addressLine2 === "string" ? s.addressLine2.trim() : "",
            countyRegion:              typeof s.countyRegion === "string" ? s.countyRegion.trim() : "",
            status:                    "pending",
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
            dimensions:            loadDetails?.dimensions?.toString() ?? "",
            fragile:               loadDetails?.fragile ?? false,
            stackable:             loadDetails?.stackable ?? false,
            tempControlled:        loadDetails?.tempControlled ?? false,
            tempRange:             loadDetails?.tempRange?.toString() ?? "",
            photosRequired:        loadDetails?.photosRequired ?? false,
            weighbridgeRequired:   loadDetails?.weighbridgeRequired ?? false,
            forkliftRequired:      loadDetails?.forkliftRequired ?? false,
            tailLiftRequired:      loadDetails?.tailLiftRequired ?? false,
            craneRequired:         loadDetails?.craneRequired ?? false,
            loadingMethod:         loadDetails?.loadingMethod?.toString() ?? "",
            unloadingMethod:       loadDetails?.unloadingMethod?.toString() ?? "",
          },
          update: {
            quantity:     toNullableNumber(loadDetails?.quantity),
            unit:         loadDetails?.unit?.toString() ?? "",
            weight:       toNullableNumber(loadDetails?.weight),
            volume:       toNullableNumber(loadDetails?.volume),
            materialType: loadDetails?.materialType?.toString() ?? "",
            hazardClass:  loadDetails?.hazardClass?.toString() ?? "",
            notes:        loadDetails?.notes?.toString() ?? "",
            dimensions:            loadDetails?.dimensions?.toString() ?? "",
            fragile:               loadDetails?.fragile ?? false,
            stackable:             loadDetails?.stackable ?? false,
            tempControlled:        loadDetails?.tempControlled ?? false,
            tempRange:             loadDetails?.tempRange?.toString() ?? "",
            photosRequired:        loadDetails?.photosRequired ?? false,
            weighbridgeRequired:   loadDetails?.weighbridgeRequired ?? false,
            forkliftRequired:      loadDetails?.forkliftRequired ?? false,
            tailLiftRequired:      loadDetails?.tailLiftRequired ?? false,
            craneRequired:         loadDetails?.craneRequired ?? false,
            loadingMethod:         loadDetails?.loadingMethod?.toString() ?? "",
            unloadingMethod:       loadDetails?.unloadingMethod?.toString() ?? "",
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
          ...(jobReference !== undefined ? { jobReference } : {}),
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
          jobType:                   body.jobType ?? job.jobType,
          jobTitle:                  body.jobTitle ?? job.jobTitle,
          customerRef:               body.customerRef ?? job.customerRef,
          purchaseOrderNumber:       body.purchaseOrderNumber ?? job.purchaseOrderNumber,
          bookingContactName:        body.bookingContactName ?? job.bookingContactName,
          bookingContactPhone:       body.bookingContactPhone ?? job.bookingContactPhone,
          bookingContactEmail:       body.bookingContactEmail ?? job.bookingContactEmail,
          billingNotes:              body.billingNotes ?? job.billingNotes,
          customerInstructions:      body.customerInstructions ?? job.customerInstructions,
          custRefRequired:           body.custRefRequired ?? job.custRefRequired,
          poRequired:                body.poRequired ?? job.poRequired,
          minVehicleSize:            body.minVehicleSize ?? job.minVehicleSize,
          trailerTypesForbidden:     body.trailerTypesForbidden ?? JSON.parse(JSON.stringify(job.trailerTypesForbidden ?? [])),
          equipmentRequired:         body.equipmentRequired ?? JSON.parse(JSON.stringify(job.equipmentRequired ?? [])),
          driverQualificationsReq:   body.driverQualificationsReq ?? JSON.parse(JSON.stringify(job.driverQualificationsReq ?? [])),
          heightRestriction:         body.heightRestriction ?? job.heightRestriction,
          weightRestriction:         body.weightRestriction ?? job.weightRestriction,
          lengthRestriction:         body.lengthRestriction ?? job.lengthRestriction,
          vehicleAccessNotes:        body.vehicleAccessNotes ?? job.vehicleAccessNotes,
          failureAction:             body.failureAction ?? job.failureAction,
          assistancePhone:           body.assistancePhone ?? job.assistancePhone,
          assistanceNote:            body.assistanceNote ?? job.assistanceNote,
          returnDestination:         body.returnDestination ?? job.returnDestination,
          altAddress:                body.altAddress !== undefined
                                     ? (body.altAddress ? (body.altAddress as Prisma.InputJsonValue) : Prisma.DbNull)
                                     : (job.altAddress ?? Prisma.DbNull),
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

  // ── DELETE /jobs/:id ──────────────────────────────────────────────────────
  app.delete("/jobs/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId, userId } = request.user!;

    const job = await prisma.plannedJob.findFirst({ where: { id, companyId } });
    if (!job) return reply.status(404).send({ error: "Job not found" });
    if (job.status === "cancelled") return reply.status(204).send();

    const loadedTrailer = await prisma.fleetTrailer.findFirst({
      where: { companyId, linkedJobId: id, status: "loaded" },
      select: { registration: true },
    });
    if (loadedTrailer) {
      return reply.status(409).send({
        error: "Cannot delete a job with a loaded linked trailer",
        message: `Loaded trailer ${loadedTrailer.registration} is still linked to this job. Replan or unload it before deleting the job.`,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.fleetTrailer.updateMany({
        where: { companyId, linkedJobId: id },
        data:  { linkedJobId: null },
      });
      await tx.plannedJob.update({
        where: { id },
        data: {
          status:           "cancelled",
          assignedDriverId: null,
          assignedTruck:    "",
          plannerNotes:     appendPlannerReason(job.plannerNotes, "Job deleted by planner. Record kept as cancelled for audit and reporting."),
        },
      });
      await tx.jobAudit.create({
        data: {
          companyId,
          jobId:     id,
          changedBy: userId,
          action:    "deleted",
          field:     "job",
          oldValue:  {
            status:           job.status,
            assignedDriverId: job.assignedDriverId,
            assignedTruck:    job.assignedTruck,
            assignedTrailer:  job.assignedTrailer,
          },
          newValue:  {
            status:           "cancelled",
            assignedDriverId: null,
            assignedTruck:    "",
            assignedTrailer:  job.assignedTrailer,
          },
        },
      });
    });

    return reply.status(204).send();
  });

  // ── PATCH /jobs/:id/allocate — planner swaps driver / truck / trailer + edits stop timing ──
  app.patch("/jobs/:id/allocate", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id        = parseInt((request.params as { id: string }).id, 10);
    const { companyId, userId } = request.user!;
    const body = request.body as {
      assignedDriverId?: number | null;
      assignedTruck?:    string;
      assignedTrailer?:  string;
      overrideReason?:   string;
      stopTimes?: {
        stopId:                    number;
        bookedTime?:               string | null;
        earliestArrivalMinutes?:   number | null;
        unloadingAllowanceMinutes?: number | null;
      }[];
    };

    const job = await prisma.plannedJob.findFirst({ where: { id, companyId }, include: { stops: true } });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    const overrideReason = typeof body.overrideReason === "string" ? body.overrideReason.trim() : "";

    // A unit cannot be assigned without a driver. If the planner is removing the
    // driver, the unit is cleared automatically so the job returns to planning.
    const effectiveDriverId = body.assignedDriverId !== undefined ? body.assignedDriverId : job.assignedDriverId;
    const effectiveTruck    = body.assignedTruck !== undefined
      ? body.assignedTruck
      : body.assignedDriverId === null
        ? ""
        : job.assignedTruck;
    if (effectiveTruck?.trim() && !effectiveDriverId) {
      return reply.status(400).send({ error: "A unit cannot be assigned without a driver" });
    }

    if (body.assignedDriverId !== undefined && body.assignedDriverId !== null) {
      const driver = await prisma.driverProfile.findFirst({
        where: { id: body.assignedDriverId, companyId, status: "active" },
      });
      if (!driver) return reply.status(400).send({ error: "Driver not found or inactive" });
    }

    await prisma.$transaction(async (tx) => {
      // If swapping driver — remove from any other open job first
      if (body.assignedDriverId !== undefined && body.assignedDriverId !== null) {
        const displacedJobs = await tx.plannedJob.findMany({
          where: {
            companyId,
            assignedDriverId: body.assignedDriverId,
            id: { not: id },
            status: { notIn: ["completed", "cancelled"] },
          },
          select: {
            id:               true,
            assignedDriverId: true,
            assignedTruck:    true,
            assignedTrailer:  true,
            plannerNotes:     true,
          },
        });
        for (const displacedJob of displacedJobs) {
          await tx.plannedJob.update({
            where: { id: displacedJob.id },
            data: {
              assignedDriverId: null,
              assignedTruck:    "",
              plannerNotes:     appendPlannerReason(
                displacedJob.plannerNotes,
                `Driver removed because they were reassigned to job #${id}. Job needs replanning.`,
              ),
            },
          });
          await tx.jobAudit.create({
            data: {
              companyId,
              jobId:     displacedJob.id,
              changedBy: userId,
              action:    "updated",
              field:     "allocation",
              oldValue:  {
                assignedDriverId: displacedJob.assignedDriverId,
                assignedTruck:    displacedJob.assignedTruck,
                assignedTrailer:  displacedJob.assignedTrailer,
              },
              newValue:  {
                assignedDriverId: null,
                assignedTruck:    "",
                assignedTrailer:  displacedJob.assignedTrailer,
                reason:           `Driver reassigned to job #${id}`,
              },
            },
          });
        }
      }

      // Update job-level allocation fields
      const updateData: Record<string, unknown> = {};
      if (body.assignedDriverId !== undefined) updateData.assignedDriverId = body.assignedDriverId;
      if (body.assignedTruck    !== undefined) updateData.assignedTruck    = body.assignedTruck;
      else if (body.assignedDriverId === null) updateData.assignedTruck    = "";
      if (body.assignedTrailer  !== undefined) updateData.assignedTrailer  = body.assignedTrailer;
      if (overrideReason || body.assignedDriverId === null) {
        updateData.plannerNotes = appendPlannerReason(
          job.plannerNotes,
          overrideReason || "Driver removed by planner. Job needs replanning.",
        );
      }

      if (Object.keys(updateData).length > 0) {
        await tx.plannedJob.update({ where: { id }, data: updateData });
      }

      // Patch individual stop timing fields without touching other stop data
      if (Array.isArray(body.stopTimes)) {
        for (const st of body.stopTimes) {
          const patch: Record<string, unknown> = {};
          if ("bookedTime"               in st) patch.bookedTime               = st.bookedTime ? new Date(st.bookedTime) : null;
          if ("earliestArrivalMinutes"   in st) patch.earliestArrivalMinutes   = st.earliestArrivalMinutes ?? null;
          if ("unloadingAllowanceMinutes" in st) patch.unloadingAllowanceMinutes = st.unloadingAllowanceMinutes ?? null;
          if (Object.keys(patch).length > 0) {
            await tx.jobStop.updateMany({
              where: { id: st.stopId, jobId: id, companyId },
              data: patch,
            });
          }
        }
      }

      await tx.jobAudit.create({
        data: {
          companyId,
          jobId:     id,
          changedBy: userId,
          action:    "updated",
          field:     "allocation",
          oldValue:  { assignedDriverId: job.assignedDriverId, assignedTruck: job.assignedTruck, assignedTrailer: job.assignedTrailer },
          newValue:  JSON.parse(JSON.stringify(updateData)) as Prisma.InputJsonValue,
        },
      });
    });

    const updated = await prisma.plannedJob.findFirst({
      where: { id, companyId },
      include: {
        assignedDriver: true,
        stops:          { orderBy: { sequenceNumber: "asc" } },
        loadDetails:    true,
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

    const clientEventId = body.clientEventId?.trim() || `server-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const duplicateEvent = await prisma.jobExecutionEvent.findUnique({
      where: { companyId_clientEventId: { companyId, clientEventId } },
    });
    if (duplicateEvent) {
      return reply.send({ status: job.status, id, duplicate: true });
    }

    const allowed = ALLOWED_JOB_TRANSITIONS[job.status] ?? [];
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
      const parsedTime = parsedClientTs.getTime();
      if (Number.isNaN(parsedTime)) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "clientTimestamp must be a valid ISO date",
        });
      }
      const now = Date.now();
      if (now - parsedTime > SYNC_REVIEW_RULES.MAX_EVENT_AGE_MS) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "clientTimestamp is older than 7 days",
        });
      }
      if (parsedTime - now > SYNC_REVIEW_RULES.MAX_FUTURE_DRIFT_MS) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "clientTimestamp is more than 1 hour in the future",
        });
      }
      clientTs = parsedClientTs;
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
          clientEventId,
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

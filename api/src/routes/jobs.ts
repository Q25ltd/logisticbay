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
  findInvalidStopLocationId,
  type StructuredJobPartInput,
  type StructuredLoadDetailsInput,
} from "../services/jobValidation.js";
import { scoreStructuredJob } from "../services/jobQuality.js";
import { ALLOWED_JOB_TRANSITIONS, SYNC_REVIEW_RULES, EVENT_TYPE_MAP } from "../sync/sync.constants.js";
import { generateJobReference } from "../lib/jobReference.js";
import { checkDayFeasibility, type ScheduleStop } from "../lib/driverSchedule.js";
import { toNullableNumber, toNullableDate } from "../lib/coerce.js";
import { legacyVehicleToRequirement, normalizeEquipment } from "../lib/vehicleCompat.js";
import { hasLoadDetailsInput, appendPlannerReason, buildStopData } from "../lib/jobUtils.js";

// Standard include for job detail views
const JOB_DETAIL_INCLUDE = {
  customer:    true,
  template:    true,
  stops:       { orderBy: { sequenceNumber: "asc" as const } },
  loadDetails: true,
  events:      { orderBy: { createdAt: "asc" as const } },
  runAssignments: {
    where:  { removedAt: null },
    select: { id: true, jobPartId: true, status: true },
  },
} satisfies Prisma.PlannedJobInclude;

type PlanningStatus = "no_stops" | "not_planned" | "partially_planned" | "planned" | "partially_done" | "done";

function computePlanningStatus(
  stops: { id?: number }[],
  assignments: { jobPartId: number; status: string }[]
): PlanningStatus {
  if (stops.length === 0) return "no_stops";
  const assignedPartIds = new Set(assignments.map((a) => a.jobPartId));
  const completedCount  = assignments.filter((a) => a.status === "completed").length;
  const assignedCount   = assignedPartIds.size;
  if (completedCount >= stops.length) return "done";
  if (completedCount > 0)             return "partially_done";
  if (assignedCount  >= stops.length) return "planned";
  if (assignedCount  > 0)             return "partially_planned";
  return "not_planned";
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

    const where: Prisma.PlannedJobWhereInput = { companyId };

    // Driver filter: look up jobs via RunAssignment (driver is on Run, not Job)
    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile) return reply.send({ data: [], pagination: { limit: 200, nextCursor: null, hasNextPage: false } });
      const assignments = await prisma.runAssignment.findMany({
        where:  { companyId, removedAt: null, run: { assignedDriverId: profile.id } },
        select: { jobId: true },
        distinct: ["jobId"],
      });
      where.id = { in: assignments.map(a => a.jobId) };
    } else if (q.driverId) {
      const requestedDriverId = parseInt(q.driverId, 10);
      if (!Number.isInteger(requestedDriverId)) {
        return reply.status(400).send({ error: "driverId must be a valid number" });
      }
      const assignments = await prisma.runAssignment.findMany({
        where:  { companyId, removedAt: null, run: { assignedDriverId: requestedDriverId } },
        select: { jobId: true },
        distinct: ["jobId"],
      });
      where.id = { in: assignments.map(a => a.jobId) };
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
      include: JOB_DETAIL_INCLUDE,
      orderBy: [{ plannedDate: "asc" }, { id: "asc" }],
      take:   limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNextPage = jobs.length > limit;
    const page        = hasNextPage ? jobs.slice(0, limit) : jobs;
    const nextCursor  = hasNextPage ? page[page.length - 1].id : null;

    const jobsWithStatus = page.map((job) => ({
      ...job,
      planningStatus: computePlanningStatus(job.stops ?? [], job.runAssignments ?? []),
    }));

    return reply.send({ data: jobsWithStatus, pagination: { limit, nextCursor, hasNextPage } });
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

    // Find jobs for this driver via RunAssignment
    const assignments = await prisma.runAssignment.findMany({
      where: { companyId, removedAt: null, run: { assignedDriverId: profile.id } },
      select: { jobId: true },
      distinct: ["jobId"],
    });
    const jobIds = assignments.map(a => a.jobId);

    const jobs = await prisma.plannedJob.findMany({
      where: {
        companyId,
        id:          { in: jobIds },
        plannedDate: { gte: today, lt: in7 },
        status:      { not: "cancelled" },
      },
      include: {
        customer:    true,
        stops:       { orderBy: { sequenceNumber: "asc" } },
        loadDetails: true,
        events:      { orderBy: { createdAt: "asc" } },
        runAssignments: {
          where:  { removedAt: null },
          select: { id: true, jobPartId: true, status: true },
        },
      },
      orderBy: [{ plannedDate: "asc" }, { id: "asc" }],
    });

    const todayStr     = today.toISOString().split("T")[0];
    const datedJobs    = jobs.filter(j => j.plannedDate !== null);
    const todayJobs    = datedJobs.filter(j => j.plannedDate!.toISOString().split("T")[0] === todayStr)
      .map((job) => ({ ...job, planningStatus: computePlanningStatus(job.stops ?? [], job.runAssignments ?? []) }));
    const upcomingJobs = datedJobs.filter(j => j.plannedDate!.toISOString().split("T")[0] !== todayStr)
      .map((job) => ({ ...job, planningStatus: computePlanningStatus(job.stops ?? [], job.runAssignments ?? []) }));

    return reply.send({ data: todayJobs, upcoming: upcomingJobs });
  });

  // ── GET /jobs/:id ─────────────────────────────────────────────────────────
  app.get("/jobs/:id", { preHandler: authenticate }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId, userId, role } = request.user!;

    const job = await prisma.plannedJob.findFirst({
      where:   { id, companyId },
      include: JOB_DETAIL_INCLUDE,
    });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile) return reply.status(403).send({ error: "Not your job" });
      const assignment = await prisma.runAssignment.findFirst({
        where: { jobId: id, companyId, removedAt: null, run: { assignedDriverId: profile.id } },
      });
      if (!assignment) return reply.status(403).send({ error: "Not your job" });
    }

    return reply.send({
      ...job,
      planningStatus: computePlanningStatus(job.stops ?? [], job.runAssignments ?? []),
    });
  });

  // ── POST /jobs — create structured job ────────────────────────────────────
  app.post("/jobs", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateJobBody;
    const { companyId, userId } = request.user!;
    const saveMode = body.saveMode ?? "draft";

    const legacyValidation = validateCreateJob(body);
    if (!legacyValidation.valid) return reply.status(400).send({ error: legacyValidation.errors.join(", ") });

    let template: Awaited<ReturnType<typeof prisma.jobTemplate.findFirst>> = null;
    if (body.templateId) {
      template = await prisma.jobTemplate.findFirst({ where: { id: body.templateId, companyId } });
      if (!template) return reply.status(400).send({ error: "Template not found" });
    }

    // Build stops array — body.stops takes precedence; legacy 2-stop fallback uses template snapshots
    const stops: StructuredJobPartInput[] = Array.isArray(body.stops) && body.stops.length > 0
      ? body.stops
      : (() => {
          const pText = template?.pickupTextSnapshot  ?? "";
          const dText = template?.dropoffTextSnapshot ?? "";
          return [
            ...(pText ? [{ sequenceNumber: 1, type: "pickup",  locationTextSnapshot: pText }] : []),
            ...(dText ? [{ sequenceNumber: 2, type: "dropoff", locationTextSnapshot: dText }] : []),
          ];
        })();

    const loadDetails: StructuredLoadDetailsInput | null = body.loadDetails ?? (
      body.quantityExpected || body.quantityUnit || body.materialType
        ? {
            quantity:     body.quantityExpected ?? null,
            unit:         body.quantityUnit ?? "",
            materialType: body.materialType ?? "",
          }
        : null
    );

    const legacyRequirement = legacyVehicleToRequirement(body.vehicleClassRequired ?? body.vehicleClass);
    const reqBodyCategory   = body.reqBodyCategory ?? legacyRequirement.bodyCategory;
    const reqGvwMin         = body.reqGvwMin ?? "";
    const reqBodyType       = body.reqBodyType ?? legacyRequirement.bodyType;
    const reqEquipment      = normalizeEquipment(body.reqEquipment, [
      ...normalizeEquipment(body.equipmentRequired),
      ...legacyRequirement.equipment,
    ]);
    const reqLicenceClass   = body.reqLicenceClass ?? legacyRequirement.licenceClass;

    let customerId   = body.customerId ?? null;
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
      plannedDate:          body.plannedDate,
      vehicleClassRequired: body.vehicleClassRequired,
      reqBodyCategory,
      reqGvwMin,
      reqBodyType,
      reqEquipment,
      reqLicenceClass,
      trailerTypesAllowed:  body.trailerTypesAllowed,
      stops,
      loadDetails,
    });

    if (saveMode === "ready_to_plan" && !structuredValidation.isValid) {
      return reply.status(400).send({
        error:    "Job is not ready to plan",
        errors:   structuredValidation.errors,
        warnings: structuredValidation.warnings,
      });
    }

    const quality = scoreStructuredJob({ stops, loadDetails });

    const invalidStopLocationId = await findInvalidStopLocationId(prisma, companyId, stops);
    if (invalidStopLocationId !== null) return reply.status(400).send({ error: "Invalid location reference in stops" });

    const job = await prisma.$transaction(async (tx) => {
      const jobReference = await generateJobReference(companyId, tx);

      const created = await tx.plannedJob.create({
        data: {
          companyId,
          customerId,
          customerName,
          jobReference,
          templateId:          body.templateId ?? null,
          createdByUserId:     userId,
          plannedDate:         body.plannedDate ? new Date(body.plannedDate) : null,
          materialType:        loadDetails?.materialType?.toString() ?? "",
          quantityExpected:    loadDetails?.quantity !== undefined && loadDetails?.quantity !== null ? String(loadDetails.quantity) : "",
          quantityUnit:        loadDetails?.unit?.toString() ?? "",
          plannerNotes:        body.plannerNotes ?? "",
          reqBodyCategory,
          reqGvwMin,
          reqBodyType,
          reqEquipment,
          reqLicenceClass,
          trailerTypesAllowed: body.trailerTypesAllowed ?? [],
          priority:            body.priority ?? "normal",
          serviceType:         body.serviceType ?? "",
          customerRef:         body.customerRef ?? "",
          purchaseOrderNumber: body.purchaseOrderNumber ?? "",
          billingNotes:        body.billingNotes ?? "",
          customerInstructions: body.customerInstructions ?? "",
          custRefRequired:     body.custRefRequired ?? false,
          poRequired:          body.poRequired ?? false,
          minVehicleSize:      body.minVehicleSize ?? "",
          equipmentRequired:   body.equipmentRequired ?? [],
          driverQualificationsReq: body.driverQualificationsReq ?? [],
          lengthRestriction:   body.lengthRestriction ?? "",
          vehicleAccessNotes:  body.vehicleAccessNotes ?? "",
          failureAction:       body.failureAction ?? "call_assistance",
          assistancePhone:     body.assistancePhone ?? "",
          assistanceNote:      body.assistanceNote ?? "",
          internalNotes:       body.internalNotes ?? "",
          validationStatus:    structuredValidation.validationStatus,
          qualityScore:        quality.score,
          requirePOD:          body.requirePOD ?? false,
          canSplitShipment:    body.canSplitShipment ?? "must_stay_together",
          status:              "draft",
          stops: {
            create: stops.map(s => buildStopData(s, companyId)),
          },
          ...(hasLoadDetailsInput(loadDetails) ? {
            loadDetails: {
              create: {
                companyId,
                quantity:        toNullableNumber(loadDetails?.quantity),
                unit:            loadDetails?.unit?.toString() ?? "",
                weight:          toNullableNumber(loadDetails?.weight),
                volume:          toNullableNumber(loadDetails?.volume),
                materialType:    loadDetails?.materialType?.toString() ?? "",
                hazardClass:     loadDetails?.hazardClass?.toString() ?? "",
                notes:           loadDetails?.notes?.toString() ?? "",
                dimensions:      loadDetails?.dimensions?.toString() ?? "",
                fragile:         loadDetails?.fragile ?? false,
                stackable:       loadDetails?.stackable ?? false,
                tempControlled:  loadDetails?.tempControlled ?? false,
                tempRange:       loadDetails?.tempRange?.toString() ?? "",
                photosRequired:  loadDetails?.photosRequired ?? false,
                weighbridgeRequired: loadDetails?.weighbridgeRequired ?? false,
                forkliftRequired:    loadDetails?.forkliftRequired ?? false,
                tailLiftRequired:    loadDetails?.tailLiftRequired ?? false,
                craneRequired:       loadDetails?.craneRequired ?? false,
                loadingMethod:       loadDetails?.loadingMethod?.toString() ?? "",
                unloadingMethod:     loadDetails?.unloadingMethod?.toString() ?? "",
                goodsType:           loadDetails?.goodsType?.toString() ?? "",
                securingRequirements: Array.isArray(loadDetails?.securingRequirements) ? (loadDetails.securingRequirements as any) : undefined,
                specialRequirements:  Array.isArray(loadDetails?.specialRequirements)  ? (loadDetails.specialRequirements  as any) : undefined,
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
                qualityScore:     quality.score,
              },
            },
          },
        },
        include: {
          stops:       { orderBy: { sequenceNumber: "asc" } },
          loadDetails: true,
          audits:      { orderBy: { createdAt: "desc" }, take: 5 },
        },
      });

      if (body.saveAsTemplate && body.templateName) {
        const templateStops = (stops as unknown as Record<string, unknown>[]).map((s) => ({
          ...s,
          date:            undefined,
          timeType:        "anytime",
          bookedTime:      undefined,
          timeWindowStart: undefined,
          timeWindowEnd:   undefined,
          referenceNumber: undefined,
          bookingRef:      undefined,
        }));

        const defaultJobData = {
          customerId:      body.customerId    ?? null,
          customerName:    body.customerName  ?? "",
          serviceType:     body.serviceType   ?? "",
          priority:        body.priority      ?? "normal",
          billingNotes:    body.billingNotes  ?? "",
          custInstructions: body.customerInstructions ?? "",
          custRefRequired: body.custRefRequired ?? false,
          poRequired:      body.poRequired     ?? false,
          materialDesc:    loadDetails?.materialType?.toString() ?? "",
          totalQty:        loadDetails?.quantity != null ? String(loadDetails.quantity) : "",
          qtyUnit:         loadDetails?.unit     ?? "",
          totalWeight:     loadDetails?.weight   != null ? String(loadDetails.weight)   : "",
          volume:          loadDetails?.volume   != null ? String(loadDetails.volume)   : "",
          dimensions:      loadDetails?.dimensions ?? "",
          adrClass:        loadDetails?.hazardClass ?? "",
          fragile:         loadDetails?.fragile    ?? false,
          stackable:       loadDetails?.stackable  ?? false,
          tempControlled:  loadDetails?.tempControlled ?? false,
          tempRange:       loadDetails?.tempRange  ?? "",
          forkliftReq:     loadDetails?.forkliftRequired  ?? false,
          tailLiftReq:     loadDetails?.tailLiftRequired  ?? false,
          craneReq:        loadDetails?.craneRequired     ?? false,
          loadingMethod:   loadDetails?.loadingMethod     ?? "",
          unloadingMethod: loadDetails?.unloadingMethod   ?? "",
          loadNotes:       loadDetails?.notes            ?? "",
          photosRequired:  loadDetails?.photosRequired   ?? false,
          weighbridgeReq:  loadDetails?.weighbridgeRequired ?? false,
          podRequired:     body.requirePOD ?? true,
          reqBodyCategory,
          reqGvwMin,
          reqBodyType,
          reqEquipment,
          reqLicenceClass,
          minSize:          body.minVehicleSize     ?? "",
          trailersAllowed:  body.trailerTypesAllowed ?? [],
          equipmentReq:     body.equipmentRequired   ?? [],
          driverQuals:      body.driverQualificationsReq ?? [],
          lengthRestriction: body.lengthRestriction  ?? "",
          accessNotes:       body.vehicleAccessNotes ?? "",
          failureAction:     body.failureAction       ?? "call_assistance",
          assistancePhone:   body.assistancePhone     ?? "",
          assistanceNote:    body.assistanceNote      ?? "",
        };

        const firstPickup  = [...stops].sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0)).find(s => s.type === "pickup");
        const lastDropoff  = [...stops].sort((a, b) => (b.sequenceNumber ?? 0) - (a.sequenceNumber ?? 0)).find(s => s.type === "dropoff");

        await tx.jobTemplate.create({
          data: {
            companyId,
            name:                body.templateName,
            pickupLocationId:    firstPickup?.savedLocationId ?? null,
            dropoffLocationId:   lastDropoff?.savedLocationId ?? null,
            pickupTextSnapshot:  typeof firstPickup?.locationTextSnapshot === "string" ? firstPickup.locationTextSnapshot.trim() : "",
            dropoffTextSnapshot: typeof lastDropoff?.locationTextSnapshot === "string" ? lastDropoff.locationTextSnapshot.trim() : "",
            defaultReference:    "",
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
      where:   { id, companyId },
      include: {
        customer:    true,
        stops:       { orderBy: { sequenceNumber: "asc" } },
        loadDetails: true,
      },
    });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    const existingStops: StructuredJobPartInput[] = job.stops.map(s => ({
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

    const stops: StructuredJobPartInput[] = Array.isArray(body.stops) ? body.stops : existingStops;

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
    const existingReqEquipment = Array.isArray(job.reqEquipment) ? job.reqEquipment.map(String) : [];
    const legacyRequirement = legacyVehicleToRequirement(body.vehicleClassRequired ?? body.vehicleClass);
    const reqBodyCategory   = body.reqBodyCategory ?? job.reqBodyCategory ?? legacyRequirement.bodyCategory;
    const reqGvwMin         = body.reqGvwMin ?? job.reqGvwMin ?? "";
    const reqBodyType       = body.reqBodyType ?? job.reqBodyType ?? legacyRequirement.bodyType;
    const reqEquipment      = normalizeEquipment(body.reqEquipment, [
      ...(existingReqEquipment.length > 0 ? existingReqEquipment : normalizeEquipment(body.equipmentRequired ?? job.equipmentRequired)),
      ...legacyRequirement.equipment,
    ]);
    const reqLicenceClass   = body.reqLicenceClass ?? job.reqLicenceClass ?? legacyRequirement.licenceClass;

    const effectiveCustomerId = body.customerId !== undefined ? body.customerId : job.customerId;

    let patchCustomerName = job.customerName;
    if (body.customerId !== undefined && body.customerId !== null) {
      const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId } });
      if (!customer) return reply.status(400).send({ error: "Customer not found" });
      patchCustomerName = customer.name;
    } else if (body.customerId === null) {
      patchCustomerName = body.customerName ?? "";
    } else if (body.customerName !== undefined) {
      patchCustomerName = body.customerName ?? "";
    }

    const structuredValidation = validateStructuredJob({
      saveMode,
      customerId:           effectiveCustomerId,
      customerName:         patchCustomerName,
      plannedDate:          body.plannedDate ?? job.plannedDate ?? undefined,
      vehicleClassRequired: body.vehicleClassRequired,
      reqBodyCategory,
      reqGvwMin,
      reqBodyType,
      reqEquipment,
      reqLicenceClass,
      trailerTypesAllowed:  body.trailerTypesAllowed ?? (Array.isArray(job.trailerTypesAllowed) ? job.trailerTypesAllowed : []),
      stops,
      loadDetails,
    });

    if (saveMode === "ready_to_plan" && !structuredValidation.isValid) {
      return reply.status(400).send({
        error:    "Job is not ready to plan",
        errors:   structuredValidation.errors,
        warnings: structuredValidation.warnings,
      });
    }

    const quality = scoreStructuredJob({ stops, loadDetails });

    const invalidStopLocationId = await findInvalidStopLocationId(prisma, companyId, stops);
    if (invalidStopLocationId !== null) return reply.status(400).send({ error: "Invalid location reference in stops" });

    const updated = await prisma.$transaction(async (tx) => {
      const jobReference = !job.jobReference
        ? await generateJobReference(companyId, tx)
        : undefined;

      await tx.jobPart.deleteMany({ where: { jobId: id, companyId } });

      if (stops.length > 0) {
        await tx.jobPart.createMany({
          data: stops.map(s => ({ jobId: id, ...buildStopData(s, companyId) })),
        });
      }

      if (body.loadDetails === null) {
        await tx.loadDetails.deleteMany({ where: { jobId: id, companyId } });
      } else if (hasLoadDetailsInput(loadDetails)) {
        await tx.loadDetails.upsert({
          where:  { jobId: id },
          create: {
            companyId,
            jobId:           id,
            quantity:        toNullableNumber(loadDetails?.quantity),
            unit:            loadDetails?.unit?.toString() ?? "",
            weight:          toNullableNumber(loadDetails?.weight),
            volume:          toNullableNumber(loadDetails?.volume),
            materialType:    loadDetails?.materialType?.toString() ?? "",
            hazardClass:     loadDetails?.hazardClass?.toString() ?? "",
            notes:           loadDetails?.notes?.toString() ?? "",
            dimensions:      loadDetails?.dimensions?.toString() ?? "",
            fragile:         loadDetails?.fragile ?? false,
            stackable:       loadDetails?.stackable ?? false,
            tempControlled:  loadDetails?.tempControlled ?? false,
            tempRange:       loadDetails?.tempRange?.toString() ?? "",
            photosRequired:  loadDetails?.photosRequired ?? false,
            weighbridgeRequired: loadDetails?.weighbridgeRequired ?? false,
            forkliftRequired:    loadDetails?.forkliftRequired ?? false,
            tailLiftRequired:    loadDetails?.tailLiftRequired ?? false,
            craneRequired:       loadDetails?.craneRequired ?? false,
            loadingMethod:       loadDetails?.loadingMethod?.toString() ?? "",
            unloadingMethod:     loadDetails?.unloadingMethod?.toString() ?? "",
            goodsType:           loadDetails?.goodsType?.toString() ?? "",
            securingRequirements: Array.isArray(loadDetails?.securingRequirements) ? (loadDetails.securingRequirements as any) : undefined,
            specialRequirements:  Array.isArray(loadDetails?.specialRequirements)  ? (loadDetails.specialRequirements  as any) : undefined,
          },
          update: {
            quantity:        toNullableNumber(loadDetails?.quantity),
            unit:            loadDetails?.unit?.toString() ?? "",
            weight:          toNullableNumber(loadDetails?.weight),
            volume:          toNullableNumber(loadDetails?.volume),
            materialType:    loadDetails?.materialType?.toString() ?? "",
            hazardClass:     loadDetails?.hazardClass?.toString() ?? "",
            notes:           loadDetails?.notes?.toString() ?? "",
            dimensions:      loadDetails?.dimensions?.toString() ?? "",
            fragile:         loadDetails?.fragile ?? false,
            stackable:       loadDetails?.stackable ?? false,
            tempControlled:  loadDetails?.tempControlled ?? false,
            tempRange:       loadDetails?.tempRange?.toString() ?? "",
            photosRequired:  loadDetails?.photosRequired ?? false,
            weighbridgeRequired: loadDetails?.weighbridgeRequired ?? false,
            forkliftRequired:    loadDetails?.forkliftRequired ?? false,
            tailLiftRequired:    loadDetails?.tailLiftRequired ?? false,
            craneRequired:       loadDetails?.craneRequired ?? false,
            loadingMethod:       loadDetails?.loadingMethod?.toString() ?? "",
            unloadingMethod:     loadDetails?.unloadingMethod?.toString() ?? "",
            goodsType:           loadDetails?.goodsType?.toString() ?? "",
            securingRequirements: Array.isArray(loadDetails?.securingRequirements) ? (loadDetails.securingRequirements as any) : undefined,
            specialRequirements:  Array.isArray(loadDetails?.specialRequirements)  ? (loadDetails.specialRequirements  as any) : undefined,
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
          oldValue:  { validationStatus: job.validationStatus, qualityScore: job.qualityScore },
          newValue:  { validationStatus: structuredValidation.validationStatus, qualityScore: quality.score },
        },
      });

      return tx.plannedJob.update({
        where: { id },
        data: {
          ...(jobReference !== undefined ? { jobReference } : {}),
          customerId:          effectiveCustomerId ?? null,
          customerName:        patchCustomerName,
          materialType:        loadDetails?.materialType?.toString() ?? "",
          quantityExpected:    loadDetails?.quantity !== undefined && loadDetails?.quantity !== null ? String(loadDetails.quantity) : "",
          quantityUnit:        loadDetails?.unit?.toString() ?? "",
          plannerNotes:        body.plannerNotes ?? job.plannerNotes,
          reqBodyCategory,
          reqGvwMin,
          reqBodyType,
          reqEquipment,
          reqLicenceClass,
          trailerTypesAllowed: body.trailerTypesAllowed ?? JSON.parse(JSON.stringify(job.trailerTypesAllowed ?? [])),
          priority:            body.priority ?? job.priority,
          serviceType:         body.serviceType ?? job.serviceType,
          customerRef:         body.customerRef ?? job.customerRef,
          purchaseOrderNumber: body.purchaseOrderNumber ?? job.purchaseOrderNumber,
          billingNotes:        body.billingNotes ?? job.billingNotes,
          customerInstructions: body.customerInstructions ?? job.customerInstructions,
          custRefRequired:     body.custRefRequired ?? job.custRefRequired,
          poRequired:          body.poRequired ?? job.poRequired,
          minVehicleSize:      body.minVehicleSize ?? job.minVehicleSize,
          equipmentRequired:   body.equipmentRequired ?? JSON.parse(JSON.stringify(job.equipmentRequired ?? [])),
          driverQualificationsReq: body.driverQualificationsReq ?? JSON.parse(JSON.stringify(job.driverQualificationsReq ?? [])),
          lengthRestriction:   body.lengthRestriction ?? job.lengthRestriction,
          vehicleAccessNotes:  body.vehicleAccessNotes ?? job.vehicleAccessNotes,
          failureAction:       body.failureAction ?? job.failureAction,
          assistancePhone:     body.assistancePhone ?? job.assistancePhone,
          assistanceNote:      body.assistanceNote ?? job.assistanceNote,
          internalNotes:       body.internalNotes ?? job.internalNotes,
          validationStatus:    structuredValidation.validationStatus,
          qualityScore:        quality.score,
          requirePOD:          body.requirePOD ?? job.requirePOD,
          canSplitShipment:    body.canSplitShipment ?? job.canSplitShipment,
          plannedDate:         body.plannedDate ? new Date(body.plannedDate) : job.plannedDate,
        },
        include: {
          stops:       { orderBy: { sequenceNumber: "asc" } },
          loadDetails: true,
          audits:      { orderBy: { createdAt: "desc" }, take: 5 },
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
      where:  { companyId, linkedJobId: id, status: "loaded" },
      select: { registration: true },
    });
    if (loadedTrailer) {
      return reply.status(409).send({
        error:   "Cannot delete a job with a loaded linked trailer",
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
          status:       "cancelled",
          plannerNotes: appendPlannerReason(job.plannerNotes, "Job deleted by planner. Record kept as cancelled for audit and reporting."),
        },
      });
      await tx.jobAudit.create({
        data: {
          companyId,
          jobId:     id,
          changedBy: userId,
          action:    "deleted",
          field:     "job",
          oldValue:  { status: job.status },
          newValue:  { status: "cancelled" },
        },
      });
    });

    return reply.status(204).send();
  });

  // ── PATCH /jobs/:id/stop-times — planner edits per-stop timing ───────────
  // Driver/vehicle assignment is now on Run, not Job.
  // This endpoint handles only stop-level timing fields.
  app.patch("/jobs/:id/stop-times", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const { companyId, userId } = request.user!;
    const body = request.body as {
      stopTimes?: {
        stopId:                     number;
        bookedTime?:                string | null;
        earliestArrivalMinutes?:    number | null;
        unloadingAllowanceMinutes?: number | null;
      }[];
    };

    const job = await prisma.plannedJob.findFirst({ where: { id, companyId }, include: { stops: true } });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    if (Array.isArray(body.stopTimes) && body.stopTimes.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const st of body.stopTimes!) {
          const patch: Record<string, unknown> = {};
          if ("bookedTime"                in st) patch.bookedTime                = st.bookedTime ? new Date(st.bookedTime) : null;
          if ("earliestArrivalMinutes"    in st) patch.earliestArrivalMinutes    = st.earliestArrivalMinutes ?? null;
          if ("unloadingAllowanceMinutes" in st) patch.unloadingAllowanceMinutes = st.unloadingAllowanceMinutes ?? null;
          if (Object.keys(patch).length > 0) {
            await tx.jobPart.updateMany({
              where: { id: st.stopId, jobId: id, companyId },
              data:  patch,
            });
          }
        }
        await tx.jobAudit.create({
          data: {
            companyId,
            jobId:     id,
            changedBy: userId,
            action:    "updated",
            field:     "stop_times",
            newValue:  JSON.parse(JSON.stringify(body.stopTimes)) as Prisma.InputJsonValue,
          },
        });
      });
    }

    const updated = await prisma.plannedJob.findFirst({
      where:   { id, companyId },
      include: { stops: { orderBy: { sequenceNumber: "asc" } }, loadDetails: true },
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

    const job = await prisma.plannedJob.findFirst({ where: { id, companyId } });
    if (!job) return reply.status(404).send({ error: "Job not found" });

    if (role === "driver") {
      const profile = await prisma.driverProfile.findFirst({ where: { companyId, userId } });
      if (!profile) return reply.status(403).send({ error: "Not your job" });
      const assignment = await prisma.runAssignment.findFirst({
        where: { jobId: id, companyId, removedAt: null, run: { assignedDriverId: profile.id } },
      });
      if (!assignment) return reply.status(403).send({ error: "Not your job" });
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
      return reply.status(400).send({ error: `Cannot move from ${job.status} to ${body.status}` });
    }

    let clientTs = new Date();
    if (body.clientTimestamp) {
      const parsedClientTs = new Date(body.clientTimestamp);
      const parsedTime = parsedClientTs.getTime();
      if (Number.isNaN(parsedTime)) {
        return reply.status(400).send({ error: "BAD_REQUEST", message: "clientTimestamp must be a valid ISO date" });
      }
      const now = Date.now();
      if (now - parsedTime > SYNC_REVIEW_RULES.MAX_EVENT_AGE_MS) {
        return reply.status(400).send({ error: "BAD_REQUEST", message: "clientTimestamp is older than 7 days" });
      }
      if (parsedTime - now > SYNC_REVIEW_RULES.MAX_FUTURE_DRIFT_MS) {
        return reply.status(400).send({ error: "BAD_REQUEST", message: "clientTimestamp is more than 1 hour in the future" });
      }
      clientTs = parsedClientTs;
    }

    if (
      (body.gpsLat !== undefined && body.gpsLng === undefined) ||
      (body.gpsLat === undefined && body.gpsLng !== undefined)
    ) {
      return reply.status(400).send({ error: "BAD_REQUEST", message: "gpsLat and gpsLng must be provided together" });
    }

    if (body.gpsLat !== undefined && (typeof body.gpsLat !== "number" || !Number.isFinite(body.gpsLat) || body.gpsLat < -90 || body.gpsLat > 90)) {
      return reply.status(400).send({ error: "BAD_REQUEST", message: "gpsLat must be a number between -90 and 90" });
    }
    if (body.gpsLng !== undefined && (typeof body.gpsLng !== "number" || !Number.isFinite(body.gpsLng) || body.gpsLng < -180 || body.gpsLng > 180)) {
      return reply.status(400).send({ error: "BAD_REQUEST", message: "gpsLng must be a number between -180 and 180" });
    }

    await prisma.$transaction([
      prisma.plannedJob.update({ where: { id }, data: { status: body.status } }),
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

  // ── GET /drivers/:driverId/schedule ─────────────────────────────────────────
  app.get<{ Params: { driverId: string }; Querystring: { date?: string } }>(
    "/drivers/:driverId/schedule",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const companyId = req.user!.companyId;
      const driverId  = parseInt(req.params.driverId, 10);
      const date      = req.query.date;

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return reply.status(400).send({ error: "date query param required (YYYY-MM-DD)" });
      }

      const driver = await prisma.driverProfile.findFirst({
        where:  { id: driverId, companyId },
        select: { id: true, preferredStartTime: true, earliestStartTime: true },
      });
      if (!driver) return reply.status(404).send({ error: "Driver not found" });

      // Find all jobs this driver has RunAssignments for on the given date
      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd   = new Date(`${date}T23:59:59`);

      const assignments = await prisma.runAssignment.findMany({
        where: { companyId, removedAt: null, run: { assignedDriverId: driverId } },
        select: { jobId: true },
        distinct: ["jobId"],
      });
      const jobIds = assignments.map(a => a.jobId);

      const jobs = await prisma.plannedJob.findMany({
        where: {
          companyId,
          id:          { in: jobIds },
          plannedDate: { gte: dayStart, lte: dayEnd },
          status:      { notIn: ["cancelled"] },
        },
        include: { stops: { orderBy: { sequenceNumber: "asc" } } },
        orderBy: { id: "asc" },
      });

      const stops: ScheduleStop[] = [];
      for (const job of jobs) {
        for (const s of job.stops) {
          stops.push({
            jobId:          job.id,
            jobReference:   job.jobReference,
            stopSequence:   s.sequenceNumber,
            type:           s.type,
            postcode:       s.postcode || null,
            lat:            s.lat,
            lng:            s.lng,
            windowStart:    s.timeWindowStart?.toISOString() ?? null,
            windowEnd:      s.timeWindowEnd?.toISOString()   ?? null,
            bookedTime:     s.bookedTime?.toISOString()      ?? null,
            serviceMinutes: s.unloadingAllowanceMinutes ?? 30,
          });
        }
      }

      const dayStart24 = driver.earliestStartTime ?? driver.preferredStartTime ?? "06:00";
      const result = await checkDayFeasibility(driverId, date, stops, dayStart24);

      return reply.send(result);
    },
  );
}

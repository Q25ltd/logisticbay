/**
 * Job intake routes.
 *
 * Public (no auth):
 *   GET  /public/request/:token   — resolve link, return company/customer info + template
 *   POST /public/request/:token   — submit PRF → writes directly to Job + JobPart
 *
 * Authenticated (planner / company_owner):
 *   GET    /request-links         — list links for this company
 *   POST   /request-links         — create a link (returns raw token once)
 *   PATCH  /request-links/:id     — update link (name, active, expiry, template data)
 *
 *   GET  /job-requests            — list pending_review jobs
 *   GET  /job-requests/:id        — single pending_review job
 *   POST /job-requests/:id/accept — set plannedDate + plannerNotes → ready_to_plan
 *   POST /job-requests/:id/reject — set status → cancelled
 */

import crypto                    from "node:crypto";
import type { FastifyInstance }  from "fastify";
import { PrismaClient, Prisma }  from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { toNullableNumber }      from "../lib/coerce.js";
import { generateJobReference }  from "../lib/jobReference.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Parse an ISO string into a Date, returning null if empty/invalid. */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Combine a date string (YYYY-MM-DD) and a time string (HH:MM) into a Date.
 * Returns null if either is missing or the result is invalid.
 */
function combineDateTime(date: string | undefined, time: string | undefined): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Coerce a value to a non-null string, returning "" if null/undefined. */
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Coerce a value to a nullable string, returning null if falsy. */
function strN(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Coerce to boolean, returning false if falsy. */
function bool(v: unknown): boolean {
  return v === true;
}

/**
 * Map a PRF stop object to a JobPart create-data shape.
 * Sequence is 1-indexed; caller provides the index.
 */
function stopToJobPartData(stop: Record<string, unknown>, companyId: number, index: number) {
  const date = stop.date  as string | undefined;
  const tws  = stop.earliestArrivalTime as string | undefined;
  const twe  = stop.latestArrivalTime   as string | undefined;

  return {
    companyId,
    sequenceNumber:           index + 1,
    type:                     str(stop.type) || "delivery",
    siteName:                 str(stop.siteName),
    unitName:                 "",
    street:                   str(stop.street),
    addressLine2:             str(stop.addressLine2),
    town:                     str(stop.town),
    countyRegion:             str(stop.countyRegion),
    postcode:                 str(stop.postcode),
    country:                  str(stop.country) || "United Kingdom",
    lat:                      toNullableNumber(stop.lat  as number | null),
    lng:                      toNullableNumber(stop.lng  as number | null),
    gateLat:                  toNullableNumber(stop.gateLat  as number | null | undefined),
    gateLng:                  toNullableNumber(stop.gateLng  as number | null | undefined),
    locationTextSnapshot:     [stop.siteName, stop.street, stop.town, stop.postcode].filter(Boolean).join(", "),
    navigationInstructions:   str(stop.navigationInstructions),
    referenceNumber:          str(stop.referenceNumber),
    contactName:              str(stop.contactName),
    contactPhone:             str(stop.contactPhone),
    contactEmail:             str(stop.contactEmail),
    bookingRequired:          bool(stop.bookingRequired),
    bookingRef:               str(stop.bookingRef),
    openingHours:             str(stop.openingHours),
    instructions:             str(stop.instructions),
    internalNotes:            str(stop.internalNotes),
    standingChargeNote:       "",
    timeWindowStart:          combineDateTime(date, tws),
    timeWindowEnd:            combineDateTime(date, twe),
    bookedTime:               parseDate(stop.bookedTime as string | undefined),
    unloadingAllowanceMinutes: typeof stop.unloadingAllowanceMinutes === "number" ? stop.unloadingAllowanceMinutes : null,
    quantityRequired:         toNullableNumber(stop.quantityRequired as number | null | undefined),
    quantityUnit:             str(stop.quantityUnit),
    exchangeDropQty:          toNullableNumber(stop.exchangeDropQty    as number | null | undefined),
    exchangeCollectQty:       toNullableNumber(stop.exchangeCollectQty as number | null | undefined),
    exchangeUnit:             str(stop.exchangeUnit),
    handlingMethods:          Array.isArray(stop.handlingMethods)    ? (stop.handlingMethods    as Prisma.InputJsonValue) : Prisma.JsonNull,
    proofRequirements:        Array.isArray(stop.proofRequirements)  ? (stop.proofRequirements  as Prisma.InputJsonValue) : Prisma.JsonNull,
    accessRequirements:       Array.isArray(stop.accessRequirements) ? (stop.accessRequirements as Prisma.InputJsonValue) : Prisma.JsonNull,
    loadReadiness:            str(stop.loadReadiness),
    stopNotes:                str(stop.stopNotes),
    heightRestriction:        str(stop.heightRestriction),
    weightRestriction:        str(stop.weightRestriction),
    lengthRestriction:        str(stop.lengthRestriction),
    numPallets:               toNullableNumber(stop.numPallets as number | null | undefined),
    status:                   "pending",
  };
}

// ─── routes ─────────────────────────────────────────────────────────────────

export async function jobRequestRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {

  // ── GET /public/request/:token ─────────────────────────────────────────────
  app.get("/public/request/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const tokenHash = hashToken(token);

    const link = await prisma.clientRequestLink.findUnique({
      where:   { tokenHash },
      include: { company: true, customer: true },
    });

    if (!link || !link.isActive) {
      return reply.status(404).send({ error: "Link not found or inactive" });
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      return reply.status(410).send({ error: "This link has expired" });
    }

    return reply.send({
      companyName:  link.company.name,
      customerName: link.customer?.name ?? null,
      contactName:  (link.customer as any)?.contactName ?? null,
      contactEmail: (link.customer as any)?.contactEmail ?? null,
      contactPhone: (link.customer as any)?.contactPhone ?? null,
      templateData: link.templateData ?? null,
    });
  });

  // ── POST /public/request/:token ────────────────────────────────────────────
  app.post("/public/request/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const tokenHash = hashToken(token);

    const link = await prisma.clientRequestLink.findUnique({
      where:   { tokenHash },
      include: { company: true, customer: true },
    });

    if (!link || !link.isActive) {
      return reply.status(404).send({ error: "Link not found or inactive" });
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      return reply.status(410).send({ error: "This link has expired" });
    }

    const body  = request.body as Record<string, unknown>;
    const stops = (body.stops as Record<string, unknown>[] | undefined) ?? [];

    if (stops.length === 0) {
      return reply.status(400).send({ error: "At least one stop is required" });
    }

    // ── Vehicle requirements ─────────────────────────────────────────────────
    const vehicleCategory    = str(body.vehicleCategory);
    const bodyTypes: string[]       = Array.isArray(body.bodyTypes)       ? body.bodyTypes       as string[] : [];
    const equipment: string[]       = Array.isArray(body.equipment)       ? body.equipment       as string[] : [];
    const trailersAllowed: string[] = Array.isArray(body.trailersAllowed) ? body.trailersAllowed as string[] : [];

    // ── Load ─────────────────────────────────────────────────────────────────
    const tempControlled = bool(body.tempControlled);
    const tempRange      = strN(body.tempRange);
    const fragile        = bool(body.fragile);
    const hazardClass    = strN(body.hazardClass);
    const specialItems: string[] = Array.isArray(body.specialRequirements) ? body.specialRequirements as string[] : [];

    // ── Exception policy ─────────────────────────────────────────────────────
    const failureAction              = str(body.failureAction) || "call_assistance";
    const approvalContactName        = strN(body.approvalContactName);
    const approvalContactPhone       = strN(body.approvalContactPhone);
    const alternativeReturnAddress   = strN(body.alternativeReturnAddress);
    const alternativeReturnPostcode  = strN(body.alternativeReturnPostcode);
    const alternativeReturnContactName  = strN(body.alternativeReturnContactName);
    const alternativeReturnContactPhone = strN(body.alternativeReturnContactPhone);

    // ── Notes ────────────────────────────────────────────────────────────────
    const driverNoteChips: string[]  = Array.isArray(body.driverNoteChips) ? body.driverNoteChips as string[] : [];
    const driverVisibleNotes = strN(body.driverVisibleNotes);
    const safetyInstructions = strN(body.safetyInstructions);

    // ── Find creator (a planner/owner in this company) ───────────────────────
    const membership = await prisma.companyMembership.findFirst({
      where: {
        companyId: link.companyId,
        role:      { in: ["company_owner", "planner"] },
        status:    "active",
      },
      orderBy: { id: "asc" },
    });
    if (!membership) {
      return reply.status(500).send({ error: "Company has no active planner account" });
    }

    // ── Transaction: create Job + JobParts, update link stats ────────────────
    const job = await prisma.$transaction(async (tx) => {
      const jobReference = await generateJobReference(
        link.companyId,
        tx as unknown as { $queryRawUnsafe<T>(q: string, ...v: unknown[]): Promise<T> },
      );

      const created = await (tx as unknown as PrismaClient).job.create({
        data: {
          companyId:       link.companyId,
          customerId:      link.customerId ?? null,
          createdByUserId: membership.userId,
          jobReference,
          status:          "pending_review",

          // Customer / requester
          customerName:        str(body.customerName) || (link.customer?.name ?? ""),
          customerRef:         strN(body.customerRef),
          bookingContactName:  strN(body.bookingContactName),
          bookingContactPhone: strN(body.bookingContactPhone),
          bookingContactEmail: strN(body.bookingContactEmail),

          // Billing
          purchaseOrderNumber: strN(body.purchaseOrderNumber),
          billingReference:    strN(body.billingReference),
          declaredGoodsValue:  body.declaredGoodsValue != null ? str(body.declaredGoodsValue) : null,

          // Load
          goodsType:           strN(body.goodsType),
          goodsDescription:    strN(body.goodsDescription),
          quantity:            toNullableNumber(body.quantity as number | null | undefined),
          quantityUnit:        str(body.quantityUnit),
          weight:              toNullableNumber(body.weight as number | null | undefined),
          fragile,
          stackable:           bool(body.stackable),
          tempControlled,
          tempRange,
          hazardClass,
          securingRequirements: Array.isArray(body.securingRequirements)
                                  ? (body.securingRequirements as Prisma.InputJsonValue)
                                  : Prisma.DbNull,
          specialRequirements:  specialItems.length > 0
                                  ? (specialItems as unknown as Prisma.InputJsonValue)
                                  : Prisma.DbNull,

          // Vehicle requirements
          vehicleCategory,
          bodyTypes:           bodyTypes.length > 0
                                 ? (bodyTypes as unknown as Prisma.InputJsonValue)
                                 : Prisma.DbNull,
          equipment:           equipment.length > 0
                                 ? (equipment as unknown as Prisma.InputJsonValue)
                                 : Prisma.DbNull,
          trailersAllowed:     trailersAllowed.length > 0
                                 ? (trailersAllowed as unknown as Prisma.InputJsonValue)
                                 : Prisma.DbNull,
          vehicleAccessNotes: "",

          // Notes
          driverNoteChips:    driverNoteChips.length > 0
                                ? (driverNoteChips as unknown as Prisma.InputJsonValue)
                                : Prisma.DbNull,
          driverVisibleNotes,
          safetyInstructions,

          // Exception policy
          failureAction,
          approvalContactName,
          approvalContactPhone,
          alternativeReturnAddress,
          alternativeReturnPostcode,
          alternativeReturnContactName,
          alternativeReturnContactPhone,

          canSplitShipment: str(body.canSplitShipment) || "must_stay_together",

          stops: {
            create: stops.map((stop, i) => stopToJobPartData(stop, link.companyId, i)),
          },
        },
      });

      // Update link usage stats
      await (tx as unknown as PrismaClient).clientRequestLink.update({
        where: { id: link.id },
        data:  { lastUsedAt: new Date(), usageCount: { increment: 1 } },
      });

      return created;
    });

    return reply.status(201).send({ id: job.id, warnings: [] });
  });

  // ── GET /request-links ─────────────────────────────────────────────────────
  app.get(
    "/request-links",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const links = await prisma.clientRequestLink.findMany({
        where:   { companyId: request.user!.companyId },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({
        data: links.map((l) => ({
          id:           l.id,
          companyId:    l.companyId,
          customerId:   l.customerId,
          name:         l.name,
          tokenHash:    l.tokenHash,
          isActive:     l.isActive,
          expiresAt:    l.expiresAt?.toISOString() ?? null,
          lastUsedAt:   l.lastUsedAt?.toISOString() ?? null,
          usageCount:   l.usageCount,
          createdAt:    l.createdAt.toISOString(),
          customer:     l.customer ?? null,
          templateData: l.templateData ?? null,
        })),
      });
    },
  );

  // ── POST /request-links ────────────────────────────────────────────────────
  app.post(
    "/request-links",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const body      = request.body as Record<string, unknown>;
      const rawToken  = generateRawToken();
      const tokenHash = hashToken(rawToken);

      const link = await prisma.clientRequestLink.create({
        data: {
          companyId:    request.user!.companyId,
          customerId:   typeof body.customerId === "number" ? body.customerId : null,
          name:         str(body.name) || "Untitled link",
          tokenHash,
          isActive:     true,
          expiresAt:    body.expiresAt ? new Date(body.expiresAt as string) : null,
          createdBy:    request.user!.userId,
          templateData: body.templateData != null
                          ? (body.templateData as unknown as Prisma.InputJsonValue)
                          : Prisma.DbNull,
        },
        include: { customer: { select: { id: true, name: true } } },
      });

      return reply.status(201).send({
        id:           link.id,
        companyId:    link.companyId,
        customerId:   link.customerId,
        name:         link.name,
        tokenHash:    link.tokenHash,
        isActive:     link.isActive,
        expiresAt:    link.expiresAt?.toISOString() ?? null,
        lastUsedAt:   null,
        usageCount:   0,
        createdAt:    link.createdAt.toISOString(),
        customer:     link.customer ?? null,
        templateData: link.templateData ?? null,
        rawToken,  // returned ONCE — client must save this immediately
      });
    },
  );

  // ── PATCH /request-links/:id ───────────────────────────────────────────────
  app.patch(
    "/request-links/:id",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const id   = parseInt((request.params as { id: string }).id, 10);
      const body = request.body as Record<string, unknown>;

      const existing = await prisma.clientRequestLink.findFirst({
        where: { id, companyId: request.user!.companyId },
      });
      if (!existing) return reply.status(404).send({ error: "Link not found" });

      const updated = await prisma.clientRequestLink.update({
        where: { id },
        data: {
          name:      typeof body.name     === "string" ? body.name.trim()  : undefined,
          isActive:  typeof body.isActive === "boolean" ? body.isActive    : undefined,
          expiresAt: body.expiresAt !== undefined
                       ? (body.expiresAt ? new Date(body.expiresAt as string) : null)
                       : undefined,
          templateData: body.templateData !== undefined
                          ? (body.templateData != null
                              ? (body.templateData as unknown as Prisma.InputJsonValue)
                              : Prisma.DbNull)
                          : undefined,
        },
        include: { customer: { select: { id: true, name: true } } },
      });

      return reply.send({
        id:           updated.id,
        companyId:    updated.companyId,
        customerId:   updated.customerId,
        name:         updated.name,
        tokenHash:    updated.tokenHash,
        isActive:     updated.isActive,
        expiresAt:    updated.expiresAt?.toISOString() ?? null,
        lastUsedAt:   updated.lastUsedAt?.toISOString() ?? null,
        usageCount:   updated.usageCount,
        createdAt:    updated.createdAt.toISOString(),
        customer:     updated.customer ?? null,
        templateData: updated.templateData ?? null,
      });
    },
  );

  // ── GET /job-requests — list pending_review jobs ───────────────────────────
  app.get(
    "/job-requests",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const qs    = request.query as Record<string, string>;
      const status = qs.status || "pending_review";
      const page   = Math.max(1, parseInt(qs.page ?? "1", 10));
      const limit  = 25;
      const skip   = (page - 1) * limit;

      const [jobs, total] = await prisma.$transaction([
        prisma.job.findMany({
          where:   { companyId: request.user!.companyId, status },
          include: {
            customer: true,
            stops:    { orderBy: { sequenceNumber: "asc" as const } },
          },
          orderBy: { createdAt: "desc" as const },
          take:    limit,
          skip,
        }),
        prisma.job.count({ where: { companyId: request.user!.companyId, status } }),
      ]);

      return reply.send({ data: jobs, total, page, pages: Math.ceil(total / limit) });
    },
  );

  // ── GET /job-requests/:id ──────────────────────────────────────────────────
  app.get(
    "/job-requests/:id",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const id  = parseInt((request.params as { id: string }).id, 10);
      const job = await prisma.job.findFirst({
        where:   { id, companyId: request.user!.companyId },
        include: {
          customer: true,
          stops:    { orderBy: { sequenceNumber: "asc" as const } },
        },
      });
      if (!job) return reply.status(404).send({ error: "Not found" });
      return reply.send(job);
    },
  );

  // ── POST /job-requests/:id/accept ─────────────────────────────────────────
  app.post(
    "/job-requests/:id/accept",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const id   = parseInt((request.params as { id: string }).id, 10);
      const body = request.body as { plannedDate?: string; plannerNotes?: string };

      const job = await prisma.job.findFirst({
        where: { id, companyId: request.user!.companyId },
      });
      if (!job) return reply.status(404).send({ error: "Job not found" });
      if (job.status !== "pending_review") {
        return reply.status(409).send({ error: "Job is not pending review" });
      }
      if (!body.plannedDate) {
        return reply.status(400).send({ error: "plannedDate is required to accept a job" });
      }

      const note = body.plannerNotes?.trim() || "";

      await prisma.$transaction([
        prisma.job.update({
          where: { id },
          data: {
            status:       "ready_to_plan",
            plannedDate:  new Date(body.plannedDate),
            plannerNotes: note || job.plannerNotes,
          },
        }),
        prisma.jobAudit.create({
          data: {
            companyId: job.companyId,
            jobId:     id,
            changedBy: request.user!.userId,
            action:    "accepted",
            field:     "status",
            oldValue:  "pending_review",
            newValue:  "ready_to_plan",
          },
        }),
      ]);

      return reply.send({ ok: true, jobId: id, jobReference: job.jobReference });
    },
  );

  // ── POST /job-requests/:id/reject ──────────────────────────────────────────
  app.post(
    "/job-requests/:id/reject",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const id   = parseInt((request.params as { id: string }).id, 10);
      const body = request.body as { reason?: string; notes?: string };

      const job = await prisma.job.findFirst({
        where: { id, companyId: request.user!.companyId },
      });
      if (!job) return reply.status(404).send({ error: "Job not found" });
      if (job.status !== "pending_review") {
        return reply.status(409).send({ error: "Job is not pending review" });
      }

      const note = body.reason
        ? `Rejected: ${body.reason}${body.notes ? ` — ${body.notes}` : ""}`
        : "Rejected by planner";

      await prisma.$transaction([
        prisma.job.update({ where: { id }, data: { status: "cancelled" } }),
        prisma.jobAudit.create({
          data: {
            companyId: job.companyId,
            jobId:     id,
            changedBy: request.user!.userId,
            action:    "rejected",
            field:     "status",
            oldValue:  "pending_review",
            newValue:  { status: "cancelled", note },
          },
        }),
      ]);

      return reply.send({ ok: true });
    },
  );
}

/**
 * Job intake routes.
 *
 * Public (no auth):
 *   GET  /og/request/:token       — OG meta tag HTML for social-media link previews
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
import type { ZodType }          from "zod";
import { PrismaClient, Prisma }  from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { env }                   from "../lib/env.js";
import { generateJobReference }  from "../lib/jobReference.js";
import { buildStopData }         from "../lib/jobUtils.js";
import { CreateJobSchema, type CreateJobInput } from "../schemas/jobs.js";
import {
  validateStructuredJob,
  findInvalidStopLocationId,
  type StructuredJobPartInput,
} from "../services/jobValidation.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseBody<T>(schema: ZodType<T>, body: unknown): { data: T } | { error: string; errors: string[] } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map(e => `${e.path.map(p => String(p)).join(".")}: ${e.message}`);
    return { error: errors[0] ?? "Invalid request body", errors };
  }
  return { data: result.data };
}

const toJson = (arr: string[] | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  Array.isArray(arr) && arr.length > 0 ? (arr as unknown as Prisma.InputJsonValue) : Prisma.DbNull;

type ResolvedLink = Awaited<ReturnType<PrismaClient["clientRequestLink"]["findUnique"]>> & {
  customer: { id: number; name: string } | null;
  company:  { name: string };
};

function buildPRFJobData(
  b: CreateJobInput,
  link: NonNullable<ResolvedLink>,
  createdByUserId: number,
  jobReference: string | null,
) {
  return {
    companyId:           link.companyId,
    customerId:          link.customerId ?? null,
    createdByUserId,
    jobReference,
    status:              "pending_review",
    customerName:        b.customerName?.trim() || link.customer?.name || null,
    customerRef:         b.customerRef?.trim()         || null,
    bookingContactName:  b.bookingContactName?.trim()  || null,
    bookingContactPhone: b.bookingContactPhone?.trim() || null,
    bookingContactEmail: b.bookingContactEmail?.trim() || null,
    purchaseOrderNumber: b.purchaseOrderNumber?.trim() || null,
    billingReference:    b.billingReference?.trim()    || null,
    declaredGoodsValue:  b.declaredGoodsValue?.trim()  || null,
    goodsType:           b.goodsType?.trim()           || null,
    goodsDescription:    b.goodsDescription?.trim()    || null,
    quantity:            b.quantity            ?? null,
    quantityUnit:        b.quantityUnit?.trim()        || null,
    weight:              b.weight              ?? null,
    tempControlled:      b.tempControlled      ?? false,
    tempRange:           b.tempRange?.trim()           || null,
    hazardClass:         b.hazardClass?.trim()         || null,
    tunnelCode:          b.tunnelCode?.trim()           || null,
    priority:            b.priority            ?? "normal",
    serviceType:         (() => {
      const ss = b.stops ?? [];
      const hasCollection = ss.some(s => s.type === "collection" || s.type === "pickup");
      const hasDelivery   = ss.some(s => s.type === "delivery"   || s.type === "dropoff");
      if (hasCollection && hasDelivery) return "multi_drop";
      if (hasCollection) return "collection";
      return "delivery";
    })(),
    jobType:             b.jobType?.trim()              || null,
    custRefRequired:     b.custRefRequired     ?? false,
    poRequired:          b.poRequired          ?? false,
    billingNotes:        b.billingNotes?.trim()         || null,
    volume:              b.volume              ?? null,
    dimensions:          b.dimensions?.trim()           || null,
    fragile:             b.fragile             ?? false,
    stackable:           b.stackable           ?? false,
    photosRequired:      b.photosRequired      ?? false,
    weighbridgeRequired: b.weighbridgeRequired ?? false,
    requirePOD:          b.requirePOD          ?? false,
    securingRequirements: toJson(b.securingRequirements),
    specialRequirements:  toJson(b.specialRequirements),
    vehicleCategory:     b.vehicleCategory?.trim()     || null,
    bodyTypes:           toJson(b.bodyTypes),
    minGvwClass:         b.minGvwClass?.trim()          || null,
    equipment:           toJson(b.equipment),
    trailersAllowed:     toJson(b.trailersAllowed),
    vehicleAccessNotes:  b.vehicleAccessNotes?.trim()  || null,
    driverNoteChips:     toJson(b.driverNoteChips),
    driverVisibleNotes:  b.driverVisibleNotes?.trim()  || null,
    safetyInstructions:  b.safetyInstructions?.trim()  || null,
    failureAction:       b.failureAction        ?? "call_assistance",
    assistancePhone:     b.assistancePhone?.trim()      || null,
    assistanceNote:      b.assistanceNote?.trim()       || null,
    approvalContactName:           b.approvalContactName?.trim()           || null,
    approvalContactPhone:          b.approvalContactPhone?.trim()          || null,
    alternativeReturnAddress:      b.alternativeReturnAddress?.trim()      || null,
    alternativeReturnPostcode:     b.alternativeReturnPostcode?.trim()     || null,
    alternativeReturnContactName:  b.alternativeReturnContactName?.trim()  || null,
    alternativeReturnContactPhone: b.alternativeReturnContactPhone?.trim() || null,
    canSplitShipment:    b.canSplitShipment ?? "must_stay_together",
    internalNotes:       null,
    loadData:                               b.loadData != null ? (b.loadData as Prisma.InputJsonValue) : Prisma.DbNull,
    alternativeReturnSiteName:              b.alternativeReturnSiteName?.trim()              || null,
    alternativeReturnAddressLine2:          b.alternativeReturnAddressLine2?.trim()          || null,
    alternativeReturnTown:                  b.alternativeReturnTown?.trim()                  || null,
    alternativeReturnCounty:                b.alternativeReturnCounty?.trim()                || null,
    alternativeReturnCountry:               b.alternativeReturnCountry?.trim()               || null,
    alternativeReturnLat:                   b.alternativeReturnLat ?? null,
    alternativeReturnLng:                   b.alternativeReturnLng ?? null,
    alternativeReturnNavigationInstructions: b.alternativeReturnNavigationInstructions?.trim() || null,
    photosRequiredOnRejection:              b.photosRequiredOnRejection ?? false,
    rejectionSignatureRequired:             b.rejectionSignatureRequired ?? false,
    rejectionNotes:                         b.rejectionNotes?.trim() || null,
    stops: { create: b.stops!.map(s => buildStopData(s, link.companyId)) },
  };
}

// ─── link resolution ────────────────────────────────────────────────────────

/** Resolve a URL param to a link — tries token hash first, then company slug (main link only). */
async function resolveLink(prisma: PrismaClient, param: string) {
  const byToken = await prisma.clientRequestLink.findUnique({
    where:   { tokenHash: hashToken(param) },
    include: { company: true, customer: true },
  });
  if (byToken) return byToken;

  // Slug path: only resolves the main active link for that company
  const company = await prisma.company.findUnique({ where: { slug: param } });
  if (!company) return null;

  const mainLink = await prisma.clientRequestLink.findFirst({
    where:   { companyId: company.id, isMain: true },
    include: { company: true, customer: true },
  });
  return mainLink ?? null;
}

// ─── routes ─────────────────────────────────────────────────────────────────

export async function jobRequestRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {

  // ── GET /og/request/:token ────────────────────────────────────────────────
  //
  // Social-media crawlers (Facebook, WhatsApp, iMessage, LinkedIn, Slack…)
  // call this endpoint to get Open Graph meta tags. Browsers and apps are
  // immediately redirected to the SPA via <meta http-equiv="refresh">.
  //
  // Vercel Edge Middleware detects bot User-Agents on /request/:token and
  // proxies the request here so the crawler gets real OG tags.
  app.get("/og/request/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const appUrl    = env.APP_URL ?? "https://www.logisticbay.com";

    const link = await resolveLink(prisma, token).catch(() => null);
    const isValid =
      link &&
      link.isActive &&
      !(link.expiresAt && link.expiresAt < new Date());

    const companyName = isValid ? link!.company.name : null;
    const title       = companyName
      ? `${companyName} — Transport Request`
      : "Submit a Transport Request";
    const description = companyName
      ? `Submit a transport job request to ${companyName} via LogisticBay.`
      : "Submit a transport job request via LogisticBay.";
    const redirectUrl = `${appUrl}/request/${encodeURIComponent(token)}`;
    const imageUrl    = `${appUrl}/og-image.png`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />

  <meta property="og:type"        content="website" />
  <meta property="og:site_name"   content="LogisticBay" />
  <meta property="og:title"       content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image"       content="${imageUrl}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url"         content="${redirectUrl}" />

  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image"       content="${imageUrl}" />

  <!-- Redirect real browsers to the SPA immediately -->
  <meta http-equiv="refresh" content="0; url=${redirectUrl}" />
</head>
<body>
  <p>Redirecting… <a href="${redirectUrl}">Click here if not redirected</a></p>
  <script>window.location.replace("${redirectUrl.replace(/"/g, '\\"')}");</script>
</body>
</html>`;

    return reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Cache-Control", "public, max-age=300")
      .send(html);
  });

  // ── GET /public/request/:token ─────────────────────────────────────────────
  app.get("/public/request/:token", async (request, reply) => {
    const { token } = request.params as { token: string };

    const link = await resolveLink(prisma, token);

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
  app.post("/public/request/:token", {
    config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
  }, async (request, reply) => {
    const { token } = request.params as { token: string };

    const link = await resolveLink(prisma, token);

    if (!link || !link.isActive) {
      return reply.status(404).send({ error: "Link not found or inactive" });
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      return reply.status(410).send({ error: "This link has expired" });
    }

    const parsed = parseBody(CreateJobSchema, request.body);
    if ("error" in parsed) return reply.status(400).send(parsed);
    const b = parsed.data;

    if (!b.stops?.length) {
      return reply.status(400).send({ error: "At least one stop is required" });
    }

    // ── Find creator (a planner/owner in this company) ───────────────────────
    const membership = await prisma.companyMembership.findFirst({
      where: { companyId: link.companyId, role: { in: ["company_owner", "planner"] }, status: "active" },
      orderBy: { id: "asc" },
    });
    if (!membership) return reply.status(500).send({ error: "Company has no active planner account" });

    // ── IDOR guard: validate every savedLocationId against this company ───────
    const invalidLocId = await findInvalidStopLocationId(prisma, link.companyId, b.stops!);
    if (invalidLocId !== null) {
      return reply.status(400).send({ error: "Invalid location reference in stops" });
    }

    // ── Transaction: create Job + JobParts, update link stats ────────────────
    const job = await prisma.$transaction(async (tx) => {
      const jobReference = await generateJobReference(
        link.companyId,
        tx as unknown as { $queryRawUnsafe<T>(q: string, ...v: unknown[]): Promise<T> },
      );
      const created = await (tx as unknown as PrismaClient).job.create({
        data: buildPRFJobData(b, link, membership.userId, jobReference),
      });
      await (tx as unknown as PrismaClient).clientRequestLink.update({
        where: { id: link.id },
        data:  { lastUsedAt: new Date(), usageCount: { increment: 1 } },
      });
      return created;
    });

    return reply.status(201).send({ id: job.id, warnings: [] });
  });

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
      const body = request.body as { plannedDate?: string; plannerNotes?: string; vehicleCategory?: string; bodyTypes?: string[] };

      const job = await prisma.job.findFirst({
        where:   { id, companyId: request.user!.companyId },
        include: { stops: { orderBy: { sequenceNumber: "asc" } } },
      });
      if (!job) return reply.status(404).send({ error: "Job not found" });
      if (job.status !== "pending_review") {
        return reply.status(409).send({ error: "Job is not pending review" });
      }
      // Derive plannedDate from the first collection stop if not explicitly supplied.
      // This mirrors the CJP/accept-drawer behaviour where the field was removed from the UI.
      const resolvedPlannedDate: string = body.plannedDate ||
        job.stops.find(s => s.type === "collection" || s.type === "pickup")?.timeWindowStart?.toISOString().slice(0, 10) ||
        job.stops[0]?.timeWindowStart?.toISOString().slice(0, 10) ||
        "";
      if (!resolvedPlannedDate) {
        return reply.status(400).send({
          error:   "DATE_REQUIRED",
          message: "Cannot determine collection date — add a time window to a collection stop first.",
        });
      }

      // Vehicle category must be known before a job can enter planning.
      // Accept body may supply it when the customer left it blank in the PRF.
      const vehicleCategory = body.vehicleCategory?.trim() || (job.vehicleCategory as string | null) || null;
      if (!vehicleCategory) {
        return reply.status(400).send({
          error:   "VEHICLE_REQUIRED",
          message: "Vehicle type must be set before this job can be accepted into planning.",
        });
      }

      // Full validation — same gates as CJP ready_to_plan save.
      // Auto-build locationTextSnapshot from address parts when the PRF stop
      // has address fields but no snapshot text (matching buildStopData logic).
      const stopInputs: StructuredJobPartInput[] = job.stops.map(s => {
        const snapshotFromParts = [s.siteName, s.street, s.town, s.postcode]
          .map(x => (x ?? "").trim()).filter(Boolean).join(", ") || null;
        return {
          sequenceNumber:       s.sequenceNumber,
          type:                 s.type,
          savedLocationId:      s.savedLocationId,
          locationTextSnapshot: s.locationTextSnapshot || snapshotFromParts,
          siteName:             s.siteName   ?? undefined,
          street:               s.street     ?? undefined,
          town:                 s.town       ?? undefined,
          postcode:             s.postcode   ?? undefined,
          lat:                  s.lat,
          lng:                  s.lng,
          timeWindowStart:      s.timeWindowStart?.toISOString() ?? null,
          timeWindowEnd:        s.timeWindowEnd?.toISOString()   ?? null,
          bookedTime:           s.bookedTime?.toISOString()       ?? null,
          contactName:          s.contactName  ?? undefined,
          contactPhone:         s.contactPhone ?? undefined,
          bookingRequired:      (s as any).bookingRequired ?? undefined,
          bookingRef:           (s as any).bookingRef      ?? undefined,
        };
      });

      const validation = validateStructuredJob({
        saveMode:       "ready_to_plan",
        customerId:     job.customerId,
        customerName:   job.customerName,
        plannedDate:    resolvedPlannedDate,
        vehicleCategory,
        minGvwClass:    job.minGvwClass ?? "",
        bodyType:       Array.isArray(job.bodyTypes)      ? (job.bodyTypes      as string[])[0] ?? "" : "",
        equipment:      Array.isArray(job.equipment)      ? job.equipment       as string[] : [],
        trailersAllowed:Array.isArray(job.trailersAllowed)? job.trailersAllowed as string[] : [],
        stops:          stopInputs,
        loadDetails: {
          quantity:            job.quantity,
          unit:                job.quantityUnit,
          weight:              job.weight,
          materialType:        job.goodsDescription,
          hazardClass:         job.hazardClass,
          goodsType:           job.goodsType,
          fragile:             job.fragile,
          stackable:           job.stackable,
          tempControlled:      job.tempControlled,
          securingRequirements: Array.isArray(job.securingRequirements) ? job.securingRequirements as string[] : null,
          specialRequirements:  Array.isArray(job.specialRequirements)  ? job.specialRequirements  as string[] : null,
        },
        loadData: job.loadData as Record<string, unknown> | null,
      });

      if (!validation.isValid) {
        return reply.status(400).send({
          error:    "Job cannot be accepted — required information is missing",
          errors:   validation.errors,
          warnings: validation.warnings,
        });
      }

      const note = body.plannerNotes?.trim() || "";

      await prisma.$transaction([
        prisma.job.update({
          where: { id },
          data: {
            status:          "ready_to_plan",
            plannedDate:     new Date(resolvedPlannedDate),
            plannerNotes:    note || job.plannerNotes,
            vehicleCategory,
            ...(Array.isArray(body.bodyTypes) && body.bodyTypes.length
              ? { bodyTypes: body.bodyTypes }
              : {}),
            validationStatus: validation.validationStatus,
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

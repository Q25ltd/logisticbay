/**
 * Job Request Intake routes
 *
 * Public (no auth):
 *   GET  /public/request/:token   — company branding for form header
 *   POST /public/request/:token   — submit a transport request
 *
 * Internal (auth required):
 *   GET  /request-links           — list intake links
 *   POST /request-links           — create intake link
 *   PATCH /request-links/:id      — update / deactivate link
 *
 *   GET  /job-requests            — review queue
 *   GET  /job-requests/:id        — request detail
 *   POST /job-requests/:id/accept — convert to PlannedJob + JobStops
 *   POST /job-requests/:id/reject — reject with reason
 *
 * STOP OBJECT SHAPE (stored in stops Json array):
 * {
 *   type: "collection" | "delivery" | "reload" | "return" | "waypoint" | "other"
 *   sequence: number
 *   siteName: string
 *   street: string
 *   addressLine2?: string
 *   town: string
 *   countyRegion?: string
 *   postcode: string
 *   country?: string
 *   lat: number
 *   lng: number
 *   navigationInstructions: string
 *   referenceNumber?: string
 *   contactName?: string
 *   contactPhone?: string
 *   contactEmail?: string
 *   bookingRequired?: boolean
 *   bookingRef?: string
 *   openingHours?: string
 *   siteRestrictions?: string[]
 *   date: string               // YYYY-MM-DD
 *   earliestArrivalTime: string  // HH:MM
 *   latestArrivalTime: string    // HH:MM
 *   bookedTime?: string
 *   unloadingAllowanceMinutes: number
 *   handlingMethods?: string[]
 *   proofRequirements?: string[]
 *   accessRequirements?: string[]
 *   entranceDistanceFromPostcode?: number | null  // set server-side
 *   entranceWarningLevel?: "ok" | "warn" | "danger"  // set server-side
 * }
 */

import crypto                       from "crypto";
import type { FastifyInstance }      from "fastify";
import { PrismaClient, Prisma }      from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { generateJobReference }      from "../lib/jobReference.js";
import { distanceMiles, checkEntranceDistance } from "../lib/geo.js";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function resolveLink(prisma: PrismaClient, rawToken: string) {
  const link = await prisma.clientRequestLink.findUnique({
    where:   { tokenHash: hashToken(rawToken) },
    include: { company: { select: { id: true, name: true } }, customer: true },
  });
  if (!link || !link.isActive)                        return null;
  if (link.expiresAt && link.expiresAt < new Date())  return null;
  return link;
}

// ── Type helpers ──────────────────────────────────────────────────────────────

interface StopBlob {
  type: string;
  sequence?: number;
  siteName?: string;
  street?: string;
  addressLine2?: string;
  town?: string;
  countyRegion?: string;
  postcode?: string;
  country?: string;
  lat?: number;
  lng?: number;
  navigationInstructions?: string;
  referenceNumber?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  bookingRequired?: boolean;
  bookingRef?: string;
  openingHours?: string;
  siteRestrictions?: string[];
  date?: string;
  earliestArrivalTime?: string;
  latestArrivalTime?: string;
  bookedTime?: string;
  unloadingAllowanceMinutes?: number;
  handlingMethods?: string[];
  proofRequirements?: string[];
  accessRequirements?: string[];
  loadReadiness?: string;
  typicalWaitingTime?: string;
  heightRestrictionValue?: string;
  weightRestrictionValue?: string;
  lengthRestrictionValue?: string;
  entranceDistanceFromPostcode?: number | null;
  entranceWarningLevel?: string;
}

interface LoadDataBlob {
  goodsType?: string;
  goodsDescription?: string;
  quantity?: number;
  unit?: string;
  estimatedWeight?: number;
  palletCount?: number;
  palletType?: string;
  stackable?: boolean;
  dimensions?: string;
  craneRequired?: boolean;
  tippingRequired?: boolean;
  temperatureRange?: string;
  chilledFrozenAmbient?: string;
  vehicleCount?: number;
  driveable?: boolean;
  containerSize?: string;
  loadedOrEmpty?: string;
  containerNumber?: string;
  loadNotes?: string;
  canSplitShipment?: string;
  securingRequirements?: string[];
}

interface SpecialRequirementsBlob {
  items?: string[];
  adrClass?: string;
  unNumber?: string;
  packingGroup?: string;
  hazardousPaperworkAvailable?: boolean;
  temperatureRange?: string;
}

interface TransportRequirementsBlob {
  plannerDecides?: boolean;
  reqBodyCategory?: string;
  reqBodyType?: string;
  reqEquipment?: string[];
  trailerTypesAllowed?: string[];
}

interface BillingBlob {
  pricingType?: string;
  declaredGoodsValue?: number;
  currency?: string;
  purchaseOrderNumber?: string;
  billingReference?: string;
  vatRegistered?: boolean;
  vatNumber?: string;
}

interface NotesBlob {
  driverNoteChips?: string[];
  driverVisibleNotes?: string;
  safetyInstructions?: string;
  customerNotes?: string;
}

interface ExceptionPolicyBlob {
  rejectionAction?: string;
  alternativeReturnAddress?: string;
  alternativeReturnPostcode?: string;
  alternativeReturnContactName?: string;
  alternativeReturnContactPhone?: string;
  approvalContactName?: string;
  approvalContactPhone?: string;
  photosRequiredOnRejection?: boolean;
  rejectionSignatureRequired?: boolean;
  rejectionNotes?: string;
}

interface RequesterBlob {
  customerCompanyName?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  customerRef?: string;
}

interface PublicRequestBody {
  requesterData:             RequesterBlob;
  stops:                     StopBlob[];
  loadData:                  LoadDataBlob;
  specialRequirementsData?:  SpecialRequirementsBlob;
  transportRequirementsData?: TransportRequirementsBlob;
  billingData?:              BillingBlob;
  notesData?:                NotesBlob;
  exceptionPolicyData?:      ExceptionPolicyBlob;
}

interface InternalRequestBody extends PublicRequestBody {
  internalOfficeNotes?: string;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateStop(s: StopBlob, idx: number, total: number): string[] {
  const e: string[] = [];
  const suf = total > 1 ? ` (stop ${idx + 1})` : "";
  if (!s.siteName?.trim())                e.push(`Site name is required${suf}`);
  if (!s.street?.trim())                  e.push(`Address is required${suf}`);
  if (!s.town?.trim())                    e.push(`Town/city is required${suf}`);
  if (!s.postcode?.trim())                e.push(`Postcode is required${suf}`);
  if (s.lat == null || s.lng == null)     e.push(`Exact entrance pin is required${suf}`);
  if (!s.navigationInstructions?.trim())  e.push(`Entrance instructions are required${suf}`);
  if (!s.date?.trim())                    e.push(`Date is required${suf}`);
  if (!s.earliestArrivalTime?.trim())     e.push(`Earliest arrival time is required${suf}`);
  if (!s.latestArrivalTime?.trim())       e.push(`Latest arrival time is required${suf}`);
  if (!s.unloadingAllowanceMinutes)       e.push(`Estimated service time is required${suf}`);
  if ((s.type === "collection" || s.type === "delivery") && !s.referenceNumber?.trim())
                                          e.push(`Reference number is required${suf}`);
  return e;
}

function validateBody(body: Partial<PublicRequestBody>): string[] {
  const errors: string[] = [];
  const r = body.requesterData ?? {};
  if (!r.customerCompanyName?.trim()) errors.push("Company name is required");
  if (!r.contactName?.trim())         errors.push("Contact name is required");
  if (!r.contactPhone?.trim())        errors.push("Contact phone is required");
  if (!r.contactEmail?.trim())        errors.push("Contact email is required");

  const stops = body.stops ?? [];
  if (stops.length === 0) { errors.push("At least one stop is required"); return errors; }
  const collections = stops.filter(s => s.type === "collection");
  const deliveries  = stops.filter(s => s.type === "delivery");
  if (collections.length === 0) errors.push("At least one collection stop is required");
  if (deliveries.length === 0)  errors.push("At least one delivery stop is required");
  stops.forEach((s, i) => errors.push(...validateStop(s, i, stops.length)));

  const l = body.loadData ?? {};
  if (!l.goodsDescription?.trim())                          errors.push("Goods description is required");
  if (!l.quantity)                                          errors.push("Quantity is required");
  if (!l.unit?.trim())                                      errors.push("Unit is required");
  if (!l.estimatedWeight || !(l.estimatedWeight > 0))       errors.push("Estimated weight is required and must be a positive number");

  const b = body.billingData ?? {};
  if (!b.declaredGoodsValue || !(b.declaredGoodsValue > 0)) errors.push("Declared goods value is required and must be a positive number");

  return errors;
}

// ── Route registration ────────────────────────────────────────────────────────

export async function jobRequestRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /public/request/:token ─────────────────────────────────────────────
  app.get<{ Params: { token: string } }>("/public/request/:token", async (req, reply) => {
    const link = await resolveLink(prisma, req.params.token);
    if (!link) return reply.status(404).send({ error: "Request link not found or expired" });
    return reply.send({
      companyName:   link.company.name,
      customerName:  link.customer?.name       ?? null,
      contactName:   link.customer?.contactName  ?? null,
      contactEmail:  link.customer?.contactEmail ?? null,
      contactPhone:  link.customer?.contactPhone ?? null,
    });
  });

  // ── POST /public/request/:token ────────────────────────────────────────────
  app.post<{ Params: { token: string }; Body: PublicRequestBody }>(
    "/public/request/:token",
    async (req, reply) => {
      const link = await resolveLink(prisma, req.params.token);
      if (!link) return reply.status(404).send({ error: "Request link not found or expired" });

      const body = req.body as PublicRequestBody;
      const errors = validateBody(body);
      if (errors.length > 0) return reply.status(400).send({ errors });

      // Entrance distance check per stop (non-blocking)
      const stopsWithWarnings = await Promise.all(
        (body.stops ?? []).map(async (s, i) => {
          const dist = s.postcode && s.lat != null && s.lng != null
            ? await checkEntranceDistance(s.postcode, s.lat, s.lng)
            : { distanceMiles: null, warningLevel: "ok" as const };
          return { ...s, sequence: i + 1, entranceDistanceFromPostcode: dist.distanceMiles, entranceWarningLevel: dist.warningLevel };
        })
      );

      const r     = body.requesterData;
      const billing = body.billingData ?? {};
      const pricingType = billing.pricingType ?? "quote_required";

      const request = await prisma.jobRequest.create({
        data: {
          companyId:     link.companyId,
          requestLinkId: link.id,
          customerId:    link.customerId ?? null,
          source:        "client_request_link",
          status:        "pending_review",
          // Denormalized summaries
          customerName:  (r.customerCompanyName ?? "").trim(),
          contactName:   (r.contactName ?? "").trim(),
          contactPhone:  (r.contactPhone ?? "").trim(),
          contactEmail:  (r.contactEmail ?? "").trim(),
          pricingType:   "quote_required", // always server-forced on public form
          // Blobs
          requesterData:             body.requesterData   as Prisma.InputJsonValue,
          stops:                     stopsWithWarnings    as unknown as Prisma.InputJsonValue,
          loadData:                  body.loadData        as Prisma.InputJsonValue,
          specialRequirementsData:   (body.specialRequirementsData  ?? {}) as Prisma.InputJsonValue,
          transportRequirementsData: (body.transportRequirementsData ?? {}) as Prisma.InputJsonValue,
          billingData:               billing                          as Prisma.InputJsonValue,
          notesData:                 (body.notesData           ?? {}) as Prisma.InputJsonValue,
          exceptionPolicyData:       (body.exceptionPolicyData ?? {}) as Prisma.InputJsonValue,
        },
      });

      await prisma.clientRequestLink.update({
        where: { id: link.id },
        data:  { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      });

      // Build non-blocking warnings
      const warnings: string[] = [];
      stopsWithWarnings.forEach((s, i) => {
        const suf = stopsWithWarnings.length > 1 ? ` (stop ${i + 1} — ${s.siteName ?? ""})` : "";
        if (s.entranceWarningLevel === "danger") warnings.push(`Entrance pin is far from the postcode — please verify it is the correct gate${suf}.`);
        else if (s.entranceWarningLevel === "warn") warnings.push(`Entrance pin is more than 1 mile from the postcode — please check it is the correct entrance${suf}.`);
      });

      return reply.status(201).send({ id: request.id, warnings });
    },
  );

  // ── GET /request-links ─────────────────────────────────────────────────────
  app.get("/request-links",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const links = await prisma.clientRequestLink.findMany({
        where:   { companyId: req.user!.companyId },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      });
      return reply.send({ data: links });
    },
  );

  // ── POST /request-links ────────────────────────────────────────────────────
  app.post<{ Body: { name: string; customerId?: number; expiresAt?: string } }>(
    "/request-links",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const { companyId, userId } = req.user!;
      const { name, customerId, expiresAt } = req.body;
      if (!name?.trim()) return reply.status(400).send({ error: "Link name is required" });
      const rawToken = generateRawToken();
      const link = await prisma.clientRequestLink.create({
        data: {
          companyId,
          customerId: customerId ?? null,
          name:       name.trim(),
          tokenHash:  hashToken(rawToken),
          createdBy:  userId,
          expiresAt:  expiresAt ? new Date(expiresAt) : null,
        },
        include: { customer: { select: { id: true, name: true } } },
      });
      return reply.status(201).send({ ...link, rawToken });
    },
  );

  // ── PATCH /request-links/:id ───────────────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: { name?: string; isActive?: boolean; expiresAt?: string | null } }>(
    "/request-links/:id",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const { companyId } = req.user!;
      const id = parseInt(req.params.id, 10);
      const link = await prisma.clientRequestLink.findFirst({ where: { id, companyId } });
      if (!link) return reply.status(404).send({ error: "Link not found" });
      const updated = await prisma.clientRequestLink.update({
        where: { id },
        data: {
          ...(req.body.name     !== undefined ? { name:     req.body.name.trim() } : {}),
          ...(req.body.isActive !== undefined ? { isActive: req.body.isActive }   : {}),
          ...(req.body.expiresAt !== undefined
            ? { expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null }
            : {}),
        },
      });
      return reply.send(updated);
    },
  );

  // ── GET /job-requests ──────────────────────────────────────────────────────
  app.get<{ Querystring: { status?: string; page?: string } }>(
    "/job-requests",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const { companyId } = req.user!;
      const status = req.query.status;
      const page   = Math.max(1, parseInt(req.query.page ?? "1", 10));
      const take   = 50;
      const [requests, total] = await Promise.all([
        prisma.jobRequest.findMany({
          where:   { companyId, ...(status ? { status } : {}) },
          orderBy: { createdAt: "desc" },
          skip:    (page - 1) * take,
          take,
          include: {
            requestLink:  { select: { id: true, name: true } },
            convertedJob: { select: { id: true, jobReference: true, status: true } },
          },
        }),
        prisma.jobRequest.count({ where: { companyId, ...(status ? { status } : {}) } }),
      ]);
      return reply.send({ data: requests, total, page, pages: Math.ceil(total / take) });
    },
  );

  // ── GET /job-requests/:id ──────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/job-requests/:id",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const { companyId } = req.user!;
      const id = parseInt(req.params.id, 10);
      const request = await prisma.jobRequest.findFirst({
        where:   { id, companyId },
        include: {
          requestLink:    { select: { id: true, name: true } },
          convertedJob:   { select: { id: true, jobReference: true, status: true } },
          reviewedByUser: { select: { id: true, name: true } },
        },
      });
      if (!request) return reply.status(404).send({ error: "Request not found" });
      return reply.send(request);
    },
  );

  // ── POST /job-requests/:id/accept ──────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { plannerNotes?: string } }>(
    "/job-requests/:id/accept",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const { companyId, userId } = req.user!;
      const id = parseInt(req.params.id, 10);

      const jobRequest = await prisma.jobRequest.findFirst({ where: { id, companyId } });
      if (!jobRequest) return reply.status(404).send({ error: "Request not found" });
      if (jobRequest.status !== "pending_review")
        return reply.status(409).send({ error: `Cannot accept a request with status '${jobRequest.status}'` });

      const stopsArr  = (jobRequest.stops as unknown) as StopBlob[];
      const loadData  = jobRequest.loadData as unknown as LoadDataBlob;
      const transport = jobRequest.transportRequirementsData as unknown as TransportRequirementsBlob;
      const billing   = jobRequest.billingData as unknown as BillingBlob;

      const collections  = stopsArr.filter(s => s.type === "collection");
      const deliveries   = stopsArr.filter(s => s.type === "delivery");
      const firstCollect = collections[0] ?? stopsArr[0];
      const lastDeliver  = deliveries[deliveries.length - 1] ?? stopsArr[stopsArr.length - 1];

      const job = await prisma.$transaction(async (tx) => {
        const job = await tx.plannedJob.create({
          data: {
            companyId,
            createdByUserId:   userId,
            customerId:        jobRequest.customerId ?? null,
            customerName:      jobRequest.customerName,
            status:            "draft",
            validationStatus:  "ready_for_planner",
            serviceType:       "delivery",
            purchaseOrderNumber: (billing?.purchaseOrderNumber ?? ""),
            customerRef:         (billing?.billingReference    ?? ""),
            plannerNotes:        req.body.plannerNotes ?? "",
            internalNotes:       jobRequest.internalOfficeNotes ?? "",
            reqBodyCategory:     transport?.reqBodyCategory ?? "",
            reqBodyType:         transport?.reqBodyType     ?? "",
            reqEquipment:        transport?.reqEquipment    ?? undefined,
            trailerTypesAllowed: transport?.trailerTypesAllowed ?? undefined,
            requirePOD:          false,
            plannedDate:         firstCollect.date ? new Date(firstCollect.date) : null,
          },
        });

        // Generate reference
        const jobReference = await generateJobReference(companyId, tx as any);
        if (jobReference) {
          await tx.plannedJob.update({ where: { id: job.id }, data: { jobReference } });
        }

        // Create one JobStop per stop in sequence order
        const sorted = [...stopsArr].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
        for (let i = 0; i < sorted.length; i++) {
          const s = sorted[i];
          await tx.jobPart.create({
            data: {
              companyId,
              jobId:          job.id,
              sequenceNumber: i + 1,
              type:           s.type === "collection" ? "collection" : "delivery",
              siteName:       s.siteName              ?? "",
              street:         s.street                ?? "",
              addressLine2:   s.addressLine2          ?? "",
              town:           s.town                  ?? "",
              countyRegion:   s.countyRegion          ?? "",
              postcode:       s.postcode              ?? "",
              country:        s.country               ?? "United Kingdom",
              locationTextSnapshot: `${s.siteName}, ${s.street}, ${s.town} ${s.postcode}`,
              lat:            s.lat                   ?? null,
              lng:            s.lng                   ?? null,
              navigationInstructions: s.navigationInstructions ?? "",
              contactName:    s.contactName           ?? "",
              contactPhone:   s.contactPhone          ?? "",
              contactEmail:   s.contactEmail          ?? "",
              bookingRequired: s.bookingRequired      ?? false,
              bookingRef:     s.bookingRef            ?? "",
              openingHours:   s.openingHours          ?? "",
              referenceNumber: s.referenceNumber      ?? "",
              timeWindowStart: s.date && s.earliestArrivalTime
                ? new Date(`${s.date}T${s.earliestArrivalTime}:00`) : null,
              timeWindowEnd: s.date && s.latestArrivalTime
                ? new Date(`${s.date}T${s.latestArrivalTime}:00`) : null,
              bookedTime: s.date && s.bookedTime
                ? new Date(`${s.date}T${s.bookedTime}:00`) : null,
              unloadingAllowanceMinutes: s.unloadingAllowanceMinutes ?? 30,
              handlingMethods:   s.handlingMethods   ? s.handlingMethods   : undefined,
              proofRequirements: s.proofRequirements ? s.proofRequirements : undefined,
              accessRequirements: s.accessRequirements ? s.accessRequirements : undefined,
              heightRestriction: s.heightRestrictionValue ?? "",
              weightRestriction: s.weightRestrictionValue ?? "",
            },
          });
        }

        // Create LoadDetails from loadData blob
        if (loadData) {
          const special = jobRequest.specialRequirementsData as SpecialRequirementsBlob;
          await tx.loadDetails.create({
            data: {
              companyId,
              jobId:        job.id,
              materialType: loadData.goodsDescription ?? "",
              quantity:     loadData.quantity         ?? null,
              unit:         loadData.unit             ?? "",
              weight:       loadData.estimatedWeight  ?? null,
              notes:        loadData.loadNotes        ?? "",
              dimensions:   loadData.dimensions       ?? "",
              fragile:      (special?.items ?? []).includes("fragile"),
              stackable:    loadData.stackable        ?? false,
              tempControlled: (special?.items ?? []).includes("temperature_controlled"),
              tempRange:    special?.temperatureRange ?? "",
              hazardClass:  special?.adrClass         ?? "",
              photosRequired:      false,
              weighbridgeRequired: false,
              forkliftRequired:    false,
              tailLiftRequired:    false,
              craneRequired:       loadData.craneRequired ?? false,
            },
          });
        }

        // Mark accepted
        await tx.jobRequest.update({
          where: { id },
          data: {
            status:         "accepted",
            reviewedAt:     new Date(),
            reviewedBy:     userId,
            convertedJobId: job.id,
            reviewData:     { plannerNotes: req.body.plannerNotes ?? "" } as Prisma.InputJsonValue,
          },
        });

        return job;
      });

      const final = await prisma.plannedJob.findUnique({
        where:  { id: job.id },
        select: { id: true, jobReference: true, status: true },
      });
      return reply.send({ ok: true, jobId: job.id, jobReference: final?.jobReference ?? null });
    },
  );

  // ── POST /job-requests/:id/reject ──────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { reason: string; notes?: string } }>(
    "/job-requests/:id/reject",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const { companyId, userId } = req.user!;
      const id = parseInt(req.params.id, 10);

      const VALID_REASONS = [
        "no_capacity", "outside_service_area", "incomplete_information",
        "pricing_issue", "duplicate_request", "other",
      ];

      const jobRequest = await prisma.jobRequest.findFirst({ where: { id, companyId } });
      if (!jobRequest) return reply.status(404).send({ error: "Request not found" });
      if (jobRequest.status !== "pending_review")
        return reply.status(409).send({ error: `Cannot reject a request with status '${jobRequest.status}'` });
      if (!req.body.reason?.trim() || !VALID_REASONS.includes(req.body.reason))
        return reply.status(400).send({ error: `reason must be one of: ${VALID_REASONS.join(", ")}` });

      await prisma.jobRequest.update({
        where: { id },
        data: {
          status:          "rejected",
          reviewedAt:      new Date(),
          reviewedBy:      userId,
          rejectionReason: req.body.reason,
          reviewNotes:     req.body.notes?.trim() || null,
        },
      });
      return reply.send({ ok: true });
    },
  );
}

/**
 * Job Request Intake routes
 *
 * Public (no auth):
 *   GET  /public/request/:token        — get company name for form branding
 *   POST /public/request/:token        — submit a transport request
 *
 * Internal (auth required):
 *   GET  /request-links                — list intake links
 *   POST /request-links                — create intake link
 *   PATCH /request-links/:id           — update/deactivate link
 *
 *   GET  /job-requests                 — review queue
 *   GET  /job-requests/:id             — request detail
 *   POST /job-requests                 — create request manually (internal)
 *   POST /job-requests/:id/accept      — accept → convert to PlannedJob + JobStops
 *   POST /job-requests/:id/reject      — reject with reason
 */

import crypto                       from "crypto";
import type { FastifyInstance }      from "fastify";
import { PrismaClient, Prisma }      from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { generateJobReference }      from "../lib/jobReference.js";
import { postcodeToCoords }          from "../lib/routing.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex"); // 64-char hex, URL-safe
}

/** Distance in miles between two lat/lng pairs (Haversine). */
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Validate entrance coordinates against postcode. Returns warning level. */
async function checkEntranceDistance(
  postcode: string,
  lat: number,
  lng: number,
): Promise<{ distanceMiles: number | null; warningLevel: "ok" | "warn" | "danger" }> {
  const center = await postcodeToCoords(postcode).catch(() => null);
  if (!center) return { distanceMiles: null, warningLevel: "ok" };
  const miles = distanceMiles(center.lat, center.lng, lat, lng);
  return {
    distanceMiles: Math.round(miles * 10) / 10,
    warningLevel:  miles > 3 ? "danger" : miles > 1 ? "warn" : "ok",
  };
}

/** Pull and validate a request link from the token, bumping usage. */
async function resolveLink(prisma: PrismaClient, rawToken: string) {
  const link = await prisma.clientRequestLink.findUnique({
    where:   { tokenHash: hashToken(rawToken) },
    include: { company: { select: { id: true, name: true, ticker: true } }, customer: true },
  });
  if (!link)                                    return null;
  if (!link.isActive)                           return null;
  if (link.expiresAt && link.expiresAt < new Date()) return null;
  return link;
}

// ── Route registration ────────────────────────────────────────────────────────

export async function jobRequestRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /public/request/:token ─────────────────────────────────────────────
  // Returns company branding info so the public form can say "Submit a request to Acme Haulage".
  // No sensitive data — token only reveals company name + optional customer name.
  app.get<{ Params: { token: string } }>(
    "/public/request/:token",
    async (req, reply) => {
      const link = await resolveLink(prisma, req.params.token);
      if (!link) return reply.status(404).send({ error: "Request link not found or expired" });

      return reply.send({
        companyName:   link.company.name,
        customerName:  link.customer?.name ?? null,
        contactName:   link.customer?.contactName ?? null,
        contactEmail:  link.customer?.contactEmail ?? null,
        contactPhone:  link.customer?.contactPhone ?? null,
      });
    },
  );

  // ── POST /public/request/:token ────────────────────────────────────────────
  app.post<{ Params: { token: string }; Body: PublicRequestBody }>(
    "/public/request/:token",
    async (req, reply) => {
      const link = await resolveLink(prisma, req.params.token);
      if (!link) return reply.status(404).send({ error: "Request link not found or expired" });

      const body = req.body as PublicRequestBody;
      const companyId = link.companyId;

      // ── Validate required fields ──────────────────────────────────────────
      const errors: string[] = [];
      if (!body.customerCompanyName?.trim()) errors.push("Customer company name is required");
      if (!body.contactName?.trim())         errors.push("Contact name is required");
      if (!body.contactPhone?.trim())        errors.push("Contact phone is required");
      if (!body.contactEmail?.trim())        errors.push("Contact email is required");
      if (!body.collectionReference?.trim()) errors.push("Collection reference is required");
      if (!body.deliveryReference?.trim())   errors.push("Delivery reference is required");

      // Pickup required fields
      const p = body.pickupData ?? {};
      if (!p.siteName?.trim())          errors.push("Collection site name is required");
      if (!p.postcode?.trim())          errors.push("Collection postcode is required");
      if (!p.addressLine1?.trim())      errors.push("Collection address is required");
      if (!p.townCity?.trim())          errors.push("Collection town/city is required");
      if (!p.pickupDate?.trim())        errors.push("Collection date is required");
      if (!p.earliestTime?.trim())      errors.push("Earliest collection time is required");
      if (!p.latestTime?.trim())        errors.push("Latest collection time is required");
      if (!p.estimatedLoadingMinutes)   errors.push("Estimated loading time is required");
      if (p.entranceLat == null || p.entranceLng == null)
                                        errors.push("Exact collection entrance pin is required");
      if (!p.entranceInstructions?.trim()) errors.push("Collection entrance instructions are required");

      // Delivery required fields
      const d = body.deliveryData ?? {};
      if (!d.siteName?.trim())          errors.push("Delivery site name is required");
      if (!d.postcode?.trim())          errors.push("Delivery postcode is required");
      if (!d.addressLine1?.trim())      errors.push("Delivery address is required");
      if (!d.townCity?.trim())          errors.push("Delivery town/city is required");
      if (!d.deliveryDate?.trim())      errors.push("Delivery date is required");
      if (!d.earliestTime?.trim())      errors.push("Earliest delivery time is required");
      if (!d.latestTime?.trim())        errors.push("Latest delivery time is required");
      if (!d.estimatedUnloadingMinutes) errors.push("Estimated unloading time is required");
      if (d.entranceLat == null || d.entranceLng == null)
                                        errors.push("Exact delivery entrance pin is required");
      if (!d.entranceInstructions?.trim()) errors.push("Delivery entrance instructions are required");

      // Load
      const l = body.loadData ?? {};
      if (!l.goodsDescription?.trim())  errors.push("Goods description is required");
      if (!l.quantity)                  errors.push("Quantity is required");
      if (!l.unit?.trim())              errors.push("Unit is required");

      if (errors.length > 0) return reply.status(400).send({ errors });

      // ── Entrance distance validation ──────────────────────────────────────
      const [pickupDist, deliveryDist] = await Promise.all([
        checkEntranceDistance(p.postcode!, p.entranceLat!, p.entranceLng!),
        checkEntranceDistance(d.postcode!, d.entranceLat!, d.entranceLng!),
      ]);

      const pickupDataFinal = {
        ...p,
        entranceDistanceFromPostcode: pickupDist.distanceMiles,
        entranceWarningLevel:         pickupDist.warningLevel,
      };
      const deliveryDataFinal = {
        ...d,
        entranceDistanceFromPostcode: deliveryDist.distanceMiles,
        entranceWarningLevel:         deliveryDist.warningLevel,
      };

      // ── Create JobRequest ─────────────────────────────────────────────────
      const request = await prisma.jobRequest.create({
        data: {
          companyId,
          requestLinkId:        link.id,
          customerId:           link.customerId ?? null,
          source:               "client_request_link",
          status:               "pending_review",
          customerCompanyName:  body.customerCompanyName.trim(),
          contactName:          body.contactName.trim(),
          contactPhone:         body.contactPhone.trim(),
          contactEmail:         body.contactEmail.trim(),
          collectionReference:  body.collectionReference.trim(),
          deliveryReference:    body.deliveryReference.trim(),
          purchaseOrderNumber:  body.purchaseOrderNumber?.trim() || null,
          billingReference:     body.billingReference?.trim() || null,
          declaredGoodsValue:   body.declaredGoodsValue ?? null,
          currency:             body.currency || "GBP",
          pricingType:          "quote_required", // always server-set on public form
          pickupData:           pickupDataFinal,
          deliveryData:         deliveryDataFinal,
          loadData:             l as Prisma.InputJsonValue,
          reqBodyCategory:      body.reqBodyCategory || null,
          reqBodyType:          body.reqBodyType || null,
          reqEquipment:         body.reqEquipment ?? undefined,
          trailerTypesAllowed:  body.trailerTypesAllowed ?? undefined,
          minimumVehicleSize:   body.minimumVehicleSize || null,
          heightRestriction:    body.heightRestriction || null,
          weightRestriction:    body.weightRestriction || null,
          lengthRestriction:    body.lengthRestriction || null,
          accessRestrictionNotes: body.accessRestrictionNotes || null,
          driverQualificationRequired: body.driverQualificationRequired || null,
          proofOfDeliveryRequired:   body.proofOfDeliveryRequired   ?? false,
          photosRequired:            body.photosRequired            ?? false,
          weighbridgeTicketRequired: body.weighbridgeTicketRequired ?? false,
          driverVisibleNotes:  body.driverVisibleNotes  || null,
          customerNotes:       body.customerNotes       || null,
          specialInstructions: body.specialInstructions || null,
          safetyInstructions:  body.safetyInstructions  || null,
        },
      });

      // Bump usage count
      await prisma.clientRequestLink.update({
        where: { id: link.id },
        data:  { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      });

      // Warnings to return (non-blocking)
      const warnings: string[] = [];
      if (pickupDist.warningLevel === "danger")  warnings.push("Collection entrance pin is far from the postcode — please verify it is the correct gate.");
      if (pickupDist.warningLevel === "warn")    warnings.push("Collection entrance pin is more than 1 mile from the postcode — please check this is the correct entrance.");
      if (deliveryDist.warningLevel === "danger") warnings.push("Delivery entrance pin is far from the postcode — please verify it is the correct gate.");
      if (deliveryDist.warningLevel === "warn")   warnings.push("Delivery entrance pin is more than 1 mile from the postcode — please check this is the correct entrance.");

      return reply.status(201).send({ id: request.id, warnings });
    },
  );

  // ── GET /request-links ─────────────────────────────────────────────────────
  app.get(
    "/request-links",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const companyId = req.user!.companyId;
      const links = await prisma.clientRequestLink.findMany({
        where:   { companyId },
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
      const companyId = req.user!.companyId;
      const userId    = req.user!.userId;
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

      // Return the raw token once — never stored, cannot be recovered
      return reply.status(201).send({ ...link, rawToken });
    },
  );

  // ── PATCH /request-links/:id ───────────────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: { name?: string; isActive?: boolean; expiresAt?: string | null } }>(
    "/request-links/:id",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const companyId = req.user!.companyId;
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
      const companyId = req.user!.companyId;
      const status    = req.query.status;
      const page      = Math.max(1, parseInt(req.query.page ?? "1", 10));
      const take      = 50;

      const requests = await prisma.jobRequest.findMany({
        where:   { companyId, ...(status ? { status } : {}) },
        orderBy: { createdAt: "desc" },
        skip:    (page - 1) * take,
        take,
        include: {
          requestLink: { select: { id: true, name: true } },
          convertedJob: { select: { id: true, jobReference: true, status: true } },
        },
      });

      const total = await prisma.jobRequest.count({
        where: { companyId, ...(status ? { status } : {}) },
      });

      return reply.send({ data: requests, total, page, pages: Math.ceil(total / take) });
    },
  );

  // ── GET /job-requests/:id ──────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/job-requests/:id",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const companyId = req.user!.companyId;
      const id = parseInt(req.params.id, 10);

      const request = await prisma.jobRequest.findFirst({
        where:   { id, companyId },
        include: {
          requestLink:  { select: { id: true, name: true } },
          convertedJob: { select: { id: true, jobReference: true, status: true } },
          reviewedByUser: { select: { id: true, name: true } },
        },
      });
      if (!request) return reply.status(404).send({ error: "Request not found" });
      return reply.send(request);
    },
  );

  // ── POST /job-requests (internal manual creation) ──────────────────────────
  app.post<{ Body: InternalRequestBody }>(
    "/job-requests",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const companyId = req.user!.companyId;
      const body = req.body as InternalRequestBody;

      const errors = validateRequestBody(body);
      if (errors.length > 0) return reply.status(400).send({ errors });

      const [pickupDist, deliveryDist] = await Promise.all([
        checkEntranceDistance(body.pickupData.postcode!, body.pickupData.entranceLat!, body.pickupData.entranceLng!),
        checkEntranceDistance(body.deliveryData.postcode!, body.deliveryData.entranceLat!, body.deliveryData.entranceLng!),
      ]);

      const request = await prisma.jobRequest.create({
        data: {
          companyId,
          source:               "internal_manual",
          status:               "pending_review",
          customerCompanyName:  body.customerCompanyName.trim(),
          contactName:          body.contactName.trim(),
          contactPhone:         body.contactPhone.trim(),
          contactEmail:         body.contactEmail.trim(),
          collectionReference:  body.collectionReference.trim(),
          deliveryReference:    body.deliveryReference.trim(),
          purchaseOrderNumber:  body.purchaseOrderNumber?.trim() || null,
          billingReference:     body.billingReference?.trim()   || null,
          declaredGoodsValue:   body.declaredGoodsValue         ?? null,
          currency:             body.currency                   || "GBP",
          pricingType:          body.pricingType                || "quote_required",
          pickupData:   { ...body.pickupData,   entranceDistanceFromPostcode: pickupDist.distanceMiles,   entranceWarningLevel: pickupDist.warningLevel },
          deliveryData: { ...body.deliveryData, entranceDistanceFromPostcode: deliveryDist.distanceMiles, entranceWarningLevel: deliveryDist.warningLevel },
          loadData:             body.loadData as Prisma.InputJsonValue,
          reqBodyCategory:      body.reqBodyCategory      || null,
          reqBodyType:          body.reqBodyType          || null,
          reqEquipment:         body.reqEquipment         ?? undefined,
          trailerTypesAllowed:  body.trailerTypesAllowed  ?? undefined,
          minimumVehicleSize:   body.minimumVehicleSize   || null,
          heightRestriction:    body.heightRestriction    || null,
          weightRestriction:    body.weightRestriction    || null,
          lengthRestriction:    body.lengthRestriction    || null,
          accessRestrictionNotes: body.accessRestrictionNotes || null,
          driverQualificationRequired: body.driverQualificationRequired || null,
          proofOfDeliveryRequired:   body.proofOfDeliveryRequired   ?? false,
          photosRequired:            body.photosRequired            ?? false,
          weighbridgeTicketRequired: body.weighbridgeTicketRequired ?? false,
          driverVisibleNotes:  body.driverVisibleNotes  || null,
          customerNotes:       body.customerNotes       || null,
          specialInstructions: body.specialInstructions || null,
          safetyInstructions:  body.safetyInstructions  || null,
          internalOfficeNotes: body.internalOfficeNotes || null,
        },
      });

      return reply.status(201).send(request);
    },
  );

  // ── POST /job-requests/:id/accept ──────────────────────────────────────────
  // Converts JobRequest → PlannedJob + two JobStops (pickup + delivery) + LoadDetails
  app.post<{ Params: { id: string }; Body: { plannerNotes?: string } }>(
    "/job-requests/:id/accept",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const companyId = req.user!.companyId;
      const userId    = req.user!.userId;
      const id = parseInt(req.params.id, 10);

      const jobRequest = await prisma.jobRequest.findFirst({ where: { id, companyId } });
      if (!jobRequest) return reply.status(404).send({ error: "Request not found" });
      if (jobRequest.status !== "pending_review")
        return reply.status(409).send({ error: `Cannot accept a request with status '${jobRequest.status}'` });

      const p = jobRequest.pickupData   as PickupDataBlob;
      const d = jobRequest.deliveryData as DeliveryDataBlob;
      const l = jobRequest.loadData     as LoadDataBlob;

      const job = await prisma.$transaction(async (tx) => {
        // 1. Create the PlannedJob
        const job = await tx.plannedJob.create({
          data: {
            companyId,
            createdByUserId:  userId,
            customerId:       jobRequest.customerId ?? null,
            customerName:     jobRequest.customerCompanyName,
            status:           "pending",
            validationStatus: "ready_for_planner",
            pickupTextSnapshot:  `${p.siteName}, ${p.addressLine1}, ${p.townCity} ${p.postcode}`,
            dropoffTextSnapshot: `${d.siteName}, ${d.addressLine1}, ${d.townCity} ${d.postcode}`,
            serviceType:      "delivery",
            purchaseOrderNumber: jobRequest.purchaseOrderNumber ?? "",
            customerRef:      jobRequest.billingReference ?? "",
            plannerNotes:     req.body.plannerNotes ?? "",
            internalNotes:    jobRequest.internalOfficeNotes ?? "",
            reqBodyCategory:  jobRequest.reqBodyCategory ?? "",
            reqBodyType:      jobRequest.reqBodyType ?? "",
            reqEquipment:     jobRequest.reqEquipment ?? undefined,
            trailerTypesAllowed:  jobRequest.trailerTypesAllowed  ?? undefined,
            minVehicleSize:   jobRequest.minimumVehicleSize ?? "",
            heightRestriction: jobRequest.heightRestriction ?? "",
            weightRestriction: jobRequest.weightRestriction ?? "",
            lengthRestriction: jobRequest.lengthRestriction ?? "",
            vehicleAccessNotes: jobRequest.accessRestrictionNotes ?? "",
            requirePOD:        jobRequest.proofOfDeliveryRequired,
            plannedDate:       p.pickupDate ? new Date(p.pickupDate) : null,
          },
        });

        // 2. Generate job reference
        const jobReference = await generateJobReference(companyId, tx as any);
        if (jobReference) {
          await tx.plannedJob.update({ where: { id: job.id }, data: { jobReference } });
        }

        // 3. Create pickup JobStop
        await tx.jobStop.create({
          data: {
            companyId,
            jobId:          job.id,
            sequenceNumber: 1,
            type:           "collection",
            siteName:       p.siteName        ?? "",
            unitName:       p.unitName        ?? "",
            street:         p.addressLine1    ?? "",
            addressLine2:   p.addressLine2    ?? "",
            town:           p.townCity        ?? "",
            countyRegion:   p.countyRegion    ?? "",
            postcode:       p.postcode        ?? "",
            country:        p.country         ?? "United Kingdom",
            locationTextSnapshot: `${p.siteName}, ${p.addressLine1}, ${p.townCity} ${p.postcode}`,
            lat:            p.entranceLat     ?? null,
            lng:            p.entranceLng     ?? null,
            navigationInstructions: p.entranceInstructions ?? "",
            contactName:    p.contactName     ?? "",
            contactPhone:   p.contactPhone    ?? "",
            contactEmail:   p.contactEmail    ?? "",
            bookingRequired: p.bookingRequired ?? false,
            bookingRef:     p.bookingReference ?? "",
            openingHours:   p.openingHours    ?? "",
            instructions:   p.siteRestrictions ?? "",
            referenceNumber: jobRequest.collectionReference,
            internalNotes:  jobRequest.driverVisibleNotes ?? "",
            timeWindowStart: p.pickupDate && p.earliestTime
              ? new Date(`${p.pickupDate}T${p.earliestTime}:00`) : null,
            timeWindowEnd: p.pickupDate && p.latestTime
              ? new Date(`${p.pickupDate}T${p.latestTime}:00`) : null,
            unloadingAllowanceMinutes: p.estimatedLoadingMinutes ?? 30,
          },
        });

        // 4. Create delivery JobStop
        await tx.jobStop.create({
          data: {
            companyId,
            jobId:          job.id,
            sequenceNumber: 2,
            type:           "delivery",
            siteName:       d.siteName        ?? "",
            unitName:       d.unitName        ?? "",
            street:         d.addressLine1    ?? "",
            addressLine2:   d.addressLine2    ?? "",
            town:           d.townCity        ?? "",
            countyRegion:   d.countyRegion    ?? "",
            postcode:       d.postcode        ?? "",
            country:        d.country         ?? "United Kingdom",
            locationTextSnapshot: `${d.siteName}, ${d.addressLine1}, ${d.townCity} ${d.postcode}`,
            lat:            d.entranceLat     ?? null,
            lng:            d.entranceLng     ?? null,
            navigationInstructions: d.entranceInstructions ?? "",
            contactName:    d.contactName     ?? "",
            contactPhone:   d.contactPhone    ?? "",
            contactEmail:   d.contactEmail    ?? "",
            bookingRequired: d.bookingRequired ?? false,
            bookingRef:     d.bookingReference ?? "",
            openingHours:   d.openingHours    ?? "",
            instructions:   d.siteRestrictions ?? "",
            referenceNumber: jobRequest.deliveryReference,
            internalNotes:  jobRequest.driverVisibleNotes ?? "",
            timeWindowStart: d.deliveryDate && d.earliestTime
              ? new Date(`${d.deliveryDate}T${d.earliestTime}:00`) : null,
            timeWindowEnd: d.deliveryDate && d.latestTime
              ? new Date(`${d.deliveryDate}T${d.latestTime}:00`) : null,
            unloadingAllowanceMinutes: d.estimatedUnloadingMinutes ?? 30,
          },
        });

        // 5. Create LoadDetails
        if (l) {
          await tx.loadDetails.create({
            data: {
              companyId,
              jobId:         job.id,
              materialType:  l.goodsDescription ?? "",
              quantity:      l.quantity         ?? null,
              unit:          l.unit             ?? "",
              weight:        l.estimatedWeight  ?? null,
              volume:        l.volume           ?? null,
              notes:         l.loadNotes        ?? "",
              dimensions:    l.dimensions       ?? "",
              fragile:       l.fragile          ?? false,
              stackable:     l.stackable        ?? false,
              tempControlled: l.temperatureControlled ?? false,
              tempRange:     l.temperatureRange ?? "",
              hazardClass:   l.adrClass         ?? "",
              photosRequired:        jobRequest.photosRequired,
              weighbridgeRequired:   jobRequest.weighbridgeTicketRequired,
              forkliftRequired:      l.forkliftRequired ?? false,
              tailLiftRequired:      l.tailLiftRequired ?? false,
              craneRequired:         l.craneRequired    ?? false,
              loadingMethod:         l.loadingMethod    ?? "",
              unloadingMethod:       l.unloadingMethod  ?? "",
            },
          });
        }

        // 6. Mark JobRequest as accepted
        await tx.jobRequest.update({
          where: { id },
          data: {
            status:        "accepted",
            reviewedAt:    new Date(),
            reviewedBy:    userId,
            convertedJobId: job.id,
          },
        });

        return job;
      });

      // Fetch final job with reference
      const final = await prisma.plannedJob.findUnique({
        where: { id: job.id },
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
      const companyId = req.user!.companyId;
      const userId    = req.user!.userId;
      const id = parseInt(req.params.id, 10);

      const REJECTION_REASONS = [
        "no_capacity", "outside_service_area", "incomplete_information",
        "pricing_issue", "duplicate_request", "other",
      ];

      const jobRequest = await prisma.jobRequest.findFirst({ where: { id, companyId } });
      if (!jobRequest) return reply.status(404).send({ error: "Request not found" });
      if (jobRequest.status !== "pending_review")
        return reply.status(409).send({ error: `Cannot reject a request with status '${jobRequest.status}'` });

      if (!req.body.reason?.trim())
        return reply.status(400).send({ error: "Rejection reason is required" });
      if (!REJECTION_REASONS.includes(req.body.reason))
        return reply.status(400).send({ error: `reason must be one of: ${REJECTION_REASONS.join(", ")}` });

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

// ── Type helpers ──────────────────────────────────────────────────────────────

interface PickupDataBlob {
  siteName?: string; unitName?: string;
  addressLine1?: string; addressLine2?: string;
  townCity?: string; countyRegion?: string;
  postcode?: string; country?: string;
  entranceLat?: number; entranceLng?: number;
  entranceInstructions?: string;
  contactName?: string; contactPhone?: string; contactEmail?: string;
  bookingRequired?: boolean; bookingReference?: string;
  openingHours?: string; siteRestrictions?: string;
  pickupDate?: string;
  earliestTime?: string; latestTime?: string;
  estimatedLoadingMinutes?: number;
  entranceDistanceFromPostcode?: number | null;
  entranceWarningLevel?: string;
}

interface DeliveryDataBlob {
  siteName?: string; unitName?: string;
  addressLine1?: string; addressLine2?: string;
  townCity?: string; countyRegion?: string;
  postcode?: string; country?: string;
  entranceLat?: number; entranceLng?: number;
  entranceInstructions?: string;
  contactName?: string; contactPhone?: string; contactEmail?: string;
  bookingRequired?: boolean; bookingReference?: string;
  openingHours?: string; siteRestrictions?: string;
  deliveryDate?: string;
  earliestTime?: string; latestTime?: string;
  estimatedUnloadingMinutes?: number;
  entranceDistanceFromPostcode?: number | null;
  entranceWarningLevel?: string;
}

interface LoadDataBlob {
  goodsDescription?: string;
  quantity?: number; unit?: string; otherUnitDescription?: string;
  estimatedWeight?: number; palletCount?: number;
  dimensions?: string; volume?: number;
  hazardousGoods?: boolean; adrClass?: string;
  temperatureControlled?: boolean; temperatureRange?: string;
  fragile?: boolean; stackable?: boolean;
  forkliftRequired?: boolean; tailLiftRequired?: boolean; craneRequired?: boolean;
  loadingMethod?: string; unloadingMethod?: string;
  loadNotes?: string;
}

interface PublicRequestBody {
  customerCompanyName: string; contactName: string;
  contactPhone: string; contactEmail: string;
  collectionReference: string; deliveryReference: string;
  purchaseOrderNumber?: string; billingReference?: string;
  declaredGoodsValue?: number; currency?: string;
  pickupData:   PickupDataBlob;
  deliveryData: DeliveryDataBlob;
  loadData:     LoadDataBlob;
  reqBodyCategory?: string; reqBodyType?: string;
  reqEquipment?: string[]; trailerTypesAllowed?: string[];
  minimumVehicleSize?: string;
  heightRestriction?: string; weightRestriction?: string; lengthRestriction?: string;
  accessRestrictionNotes?: string; driverQualificationRequired?: string;
  proofOfDeliveryRequired?: boolean; photosRequired?: boolean; weighbridgeTicketRequired?: boolean;
  driverVisibleNotes?: string; customerNotes?: string;
  specialInstructions?: string; safetyInstructions?: string;
}

interface InternalRequestBody extends PublicRequestBody {
  pricingType?: string;
  internalOfficeNotes?: string;
}

function validateRequestBody(body: Partial<PublicRequestBody>): string[] {
  const errors: string[] = [];
  if (!body.customerCompanyName?.trim()) errors.push("Customer company name is required");
  if (!body.contactName?.trim())         errors.push("Contact name is required");
  if (!body.contactPhone?.trim())        errors.push("Contact phone is required");
  if (!body.contactEmail?.trim())        errors.push("Contact email is required");
  if (!body.collectionReference?.trim()) errors.push("Collection reference is required");
  if (!body.deliveryReference?.trim())   errors.push("Delivery reference is required");
  const p = body.pickupData;
  if (!p) { errors.push("Pickup data is required"); return errors; }
  if (!p.siteName?.trim())    errors.push("Collection site name is required");
  if (!p.postcode?.trim())    errors.push("Collection postcode is required");
  if (!p.addressLine1?.trim()) errors.push("Collection address is required");
  if (!p.townCity?.trim())    errors.push("Collection town/city is required");
  if (!p.pickupDate?.trim())  errors.push("Collection date is required");
  if (!p.earliestTime?.trim()) errors.push("Earliest collection time is required");
  if (!p.latestTime?.trim())  errors.push("Latest collection time is required");
  if (!p.estimatedLoadingMinutes) errors.push("Estimated loading time is required");
  if (p.entranceLat == null || p.entranceLng == null) errors.push("Collection entrance pin is required");
  if (!p.entranceInstructions?.trim()) errors.push("Collection entrance instructions are required");
  const d = body.deliveryData;
  if (!d) { errors.push("Delivery data is required"); return errors; }
  if (!d.siteName?.trim())    errors.push("Delivery site name is required");
  if (!d.postcode?.trim())    errors.push("Delivery postcode is required");
  if (!d.addressLine1?.trim()) errors.push("Delivery address is required");
  if (!d.townCity?.trim())    errors.push("Delivery town/city is required");
  if (!d.deliveryDate?.trim()) errors.push("Delivery date is required");
  if (!d.earliestTime?.trim()) errors.push("Earliest delivery time is required");
  if (!d.latestTime?.trim())  errors.push("Latest delivery time is required");
  if (!d.estimatedUnloadingMinutes) errors.push("Estimated unloading time is required");
  if (d.entranceLat == null || d.entranceLng == null) errors.push("Delivery entrance pin is required");
  if (!d.entranceInstructions?.trim()) errors.push("Delivery entrance instructions are required");
  const l = body.loadData;
  if (!l) { errors.push("Load data is required"); return errors; }
  if (!l.goodsDescription?.trim()) errors.push("Goods description is required");
  if (!l.quantity)                 errors.push("Quantity is required");
  if (!l.unit?.trim())             errors.push("Unit is required");
  return errors;
}

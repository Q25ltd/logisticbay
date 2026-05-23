import { PrismaClient, Prisma } from "../generated/client.js";
import {
  validateStructuredJob,
  findInvalidStopLocationId,
  type StructuredJobPartInput,
  type StructuredLoadDetailsInput,
  type JobValidationResult,
} from "./jobValidation.js";
import { scoreStructuredJob } from "./jobQuality.js";
import { generateJobReference } from "../lib/jobReference.js";
import { toNullableNumber } from "../lib/coerce.js";
import { buildStopData } from "../lib/jobUtils.js";
import type { CreateJobInput, PatchJobInput } from "../schemas/jobs.js";

// ── Shared validation context builder ────────────────────────────────────────

function buildVehicleFields(body: { vehicleCategory?: string | null; minGvwClass?: string | null; bodyTypes?: string[] | null; equipment?: string[] | null; trailersAllowed?: string[] | null }, existing?: { vehicleCategory?: string | null; minGvwClass?: string | null; bodyTypes?: unknown; equipment?: unknown; trailersAllowed?: unknown }) {
  const vehicleCategory = (body.vehicleCategory !== undefined ? body.vehicleCategory : existing?.vehicleCategory) ?? "";
  const minGvwClass     = (body.minGvwClass     !== undefined ? body.minGvwClass     : existing?.minGvwClass)     ?? "";
  const bodyTypes: string[] = Array.isArray(body.bodyTypes)
    ? body.bodyTypes
    : Array.isArray(existing?.bodyTypes) ? (existing!.bodyTypes as string[]) : [];
  const equipment: string[] = Array.isArray(body.equipment)
    ? body.equipment.map(String)
    : Array.isArray(existing?.equipment) ? (existing!.equipment as string[]).map(String) : [];
  const trailersAllowed: string[] = Array.isArray(body.trailersAllowed)
    ? body.trailersAllowed.map(String)
    : Array.isArray(existing?.trailersAllowed) ? (existing!.trailersAllowed as string[]).map(String) : [];
  return { vehicleCategory, minGvwClass, bodyTypes, equipment, trailersAllowed };
}

function buildLoadValidation(
  body: Partial<CreateJobInput>,
  existing?: {
    quantity?: number | null; quantityUnit?: string | null; weight?: number | null;
    goodsDescription?: string | null; hazardClass?: string | null; goodsType?: string | null;
    fragile?: boolean; stackable?: boolean; tempControlled?: boolean;
    securingRequirements?: unknown; specialRequirements?: unknown;
  },
): StructuredLoadDetailsInput {
  return {
    quantity:        body.quantity        !== undefined ? body.quantity        : existing?.quantity,
    unit:            body.quantityUnit    !== undefined ? body.quantityUnit    : existing?.quantityUnit,
    weight:          body.weight          !== undefined ? body.weight          : existing?.weight,
    materialType:    body.goodsDescription !== undefined ? body.goodsDescription : existing?.goodsDescription,
    hazardClass:     body.hazardClass     !== undefined ? body.hazardClass     : existing?.hazardClass,
    goodsType:       body.goodsType       !== undefined ? body.goodsType       : existing?.goodsType,
    fragile:         body.fragile         !== undefined ? body.fragile         : existing?.fragile,
    stackable:       body.stackable       !== undefined ? body.stackable       : existing?.stackable,
    tempControlled:  body.tempControlled  !== undefined ? body.tempControlled  : existing?.tempControlled,
    securingRequirements: Array.isArray(body.securingRequirements)
      ? body.securingRequirements
      : Array.isArray(existing?.securingRequirements) ? (existing!.securingRequirements as string[]) : null,
    specialRequirements: Array.isArray(body.specialRequirements)
      ? body.specialRequirements
      : Array.isArray(existing?.specialRequirements) ? (existing!.specialRequirements as string[]) : null,
  };
}

// Prisma JSON helpers
const toJson = (arr: string[]): Prisma.InputJsonValue => arr as unknown as Prisma.InputJsonValue;
const jsonOrNull = (arr: string[]): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  arr.length > 0 ? toJson(arr) : Prisma.DbNull;

// ── ServiceError — returned as-is to the handler ─────────────────────────────

export interface ServiceError {
  ok: false;
  status: number;
  error: string;
  errors?: string[];
  warnings?: string[];
}
export type ServiceOk<T> = { ok: true } & T;
export type ServiceResult<T> = ServiceOk<T> | ServiceError;

// ── createJob ─────────────────────────────────────────────────────────────────

export async function createJob(
  prisma: PrismaClient,
  { companyId, userId, body }: { companyId: number; userId: number; body: CreateJobInput },
): Promise<ServiceResult<{ job: unknown; validation: JobValidationResult; quality: { score: number } }>> {

  const saveMode = body.saveMode ?? "draft";

  let template: Awaited<ReturnType<typeof prisma.jobTemplate.findFirst>> = null;
  if (body.templateId) {
    template = await prisma.jobTemplate.findFirst({ where: { id: body.templateId, companyId } });
    if (!template) return { ok: false, status: 400, error: "Template not found" };
  }

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

  const { vehicleCategory, minGvwClass, bodyTypes, equipment, trailersAllowed } = buildVehicleFields(body);
  const loadDetailsForValidation = buildLoadValidation(body);

  let customerId   = body.customerId ?? null;
  let customerName = body.customerName ?? "";
  if (customerId !== null) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId } });
    if (!customer) return { ok: false, status: 400, error: "Customer not found" };
    customerName = customer.name;
  }

  const structuredValidation = validateStructuredJob({
    saveMode,
    customerId,
    customerName,
    plannedDate:     body.plannedDate,
    vehicleCategory,
    minGvwClass,
    bodyType:        bodyTypes[0] ?? "",
    equipment,
    trailersAllowed,
    stops,
    loadDetails:     loadDetailsForValidation,
    loadData:        (body.loadData as Record<string, unknown> | null) ?? null,
  });

  if (saveMode === "ready_to_plan" && !structuredValidation.isValid) {
    return { ok: false, status: 400, error: "Job is not ready to plan", errors: structuredValidation.errors, warnings: structuredValidation.warnings };
  }

  const quality = scoreStructuredJob({ stops, loadDetails: loadDetailsForValidation });

  const invalidStopLocationId = await findInvalidStopLocationId(prisma, companyId, stops);
  if (invalidStopLocationId !== null) return { ok: false, status: 400, error: "Invalid location reference in stops" };

  const job = await prisma.$transaction(async (tx) => {
    const jobReference = await generateJobReference(companyId, tx);

    const created = await tx.job.create({
      data: {
        companyId,
        customerId,
        customerName,
        jobReference,
        templateId:          body.templateId ?? null,
        createdByUserId:     userId,
        plannedDate:         body.plannedDate ? new Date(body.plannedDate) : null,
        plannerNotes:        body.plannerNotes?.trim() || null,
        vehicleCategory:     vehicleCategory || null,
        minGvwClass:         minGvwClass || null,
        bodyTypes:           jsonOrNull(bodyTypes),
        equipment:           jsonOrNull(equipment),
        trailersAllowed:     jsonOrNull(trailersAllowed),
        priority:            body.priority ?? "normal",
        serviceType:         body.serviceType?.trim() || null,
        customerRef:         body.customerRef?.trim() || null,
        purchaseOrderNumber: body.purchaseOrderNumber?.trim() || null,
        billingNotes:        body.billingNotes?.trim() || null,
        bookingContactName:  body.bookingContactName?.trim() || null,
        bookingContactPhone: body.bookingContactPhone?.trim() || null,
        bookingContactEmail: body.bookingContactEmail?.trim() || null,
        custRefRequired:     body.custRefRequired ?? false,
        poRequired:          body.poRequired ?? false,
        vehicleAccessNotes:  body.vehicleAccessNotes?.trim() || null,
        failureAction:       body.failureAction ?? "call_assistance",
        assistancePhone:     body.assistancePhone?.trim() || null,
        assistanceNote:      body.assistanceNote?.trim() || null,
        approvalContactName:           body.approvalContactName?.trim()           || null,
        approvalContactPhone:          body.approvalContactPhone?.trim()          || null,
        alternativeReturnAddress:      body.alternativeReturnAddress?.trim()      || null,
        alternativeReturnPostcode:     body.alternativeReturnPostcode?.trim()     || null,
        alternativeReturnContactName:  body.alternativeReturnContactName?.trim()  || null,
        alternativeReturnContactPhone: body.alternativeReturnContactPhone?.trim() || null,
        internalNotes:       body.internalNotes?.trim() || null,
        validationStatus:    structuredValidation.validationStatus,
        qualityScore:        quality.score,
        requirePOD:          body.requirePOD ?? false,
        canSplitShipment:    body.canSplitShipment ?? "must_stay_together",
        status:              "draft",
        goodsDescription:    body.goodsDescription?.trim() || null,
        goodsType:           body.goodsType?.trim() || null,
        quantity:            toNullableNumber(body.quantity),
        quantityUnit:        body.quantityUnit?.trim() || null,
        weight:              toNullableNumber(body.weight),
        volume:              toNullableNumber(body.volume),
        dimensions:          body.dimensions?.trim() || null,
        fragile:             body.fragile ?? false,
        stackable:           body.stackable ?? false,
        tempControlled:      body.tempControlled ?? false,
        tempRange:           body.tempRange?.trim() || null,
        hazardClass:         body.hazardClass?.trim() || null,
        photosRequired:      body.photosRequired ?? false,
        weighbridgeRequired: body.weighbridgeRequired ?? false,
        securingRequirements: jsonOrNull(Array.isArray(body.securingRequirements) ? body.securingRequirements : []),
        specialRequirements:  jsonOrNull(Array.isArray(body.specialRequirements)  ? body.specialRequirements  : []),
        driverNoteChips:     jsonOrNull(Array.isArray(body.driverNoteChips) ? body.driverNoteChips : []),
        driverVisibleNotes:  body.driverVisibleNotes?.trim()  || null,
        safetyInstructions:  body.safetyInstructions?.trim()  || null,
        jobTitle:            body.jobTitle?.trim()            || null,
        jobType:             body.jobType?.trim()             || null,
        billingReference:    body.billingReference?.trim()    || null,
        declaredGoodsValue:  body.declaredGoodsValue?.trim()  || null,
        loadData:                               body.loadData != null ? (body.loadData as Prisma.InputJsonValue) : Prisma.DbNull,
        alternativeReturnSiteName:              body.alternativeReturnSiteName?.trim()              || null,
        alternativeReturnAddressLine2:          body.alternativeReturnAddressLine2?.trim()          || null,
        alternativeReturnTown:                  body.alternativeReturnTown?.trim()                  || null,
        alternativeReturnCounty:                body.alternativeReturnCounty?.trim()                || null,
        alternativeReturnCountry:               body.alternativeReturnCountry?.trim()               || null,
        alternativeReturnLat:                   body.alternativeReturnLat ?? null,
        alternativeReturnLng:                   body.alternativeReturnLng ?? null,
        alternativeReturnNavigationInstructions: body.alternativeReturnNavigationInstructions?.trim() || null,
        photosRequiredOnRejection:              body.photosRequiredOnRejection ?? false,
        rejectionSignatureRequired:             body.rejectionSignatureRequired ?? false,
        rejectionNotes:                         body.rejectionNotes?.trim() || null,
        stops: { create: stops.map(s => buildStopData(s, companyId)) },
        audits: {
          create: {
            companyId,
            changedBy: userId,
            action:    "created",
            field:     "job",
            newValue:  { saveMode, validationStatus: structuredValidation.validationStatus, qualityScore: quality.score },
          },
        },
      },
      include: {
        stops:  { orderBy: { sequenceNumber: "asc" } },
        audits: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });

    if (body.saveAsTemplate && body.templateName) {
      const templateStops = (stops as unknown as Record<string, unknown>[]).map((s) => ({
        ...s,
        date: undefined, timeType: "anytime",
        bookedTime: undefined, timeWindowStart: undefined, timeWindowEnd: undefined,
        referenceNumber: undefined, bookingRef: undefined,
      }));
      const sortedStops = [...stops].sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));
      const firstPickup = sortedStops.find(s => s.type === "collection" || s.type === "pickup");
      const lastDropoff = [...sortedStops].reverse().find(s => s.type === "delivery" || s.type === "dropoff");
      await tx.jobTemplate.create({
        data: {
          companyId,
          name:                body.templateName,
          pickupLocationId:    firstPickup?.savedLocationId ?? null,
          dropoffLocationId:   lastDropoff?.savedLocationId ?? null,
          pickupTextSnapshot:  typeof firstPickup?.locationTextSnapshot === "string" ? (firstPickup.locationTextSnapshot.trim() || null) : null,
          dropoffTextSnapshot: typeof lastDropoff?.locationTextSnapshot === "string" ? (lastDropoff.locationTextSnapshot.trim() || null) : null,
          defaultReference:    null,
          defaultNotes:        body.plannerNotes?.trim() || null,
          defaultMaterialType: body.goodsDescription?.trim() || null,
          trailerTypesAllowed: trailersAllowed,
          defaultStops:        JSON.parse(JSON.stringify(templateStops)),
          defaultLoadDetails:  JSON.parse(JSON.stringify(loadDetailsForValidation)),
          defaultJobData:      JSON.parse(JSON.stringify({
            customerId: body.customerId ?? null, customerName: body.customerName?.trim() || null,
            serviceType: body.serviceType?.trim() || null, priority: body.priority ?? "normal",
            billingNotes: body.billingNotes?.trim() || null, custRefRequired: body.custRefRequired ?? false,
            poRequired: body.poRequired ?? false, goodsDescription: body.goodsDescription?.trim() || null,
            quantity: body.quantity != null ? String(body.quantity) : null, quantityUnit: body.quantityUnit?.trim() || null,
            hazardClass: body.hazardClass?.trim() || null, podRequired: body.requirePOD ?? true,
            vehicleCategory: vehicleCategory || null, minGvwClass: minGvwClass || null, bodyTypes, equipment, trailersAllowed,
            vehicleAccessNotes: body.vehicleAccessNotes?.trim() || null,
            failureAction: body.failureAction ?? "call_assistance",
            assistancePhone: body.assistancePhone?.trim() || null, assistanceNote: body.assistanceNote?.trim() || null,
          })),
          qualityScore: quality.score,
          status:       "active",
        },
      });
    }

    return created;
  });

  return { ok: true, job, validation: structuredValidation, quality };
}

// ── patchJob ──────────────────────────────────────────────────────────────────

type ExistingJobStop = {
  sequenceNumber: number; type: string; savedLocationId: number | null;
  siteName: string | null; unitName: string | null; street: string | null;
  town: string | null; postcode: string | null; locationTextSnapshot: string | null;
  lat: number | null; lng: number | null; gateLat: number | null; gateLng: number | null;
  timeWindowStart: Date | null; timeWindowEnd: Date | null;
  contactName: string | null; contactPhone: string | null;
  referenceNumber: string | null; instructions: string | null;
};
type ExistingJob = NonNullable<Awaited<ReturnType<PrismaClient["job"]["findFirst"]>>> & { stops: ExistingJobStop[] };

export async function patchJob(
  prisma: PrismaClient,
  { id, companyId, userId, body, job }: { id: number; companyId: number; userId: number; body: PatchJobInput; job: NonNullable<ExistingJob> },
): Promise<ServiceResult<{ job: unknown; validation: JobValidationResult; quality: { score: number } }>> {

  const existingStops: StructuredJobPartInput[] = job.stops.map(s => ({
    sequenceNumber: s.sequenceNumber, type: s.type, savedLocationId: s.savedLocationId,
    siteName: s.siteName ?? undefined, unitName: s.unitName ?? undefined,
    street: s.street ?? undefined, town: s.town ?? undefined, postcode: s.postcode ?? undefined,
    locationTextSnapshot: s.locationTextSnapshot,
    lat: s.lat, lng: s.lng, gateLat: s.gateLat, gateLng: s.gateLng,
    timeWindowStart: s.timeWindowStart, timeWindowEnd: s.timeWindowEnd,
    contactName: s.contactName ?? undefined, contactPhone: s.contactPhone ?? undefined,
    referenceNumber: s.referenceNumber ?? undefined, instructions: s.instructions ?? undefined,
  }));

  const stops: StructuredJobPartInput[] = Array.isArray(body.stops) ? body.stops : existingStops;
  const saveMode = body.saveMode ?? (job.validationStatus === "ready_to_plan" ? "ready_to_plan" : "draft");
  const { vehicleCategory, minGvwClass, bodyTypes, equipment, trailersAllowed } = buildVehicleFields(body, job);
  const loadDetailsForValidation = buildLoadValidation(body, job);

  const effectiveCustomerId = body.customerId !== undefined ? body.customerId : job.customerId;
  let patchCustomerName = job.customerName;
  if (body.customerId !== undefined && body.customerId !== null) {
    const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId } });
    if (!customer) return { ok: false, status: 400, error: "Customer not found" };
    patchCustomerName = customer.name;
  } else if (body.customerId === null) {
    patchCustomerName = body.customerName?.trim() || null;
  } else if (body.customerName !== undefined) {
    patchCustomerName = body.customerName?.trim() || null;
  }

  const effectiveLoadData = (
    body.loadData !== undefined ? body.loadData : (job as any).loadData
  ) as Record<string, unknown> | null | undefined;

  const structuredValidation = validateStructuredJob({
    saveMode,
    customerId:  effectiveCustomerId,
    customerName: patchCustomerName,
    plannedDate:  body.plannedDate ?? job.plannedDate ?? undefined,
    vehicleCategory,
    minGvwClass,
    bodyType:     bodyTypes[0] ?? "",
    equipment,
    trailersAllowed,
    stops,
    loadDetails:  loadDetailsForValidation,
    loadData:     effectiveLoadData ?? null,
  });

  if (saveMode === "ready_to_plan" && !structuredValidation.isValid) {
    return { ok: false, status: 400, error: "Job is not ready to plan", errors: structuredValidation.errors, warnings: structuredValidation.warnings };
  }

  const quality = scoreStructuredJob({ stops, loadDetails: loadDetailsForValidation });
  const invalidStopLocationId = await findInvalidStopLocationId(prisma, companyId, stops);
  if (invalidStopLocationId !== null) return { ok: false, status: 400, error: "Invalid location reference in stops" };

  const p = <T>(newVal: T | null | undefined, existing: T): T => newVal != null ? newVal : existing;

  const updated = await prisma.$transaction(async (tx) => {
    const jobReference = !job.jobReference ? await generateJobReference(companyId, tx) : undefined;

    await tx.jobPart.deleteMany({ where: { jobId: id, companyId } });
    if (stops.length > 0) {
      await tx.jobPart.createMany({ data: stops.map(s => ({ jobId: id, ...buildStopData(s, companyId) })) });
    }
    await tx.jobAudit.create({
      data: {
        companyId, jobId: id, changedBy: userId, action: "updated", field: "job",
        oldValue: { validationStatus: job.validationStatus, qualityScore: job.qualityScore },
        newValue: { validationStatus: structuredValidation.validationStatus, qualityScore: quality.score },
      },
    });

    return tx.job.update({
      where: { id },
      data: {
        ...(jobReference !== undefined ? { jobReference } : {}),
        customerId:          effectiveCustomerId ?? null,
        customerName:        patchCustomerName,
        plannerNotes:        body.plannerNotes !== undefined ? (body.plannerNotes?.trim() || null) : job.plannerNotes,
        vehicleCategory:     vehicleCategory || null,
        minGvwClass:         minGvwClass || null,
        bodyTypes:           jsonOrNull(bodyTypes),
        equipment:           jsonOrNull(equipment),
        trailersAllowed:     jsonOrNull(trailersAllowed),
        priority:            p(body.priority, job.priority),
        serviceType:         body.serviceType !== undefined ? (body.serviceType?.trim() || null) : job.serviceType,
        customerRef:         body.customerRef !== undefined ? (body.customerRef?.trim() || null) : job.customerRef,
        purchaseOrderNumber: body.purchaseOrderNumber !== undefined ? (body.purchaseOrderNumber?.trim() || null) : job.purchaseOrderNumber,
        billingNotes:        body.billingNotes !== undefined ? (body.billingNotes?.trim() || null) : job.billingNotes,
        bookingContactName:  body.bookingContactName  !== undefined ? (body.bookingContactName?.trim()  || null) : job.bookingContactName,
        bookingContactPhone: body.bookingContactPhone !== undefined ? (body.bookingContactPhone?.trim() || null) : job.bookingContactPhone,
        bookingContactEmail: body.bookingContactEmail !== undefined ? (body.bookingContactEmail?.trim() || null) : job.bookingContactEmail,
        custRefRequired:     p(body.custRefRequired, job.custRefRequired),
        poRequired:          p(body.poRequired, job.poRequired),
        vehicleAccessNotes:  body.vehicleAccessNotes !== undefined ? (body.vehicleAccessNotes?.trim() || null) : job.vehicleAccessNotes,
        failureAction:       p(body.failureAction, job.failureAction),
        assistancePhone:     body.assistancePhone !== undefined ? (body.assistancePhone?.trim() || null) : job.assistancePhone,
        assistanceNote:      body.assistanceNote  !== undefined ? (body.assistanceNote?.trim()  || null) : job.assistanceNote,
        approvalContactName:           body.approvalContactName           !== undefined ? (body.approvalContactName?.trim()           || null) : job.approvalContactName,
        approvalContactPhone:          body.approvalContactPhone          !== undefined ? (body.approvalContactPhone?.trim()          || null) : job.approvalContactPhone,
        alternativeReturnAddress:      body.alternativeReturnAddress      !== undefined ? (body.alternativeReturnAddress?.trim()      || null) : job.alternativeReturnAddress,
        alternativeReturnPostcode:     body.alternativeReturnPostcode     !== undefined ? (body.alternativeReturnPostcode?.trim()     || null) : job.alternativeReturnPostcode,
        alternativeReturnContactName:  body.alternativeReturnContactName  !== undefined ? (body.alternativeReturnContactName?.trim()  || null) : job.alternativeReturnContactName,
        alternativeReturnContactPhone: body.alternativeReturnContactPhone !== undefined ? (body.alternativeReturnContactPhone?.trim() || null) : job.alternativeReturnContactPhone,
        internalNotes:       body.internalNotes !== undefined ? (body.internalNotes?.trim() || null) : job.internalNotes,
        validationStatus:    structuredValidation.validationStatus,
        qualityScore:        quality.score,
        requirePOD:          p(body.requirePOD, job.requirePOD),
        canSplitShipment:    p(body.canSplitShipment, job.canSplitShipment),
        plannedDate:         body.plannedDate !== undefined ? (body.plannedDate ? new Date(body.plannedDate) : null) : job.plannedDate,
        goodsDescription:    body.goodsDescription !== undefined ? (body.goodsDescription?.trim() || null) : job.goodsDescription,
        goodsType:           body.goodsType !== undefined ? (body.goodsType?.trim() || null) : job.goodsType,
        quantity:            body.quantity !== undefined ? toNullableNumber(body.quantity) : job.quantity,
        quantityUnit:        body.quantityUnit !== undefined ? (body.quantityUnit?.trim() || null) : job.quantityUnit,
        weight:              body.weight  !== undefined ? toNullableNumber(body.weight)  : job.weight,
        volume:              body.volume  !== undefined ? toNullableNumber(body.volume)  : job.volume,
        dimensions:          body.dimensions !== undefined ? (body.dimensions?.trim() || null) : job.dimensions,
        fragile:             p(body.fragile, job.fragile),
        stackable:           p(body.stackable, job.stackable),
        tempControlled:      p(body.tempControlled, job.tempControlled),
        tempRange:           body.tempRange  !== undefined ? (body.tempRange?.trim()  || null) : job.tempRange,
        hazardClass:         body.hazardClass !== undefined ? (body.hazardClass?.trim() || null) : job.hazardClass,
        photosRequired:      p(body.photosRequired, job.photosRequired),
        weighbridgeRequired: p(body.weighbridgeRequired, job.weighbridgeRequired),
        driverNoteChips: body.driverNoteChips !== undefined
          ? jsonOrNull(Array.isArray(body.driverNoteChips) ? body.driverNoteChips : [])
          : jsonOrNull(Array.isArray(job.driverNoteChips) ? (job.driverNoteChips as string[]) : []),
        driverVisibleNotes:  body.driverVisibleNotes  !== undefined ? (body.driverVisibleNotes?.trim()  || null) : job.driverVisibleNotes,
        safetyInstructions:  body.safetyInstructions  !== undefined ? (body.safetyInstructions?.trim()  || null) : job.safetyInstructions,
        jobTitle:            body.jobTitle            !== undefined ? (body.jobTitle?.trim()            || null) : job.jobTitle,
        jobType:             body.jobType             !== undefined ? (body.jobType?.trim()             || null) : job.jobType,
        billingReference:    body.billingReference    !== undefined ? (body.billingReference?.trim()    || null) : job.billingReference,
        declaredGoodsValue:  body.declaredGoodsValue  !== undefined ? (body.declaredGoodsValue?.trim()  || null) : job.declaredGoodsValue,
        loadData: body.loadData !== undefined
          ? (body.loadData != null ? (body.loadData as Prisma.InputJsonValue) : Prisma.DbNull)
          : ((job as any).loadData ?? Prisma.DbNull),
        alternativeReturnSiteName:              body.alternativeReturnSiteName !== undefined ? (body.alternativeReturnSiteName?.trim() || null) : (job as any).alternativeReturnSiteName,
        alternativeReturnAddressLine2:          body.alternativeReturnAddressLine2 !== undefined ? (body.alternativeReturnAddressLine2?.trim() || null) : (job as any).alternativeReturnAddressLine2,
        alternativeReturnTown:                  body.alternativeReturnTown !== undefined ? (body.alternativeReturnTown?.trim() || null) : (job as any).alternativeReturnTown,
        alternativeReturnCounty:                body.alternativeReturnCounty !== undefined ? (body.alternativeReturnCounty?.trim() || null) : (job as any).alternativeReturnCounty,
        alternativeReturnCountry:               body.alternativeReturnCountry !== undefined ? (body.alternativeReturnCountry?.trim() || null) : (job as any).alternativeReturnCountry,
        alternativeReturnLat:                   body.alternativeReturnLat !== undefined ? (body.alternativeReturnLat ?? null) : (job as any).alternativeReturnLat,
        alternativeReturnLng:                   body.alternativeReturnLng !== undefined ? (body.alternativeReturnLng ?? null) : (job as any).alternativeReturnLng,
        alternativeReturnNavigationInstructions: body.alternativeReturnNavigationInstructions !== undefined ? (body.alternativeReturnNavigationInstructions?.trim() || null) : (job as any).alternativeReturnNavigationInstructions,
        photosRequiredOnRejection: body.photosRequiredOnRejection !== undefined ? (body.photosRequiredOnRejection ?? false) : (job as any).photosRequiredOnRejection ?? false,
        rejectionSignatureRequired: body.rejectionSignatureRequired !== undefined ? (body.rejectionSignatureRequired ?? false) : (job as any).rejectionSignatureRequired ?? false,
        rejectionNotes: body.rejectionNotes !== undefined ? (body.rejectionNotes?.trim() || null) : (job as any).rejectionNotes,
        securingRequirements: body.securingRequirements !== undefined
          ? jsonOrNull(Array.isArray(body.securingRequirements) ? body.securingRequirements : [])
          : jsonOrNull(Array.isArray(job.securingRequirements) ? (job.securingRequirements as string[]) : []),
        specialRequirements: body.specialRequirements !== undefined
          ? jsonOrNull(Array.isArray(body.specialRequirements) ? body.specialRequirements : [])
          : jsonOrNull(Array.isArray(job.specialRequirements) ? (job.specialRequirements as string[]) : []),
      },
      include: {
        stops:  { orderBy: { sequenceNumber: "asc" } },
        audits: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
  });

  return { ok: true, job: updated, validation: structuredValidation, quality };
}

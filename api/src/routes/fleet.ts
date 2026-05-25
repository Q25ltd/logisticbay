import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { gvwForCategory, isBodyCategory, isBodyType, isGvwClass, isOnboardEquipment } from "../constants/jobCreation.js";

// ── Fleet Units ──────────────────────────────────────────────────────────────

interface CreateUnitBody {
  registration: string;
  vehicleClass?:  string;
  bodyCategory?: string;
  gvwClass?: string;
  bodyType?: string;
  onboardEquipment?: string[];
  status?:       string;
  notes?:        string;
  yardLocation?: string;
  heightM?:      number | null;
  widthM?:       number | null;
  lengthM?:      number | null;
  axleLoadT?:    number | null;
}

interface PatchUnitBody {
  registration?: string;
  vehicleClass?:  string;
  bodyCategory?: string;
  gvwClass?: string;
  bodyType?: string;
  onboardEquipment?: string[];
  status?:        string;
  notes?:         string;
  yardLocation?:  string;
  heightM?:       number | null;
  widthM?:        number | null;
  lengthM?:       number | null;
  axleLoadT?:     number | null;
}

// ── Fleet Trailers ───────────────────────────────────────────────────────────

interface CreateTrailerBody {
  registration: string;
  trailerType?:   string;
  bodyType?:      string;
  trailerLength?: string;
  decks?:         number;
  compartments?:  number | null;
  onboardEquipment?: string[];
  status?:       string;
  notes?:        string;
  yardLocation?: string;
  heightM?:      number | null;
  widthM?:       number | null;
  lengthM?:      number | null;
  axleLoadT?:    number | null;
}

interface PatchTrailerBody {
  registration?: string;
  trailerType?:   string;
  bodyType?:      string;
  trailerLength?: string;
  decks?:         number;
  compartments?:  number | null;
  onboardEquipment?: string[];
  status?:        string;
  notes?:         string;
  yardLocation?:  string;
  heightM?:       number | null;
  widthM?:        number | null;
  lengthM?:       number | null;
  axleLoadT?:     number | null;
}

function legacyUnitClass(value: unknown) {
  const source = typeof value === "string" ? value.trim() : "";
  const v = source.toLowerCase();
  if (v === "van") return { vehicleClassLegacy: source, bodyCategory: "van", gvwClass: "3.5t", bodyType: "panel" };
  if (v === "artic" || v === "artic unit" || /^class\s*1$/.test(v)) return { vehicleClassLegacy: source, bodyCategory: "tractor", gvwClass: "44t", bodyType: "" };
  if (/^class\s*2$/.test(v) || v === "rigid") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "" };
  if (v === "tipper") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "tipper" };
  if (v === "grab") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "tipper" };
  if (v === "mixer") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "mixer" };
  if (v === "hiab") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "flatbed" };
  if (v === "refrigerated") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "fridge" };
  if (v === "other") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "other" };
  return { vehicleClassLegacy: source, bodyCategory: "", gvwClass: "", bodyType: "" };
}

function legacyTrailerType(value: unknown): string {
  const source = typeof value === "string" ? value.trim() : "";
  const v = source.toLowerCase().replace(/[\s-]+/g, "_");
  const map: Record<string, string> = {
    curtain_sider: "curtain_sider",
    flatbed: "flatbed",
    box: "box",
    tipper: "tipper",
    tanker: "tanker_other",
    low_loader: "low_loader",
    skeletal: "skeletal_40",
    refrigerated_trailer: "fridge",
    fridge: "fridge",
    walking_floor: "walking_floor",
    container: "skeletal_40",
    other: "other",
  };
  return map[v] ?? "";
}

function validEquipment(values: unknown): string[] {
  const list = Array.isArray(values) ? values : [];
  return list.filter(isOnboardEquipment);
}

function hasInvalidEquipment(values: unknown): boolean {
  return Array.isArray(values) && values.some((value) => !isOnboardEquipment(value));
}

export async function fleetRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /fleet/units ─────────────────────────────────────────────────────
  app.get("/fleet/units", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string };

    const where: Record<string, unknown> = { companyId };
    if (q.status) where.status = q.status;
    else where.status = { not: "deleted" };

    const units = await prisma.fleetUnit.findMany({
      where,
      orderBy: { registration: "asc" },
    });

    return reply.send({ data: units });
  });

  // ── POST /fleet/units ────────────────────────────────────────────────────
  app.post("/fleet/units", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateUnitBody;
    const { companyId } = request.user!;

    if (!body.registration?.trim()) return reply.status(400).send({ error: "Registration is required" });
    const legacy = legacyUnitClass(body.vehicleClass);
    const bodyCategory = (body.bodyCategory ?? legacy.bodyCategory).trim();
    const gvwClass = (body.gvwClass ?? legacy.gvwClass).trim();
    const bodyType = (body.bodyType ?? legacy.bodyType).trim();
    if (!bodyCategory) return reply.status(400).send({ error: "Body category is required" });
    if (!isBodyCategory(bodyCategory)) return reply.status(400).send({ error: "Body category is invalid" });
    if (!gvwClass && gvwForCategory(bodyCategory).length > 0) return reply.status(400).send({ error: "GVW class is required" });
    if (gvwClass && !isGvwClass(gvwClass)) return reply.status(400).send({ error: "GVW class is invalid" });
    if (bodyType && !isBodyType(bodyType)) return reply.status(400).send({ error: "Body type is invalid" });
    if (hasInvalidEquipment(body.onboardEquipment)) return reply.status(400).send({ error: "Onboard equipment contains invalid value" });

    const unit = await prisma.fleetUnit.create({
      data: {
        companyId,
        registration: body.registration.trim().toUpperCase(),
        vehicleClass:  body.vehicleClass?.trim() || bodyCategory,
        vehicleClassLegacy: legacy.vehicleClassLegacy,
        bodyCategory,
        gvwClass,
        bodyType,
        onboardEquipment: validEquipment(body.onboardEquipment),
        status:        body.status ?? "available",
        notes:         body.notes?.trim() ?? null,
        yardLocation:  body.yardLocation?.trim() ?? null,
        heightM:       body.heightM   ?? null,
        widthM:        body.widthM    ?? null,
        lengthM:       body.lengthM   ?? null,
        axleLoadT:     body.axleLoadT ?? null,
      },
    });

    return reply.status(201).send(unit);
  });

  // ── PATCH /fleet/units/:id ───────────────────────────────────────────────
  app.patch("/fleet/units/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchUnitBody;
    const { companyId } = request.user!;

    const unit = await prisma.fleetUnit.findFirst({ where: { id, companyId, status: { not: "deleted" } } });
    if (!unit) return reply.status(404).send({ error: "Fleet unit not found" });
    const bodyCategory = (body.bodyCategory?.trim() || undefined) ?? unit.bodyCategory;
    const gvwClass = (body.gvwClass?.trim() || undefined) ?? unit.gvwClass;
    const bodyType = (body.bodyType?.trim() || undefined) ?? unit.bodyType ?? "";
    if (body.bodyCategory?.trim() && !isBodyCategory(bodyCategory)) return reply.status(400).send({ error: "Body category is invalid" });
    if (body.gvwClass?.trim() && gvwClass && !isGvwClass(gvwClass)) return reply.status(400).send({ error: "GVW class is invalid" });
    if (body.bodyType?.trim() && bodyType && !isBodyType(bodyType)) return reply.status(400).send({ error: "Body type is invalid" });
    if (hasInvalidEquipment(body.onboardEquipment)) return reply.status(400).send({ error: "Onboard equipment contains invalid value" });

    const updated = await prisma.fleetUnit.update({
      where: { id },
      data: {
        registration: body.registration?.trim().toUpperCase() ?? unit.registration,
        vehicleClass:  body.vehicleClass?.trim()  ?? unit.vehicleClass,
        vehicleClassLegacy: body.vehicleClass?.trim() ?? unit.vehicleClassLegacy,
        bodyCategory,
        gvwClass,
        bodyType,
        ...(body.onboardEquipment !== undefined ? { onboardEquipment: validEquipment(body.onboardEquipment) } : {}),
        status:        body.status                 ?? unit.status,
        notes:         body.notes !== undefined    ? (body.notes?.trim() || null) : unit.notes,
        yardLocation:  body.yardLocation !== undefined ? (body.yardLocation?.trim() || null) : unit.yardLocation,
        heightM:       body.heightM   !== undefined ? body.heightM   : unit.heightM,
        widthM:        body.widthM    !== undefined ? body.widthM    : unit.widthM,
        lengthM:       body.lengthM   !== undefined ? body.lengthM   : unit.lengthM,
        axleLoadT:     body.axleLoadT !== undefined ? body.axleLoadT : unit.axleLoadT,
      },
    });

    return reply.send(updated);
  });

  // ── DELETE /fleet/units/:id ──────────────────────────────────────────────
  app.delete("/fleet/units/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId } = request.user!;

    const unit = await prisma.fleetUnit.findFirst({ where: { id, companyId } });
    if (!unit) return reply.status(404).send({ error: "Fleet unit not found" });
    if (unit.status === "deleted") return reply.status(204).send();

    await prisma.fleetUnit.update({
      where: { id },
      data: {
        status:           "deleted",
        assignedDriverId: null,
        currentTrailerId: null,
        notes:            [unit.notes?.trim(), "Deleted by planner. Record kept for audit/history."].filter(Boolean).join("\n"),
      },
    });
    return reply.status(204).send();
  });

  // ── GET /fleet/trailers ──────────────────────────────────────────────────
  app.get("/fleet/trailers", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string };

    const where: Record<string, unknown> = { companyId };
    if (q.status) where.status = q.status;
    else where.status = { not: "deleted" };

    const trailers = await prisma.fleetTrailer.findMany({
      where,
      orderBy: { registration: "asc" },
    });

    return reply.send({ data: trailers });
  });

  // ── POST /fleet/trailers ─────────────────────────────────────────────────
  app.post("/fleet/trailers", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateTrailerBody;
    const { companyId } = request.user!;

    if (!body.registration?.trim()) return reply.status(400).send({ error: "Registration is required" });
    const bodyType = (body.bodyType ?? legacyTrailerType(body.trailerType)).trim();
    if (!bodyType) return reply.status(400).send({ error: "Trailer body type is required" });
    if (!isBodyType(bodyType)) return reply.status(400).send({ error: "Trailer body type is invalid" });
    if (hasInvalidEquipment(body.onboardEquipment)) return reply.status(400).send({ error: "Onboard equipment contains invalid value" });

    const trailer = await prisma.fleetTrailer.create({
      data: {
        companyId,
        registration: body.registration.trim().toUpperCase(),
        trailerType:   body.trailerType?.trim() || bodyType,
        bodyType,
        trailerLength: body.trailerLength?.trim() ?? "",
        decks:         body.decks ?? 1,
        compartments:  body.compartments ?? null,
        onboardEquipment: validEquipment(body.onboardEquipment),
        status:        body.status ?? "available",
        notes:         body.notes?.trim() ?? null,
        yardLocation:  body.yardLocation?.trim() ?? null,
        heightM:       body.heightM   ?? null,
        widthM:        body.widthM    ?? null,
        lengthM:       body.lengthM   ?? null,
        axleLoadT:     body.axleLoadT ?? null,
      },
    });

    return reply.status(201).send(trailer);
  });

  // ── PATCH /fleet/trailers/:id ────────────────────────────────────────────
  app.patch("/fleet/trailers/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as PatchTrailerBody;
    const { companyId } = request.user!;

    const trailer = await prisma.fleetTrailer.findFirst({ where: { id, companyId, status: { not: "deleted" } } });
    if (!trailer) return reply.status(404).send({ error: "Fleet trailer not found" });
    const bodyType = body.bodyType?.trim() ?? trailer.bodyType;
    if (body.bodyType !== undefined && bodyType && !isBodyType(bodyType)) return reply.status(400).send({ error: "Trailer body type is invalid" });
    if (hasInvalidEquipment(body.onboardEquipment)) return reply.status(400).send({ error: "Onboard equipment contains invalid value" });

    const updated = await prisma.fleetTrailer.update({
      where: { id },
      data: {
        registration: body.registration?.trim().toUpperCase() ?? trailer.registration,
        trailerType:   body.trailerType?.trim()   ?? trailer.trailerType,
        bodyType,
        trailerLength: body.trailerLength?.trim() ?? trailer.trailerLength,
        decks:         body.decks                 ?? trailer.decks,
        compartments:  body.compartments !== undefined ? body.compartments : trailer.compartments,
        ...(body.onboardEquipment !== undefined ? { onboardEquipment: validEquipment(body.onboardEquipment) } : {}),
        status:        body.status                 ?? trailer.status,
        notes:         body.notes !== undefined    ? (body.notes?.trim() || null) : trailer.notes,
        yardLocation:  body.yardLocation !== undefined ? (body.yardLocation?.trim() || null) : trailer.yardLocation,
        heightM:       body.heightM   !== undefined ? body.heightM   : trailer.heightM,
        widthM:        body.widthM    !== undefined ? body.widthM    : trailer.widthM,
        lengthM:       body.lengthM   !== undefined ? body.lengthM   : trailer.lengthM,
        axleLoadT:     body.axleLoadT !== undefined ? body.axleLoadT : trailer.axleLoadT,
      },
    });

    return reply.send(updated);
  });

  // ── DELETE /fleet/trailers/:id ───────────────────────────────────────────
  app.delete("/fleet/trailers/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    const { companyId } = request.user!;

    const trailer = await prisma.fleetTrailer.findFirst({ where: { id, companyId } });
    if (!trailer) return reply.status(404).send({ error: "Fleet trailer not found" });
    if (trailer.status === "deleted") return reply.status(204).send();
    if (trailer.status === "loaded" && trailer.linkedJobId) {
      return reply.status(409).send({
        error: "Cannot delete a loaded trailer",
        message: `Trailer ${trailer.registration} is loaded and linked to job #${trailer.linkedJobId}. Replan or unload it before deleting.`,
      });
    }

    await prisma.fleetTrailer.update({
      where: { id },
      data: {
        status:         "deleted",
        attachedUnitId: null,
        linkedJobId:    null,
        notes:          [trailer.notes?.trim(), "Deleted by planner. Record kept for audit/history."].filter(Boolean).join("\n"),
      },
    });
    return reply.status(204).send();
  });
}

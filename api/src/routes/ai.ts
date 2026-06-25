/**
 * Planning intelligence routes.
 *
 * POST /ai/parse-request       — AI only (free text → structured job). Requires ANTHROPIC_API_KEY.
 * POST /ai/suggest-vehicle     — Rule-based. No AI.
 * POST /ai/check-vehicle-load  — Rule-based. No AI.
 * POST /ai/check-run           — Rule-based + ORS routing. No AI.
 * POST /ai/suggest-run-trailer — Rule-based. No AI.
 * POST /ai/area-lookup         — Reverse geocode via Nominatim. No AI.
 * GET  /ai/status              — Returns whether AI (parse-request) is enabled.
 */

import type { FastifyInstance } from "fastify";
import type { PrismaClient }    from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { env }                  from "../lib/env.js";
import { parseTransportRequest, type SavedLocationHint } from "../services/parseRequestService.js";
import { suggestVehicle, suggestTrailerForRun, type VehicleSuggestionInput } from "../services/suggestVehicleService.js";
import { lookupAreaTypes } from "../services/areaLookupService.js";
import { checkLoadVehicle, type LoadVehicleCheckInput } from "../services/checkLoadVehicleService.js";
import { checkRun, type RunStop } from "../services/checkRunService.js";
import { buildFleetCapacityProfile } from "../lib/loadCapacity.js";
import { badRequest } from "../lib/errors.js";

export async function aiRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {

  // ── POST /ai/parse-request ─────────────────────────────────────────────────
  app.post(
    "/ai/parse-request",
    {
      preHandler: [authenticate, requireRole("company_owner", "planner")],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      if (!env.AI_ENABLED) {
        return reply.status(503).send({
          error:   "AI_UNAVAILABLE",
          message: "AI features are not enabled on this server.",
        });
      }

      const body = request.body as { text?: unknown };
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) {
        return badRequest(reply, "BAD_REQUEST", "text is required");
      }
      if (text.length > 8000) {
        return badRequest(reply, "BAD_REQUEST", "Message is too long (max 8 000 characters)");
      }

      const { companyId } = request.user!;

      // Fetch company's saved locations to help Claude match addresses
      const locations = await prisma.savedLocation.findMany({
        where:  { companyId },
        select: { id: true, siteName: true, street: true, town: true, postcode: true },
        take:   200,
        orderBy: { createdAt: "desc" },
      });

      const hints: SavedLocationHint[] = locations.map(l => ({
        id:       l.id,
        siteName: l.siteName ?? "",
        street:   l.street,
        town:     l.town,
        postcode: l.postcode,
      }));

      const todayISO = new Date().toISOString().slice(0, 10);

      try {
        const parsed = await parseTransportRequest(text, todayISO, hints);
        return reply.send(parsed);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "AI request failed";
        // Anthropic auth errors → 503 (config problem, not caller's fault)
        const isAuthError = message.toLowerCase().includes("authentication") ||
                            message.toLowerCase().includes("invalid api key") ||
                            message.toLowerCase().includes("api key");
        const status = isAuthError ? 503 : 502;
        const code   = isAuthError ? "AI_AUTH_ERROR" : "AI_ERROR";
        app.log.error({ err, code }, "AI route error");
        return reply.status(status).send({ error: code, message });
      }
    },
  );

  // ── POST /ai/suggest-vehicle  (rule-based — no AI) ────────────────────────
  app.post(
    "/ai/suggest-vehicle",
    {
      preHandler: [authenticate, requireRole("company_owner", "planner")],
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = request.body as VehicleSuggestionInput;
      const { companyId } = request.user!;

      // Fetch the company's active fleet body types so rules can match real options
      const fleetTrailers = await prisma.fleetTrailer.findMany({
        where:  { companyId, status: { notIn: ["disposed"] } },
        select: { bodyType: true },
      });
      const fleetBodyTypes = [...new Set(
        fleetTrailers.map(t => t.bodyType).filter((b): b is string => !!b && b.trim() !== "")
      )];

      const suggestion = await suggestVehicle({
        weight:              typeof body.weight === "number"   ? body.weight   : undefined,
        quantity:            typeof body.quantity === "number" ? body.quantity : undefined,
        quantityUnit:        typeof body.quantityUnit === "string" ? body.quantityUnit : undefined,
        goodsType:           typeof body.goodsType === "string"    ? body.goodsType    : undefined,
        goodsDescription:    typeof body.goodsDescription === "string" ? body.goodsDescription : undefined,
        tempControlled:      typeof body.tempControlled === "boolean" ? body.tempControlled : undefined,
        hazardClass:         typeof body.hazardClass === "string"  ? body.hazardClass  : undefined,
        specialRequirements: Array.isArray(body.specialRequirements) ? body.specialRequirements : undefined,
        stopCount:           typeof body.stopCount === "number" ? body.stopCount : undefined,
        stops:               Array.isArray(body.stops) ? body.stops : undefined,
        fleetBodyTypes:      fleetBodyTypes.length ? fleetBodyTypes : undefined,
      });
      return reply.send(suggestion);
    },
  );

  // ── POST /ai/check-vehicle-load  (rule-based — no AI) ────────────────────
  app.post(
    "/ai/check-vehicle-load",
    {
      preHandler: [authenticate, requireRole("company_owner", "planner")],
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = request.body as LoadVehicleCheckInput;

      if (typeof body.vehicleCategory !== "string" || !body.vehicleCategory) {
        return badRequest(reply, "BAD_REQUEST", "vehicleCategory is required");
      }

      const result = checkLoadVehicle({
        vehicleCategory:   body.vehicleCategory,
        bodyTypes:         Array.isArray(body.bodyTypes)             ? body.bodyTypes         : undefined,
        goodsDescription:  typeof body.goodsDescription === "string" ? body.goodsDescription  : undefined,
        goodsType:         typeof body.goodsType         === "string" ? body.goodsType         : undefined,
        weight:            typeof body.weight            === "number" ? body.weight            : undefined,
        quantity:          typeof body.quantity          === "number" ? body.quantity          : undefined,
        quantityUnit:      typeof body.quantityUnit      === "string" ? body.quantityUnit      : undefined,
        hazardClass:       typeof body.hazardClass       === "string" ? body.hazardClass       : undefined,
        tempControlled:    typeof body.tempControlled    === "boolean"? body.tempControlled    : undefined,
      });
      return reply.send(result);
    },
  );

  // ── POST /ai/area-lookup ───────────────────────────────────────────────────
  //
  // Classifies UK postcode(s) as industrial / residential / rural / urban / port.
  // Uses postcodes.io (lat/lng) + Nominatim OSM (reverse geocode).
  // No API key required. Max 20 postcodes per request.
  app.post(
    "/ai/area-lookup",
    {
      preHandler: [authenticate, requireRole("company_owner", "planner")],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = request.body as { postcodes?: unknown };
      if (!Array.isArray(body.postcodes)) {
        return badRequest(reply, "BAD_REQUEST", "postcodes must be an array of strings");
      }
      const postcodes = body.postcodes
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .slice(0, 20);

      if (!postcodes.length) return reply.send([]);

      try {
        const results = await lookupAreaTypes(postcodes);
        return reply.send(results);
      } catch (err: unknown) {
        app.log.error({ err }, "area-lookup error");
        return reply.status(500).send({ error: "Area lookup failed" });
      }
    },
  );

  // ── POST /ai/check-run  (ORS routing + rules — no AI) ────────────────────
  app.post(
    "/ai/check-run",
    {
      preHandler: [authenticate, requireRole("company_owner", "planner")],
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = request.body as {
        stops?: unknown;
        estimatedStartTime?: unknown;
        vehicle?: {
          weightT?:   number | null;
          heightM?:   number | null;
          widthM?:    number | null;
          lengthM?:   number | null;
          axleLoadT?: number | null;
        } | null;
        assignedVehicle?: {
          category?:  string | null;
          payloadKg?: number | null;
          bodyType?:  string | null;
          equipment?: string[] | null;
        } | null;
      };

      if (!Array.isArray(body.stops) || body.stops.length === 0) {
        return badRequest(reply, "BAD_REQUEST", "stops is required (non-empty array)");
      }

      // Q5a — build the company's available-fleet capacity profile so the capacity
      // check is fleet-aware (split forced when nothing can carry the load whole).
      const { companyId } = request.user!;
      const trailers = await prisma.fleetTrailer.findMany({
        where:  { companyId, status: { notIn: ["disposed"] } },
        select: { trailerType: true, trailerLength: true, lengthM: true, decks: true, status: true },
      });
      const fleet = buildFleetCapacityProfile(trailers);

      try {
        const result = await checkRun({
          stops:               body.stops as RunStop[],
          estimatedStartTime:  typeof body.estimatedStartTime === "string" ? body.estimatedStartTime : undefined,
          vehicle:             body.vehicle ?? null,
          fleet,
          assignedVehicle:     body.assignedVehicle ?? null,
        });
        return reply.send(result);
      } catch (err: unknown) {
        app.log.error({ err }, "check-run error");
        return reply.status(500).send({ error: "RUN_CHECK_FAILED", message: (err as Error).message });
      }
    },
  );

  // ── POST /ai/suggest-run-trailer  (rule-based — no AI) ──────────────────
  app.post(
    "/ai/suggest-run-trailer",
    {
      preHandler: [authenticate, requireRole("company_owner", "planner")],
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { companyId } = request.user!;
      const body = request.body as {
        weight?:         unknown;
        quantity?:       unknown;
        quantityUnit?:   unknown;
        goodsType?:      unknown;
        tempControlled?: unknown;
        hazardClass?:    unknown;
        stopCount?:      unknown;
      };

      // Fetch the company's active trailers from the fleet
      const rawTrailers = await prisma.fleetTrailer.findMany({
        where:  { companyId, status: { notIn: ["disposed"] } },
        select: { id: true, registration: true, trailerType: true, bodyType: true, status: true },
        orderBy: { registration: "asc" },
      });

      const availableTrailers = rawTrailers.map(t => ({
        id:           t.id,
        registration: t.registration,
        trailerType:  t.trailerType ?? "unknown",
        bodyType:     t.bodyType    ?? "unknown",
        status:       t.status,
      }));

      const suggestion = await suggestTrailerForRun({
        weight:           typeof body.weight         === "number"  ? body.weight         : undefined,
        quantity:         typeof body.quantity       === "number"  ? body.quantity        : undefined,
        quantityUnit:     typeof body.quantityUnit   === "string"  ? body.quantityUnit    : undefined,
        goodsType:        typeof body.goodsType      === "string"  ? body.goodsType       : undefined,
        tempControlled:   typeof body.tempControlled === "boolean" ? body.tempControlled  : undefined,
        hazardClass:      typeof body.hazardClass    === "string"  ? body.hazardClass     : undefined,
        stopCount:        typeof body.stopCount      === "number"  ? body.stopCount       : undefined,
        availableTrailers,
      });
      return reply.send(suggestion);
    },
  );

  // ── GET /ai/status ─────────────────────────────────────────────────────────
  app.get(
    "/ai/status",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (_request, reply) => {
      return reply.send({ enabled: env.AI_ENABLED });
    },
  );
}

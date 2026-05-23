/**
 * AI-assisted features (require ANTHROPIC_API_KEY).
 *
 * POST /ai/parse-request
 *   Parses a free-text transport request (email, message, note) and returns
 *   structured job data ready to pre-fill the Create Job form.
 *   Auth: company_owner | planner
 *
 * POST /ai/suggest-vehicle
 *   Given load details (weight, quantity, goods type, temp, hazmat), returns
 *   a recommended vehicle category with a short plain-English reason.
 *   Auth: company_owner | planner
 */

import type { FastifyInstance } from "fastify";
import type { PrismaClient }    from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { env }                  from "../lib/env.js";
import { parseTransportRequest, type SavedLocationHint } from "../services/parseRequestService.js";
import { suggestVehicle, type VehicleSuggestionInput }   from "../services/suggestVehicleService.js";

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
        return reply.status(400).send({ error: "text is required" });
      }
      if (text.length > 8000) {
        return reply.status(400).send({ error: "Message is too long (max 8 000 characters)" });
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

  // ── POST /ai/suggest-vehicle ───────────────────────────────────────────────
  app.post(
    "/ai/suggest-vehicle",
    {
      preHandler: [authenticate, requireRole("company_owner", "planner")],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      if (!env.AI_ENABLED) {
        return reply.status(503).send({
          error:   "AI_UNAVAILABLE",
          message: "AI features are not enabled on this server.",
        });
      }

      const body = request.body as VehicleSuggestionInput;

      try {
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
        });
        return reply.send(suggestion);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "AI request failed";
        const isAuthError = message.toLowerCase().includes("authentication") ||
                            message.toLowerCase().includes("invalid api key") ||
                            message.toLowerCase().includes("api key");
        const status = isAuthError ? 503 : 502;
        const code   = isAuthError ? "AI_AUTH_ERROR" : "AI_ERROR";
        app.log.error({ err, code }, "AI suggest-vehicle error");
        return reply.status(status).send({ error: code, message });
      }
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

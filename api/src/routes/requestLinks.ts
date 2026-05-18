import crypto                    from "node:crypto";
import type { FastifyInstance }  from "fastify";
import { PrismaClient, Prisma }  from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function serializeLink(l: {
  id: number; companyId: number; customerId: number | null; name: string;
  tokenHash: string; isActive: boolean; expiresAt: Date | null; lastUsedAt: Date | null;
  usageCount: number; createdAt: Date; customer: { id: number; name: string } | null;
  templateData: Prisma.JsonValue;
}) {
  return {
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
  };
}

export async function requestLinkRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {

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
      return reply.send({ data: links.map(serializeLink) });
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
          name:         (typeof body.name === "string" ? body.name : "") || "Untitled link",
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

      return reply.status(201).send({ ...serializeLink(link), rawToken });
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

      return reply.send(serializeLink(updated));
    },
  );
}

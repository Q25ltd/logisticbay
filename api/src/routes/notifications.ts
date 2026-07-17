/**
 * In-app notification queue (S14).
 *
 * GET   /notifications           — the signed-in user's notifications, newest first
 * PATCH /notifications/:id/read  — mark one as read
 */
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/client.js";
import { authenticate } from "../middleware.js";
import { parseIdParam } from "../lib/validate.js";
import { badRequest, notFound } from "../lib/errors.js";

export async function notificationRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {
  app.get("/notifications", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const q = request.query as { unread?: string; limit?: string };
    const limit = Math.min(parseInt(q.limit ?? "50", 10) || 50, 200);

    const notifications = await prisma.notification.findMany({
      where: {
        companyId,
        recipientUserId: userId,
        deletedAt: null,
        ...(q.unread === "true" ? { readAt: null } : {}),
      },
      orderBy: { id: "desc" },
      take:    limit,
    });
    const unreadCount = await prisma.notification.count({
      where: { companyId, recipientUserId: userId, deletedAt: null, readAt: null },
    });

    return reply.send({ notifications, unreadCount });
  });

  app.patch("/notifications/:id/read", { preHandler: authenticate }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId, userId } = request.user!;

    const updated = await prisma.notification.updateMany({
      where: { id, companyId, recipientUserId: userId, deletedAt: null },
      data:  { readAt: new Date() },
    });
    if (updated.count === 0) return notFound(reply, "Notification");

    return reply.send({ ok: true });
  });
}

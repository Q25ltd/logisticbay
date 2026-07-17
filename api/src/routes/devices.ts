/**
 * Device-token registration (S14 notifications).
 *
 * POST /devices — the signed-in app registers its Expo push token. Upsert by
 * token: a device that changes hands (or re-registers after re-login) is
 * re-pointed at the current user/company.
 */
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/client.js";
import { authenticate } from "../middleware.js";
import { parseBody } from "../lib/validate.js";
import { validationFailed } from "../lib/errors.js";
import { RegisterDeviceSchema } from "../schemas/devices.js";

export async function deviceRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {
  app.post("/devices", { preHandler: authenticate }, async (request, reply) => {
    const { companyId, userId } = request.user!;
    const parsed = parseBody(RegisterDeviceSchema, request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const { token, platform } = parsed.data;

    const device = await prisma.deviceToken.upsert({
      where:  { token },
      create: { companyId, userId, token, platform: platform ?? null },
      update: { companyId, userId, platform: platform ?? null },
    });

    return reply.status(201).send({ id: device.id, token: device.token });
  });
}

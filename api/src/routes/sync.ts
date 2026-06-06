import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/client.js';
import { authenticate } from '../middleware.js';
import { processSyncEvents, IncomingEvent } from '../sync/sync.service.js';
import { validateGpsPair } from '../lib/gps.js';
import { validateClientTimestamp } from '../lib/eventTimestamp.js';
import { badRequest } from "../lib/errors.js";

interface SyncEventsBody {
  events: IncomingEvent[];
}

export async function syncRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {
  app.post<{ Body: SyncEventsBody }>(
    '/sync/events',
    { preHandler: authenticate },
    async (request, reply) => {
      const { companyId, userId } = request.user as { companyId: number; userId: number };

      const body = request.body as SyncEventsBody;

      if (!body || !Array.isArray(body.events)) {
        return badRequest(reply, 'BAD_REQUEST', 'Request body must include an events array');
      }

      if (body.events.length === 0) {
        return badRequest(reply, 'BAD_REQUEST', 'events array must not be empty');
      }

      if (body.events.length > 100) {
        return badRequest(reply, 'BAD_REQUEST', 'Maximum 100 events per request');
      }

      for (const event of body.events) {
        if (!event.clientEventId || typeof event.clientEventId !== 'string') {
          return badRequest(reply, 'BAD_REQUEST', 'Each event must have a clientEventId string');
        }
        if (!event.eventType || typeof event.eventType !== 'string') {
          return badRequest(reply, 'BAD_REQUEST', 'Each event must have an eventType string');
        }
        if (!event.jobId || typeof event.jobId !== 'number') {
          return badRequest(reply, 'BAD_REQUEST', 'Each event must have a numeric jobId');
        }
        const tsCheck = validateClientTimestamp(event.clientTimestamp ?? null);
        if (!tsCheck.valid) {
          return badRequest(reply, 'BAD_REQUEST', tsCheck.reason);
        }

        const gpsCheck = validateGpsPair(event.gpsLat, event.gpsLng);
        if (!gpsCheck.valid) {
          return badRequest(reply, 'BAD_REQUEST', gpsCheck.reason);
        }
      }

      const results = await processSyncEvents(prisma, body.events, companyId, userId);

      const synced = results.filter((r) => r.status === 'accepted' || r.status === 'duplicate');
      const failed = results.filter((r) => r.status === 'failed');

      return reply.status(200).send({ synced, failed });
    },
  );
}

import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/client.js';
import { authenticate } from '../middleware.js';
import { processSyncEvents, IncomingEvent } from '../sync/sync.service.js';
import { validateGpsPair } from '../lib/gps.js';
import { validateClientTimestamp } from '../lib/eventTimestamp.js';

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
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'Request body must include an events array',
        });
      }

      if (body.events.length === 0) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'events array must not be empty',
        });
      }

      if (body.events.length > 100) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'Maximum 100 events per request',
        });
      }

      for (const event of body.events) {
        if (!event.clientEventId || typeof event.clientEventId !== 'string') {
          return reply.status(400).send({
            error: 'BAD_REQUEST',
            message: 'Each event must have a clientEventId string',
          });
        }
        if (!event.eventType || typeof event.eventType !== 'string') {
          return reply.status(400).send({
            error: 'BAD_REQUEST',
            message: 'Each event must have an eventType string',
          });
        }
        if (!event.jobId || typeof event.jobId !== 'number') {
          return reply.status(400).send({
            error: 'BAD_REQUEST',
            message: 'Each event must have a numeric jobId',
          });
        }
        const tsCheck = validateClientTimestamp(event.clientTimestamp ?? null);
        if (!tsCheck.valid) {
          return reply.status(400).send({
            error: 'BAD_REQUEST',
            message: tsCheck.reason,
          });
        }

        const gpsCheck = validateGpsPair(event.gpsLat, event.gpsLng);
        if (!gpsCheck.valid) {
          return reply.status(400).send({
            error: 'BAD_REQUEST',
            message: gpsCheck.reason,
          });
        }
      }

      const results = await processSyncEvents(prisma, body.events, companyId, userId);

      const synced = results.filter((r) => r.status === 'accepted' || r.status === 'duplicate');
      const failed = results.filter((r) => r.status === 'failed');

      return reply.status(200).send({ synced, failed });
    },
  );
}

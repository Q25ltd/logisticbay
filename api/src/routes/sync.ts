import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/client.js';
import { authenticate } from '../middleware.js';
import { processSyncEvents, IncomingEvent } from '../sync/sync.service.js';

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
        if (!event.clientTimestamp || typeof event.clientTimestamp !== 'string') {
          return reply.status(400).send({
            error: 'BAD_REQUEST',
            message: 'Each event must have a clientTimestamp ISO string',
          });
        }

        if (
          (event.gpsLat !== undefined && event.gpsLng === undefined) ||
          (event.gpsLat === undefined && event.gpsLng !== undefined)
        ) {
          return reply.status(400).send({
            error: 'BAD_REQUEST',
            message: 'gpsLat and gpsLng must be provided together',
          });
        }

        if (event.gpsLat !== undefined) {
          if (
            typeof event.gpsLat !== 'number' ||
            !Number.isFinite(event.gpsLat) ||
            event.gpsLat < -90 ||
            event.gpsLat > 90
          ) {
            return reply.status(400).send({
              error: 'BAD_REQUEST',
              message: 'gpsLat must be a number between -90 and 90',
            });
          }
        }

        if (event.gpsLng !== undefined) {
          if (
            typeof event.gpsLng !== 'number' ||
            !Number.isFinite(event.gpsLng) ||
            event.gpsLng < -180 ||
            event.gpsLng > 180
          ) {
            return reply.status(400).send({
              error: 'BAD_REQUEST',
              message: 'gpsLng must be a number between -180 and 180',
            });
          }
        }
      }

      const results = await processSyncEvents(prisma, body.events, companyId, userId);

      const synced = results.filter((r) => r.status === 'accepted' || r.status === 'duplicate');
      const failed = results.filter((r) => r.status === 'failed');

      return reply.status(200).send({ synced, failed });
    },
  );
}

import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { checkDayFeasibility, type ScheduleStop } from "../lib/driverSchedule.js";
import { badRequest, notFound } from "../lib/errors.js";

export async function scheduleRoutes(app: FastifyInstance, prisma: PrismaClient) {
  // ── GET /drivers/:driverId/schedule ─────────────────────────────────────────
  app.get<{ Params: { driverId: string }; Querystring: { date?: string } }>(
    "/drivers/:driverId/schedule",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (req, reply) => {
      const companyId = req.user!.companyId;
      const driverId  = parseInt(req.params.driverId, 10);
      const date      = req.query.date;

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return badRequest(reply, "BAD_REQUEST", "date query param required (YYYY-MM-DD)");
      }

      const driver = await prisma.driverProfile.findFirst({
        where:  { id: driverId, companyId },
        select: { id: true, preferredStartTime: true, earliestStartTime: true },
      });
      if (!driver) return notFound(reply, "Driver");

      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd   = new Date(`${date}T23:59:59`);

      const assignments = await prisma.runAssignment.findMany({
        where:  { companyId, removedAt: null, run: { assignedDriverId: driverId } },
        select: { jobId: true },
        distinct: ["jobId"],
      });
      const jobIds = assignments.map(a => a.jobId);

      const jobs = await prisma.job.findMany({
        where: {
          companyId,
          id:     { in: jobIds },
          // Filter by any stop's time window on this day (collection or delivery)
          stops:  { some: { timeWindowStart: { gte: dayStart, lte: dayEnd } } },
          status: { notIn: ["cancelled"] },
        },
        include: { stops: { orderBy: { sequenceNumber: "asc" } } },
        orderBy: { id: "asc" },
      });

      const stops: ScheduleStop[] = [];
      for (const job of jobs) {
        for (const s of job.stops) {
          stops.push({
            jobId:          job.id,
            jobReference:   job.jobReference,
            stopSequence:   s.sequenceNumber,
            type:           s.type,
            postcode:       s.postcode || null,
            lat:            s.lat,
            lng:            s.lng,
            windowStart:    s.timeWindowStart?.toISOString() ?? null,
            windowEnd:      s.timeWindowEnd?.toISOString()   ?? null,
            bookedTime:     s.bookedTime?.toISOString()      ?? null,
            serviceMinutes: s.unloadingAllowanceMinutes ?? 30,
          });
        }
      }

      const dayStart24 = driver.earliestStartTime ?? driver.preferredStartTime ?? "06:00";
      const result = await checkDayFeasibility(driverId, date, stops, dayStart24);

      return reply.send(result);
    },
  );
}

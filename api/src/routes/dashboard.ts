import type { FastifyInstance } from "fastify";
import { PrismaClient, Prisma } from "../generated/client.js";
import { authenticate } from "../middleware.js";
import { dayRangeUtc } from "../lib/dateUtils.js";

const CLOSED_STATUSES = new Set(["completed", "cancelled"]);

const JOB_INCLUDE = {
  customer:    true,
  template:    true,
  stops:       { orderBy: { sequenceNumber: "asc" as const } },
  events:      { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.JobInclude;

export async function dashboardRoutes(app: FastifyInstance, prisma: PrismaClient) {

  /**
   * GET /dashboard?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
   *
   * Returns everything the planner dashboard needs in one request:
   * - Jobs in the requested date range
   * - Open (non-closed) carry-over jobs outside the range
   * - All active drivers
   * - All fleet units and trailers
   *
   * All data is scoped to companyId from the verified JWT.
   * Replaces the previous pattern of 2 unbounded GET /jobs calls
   * plus separate driver and fleet fetches.
   */
  app.get("/dashboard", { preHandler: authenticate }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { dateFrom?: string; dateTo?: string };

    const dateFrom = q.dateFrom ?? new Date().toISOString().slice(0, 10);
    const dateTo   = q.dateTo   ?? dateFrom;

    const { gte, lte } = dayRangeUtc(dateFrom, dateTo);

    // Jobs whose collection stop timeWindowStart falls in the requested date range (E.2).
    const rangeJobs = await prisma.job.findMany({
      where: {
        companyId,
        stops: { some: { type: { in: ["collection", "pickup"] }, timeWindowStart: { gte, lte } } },
      },
      include: JOB_INCLUDE,
      orderBy: [{ id: "asc" }],
      take: 500,
    });

    // Open carry-over jobs — non-closed jobs with no collection timeWindowStart or before the range (E.2)
    const rangeJobIds = new Set(rangeJobs.map(j => j.id));
    const carryOverJobs = await prisma.job.findMany({
      where: {
        companyId,
        status: { notIn: [...CLOSED_STATUSES] },
        OR: [
          // No collection stop with a timeWindowStart
          { stops: { none: { type: { in: ["collection", "pickup"] }, timeWindowStart: { not: null } } } },
          // Collection stop before the range
          { stops: { some: { type: { in: ["collection", "pickup"] }, timeWindowStart: { lt: gte } } } },
        ],
      },
      include: JOB_INCLUDE,
      orderBy: [{ id: "asc" }],
      take: 200,
    });

    const jobs = [
      ...rangeJobs,
      ...carryOverJobs.filter(j => !rangeJobIds.has(j.id)),
    ];

    // Drivers, units, trailers — all scoped to companyId
    const [drivers, units, trailers] = await Promise.all([
      prisma.driverProfile.findMany({
        where:   { companyId, status: "active" },
        include: { user: true },
        orderBy: { displayName: "asc" },
      }),
      prisma.fleetUnit.findMany({
        where:   { companyId },
        orderBy: { registration: "asc" },
      }),
      prisma.fleetTrailer.findMany({
        where:   { companyId },
        orderBy: { registration: "asc" },
      }),
    ]);

    return reply.send({ jobs, drivers, units, trailers });
  });
}

import type { FastifyInstance } from "fastify";
import { PrismaClient, Prisma } from "../generated/client.js";
import { authenticate } from "../middleware.js";

const CLOSED_STATUSES = new Set(["completed", "cancelled"]);

const JOB_INCLUDE = {
  customer:        true,
  assignedDriver:  true,
  template:        true,
  pickupLocation:  true,
  dropoffLocation: true,
  stops:           { orderBy: { sequenceNumber: "asc" as const } },
  loadDetails:     true,
  events:          { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.PlannedJobInclude;

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

    // Jobs in the requested date range
    const rangeJobs = await prisma.plannedJob.findMany({
      where: {
        companyId,
        plannedDate: {
          gte: new Date(`${dateFrom}T00:00:00.000Z`),
          lte: new Date(`${dateTo}T23:59:59.999Z`),
        },
      },
      include: JOB_INCLUDE,
      orderBy: [{ plannedDate: "asc" }, { sequence: "asc" }],
      take: 500,
    });

    // Open carry-over jobs — non-closed jobs with no planned date or outside the range
    const rangeJobIds = new Set(rangeJobs.map(j => j.id));
    const carryOverJobs = await prisma.plannedJob.findMany({
      where: {
        companyId,
        status: { notIn: [...CLOSED_STATUSES] },
        OR: [
          { plannedDate: null },
          { plannedDate: { lt: new Date(`${dateFrom}T00:00:00.000Z`) } },
          { plannedDate: { gt: new Date(`${dateTo}T23:59:59.999Z`) } },
        ],
      },
      include: JOB_INCLUDE,
      orderBy: [{ plannedDate: "asc" }, { sequence: "asc" }],
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

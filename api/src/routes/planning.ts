/**
 * Planning board routes.
 *
 * GET  /planning/unplanned?date=YYYY-MM-DD   — stops ready to plan, clustered by location
 * GET  /planning/runs?date=YYYY-MM-DD        — runs for that date (with assignments)
 * POST /planning/runs                        — create a new run for that date
 * PATCH /planning/runs/:id                   — update runType, dependsOnRunId, trailer, driver, plannerNotes, estimatedStartTime
 * POST /planning/runs/:id/assignments        — add a stop (jobPartId) to a run
 * DELETE /planning/runs/:id/assignments/:aId — remove a stop from a run
 * POST /planning/runs/:id/publish            — publish run to driver
 * GET  /planning/fleet?date=YYYY-MM-DD       — available trailers + trucks for that date
 * GET  /planning/drivers?date=YYYY-MM-DD     — drivers available for that date
 */

import type { FastifyInstance } from "fastify";
import { PrismaClient }         from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { syncJobPlanningStatuses }   from "../lib/jobUtils.js";

// ── Haversine distance (km) between two GPS points ───────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Simple greedy GPS clustering (5 km radius) ───────────────────────────────

interface StopForCluster {
  id:             number;
  jobId:          number;
  jobReference:   string | null;
  customerName:   string | null;
  type:           string;
  sequenceNumber: number;
  siteName:       string | null;
  town:           string | null;
  locationText:   string | null;
  postcode:       string | null;
  lat:            number | null;
  lng:            number | null;
  timeWindowStart?: Date | null;
  timeWindowEnd?:   Date | null;
  bookedTime?:      Date | null;
  goodsType:      string | null;
  weight:         number | null;
  quantity:       number | null;
  quantityUnit:   string | null;
}

interface Cluster {
  id:           string;
  label:        string;
  postcodeArea: string;
  centLat:      number;
  centLng:      number;
  stops:        StopForCluster[];
  totalWeightKg:    number;
  totalQty:         number;
  primaryQtyUnit:   string | null;
  hasTimeWindows:   boolean;
  earliestWindow:   Date | null;
  latestWindow:     Date | null;
}

function clusterStops(stops: StopForCluster[], radiusKm = 5): Cluster[] {
  const clusters: Cluster[] = [];
  const assigned = new Set<number>();

  for (const stop of stops) {
    if (assigned.has(stop.id)) continue;

    // Find an existing cluster whose centroid is within radiusKm
    let target: Cluster | null = null;
    if (stop.lat != null && stop.lng != null) {
      for (const c of clusters) {
        if (haversineKm(c.centLat, c.centLng, stop.lat, stop.lng) <= radiusKm) {
          target = c;
          break;
        }
      }
    }

    if (!target) {
      // Postcode area fallback — same first 2-4 chars of postcode
      const area = stop.postcode?.replace(/\s.*$/, "").replace(/\d+$/, "").toUpperCase() ?? "??";
      // Try to find cluster with same postcode area and no GPS
      if (stop.lat == null) {
        target = clusters.find(c => c.postcodeArea === area) ?? null;
      }
      if (!target) {
        target = {
          id:            `cl_${clusters.length + 1}`,
          label:         area,
          postcodeArea:  area,
          centLat:       stop.lat ?? 0,
          centLng:       stop.lng ?? 0,
          stops:         [],
          totalWeightKg: 0,
          totalQty:      0,
          primaryQtyUnit: stop.quantityUnit ?? null,
          hasTimeWindows: false,
          earliestWindow: null,
          latestWindow:   null,
        };
        clusters.push(target);
      }
    }

    target.stops.push(stop);
    assigned.add(stop.id);

    // Recompute centroid
    const lats = target.stops.filter(s => s.lat != null).map(s => s.lat!);
    const lngs = target.stops.filter(s => s.lng != null).map(s => s.lng!);
    if (lats.length) {
      target.centLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      target.centLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
    }

    // Accumulate stats
    if (stop.weight)   target.totalWeightKg += stop.weight;
    if (stop.quantity) target.totalQty      += stop.quantity;
    if (stop.timeWindowStart || stop.timeWindowEnd) {
      target.hasTimeWindows = true;
      const t = stop.timeWindowStart ?? stop.timeWindowEnd!;
      if (!target.earliestWindow || t < target.earliestWindow) target.earliestWindow = t;
      const te = stop.timeWindowEnd ?? stop.timeWindowStart!;
      if (!target.latestWindow || te > target.latestWindow) target.latestWindow = te;
    }
    if (!target.primaryQtyUnit && stop.quantityUnit) target.primaryQtyUnit = stop.quantityUnit;
  }

  return clusters;
}

// ── Route helpers ─────────────────────────────────────────────────────────────

const RUN_INCLUDE = {
  assignments: {
    where:   { removedAt: null },
    include: {
      jobPart: {
        include: {
          job: {
            select: {
              id: true, jobReference: true, customerName: true,
              goodsType: true, goodsDescription: true,
              quantity: true, quantityUnit: true, weight: true,
            },
          },
        },
      },
    },
    orderBy: { sequenceNumber: "asc" as const },
  },
  waypoints: {
    include: {
      location: {
        select: { id: true, name: true, siteName: true, postcode: true, lat: true, lng: true },
      },
    },
    orderBy: { sequenceNumber: "asc" as const },
  },
  driver:    { include: { user: { select: { id: true, name: true, email: true } } } },
  dependsOn: { select: { id: true, runReference: true, status: true } },
  dependents:{ select: { id: true, runReference: true, status: true } },
};

export async function planningRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {

  // ── GET /planning/unplanned ───────────────────────────────────────────────
  app.get(
    "/planning/unplanned",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;
      const q = request.query as { date?: string };

      // Find all ready_to_plan job stops not yet assigned to any active run.
      //
      // Filtering strategy — each stop surfaces on the date it needs to happen:
      //   1. Stop has a timeWindowStart   → use that date
      //   2. Stop has no window but bookedTime → use bookedTime date
      //   3. Neither                     → fall back to the job's plannedDate
      //
      // This ensures a Monday collection + Friday delivery show on their
      // respective boards so planners can assign each leg on the right day.

      const jobPartInclude = {
        job: {
          select: {
            id: true, jobReference: true, customerName: true,
            goodsType: true, goodsDescription: true,
            quantity: true, quantityUnit: true, weight: true,
          },
        },
      };

      const baseWhere = {
        companyId,
        // Show stops from jobs that are ready to plan OR already partially in a run (in_planning).
        // "planned" / "in_progress" / "completed" jobs are excluded — they're done.
        job:            { status: { in: ["ready_to_plan", "in_planning"] as string[] } },
        runAssignments: { none: { removedAt: null as null } },
      };

      let parts: Awaited<ReturnType<typeof prisma.jobPart.findMany<{ include: typeof jobPartInclude }>>>;

      if (q.date) {
        const gte = new Date(`${q.date}T00:00:00.000Z`);
        const lte = new Date(`${q.date}T23:59:59.999Z`);

        // Two separate queries to avoid Prisma OR + nested relation conflicts.
        const [withWindow, fallback] = await Promise.all([
          // Stops that have their own time window on this date
          prisma.jobPart.findMany({
            where:   { ...baseWhere, timeWindowStart: { gte, lte } },
            include: jobPartInclude,
            orderBy: [{ timeWindowStart: "asc" }, { id: "asc" }],
          }),
          // Stops with no time window → use job plannedDate or bookedTime
          prisma.jobPart.findMany({
            where: {
              ...baseWhere,
              timeWindowStart: null,
              OR: [
                { bookedTime: { gte, lte } },
                { bookedTime: null, job: { status: { in: ["ready_to_plan", "in_planning"] as string[] }, plannedDate: { gte, lte } } },
              ],
            },
            include: jobPartInclude,
            orderBy: [{ bookedTime: "asc" }, { id: "asc" }],
          }),
        ]);

        // Merge and deduplicate (a stop can't appear twice, but be safe)
        const seen = new Set<number>();
        parts = [];
        for (const p of [...withWindow, ...fallback]) {
          if (!seen.has(p.id)) { seen.add(p.id); (parts as typeof withWindow).push(p); }
        }
      } else {
        parts = await prisma.jobPart.findMany({
          where:   baseWhere,
          include: jobPartInclude,
          orderBy: [{ timeWindowStart: "asc" }, { id: "asc" }],
        });
      }

      const stops: StopForCluster[] = parts.map(p => ({
        id:             p.id,
        jobId:          p.jobId,
        jobReference:   p.job.jobReference,
        customerName:   p.job.customerName,
        type:           p.type,
        sequenceNumber: p.sequenceNumber,
        siteName:       p.siteName ?? p.locationTextSnapshot,
        town:           p.town ?? null,
        locationText:   p.locationTextSnapshot,
        postcode:       p.postcode ?? null,
        lat:            p.lat ? Number(p.lat) : null,
        lng:            p.lng ? Number(p.lng) : null,
        timeWindowStart: p.timeWindowStart,
        timeWindowEnd:   p.timeWindowEnd,
        bookedTime:      p.bookedTime,
        goodsType:      p.job.goodsType,
        weight:         p.job.weight    ? Number(p.job.weight)    : null,
        quantity:       p.job.quantity  ? Number(p.job.quantity)  : null,
        quantityUnit:   (p.job as any).quantityUnit ?? null,
      }));

      const clusters = clusterStops(stops);
      return reply.send({ clusters, total: stops.length });
    },
  );

  // ── GET /planning/runs ────────────────────────────────────────────────────
  app.get(
    "/planning/runs",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;
      const q = request.query as { date?: string };

      const where = {
        companyId,
        ...(q.date ? {
          plannedDate: {
            gte: new Date(`${q.date}T00:00:00.000Z`),
            lte: new Date(`${q.date}T23:59:59.999Z`),
          },
        } : {}),
        status: { notIn: ["cancelled"] as string[] },
      };

      const runs = await prisma.run.findMany({
        where,
        include: RUN_INCLUDE,
        orderBy: [{ estimatedStartTime: "asc" }, { id: "asc" }],
      });

      return reply.send({ runs });
    },
  );

  // ── POST /planning/runs ───────────────────────────────────────────────────
  app.post(
    "/planning/runs",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId, userId } = request.user!;
      const b = request.body as {
        date:              string;
        runType?:          string;
        plannerNotes?:     string;
        assignedTrailerId?: number;
        assignedDriverId?:  number;
        dependsOnRunId?:    number;
      };

      if (!b.date) return reply.status(400).send({ error: "date is required" });

      const run = await prisma.$transaction(async tx => {
        const ref = await generateRunReference(companyId, new Date(b.date).getFullYear(), tx as unknown as PrismaClient);
        return (tx as unknown as PrismaClient).run.create({
          data: {
            companyId,
            runReference:      ref,
            status:            "draft",
            runType:           b.runType ?? "direct",
            plannedDate:       new Date(`${b.date}T12:00:00.000Z`),
            plannerNotes:      b.plannerNotes?.trim() || null,
            assignedTrailerId: b.assignedTrailerId ?? null,
            assignedDriverId:  b.assignedDriverId  ?? null,
            dependsOnRunId:    b.dependsOnRunId    ?? null,
            createdBy:         userId,
          },
          include: RUN_INCLUDE,
        });
      });

      return reply.status(201).send(run);
    },
  );

  // ── PATCH /planning/runs/:id ──────────────────────────────────────────────
  app.patch(
    "/planning/runs/:id",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;
      const id = parseInt((request.params as { id: string }).id, 10);
      const b  = request.body as {
        runType?:           string | null;
        dependsOnRunId?:    number | null;
        assignedTrailerId?: number | null;
        assignedDriverId?:  number | null;
        assignedTruckId?:   number | null;
        plannerNotes?:      string | null;
        estimatedStartTime?: string | null;
        estimatedEndTime?:   string | null;
        status?:            string;
      };

      const run = await prisma.run.findFirst({ where: { id, companyId } });
      if (!run) return reply.status(404).send({ error: "Run not found" });

      // When cancelling a run, release all active assignments so the job parts
      // return to the unplanned pool immediately, then revert job statuses.
      if (b.status === "cancelled") {
        const affectedJobIds = (await prisma.runAssignment.findMany({
          where:  { runId: id, companyId, removedAt: null },
          select: { jobId: true },
        })).map(a => a.jobId);

        await prisma.runAssignment.updateMany({
          where: { runId: id, companyId, removedAt: null },
          data:  { removedAt: new Date() },
        });
        await syncJobPlanningStatuses([...new Set(affectedJobIds)], companyId, prisma);
      }

      const updated = await prisma.run.update({
        where: { id },
        data: {
          ...(b.runType           !== undefined ? { runType:           b.runType }           : {}),
          ...(b.dependsOnRunId    !== undefined ? { dependsOnRunId:    b.dependsOnRunId }    : {}),
          ...(b.assignedTrailerId !== undefined ? { assignedTrailerId: b.assignedTrailerId } : {}),
          ...(b.assignedDriverId  !== undefined ? { assignedDriverId:  b.assignedDriverId }  : {}),
          ...(b.assignedTruckId   !== undefined ? { assignedTruckId:   b.assignedTruckId }   : {}),
          ...(b.plannerNotes      !== undefined ? { plannerNotes:      b.plannerNotes?.trim() || null } : {}),
          ...(b.estimatedStartTime !== undefined ? { estimatedStartTime: b.estimatedStartTime } : {}),
          ...(b.estimatedEndTime   !== undefined ? { estimatedEndTime:   b.estimatedEndTime }   : {}),
          ...(b.status            !== undefined ? { status:            b.status }            : {}),
        },
        include: RUN_INCLUDE,
      });

      return reply.send(updated);
    },
  );

  // ── POST /planning/runs/:id/assignments ───────────────────────────────────
  app.post(
    "/planning/runs/:id/assignments",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId, userId } = request.user!;
      const runId = parseInt((request.params as { id: string }).id, 10);
      const b     = request.body as { jobPartId: number; quantityAssigned?: number };

      if (!b.jobPartId) return reply.status(400).send({ error: "jobPartId is required" });

      const run = await prisma.run.findFirst({ where: { id: runId, companyId } });
      if (!run) return reply.status(404).send({ error: "Run not found" });

      const part = await prisma.jobPart.findFirst({ where: { id: b.jobPartId, companyId } });
      if (!part) return reply.status(404).send({ error: "Stop not found" });

      // Check not already actively assigned to another run
      const existing = await prisma.runAssignment.findFirst({
        where: { jobPartId: b.jobPartId, companyId, removedAt: null },
      });
      if (existing && existing.runId !== runId) {
        return reply.status(409).send({ error: "Stop is already assigned to another run" });
      }
      if (existing && existing.runId === runId) {
        return reply.status(409).send({ error: "Stop is already on this run" });
      }

      // Get next sequence number
      const maxSeq = await prisma.runAssignment.aggregate({
        where:   { runId, removedAt: null },
        _max:    { sequenceNumber: true },
      });
      const nextSeq = (maxSeq._max.sequenceNumber ?? 0) + 1;

      const assignment = await prisma.runAssignment.create({
        data: {
          companyId,
          runId,
          jobPartId: b.jobPartId,
          jobId:     part.jobId,
          sequenceNumber:   nextSeq,
          quantityAssigned: b.quantityAssigned ?? Number(part.quantityRequired ?? 0),
          quantityUnit:     part.quantityUnit  ?? "",
          status:           "pending",
          addedBy:          userId,
        },
      });

      // Refresh derived requirements then advance job to in_planning
      await recalcDerived(runId, companyId, prisma);
      await syncJobPlanningStatuses([part.jobId], companyId, prisma);

      const updated = await prisma.run.findFirst({ where: { id: runId }, include: RUN_INCLUDE });
      return reply.status(201).send({ assignment, run: updated });
    },
  );

  // ── DELETE /planning/runs/:id/assignments/:aId ────────────────────────────
  app.delete(
    "/planning/runs/:id/assignments/:aId",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId, userId } = request.user!;
      const runId = parseInt((request.params as { id: string; aId: string }).id,  10);
      const aId   = parseInt((request.params as { id: string; aId: string }).aId, 10);

      const a = await prisma.runAssignment.findFirst({
        where: { id: aId, runId, companyId, removedAt: null },
      });
      if (!a) return reply.status(404).send({ error: "Assignment not found" });

      await prisma.runAssignment.update({
        where: { id: aId },
        data:  { removedAt: new Date(), removedBy: userId },
      });

      await recalcDerived(runId, companyId, prisma);
      // Revert job to ready_to_plan if this was its last active assignment
      await syncJobPlanningStatuses([a.jobId], companyId, prisma);

      const updated = await prisma.run.findFirst({ where: { id: runId }, include: RUN_INCLUDE });
      return reply.send(updated);
    },
  );

  // ── POST /planning/runs/:id/publish ──────────────────────────────────────
  app.post(
    "/planning/runs/:id/publish",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;
      const id = parseInt((request.params as { id: string }).id, 10);

      const run = await prisma.run.findFirst({
        where:   { id, companyId },
        include: { assignments: { where: { removedAt: null } } },
      });
      if (!run) return reply.status(404).send({ error: "Run not found" });
      if (run.assignments.length === 0) {
        return reply.status(400).send({ error: "NO_STOPS", message: "Add at least one stop before publishing." });
      }

      const updated = await prisma.run.update({
        where: { id },
        data:  { status: "assigned", publishedToDriver: true },
        include: RUN_INCLUDE,
      });

      return reply.send(updated);
    },
  );

  // ── POST /planning/runs/:id/waypoints ────────────────────────────────────
  //
  // Add a non-job waypoint to a run (depot start, yard pickup, hub drop, etc.)
  // Body: { waypointType, locationId?, locationText?, postcode?, lat?, lng?,
  //         scheduledTime?, notes?, sequenceNumber? }
  app.post(
    "/planning/runs/:id/waypoints",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;
      const runId = parseInt((request.params as { id: string }).id, 10);

      const run = await prisma.run.findFirst({ where: { id: runId, companyId } });
      if (!run) return reply.status(404).send({ error: "Run not found" });

      const b = request.body as {
        waypointType?:  string;
        locationId?:    number | null;
        locationText?:  string;
        postcode?:      string;
        lat?:           number;
        lng?:           number;
        scheduledTime?: string;
        notes?:         string;
        sequenceNumber?: number;
      };

      // If linked to a SavedLocation, pull its coords automatically
      let lat = typeof b.lat === "number" ? b.lat : null;
      let lng = typeof b.lng === "number" ? b.lng : null;
      let postcode = b.postcode?.trim() || null;
      let locationText = b.locationText?.trim() || null;

      if (b.locationId) {
        const loc = await prisma.savedLocation.findFirst({
          where: { id: b.locationId, companyId },
          select: { lat: true, lng: true, postcode: true, siteName: true, name: true },
        });
        if (loc) {
          if (loc.lat) lat = Number(loc.lat);
          if (loc.lng) lng = Number(loc.lng);
          if (loc.postcode) postcode = loc.postcode;
          if (!locationText) locationText = loc.siteName ?? loc.name;
        }
      }

      const waypoint = await prisma.runWaypoint.create({
        data: {
          companyId,
          runId,
          waypointType:   b.waypointType ?? "custom",
          locationId:     b.locationId   ?? null,
          locationText,
          postcode,
          lat,
          lng,
          scheduledTime:  b.scheduledTime?.trim() || null,
          notes:          b.notes?.trim()         || null,
          sequenceNumber: b.sequenceNumber        ?? 0,
        },
        include: {
          location: {
            select: { id: true, name: true, siteName: true, postcode: true, lat: true, lng: true },
          },
        },
      });

      return reply.status(201).send(waypoint);
    },
  );

  // ── DELETE /planning/runs/:id/waypoints/:wId ──────────────────────────────
  app.delete(
    "/planning/runs/:id/waypoints/:wId",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;
      const runId = parseInt((request.params as { id: string; wId: string }).id,  10);
      const wId   = parseInt((request.params as { id: string; wId: string }).wId, 10);

      const run = await prisma.run.findFirst({ where: { id: runId, companyId } });
      if (!run) return reply.status(404).send({ error: "Run not found" });

      const waypoint = await prisma.runWaypoint.findFirst({
        where: { id: wId, runId, companyId },
      });
      if (!waypoint) return reply.status(404).send({ error: "Waypoint not found" });

      await prisma.runWaypoint.delete({ where: { id: wId } });
      return reply.status(204).send();
    },
  );

  // ── GET /planning/fleet ───────────────────────────────────────────────────
  app.get(
    "/planning/fleet",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;

      const [trailers, trucks] = await Promise.all([
        prisma.fleetTrailer.findMany({
          where:   { companyId, status: { not: "disposed" } },
          orderBy: { registration: "asc" },
        }),
        prisma.fleetUnit.findMany({
          where:   { companyId, status: { not: "disposed" } },
          orderBy: { registration: "asc" },
        }),
      ]);

      return reply.send({ trailers, trucks });
    },
  );

  // ── GET /planning/drivers ─────────────────────────────────────────────────
  app.get(
    "/planning/drivers",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;
      const q = request.query as { date?: string };

      const drivers = await prisma.driverProfile.findMany({
        where:   { companyId, status: "active" },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { displayName: "asc" },
      });

      return reply.send({ drivers });
    },
  );
}

// ── Recalculate derived run requirements ──────────────────────────────────────

async function generateRunReference(
  companyId: number,
  year: number,
  tx: PrismaClient,
): Promise<string> {
  const company = await tx.company.update({
    where:  { id: companyId },
    data:   { nextRunSequence: { increment: 1 } },
    select: { nextRunSequence: true },
  });
  const seq = (company.nextRunSequence - 1).toString().padStart(6, "0");
  return `RUN-${year}-${seq}`;
}

async function recalcDerived(runId: number, companyId: number, prisma: PrismaClient): Promise<void> {
  const activeAssignments = await prisma.runAssignment.findMany({
    where:   { runId, companyId, removedAt: null },
    include: { jobPart: true },
  });
  const parts = activeAssignments.map(a => a.jobPart);
  const hasHazardous       = parts.some(p => p.hazardous);
  const hasTemperatureLoad = parts.some(p => p.temperatureControlled);
  const hasOversized       = parts.some(p => p.oversized);
  const totalWeight        = parts.reduce((s, p) => s + (p.stopWeight ? Number(p.stopWeight) : 0), 0);
  let requiredTrailerType: string | null = null;
  if (hasTemperatureLoad) requiredTrailerType = "temperature_controlled";
  else if (hasOversized)  requiredTrailerType = "curtainsider_or_flatbed";
  await prisma.run.update({
    where: { id: runId },
    data:  {
      hasHazardous,
      hasTemperatureLoad,
      hasOversized,
      maxLoadWeight:       totalWeight > 0 ? totalWeight : null,
      requiredTrailerType,
    },
  });
}

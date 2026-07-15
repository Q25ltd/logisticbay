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
import { getPlannerWorkItems }       from "../services/plannerWorkService.js";
import { haversineKm }               from "../lib/geo.js";
import { cancelRun, recalculateDerivedRequirements, partQuantityLedger, ledgerBreakdownText } from "../services/runService.js";
import { parseIdParam }              from "../lib/validate.js";
import { dayRangeUtc }               from "../lib/dateUtils.js";
import { RUN_STATUSES, type RunStatus } from "../sync/runStatuses.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { recomputeRunCompatibility, validateFleetAssignment } from "../lib/runCompatibility.js";
import { loadRunReadiness } from "../services/runReadinessService.js";
import { buildProposals, type ProposalStop } from "../services/proposeRunsService.js";
import { checkRun } from "../services/checkRunService.js";
import { buildFleetCapacityProfile } from "../lib/loadCapacity.js";

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
  // plannedDate removed from Job — date comes from stop timeWindowStart (E.2)
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
              stackable: true, vehicleCategory: true, minGvwClass: true,
              hazardClass: true, tempControlled: true, tempRange: true,
              specialRequirements: true,
              status: true,
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
      const q = request.query as { date?: string; dateFrom?: string; dateTo?: string };

      // Resolve the effective date range.
      // Supports three modes:
      //   ?date=YYYY-MM-DD                  → single day  (original)
      //   ?dateFrom=YYYY-MM-DD&dateTo=…     → explicit range (multi-day)
      //   (no params)                       → no date filter, all unplanned
      const dateFrom = q.dateFrom ?? q.date;
      const dateTo   = q.dateTo   ?? q.date;

      // Find all ready_to_plan / in_planning job stops not yet assigned to any active run.
      // Date-placement: timeWindowStart is the sole date source (E.2 — plannedDate removed).

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
        job:            { status: { in: ["ready_to_plan", "in_planning"] as string[] } },
        runAssignments: { none: { removedAt: null as null } },
      };

      let parts: Awaited<ReturnType<typeof prisma.jobPart.findMany<{ include: typeof jobPartInclude }>>>;

      if (dateFrom && dateTo) {
        const { gte, lte } = dayRangeUtc(dateFrom, dateTo);

        const [withWindow, withBookedTime] = await Promise.all([
          // Q1: timeWindowStart in range
          prisma.jobPart.findMany({
            where: { ...baseWhere, timeWindowStart: { gte, lte } },
            include: jobPartInclude,
            orderBy: [{ timeWindowStart: "asc" }, { id: "asc" }],
          }),
          // Q2: no timeWindowStart but bookedTime in range
          prisma.jobPart.findMany({
            where: { ...baseWhere, timeWindowStart: null, bookedTime: { gte, lte } },
            include: jobPartInclude,
            orderBy: [{ bookedTime: "asc" }, { id: "asc" }],
          }),
        ]);

        const seen = new Set<number>();
        parts = [];
        for (const p of [...withWindow, ...withBookedTime]) {
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
        quantityUnit:   p.job.quantityUnit ?? null,
        plannedDate:    null, // removed — timeWindowStart is the date source (E.2)
      }));

      const clusters = clusterStops(stops);
      return reply.send({ clusters, total: stops.length });
    },
  );

  // ── GET /planning/propose-runs — A3 proposal-first ─────────────────────────
  // Deterministic, ADVISORY candidate runs (corridor + compatibility grouping,
  // strategy + "why"), each scored by the planning check (confidence + detour).
  // Creates nothing — the planner accepts a proposal via the normal run endpoints.
  app.get(
    "/planning/propose-runs",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;
      const q = request.query as { date?: string; dateFrom?: string; dateTo?: string };
      const dateFrom = q.dateFrom ?? q.date;
      const dateTo   = q.dateTo   ?? q.date;

      const baseWhere = {
        companyId,
        job:            { status: { in: ["ready_to_plan", "in_planning"] as string[] } },
        runAssignments: { none: { removedAt: null as null } },
      };
      const where = dateFrom && dateTo
        ? { ...baseWhere, timeWindowStart: dayRangeUtc(dateFrom, dateTo) }
        : baseWhere;

      const parts = await prisma.jobPart.findMany({
        where,
        include: { job: { select: { id: true, customerName: true, goodsType: true, stackable: true, weight: true, vehicleCategory: true, minGvwClass: true, hazardClass: true, tempControlled: true, tempRange: true, specialRequirements: true } } },
        orderBy: [{ timeWindowStart: "asc" }, { id: "asc" }],
      });

      // Q5a — pallet count a stop picks up (only collections carry a footprint).
      const palletsOf = (p: typeof parts[number]): number | null => {
        const isPallets = (p.quantityUnit ?? "").toLowerCase().includes("pallet");
        if (isPallets && p.quantityRequired != null) return Number(p.quantityRequired);
        return p.numPallets ?? null;
      };

      // Load flags come from the JOB-level intake fields — the forms capture
      // hazard/temperature/oversized there (four-intake-gates rule).
      const jobSpecial = (p: typeof parts[number]): string[] =>
        Array.isArray(p.job.specialRequirements) ? (p.job.specialRequirements as string[]) : [];

      const stops: ProposalStop[] = parts.map(p => ({
        jobId:          p.jobId,
        jobPartId:      p.id,
        type:           p.type,
        customerName:   p.job.customerName,
        postcode:       p.postcode ?? null,
        lat:            p.lat != null ? Number(p.lat) : null,
        lng:            p.lng != null ? Number(p.lng) : null,
        hazardous:      !!p.job.hazardClass?.trim() || jobSpecial(p).includes("dangerous_goods"),
        tempControlled: p.job.tempControlled,
        tempRange:      p.job.tempRange,
        oversized:      jobSpecial(p).includes("oversized"),
        goodsType:      p.job.goodsType,
        pallets:        palletsOf(p),
        stackable:      p.job.stackable,
        weightKg:       p.job.weight,
        vehicleCategory: p.job.vehicleCategory,
        minGvwClass:    p.job.minGvwClass,
      }));

      const proposals = buildProposals(stops);

      // Q5a — fleet-aware capacity profile (available trailers only).
      const fleetTrailers = await prisma.fleetTrailer.findMany({
        where:  { companyId, status: { notIn: ["disposed"] } },
        select: { trailerType: true, trailerLength: true, lengthM: true, decks: true, status: true },
      });
      const fleet = buildFleetCapacityProfile(fleetTrailers);

      // Score each candidate with the planning check (detour now; confidence once
      // the planner sets a start time). Compatibility is already on the proposal.
      const scored = await Promise.all(proposals.map(async (pr) => {
        const check = await checkRun({
          stops: pr.stops.map((s, i) => ({
            sequenceNumber: i + 1, type: s.type, postcode: s.postcode, lat: s.lat, lng: s.lng,
            hazardous: s.hazardous, tempControlled: s.tempControlled, tempRange: s.tempRange,
            oversized: s.oversized, goodsType: s.goodsType, jobId: s.jobId,
            pallets: s.pallets, stackable: s.stackable,
            weightKg: s.weightKg, reqVehicleCategory: s.vehicleCategory, reqMinGvwClass: s.minGvwClass,
          })),
          fleet,
        });
        return { ...pr, confidence: check.confidence, geometry: check.geometry };
      }));

      return reply.send({ proposals: scored, total: stops.length });
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
        ...(q.date ? { plannedDate: dayRangeUtc(q.date, q.date) } : {}),
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

      if (!b.date) return badRequest(reply, "BAD_REQUEST", "date is required");

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
      const { companyId, userId } = request.user!;
      const id = parseIdParam(request.params);
      if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
      const b  = request.body as {
        runType?:            string | null;
        dependsOnRunId?:     number | null;
        assignedTrailerId?:  number | null;
        assignedDriverId?:   number | null;
        assignedTruckId?:    number | null;
        plannerNotes?:       string | null;
        estimatedStartTime?: string | null;
        estimatedEndTime?:   string | null;
        status?:             string;
        publishedToDriver?:  boolean;
      };

      const run = await prisma.run.findFirst({ where: { id, companyId } });
      if (!run) return notFound(reply, "Run");

      // Validate status if provided (C.7 fix — reject "banana" statuses)
      if (b.status !== undefined && !RUN_STATUSES.includes(b.status as RunStatus)) {
        return badRequest(reply, "INVALID_RUN_STATUS", `status must be one of: ${RUN_STATUSES.join(", ")}`);
      }

      // When cancelling a run, delegate to the shared cancelRun service.
      // This fixes A.7 (duplicate logic), B.4 (LoadTrack preserved), B.15 (now transactional).
      if (b.status === "cancelled") {
        await prisma.$transaction(async (tx) => {
          await cancelRun(tx, { runId: id, companyId, actorUserId: userId, reason: "run_cancelled_by_planner" });
        });
      }

      // Step 5: validate truck/trailer belong to this company (status → warning).
      const vehicleChanged = b.assignedTrailerId !== undefined || b.assignedTruckId !== undefined;
      let fleetWarnings: string[] = [];
      if (vehicleChanged) {
        const fv = await validateFleetAssignment(
          prisma, companyId,
          b.assignedTruckId   !== undefined ? (b.assignedTruckId   ?? null) : undefined,
          b.assignedTrailerId !== undefined ? (b.assignedTrailerId ?? null) : undefined,
        );
        if (!fv.ok) return badRequest(reply, fv.code ?? "FLEET_INVALID", fv.message ?? "Invalid vehicle assignment");
        fleetWarnings = fv.warnings;
      }

      await prisma.run.update({
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
          ...(b.publishedToDriver !== undefined ? { publishedToDriver: b.publishedToDriver } : {}),
        },
      });

      // Step 5: recompute compatibility if the truck/trailer changed.
      if (vehicleChanged) await recomputeRunCompatibility(prisma, id, companyId);

      const updated = await prisma.run.findFirst({ where: { id, companyId }, include: RUN_INCLUDE });
      return reply.send(fleetWarnings.length ? { ...updated, warning: fleetWarnings.join(" ") } : updated);
    },
  );

  // ── POST /planning/runs/:id/assignments ───────────────────────────────────
  app.post(
    "/planning/runs/:id/assignments",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId, userId } = request.user!;
      const runId = parseIdParam(request.params);
      if (runId === null) return badRequest(reply, "BAD_REQUEST", "runId must be a valid integer");
      const b     = request.body as { jobPartId: number; quantityAssigned?: number };

      if (!b.jobPartId) return badRequest(reply, "BAD_REQUEST", "jobPartId is required");

      const run = await prisma.run.findFirst({ where: { id: runId, companyId } });
      if (!run) return notFound(reply, "Run");

      const part = await prisma.jobPart.findFirst({ where: { id: b.jobPartId, companyId } });
      if (!part) return notFound(reply, "Stop");

      // Quantity ledger: a part may sit on SEVERAL runs (split / multi-trip —
      // same driver, several trips) while the shares never exceed the total.
      const dupOnThisRun = await prisma.runAssignment.findFirst({
        where: { jobPartId: b.jobPartId, runId, companyId, removedAt: null },
      });
      if (dupOnThisRun) return conflict(reply, "CONFLICT", "Stop is already on this run");

      const ledger = await partQuantityLedger(prisma, companyId, b.jobPartId);
      if (!ledger) return notFound(reply, "Stop");
      if (ledger.total == null && ledger.breakdown.length > 0) {
        return conflict(reply, "CONFLICT", `Stop is already on ${ledger.breakdown[0].runReference} and has no quantity to split.`);
      }
      if (ledger.total != null && (ledger.remaining ?? 0) <= 0) {
        return conflict(reply, "FULLY_ASSIGNED", `All ${ledger.total} ${part.quantityUnit || "units"} of this stop are already on runs (${ledgerBreakdownText(ledger)}).`);
      }
      const requestedQty = b.quantityAssigned ?? ledger.remaining ?? Number(part.quantityRequired ?? 0);
      if (ledger.total != null && requestedQty > (ledger.remaining ?? 0)) {
        return badRequest(reply, "OVER_ASSIGNED", `Only ${ledger.remaining} of ${ledger.total} ${part.quantityUnit || "units"} remain unassigned (${ledgerBreakdownText(ledger)}) — cannot assign ${requestedQty}.`);
      }

      // Get next sequence number
      // Include ALL assignments (even soft-deleted) so we never reuse a
      // sequenceNumber that still exists in the table — the @@unique([runId,
      // sequenceNumber]) constraint does not exempt removed rows.
      const maxSeq = await prisma.runAssignment.aggregate({
        where: { runId },
        _max:  { sequenceNumber: true },
      });
      const nextSeq = (maxSeq._max.sequenceNumber ?? 0) + 1;

      const assignment = await prisma.runAssignment.create({
        data: {
          companyId,
          runId,
          jobPartId: b.jobPartId,
          jobId:     part.jobId,
          sequenceNumber:   nextSeq,
          quantityAssigned: requestedQty,
          quantityUnit:     part.quantityUnit  ?? "",
          status:           "not_started",   // EXECUTION_STATES initial (Step 1)
          addedBy:          userId,
        },
      });

      // Refresh derived requirements then advance job to in_planning
      await recalculateDerivedRequirements(runId, companyId, prisma);
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
      const runId = parseIdParam(request.params);
      if (runId === null) return badRequest(reply, "BAD_REQUEST", "runId must be a valid integer");
      const aId   = parseIdParam(request.params, "aId");
      if (aId === null) return badRequest(reply, "BAD_REQUEST", "aId must be a valid integer");

      const a = await prisma.runAssignment.findFirst({
        where: { id: aId, runId, companyId, removedAt: null },
      });
      if (!a) return notFound(reply, "Assignment");

      await prisma.runAssignment.update({
        where: { id: aId },
        data:  { removedAt: new Date(), removedBy: userId },
      });

      await recalculateDerivedRequirements(runId, companyId, prisma);
      // Revert job to ready_to_plan if this was its last active assignment
      await syncJobPlanningStatuses([a.jobId], companyId, prisma);

      const updated = await prisma.run.findFirst({ where: { id: runId }, include: RUN_INCLUDE });
      return reply.send(updated);
    },
  );

  // ── PATCH /planning/runs/:id/assignments/reorder ─────────────────────────
  // Body: { assignmentIds: number[] }  — active assignment IDs in desired order.
  // Updates each assignment's sequenceNumber to (index+1)*1000 so waypoints can
  // still be inserted between stops.  Only active (removedAt=null) assignments
  // belonging to this run are accepted.
  app.patch(
    "/planning/runs/:id/assignments/reorder",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;
      const runId = parseIdParam(request.params);
      if (runId === null) return badRequest(reply, "BAD_REQUEST", "runId must be a valid integer");
      const { assignmentIds } = request.body as { assignmentIds: number[] };

      if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
        return badRequest(reply, "BAD_REQUEST", "assignmentIds must be a non-empty array");
      }

      // Verify run belongs to this company
      const run = await prisma.run.findFirst({ where: { id: runId, companyId }, select: { id: true } });
      if (!run) return notFound(reply, "Run");

      // Verify every supplied ID is an active assignment on this run
      const active = await prisma.runAssignment.findMany({
        where: { id: { in: assignmentIds }, runId, companyId, removedAt: null },
        select: { id: true },
      });
      if (active.length !== assignmentIds.length) {
        return badRequest(reply, "BAD_REQUEST", "One or more assignment IDs are invalid or already removed");
      }

      // Space assignments at 1000, 2000, 3000 …
      // Depot-start waypoints sit at seq=0, return-to-base at 999999, so this
      // range keeps everything in the right visual order.
      await prisma.$transaction(
        assignmentIds.map((id, idx) =>
          prisma.runAssignment.updateMany({ where: { id, companyId }, data: { sequenceNumber: (idx + 1) * 1000 } })
        )
      );

      const updated = await prisma.run.findFirst({ where: { id: runId }, include: RUN_INCLUDE });
      return reply.send({ run: updated });
    },
  );

  // ── POST /planning/runs/:id/publish ──────────────────────────────────────
  app.post(
    "/planning/runs/:id/publish",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;
      const id = parseIdParam(request.params);
      if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");

      const run = await prisma.run.findFirst({
        where:   { id, companyId },
        include: { assignments: { where: { removedAt: null } } },
      });
      if (!run) return notFound(reply, "Run");
      if (run.assignments.length === 0) {
        return badRequest(reply, "NO_STOPS", "Add at least one stop before publishing.");
      }

      // Step 5 (D5.3): enforce vehicle compatibility at publish, with override.
      if (!run.compatibilityOverridden && (!run.trailerCompatible || !run.vehicleCompatible)) {
        return badRequest(reply, "COMPATIBILITY_FAILED", "Cannot publish: vehicle compatibility check failed", {
          trailerCompatible: run.trailerCompatible,
          vehicleCompatible: run.vehicleCompatible,
          overrideAllowed:   true,
        });
      }

      // B5 — hard resource gate (same as POST /runs/:id/publish): refuse publish
      // while any HARD readiness check fails; soft/unknown never block.
      const loaded = await loadRunReadiness(prisma, companyId, id);
      if (loaded && !loaded.readiness.ready) {
        return badRequest(reply, "RESOURCE_NOT_READY",
          `Cannot publish: ${loaded.readiness.blockers.join(" · ") || "run is not ready"}`,
          { blockers: loaded.readiness.blockers });
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
      const runId = parseIdParam(request.params);
      if (runId === null) return badRequest(reply, "BAD_REQUEST", "runId must be a valid integer");

      const run = await prisma.run.findFirst({ where: { id: runId, companyId } });
      if (!run) return notFound(reply, "Run");

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

      // ── Determine insertion sequence number ──────────────────────────────
      // We need the waypoint to land at the correct position in the combined
      // timeline (assignments + waypoints sorted by sequenceNumber).
      // Strategy: fetch all existing items, renumber them with a step of 1000
      // if needed to create gaps, then place the new waypoint at the midpoint
      // between its neighbours.

      const desiredSeq = b.sequenceNumber ?? 0;

      // Fetch all items in the run sorted by seq
      const [existingAssignments, existingWaypoints] = await Promise.all([
        prisma.runAssignment.findMany({ where: { runId }, select: { id: true, sequenceNumber: true } }),
        prisma.runWaypoint.findMany({ where: { runId }, select: { id: true, sequenceNumber: true } }),
      ]);

      // Build combined sorted list
      type SeqItem = { kind: "a" | "w"; id: number; sequenceNumber: number };
      const combined: SeqItem[] = [
        ...existingAssignments.map(a => ({ kind: "a" as const, id: a.id, sequenceNumber: a.sequenceNumber })),
        ...existingWaypoints.map(w => ({ kind: "w" as const, id: w.id, sequenceNumber: w.sequenceNumber })),
      ].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

      // Check if there's a gap around the desired insertion point.
      // Find neighbours: items immediately before and after desiredSeq.
      const prevItem = [...combined].filter(i => i.sequenceNumber <= desiredSeq).pop();
      const nextItem = combined.find(i => i.sequenceNumber > desiredSeq);

      const prevSeq = prevItem?.sequenceNumber ?? -1000;
      const nextSeq = nextItem?.sequenceNumber ?? (desiredSeq + 2000);
      const gap = nextSeq - prevSeq;

      let finalSeq: number;

      if (gap > 1) {
        // There's room — use the midpoint (or desired if it fits)
        finalSeq = prevSeq < desiredSeq && desiredSeq < nextSeq
          ? desiredSeq
          : Math.round((prevSeq + nextSeq) / 2);
      } else {
        // No room — multiply all existing sequence numbers by 1000 to create gaps, then insert
        await Promise.all([
          ...existingAssignments.map(a =>
            prisma.runAssignment.updateMany({ where: { id: a.id, companyId }, data: { sequenceNumber: a.sequenceNumber * 1000 } })
          ),
          ...existingWaypoints.map(w =>
            prisma.runWaypoint.updateMany({ where: { id: w.id, companyId }, data: { sequenceNumber: w.sequenceNumber * 1000 } })
          ),
        ]);
        finalSeq = Math.round((prevSeq * 1000 + nextSeq * 1000) / 2);
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
          sequenceNumber: finalSeq,
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
      const runId = parseIdParam(request.params);
      if (runId === null) return badRequest(reply, "BAD_REQUEST", "runId must be a valid integer");
      const wId   = parseIdParam(request.params, "wId");
      if (wId === null) return badRequest(reply, "BAD_REQUEST", "wId must be a valid integer");

      const run = await prisma.run.findFirst({ where: { id: runId, companyId } });
      if (!run) return notFound(reply, "Run");

      const waypoint = await prisma.runWaypoint.findFirst({
        where: { id: wId, runId, companyId },
      });
      if (!waypoint) return notFound(reply, "Waypoint");

      await prisma.runWaypoint.deleteMany({ where: { id: wId, companyId } });
      return reply.status(204).send();
    },
  );

  // ── GET /planning/fleet ───────────────────────────────────────────────────
  app.get(
    "/planning/fleet",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;

      const [trailers, trucks, company] = await Promise.all([
        prisma.fleetTrailer.findMany({
          where:   { companyId, status: { not: "disposed" } },
          orderBy: { registration: "asc" },
        }),
        prisma.fleetUnit.findMany({
          where:   { companyId, status: { not: "disposed" } },
          orderBy: { registration: "asc" },
        }),
        prisma.company.findUnique({
          where: { id: companyId },
          select: {
            depotLocationId: true,
            depotLocation: {
              select: { id: true, name: true, siteName: true, postcode: true, lat: true, lng: true, town: true },
            },
          },
        }),
      ]);

      return reply.send({
        trailers,
        trucks,
        depot: company?.depotLocation ?? null,
      });
    },
  );

  // ── GET /planning/work-items ──────────────────────────────────────────────
  //
  // Returns unplanned job parts sorted and grouped in the order a planner
  // would build runs — not a flat random list.
  // Sort: by NEXT REQUIRED MOVEMENT, not the original job request.
  //
  // Query params: dateFrom=YYYY-MM-DD, dateTo=YYYY-MM-DD
  app.get(
    "/planning/work-items",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId } = request.user!;
      const q = request.query as { dateFrom?: string; dateTo?: string };

      if (!q.dateFrom || !q.dateTo) {
        return badRequest(reply, "BAD_REQUEST", "dateFrom and dateTo are required (YYYY-MM-DD)");
      }

      const items = await getPlannerWorkItems(prisma, companyId, q.dateFrom, q.dateTo);
      return reply.send({ items });
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

  // ── POST /planning/runs/:id/overnight-rest ─────────────────────────────────
  //
  // Auto-creates a follow-on delivery run when a driver ends their shift at a
  // non-yard location (services, layby, etc.) — the "overnight rest" pattern.
  //
  // The new run inherits the same driver + trailer as the source run.
  // Any unexecuted delivery-type assignments are moved from the source run
  // to the new run.  A depot_start waypoint is added at the rest location.
  // estimatedStartTime = shiftEndIso + restHours (DVLA daily rest).
  //
  // Body: {
  //   restLocationText?: string      — friendly name (e.g. "M1 Northampton Services")
  //   restPostcode?:      string      — e.g. "NN6 7XS"
  //   restLat?:           number
  //   restLng?:           number
  //   shiftEndIso?:       string      — ISO datetime when driver rests (defaults to now)
  //   restHours?:         9 | 11      — DVLA daily rest; 11 = standard, 9 = reduced (default 11)
  //   moveDeliveries?:    boolean     — move delivery stops from source run (default true)
  // }
  app.post(
    "/planning/runs/:id/overnight-rest",
    { preHandler: [authenticate, requireRole("company_owner", "planner")] },
    async (request, reply) => {
      const { companyId, userId } = request.user!;
      const sourceRunId = parseIdParam(request.params);
      if (sourceRunId === null) return badRequest(reply, "BAD_REQUEST", "sourceRunId must be a valid integer");

      const b = request.body as {
        restLocationText?: string;
        restPostcode?:     string;
        restLat?:          number;
        restLng?:          number;
        shiftEndIso?:      string;
        restHours?:        number;
        moveDeliveries?:   boolean;
      };

      // Load source run — verify ownership
      const sourceRun = await prisma.run.findFirst({
        where:   { id: sourceRunId, companyId },
        include: {
          assignments: {
            where:   { removedAt: null },
            include: {
              jobPart: { select: { id: true, type: true, sequenceNumber: true } },
            },
          },
        },
      });
      if (!sourceRun) return notFound(reply, "Run");

      // ── Calculate delivery run date + start time ────────────────────────────
      const restHours  = (b.restHours === 9 || b.restHours === 11) ? b.restHours : 11;
      const shiftEnd   = b.shiftEndIso ? new Date(b.shiftEndIso) : new Date();
      const startTime  = new Date(shiftEnd.getTime() + restHours * 60 * 60 * 1000);
      const deliveryDate = startTime.toISOString().slice(0, 10);
      const estStart   = startTime.toTimeString().slice(0, 5); // HH:MM

      // ── Move delivery assignments ───────────────────────────────────────────
      // Delivery-type stops (delivery, dropoff) that are still on the source run
      // and haven't been removed — these need to happen after the overnight rest.
      const deliveryTypes = new Set(["delivery", "dropoff"]);
      const toMove = (b.moveDeliveries !== false)
        ? sourceRun.assignments.filter(a => deliveryTypes.has(a.jobPart.type ?? ""))
        : [];

      // ── Create the new delivery run in a transaction ───────────────────────
      const newRun = await prisma.$transaction(async tx => {
        const txPrisma = tx as unknown as PrismaClient;

        const ref = await generateRunReference(companyId, startTime.getFullYear(), txPrisma);

        const created = await txPrisma.run.create({
          data: {
            companyId,
            runReference:      ref,
            status:            "draft",
            runType:           "relay",
            plannedDate:       new Date(`${deliveryDate}T12:00:00.000Z`),
            estimatedStartTime: estStart,
            assignedDriverId:  sourceRun.assignedDriverId  ?? null,
            assignedTrailerId: sourceRun.assignedTrailerId ?? null,
            dependsOnRunId:    sourceRunId,
            createdBy:         userId,
          },
          include: RUN_INCLUDE,
        });

        // Add depot_start waypoint at the rest location
        await txPrisma.runWaypoint.create({
          data: {
            companyId,
            runId:         created.id,
            waypointType:  "depot_start",
            sequenceNumber: 0,
            locationText:  b.restLocationText?.trim() || "Overnight rest location",
            postcode:      b.restPostcode?.trim()     || null,
            lat:           typeof b.restLat === "number" ? b.restLat : null,
            lng:           typeof b.restLng === "number" ? b.restLng : null,
            notes:         `Overnight rest — ${restHours}h DVLA rest from ${shiftEnd.toISOString()}`,
          },
        });

        // Move delivery assignments to the new run and renumber
        if (toMove.length > 0) {
          // Remove from source run
          await txPrisma.runAssignment.updateMany({
            where: { id: { in: toMove.map(a => a.id) } },
            data:  { removedAt: new Date() },
          });

          // Re-create on new run with fresh sequence numbers
          let seq = 1000;
          for (const a of toMove) {
            await txPrisma.runAssignment.create({
              data: {
                companyId,
                runId:            created.id,
                jobId:            a.jobId,
                jobPartId:        a.jobPartId,
                sequenceNumber:   seq,
                quantityAssigned: a.quantityAssigned,
                quantityUnit:     a.quantityUnit,
                status:           "not_started",   // EXECUTION_STATES initial (Step 1)
                addedBy:          userId,
              },
            });
            seq += 1000;
          }

          // Recalculate derived requirements on source run (delivery stops removed)
          await recalculateDerivedRequirements(sourceRunId, companyId, txPrisma);
        }

        // Return the new run with full include
        return txPrisma.run.findUniqueOrThrow({
          where:   { id: created.id },
          include: RUN_INCLUDE,
        });
      });

      return reply.status(201).send({ run: newRun });
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


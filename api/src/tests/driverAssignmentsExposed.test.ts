/**
 * driverAssignments — GET /jobs/my and GET /jobs/:id must expose the driver's
 * OWN assignment rows in real EXECUTION_STATES vocabulary (not_started/
 * en_route_pickup/at_pickup/loaded/en_route_dropoff/at_dropoff/delivered/
 * exception), one per JobPart, so the app can drive its action buttons off
 * real state instead of the legacy pending/accepted/in_progress vocabulary
 * that has never matched Job.status since Step 1 (2026-06-07) decoupled them.
 *
 * Also proves the applyJobEvent assignment-resolution fix end-to-end via the
 * driver-facing API: a normal two-stop (collection + delivery) job — the
 * shape every real job actually has — runs the full started -> ... ->
 * completed chain without a TRANSITION_FAILED error, landing on the SAME
 * assignment throughout (proven by driverAssignments before/after).
 */

import "dotenv/config";
import "../lib/env.js";
import { env } from "../lib/env.js";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { PrismaClient } from "../generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildApp } from "../app.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });
after(async () => { await prisma.$disconnect(); });

const PREFIX = "__DRVASG__";
const TS     = Date.now();
const tok = (u: number, c: number, r: string) => jwt.sign({ userId: u, companyId: c, role: r }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

test("driverAssignments — real execution state exposed, two-stop job runs the full chain", async (t) => {
  const company = await prisma.company.create({ data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() } });
  const planner = await prisma.user.create({
    data: { name: `${PREFIX}P`, email: `${PREFIX}p_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } } },
  });
  const driverUser = await prisma.user.create({
    data: { name: `${PREFIX}D`, email: `${PREFIX}d_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "driver", status: "active" } } },
  });
  const profile = await prisma.driverProfile.create({ data: { companyId: company.id, userId: driverUser.id, displayName: `${PREFIX}Drv`, status: "active" } });
  const driverToken = tok(driverUser.id, company.id, "driver");
  const app = await buildApp(prisma, { silent: true });

  const today = new Date();
  const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}Cust`, status: "planned" } });
  const cPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", timeWindowStart: today, timeWindowEnd: today } });
  const dPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery" } });
  const run = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R1-${TS}`, createdBy: planner.id, assignedDriverId: profile.id, status: "assigned", publishedToDriver: true } });
  const cAsg = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: cPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });
  const dAsg = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: dPart.id, jobId: job.id, sequenceNumber: 2, addedBy: planner.id, status: "not_started" } });

  try {
    await t.test("GET /jobs/my exposes both assignments, real vocabulary, ordered by sequence", async () => {
      const res = await app.inject({ method: "GET", url: "/jobs/my", headers: { authorization: `Bearer ${driverToken}` } });
      assert.strictEqual(res.statusCode, 200, res.body);
      const body = JSON.parse(res.body) as { data: { id: number; driverAssignments: { id: number; jobPartId: number; stopType: string; sequenceNumber: number; executionState: string }[] }[] };
      const myJob = body.data.find(j => j.id === job.id);
      assert.ok(myJob, "job visible on /jobs/my");
      assert.deepStrictEqual(myJob!.driverAssignments, [
        { id: cAsg.id, jobPartId: cPart.id, stopType: "collection", sequenceNumber: 1, executionState: "not_started" },
        { id: dAsg.id, jobPartId: dPart.id, stopType: "delivery",   sequenceNumber: 2, executionState: "not_started" },
      ]);
    });

    await t.test("GET /jobs/:id exposes the same for the single-job view", async () => {
      const res = await app.inject({ method: "GET", url: `/jobs/${job.id}`, headers: { authorization: `Bearer ${driverToken}` } });
      const body = JSON.parse(res.body) as { driverAssignments: { stopType: string; executionState: string }[] };
      assert.strictEqual(body.driverAssignments.length, 2);
      assert.strictEqual(body.driverAssignments[0].stopType, "collection");
      assert.strictEqual(body.driverAssignments[1].stopType, "delivery");
    });

    await t.test("full started->arrived_pickup->collected->arrived_dropoff->completed succeeds with no TRANSITION_FAILED", async () => {
      let n = 0;
      const fire = (status: string) => app.inject({ method: "PATCH", url: `/jobs/${job.id}/status`, headers: { authorization: `Bearer ${driverToken}` },
        payload: { status, clientEventId: `${PREFIX}evt-${n++}-${TS}`, clientTimestamp: new Date().toISOString(), actualQuantity: "5", actualUnit: "pallets" } });

      for (const status of ["in_progress", "arrived_pickup", "collected", "arrived_dropoff", "completed"]) {
        const res = await fire(status);
        assert.strictEqual(res.statusCode, 200, `${status} -> ${res.body}`);
      }

      // The collection assignment absorbed the whole journey (proven root cause:
      // the standard 5-event chain is one continuous per-assignment lifecycle).
      const final = await prisma.runAssignment.findMany({ where: { jobId: job.id }, select: { id: true, status: true } });
      const cFinal = final.find(a => a.id === cAsg.id);
      const dFinal = final.find(a => a.id === dAsg.id);
      assert.strictEqual(cFinal?.status, "delivered", "the assignment that carried the journey reaches delivered");
      assert.strictEqual(dFinal?.status, "not_started", "the sibling assignment never advances (ambiguous eligibility resolution) — no longer the completion signal, see next assertion");

      // Task #28 (2026-07-22): Job.status is no longer derived by counting
      // RunAssignment.status — it reads the delivery-type JobPart's own custody
      // (written correctly by applyJobEvent regardless of which assignment
      // absorbed the event chain). So the job still reconciles to `completed`
      // even though dAsg above never left `not_started`.
      const finalJob = await prisma.job.findUnique({ where: { id: job.id } });
      assert.strictEqual(finalJob?.status, "completed", "custody-based completion: the freight reached customer_dest regardless of assignment-status counting");
    });

    await t.test("explicit runAssignmentId (what the fixed mobile app sends) is fully deterministic", async () => {
      // A second, fresh job — the fixed mobile app now reads job.driverAssignments
      // and sends the SPECIFIC assignment id with every event, so resolution never
      // depends on eligibility-guessing at all for a client that knows better.
      const job2  = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}Cust2`, status: "planned" } });
      const cPart2 = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job2.id, sequenceNumber: 1, type: "collection" } });
      const dPart2 = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job2.id, sequenceNumber: 2, type: "delivery" } });
      const run2  = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R2-${TS}`, createdBy: planner.id, assignedDriverId: profile.id, status: "assigned", publishedToDriver: true } });
      const cAsg2 = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run2.id, jobPartId: cPart2.id, jobId: job2.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });
      const dAsg2 = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run2.id, jobPartId: dPart2.id, jobId: job2.id, sequenceNumber: 2, addedBy: planner.id, status: "not_started" } });

      let n = 0;
      const fireOn = (status: string, runAssignmentId: number) => app.inject({ method: "PATCH", url: `/jobs/${job2.id}/status`, headers: { authorization: `Bearer ${driverToken}` },
        payload: { status, runAssignmentId, clientEventId: `${PREFIX}exp-${n++}-${TS}`, clientTimestamp: new Date().toISOString(), actualQuantity: "5", actualUnit: "pallets" } });

      for (const status of ["in_progress", "arrived_pickup", "collected"]) {
        const res = await fireOn(status, cAsg2.id);
        assert.strictEqual(res.statusCode, 200, `${status} on collection -> ${res.body}`);
      }
      // Sending a delivery-phase event against the COLLECTION assignment (already
      // at 'loaded', not eligible for arrived_dropoff's own chain the same way a
      // fresh delivery row would be) still just obeys the explicit id — proving
      // the id is truly authoritative, not silently re-guessed.
      for (const status of ["arrived_dropoff", "completed"]) {
        const res = await fireOn(status, cAsg2.id);
        assert.strictEqual(res.statusCode, 200, `${status} on collection -> ${res.body}`);
      }

      const finalAsg = await prisma.runAssignment.findMany({ where: { jobId: job2.id }, select: { id: true, status: true } });
      assert.strictEqual(finalAsg.find(a => a.id === cAsg2.id)?.status, "delivered");
      assert.strictEqual(finalAsg.find(a => a.id === dAsg2.id)?.status, "not_started", "untouched sibling — explicit id never drifts onto it");

      // A runAssignmentId that doesn't belong to this driver/job is rejected,
      // never silently substituted with a different row.
      const res = await app.inject({ method: "PATCH", url: `/jobs/${job2.id}/status`, headers: { authorization: `Bearer ${driverToken}` },
        payload: { status: "in_progress", runAssignmentId: 999999999, clientEventId: `${PREFIX}bad-${TS}`, clientTimestamp: new Date().toISOString() } });
      assert.strictEqual(res.statusCode, 403, res.body);
    });

  } finally {
    await app.close();
    await prisma.loadTrack.deleteMany({ where: { companyId: company.id } });
    await prisma.jobExecutionEvent.deleteMany({ where: { companyId: company.id } });
    await prisma.runAssignment.deleteMany({ where: { companyId: company.id } });
    await prisma.run.deleteMany({ where: { companyId: company.id } });
    await prisma.jobPart.deleteMany({ where: { companyId: company.id } });
    await prisma.job.deleteMany({ where: { companyId: company.id } });
    await prisma.driverProfile.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, driverUser.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

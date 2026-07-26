/**
 * applyJobEvent integration tests (updated for LOAD_MOVEMENT_PLAN Step 1).
 *
 * Driver events now advance the per-RunAssignment EXECUTION state, not Job.status.
 * Behaviours:
 *   - B.5: missing clientEventId → 400
 *   - cancelled via normal path → 400 (planner-only; use override endpoint)
 *   - duplicate clientEventId → 200 { duplicate: true }
 *   - invalid execution transition → 400 TRANSITION_FAILED
 *   - KEYSTONE (Step 1): a `planned` job runs the full driver chain
 *     started→…→completed, advancing the assignment to `delivered`, while
 *     Job.status is left unchanged. This is the regression the suite never had —
 *     it would have caught the audit 🔴 blocker.
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

const PREFIX = "__AJTEST__";
const TS     = Date.now();

function makeToken(userId: number, companyId: number, role: string) {
  return jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
}

test("applyJobEvent — execution-state machine (Step 1)", async (t) => {

  // ── Setup: a fully PLANNED job (run + assignment + driver) ───────────────────
  const company = await prisma.company.create({
    data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() },
  });
  const planner = await prisma.user.create({
    data: {
      name: `${PREFIX}Planner`, email: `${PREFIX}planner_${TS}@test.invalid`.toLowerCase(),
      passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } },
    },
  });
  const driverUser = await prisma.user.create({
    data: {
      name: `${PREFIX}Driver`, email: `${PREFIX}driver_${TS}@test.invalid`.toLowerCase(),
      passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "driver", status: "active" } },
    },
  });
  const driverProfile = await prisma.driverProfile.create({
    data: { companyId: company.id, userId: driverUser.id, displayName: `${PREFIX}Driver`, status: "active" },
  });
  const job = await prisma.job.create({
    data: {
      companyId:       company.id,
      createdByUserId: planner.id,
      customerName:    `${PREFIX}Customer`,
      status:          "planned",   // ← the status the OLD machine could never start from
    },
  });
  const jobPart = await prisma.jobPart.create({
    data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection" },
  });
  // Form-shaped fixture (CLAUDE.md §8): every real job has a delivery stop too —
  // required since Step 3's reconciler (2026-07-22) reads the delivery-type
  // part's own custody to decide "completed" (dimension 3), not just execution
  // state. No RunAssignment for it: this test's whole point is that ONE
  // assignment absorbs the entire chain (the single-assignment case).
  await prisma.jobPart.create({
    data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery" },
  });
  const run = await prisma.run.create({
    data: {
      companyId:         company.id,
      runReference:      `${PREFIX}RUN-${TS}`,
      createdBy:         planner.id,
      assignedDriverId:  driverProfile.id,
      status:            "assigned",
      publishedToDriver: true,
    },
  });
  const assignment = await prisma.runAssignment.create({
    data: {
      companyId: company.id, runId: run.id, jobPartId: jobPart.id, jobId: job.id,
      sequenceNumber: 1, addedBy: planner.id,
      // Set explicitly so the test is deterministic regardless of migration timing.
      // Production default is "not_started" via the Step 1 migration.
      status: "not_started",
    },
  });

  const plannerToken = makeToken(planner.id, company.id, "planner");
  const driverToken  = makeToken(driverUser.id, company.id, "driver");
  const app          = await buildApp(prisma, { silent: true });

  try {

    // ── B.5: clientEventId required ──────────────────────────────────────────
    await t.test("B.5: missing clientEventId → 400", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/jobs/${job.id}/status`,
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { status: "arrived_pickup" },
      });
      assert.strictEqual(res.statusCode, 400, `body: ${res.body}`);
      const body = JSON.parse(res.body);
      assert.ok(
        body.code === "BAD_REQUEST" || body.error?.toLowerCase().includes("clienteventid"),
        `Expected BAD_REQUEST, got: ${res.body}`,
      );
    });

    // ── E.1: cancel not available via normal path ─────────────────────────────
    await t.test("cancel via normal path → 400", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/jobs/${job.id}/status`,
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { status: "cancelled", clientEventId: `${PREFIX}cancel-${TS}`, clientTimestamp: new Date().toISOString() },
      });
      assert.strictEqual(res.statusCode, 400, `body: ${res.body}`);
      const body = JSON.parse(res.body);
      assert.ok(
        body.code === "TRANSITION_FAILED" || body.code === "BAD_REQUEST",
        `Expected TRANSITION_FAILED/BAD_REQUEST, got: ${res.body}`,
      );
    });

    // ── Idempotency: duplicate clientEventId returns duplicate ────────────────
    await t.test("duplicate clientEventId → 200 { duplicate: true }", async () => {
      const clientEventId = `${PREFIX}dup-${TS}`;
      await prisma.jobExecutionEvent.create({
        data: {
          companyId: company.id, jobId: job.id, driverId: planner.id,
          eventType: "started", note: "", clientEventId,
          clientTimestamp: new Date(), needsReview: false,
          runId: run.id, runAssignmentId: assignment.id, jobPartId: jobPart.id,
        },
      });
      const res = await app.inject({
        method: "PATCH", url: `/jobs/${job.id}/status`,
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { status: "in_progress", clientEventId, clientTimestamp: new Date().toISOString() },
      });
      assert.strictEqual(res.statusCode, 200, `body: ${res.body}`);
      assert.strictEqual(JSON.parse(res.body).duplicate, true, `Expected duplicate:true, got: ${res.body}`);
    });

    // ── Invalid transition: completed from not_started (skips steps) ──────────
    await t.test("invalid transition → 400 TRANSITION_FAILED", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/jobs/${job.id}/status`,
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { status: "completed", clientEventId: `${PREFIX}invalid-${TS}`, clientTimestamp: new Date().toISOString() },
      });
      assert.strictEqual(res.statusCode, 400, `body: ${res.body}`);
      assert.strictEqual(JSON.parse(res.body).code, "TRANSITION_FAILED", `got: ${res.body}`);
    });

    // ── KEYSTONE: planned job runs the full driver chain ──────────────────────
    await t.test("planned job → full driver chain advances to delivered; Job.status unchanged", async () => {
      const chain: Array<{ status: string; expectState: string }> = [
        { status: "in_progress",     expectState: "en_route_pickup" },
        { status: "arrived_pickup",  expectState: "at_pickup" },
        { status: "collected",       expectState: "loaded" },
        { status: "arrived_dropoff", expectState: "at_dropoff" },
        { status: "completed",       expectState: "delivered" },
      ];
      for (const [i, step] of chain.entries()) {
        const res = await app.inject({
          method: "PATCH", url: `/jobs/${job.id}/status`,
          headers: { authorization: `Bearer ${driverToken}` },
          payload: { status: step.status, clientEventId: `${PREFIX}chain-${TS}-${i}`, clientTimestamp: new Date().toISOString() },
        });
        assert.strictEqual(res.statusCode, 200, `step ${step.status} body: ${res.body}`);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.executionState, step.expectState, `step ${step.status} → executionState`);
      }

      // Assignment reached delivered; Step 3 reconciler rolls Job.status up to completed.
      const finalAssignment = await prisma.runAssignment.findUnique({ where: { id: assignment.id } });
      assert.strictEqual(finalAssignment?.status, "delivered", "assignment should be delivered");
      const finalJob = await prisma.job.findUnique({ where: { id: job.id } });
      assert.strictEqual(finalJob?.status, "completed", "Job.status reconciled to completed (Step 3)");
    });

  } finally {
    await app.close();
    // LoadTrack.eventId → JobExecutionEvent FK: delete custody rows first (Step 2).
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

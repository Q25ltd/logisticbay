/**
 * reconcileLoadState — LOAD_MOVEMENT_PLAN Step 3.
 *
 *   - deriveJobStatus pure rollup (no DB).
 *   - B1 chain reconciles Job.status + Run.status + actual timestamps via HTTP.
 *   - reconciler never overrides a cancelled job.
 */

import "dotenv/config";
import "../lib/env.js";
import { env } from "../lib/env.js";
import { describe, it, test, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { PrismaClient } from "../generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildApp } from "../app.js";
import { deriveJobStatus, reconcileLoadState } from "../lib/reconcileLoadState.js";

// ── Pure rollup unit tests (no DB) ───────────────────────────────────────────
// deriveJobStatus(executionStates, parts) — parts carry each JobPart's TYPE +
// latest custody BASE (dimension 3), which is what actually decides
// collected/delivered since 2026-07-22 (task #28). executionStates still
// drives the exception override and the in_execution floor (dimension 2).
const collectionPart = (custodyBase: string | null) => ({ type: "collection", custodyBase });
const deliveryPart   = (custodyBase: string | null) => ({ type: "delivery",   custodyBase });

describe("deriveJobStatus (pure rollup)", () => {
  it("empty / all not_started, no custody → null (no assertion)", () => {
    assert.strictEqual(deriveJobStatus([], []), null);
    assert.strictEqual(
      deriveJobStatus(["not_started", "not_started"], [collectionPart(null), deliveryPart(null)]),
      null,
    );
  });
  it("any started, none collected → in_execution", () => {
    assert.strictEqual(
      deriveJobStatus(["en_route_pickup"], [collectionPart(null), deliveryPart(null)]),
      "in_execution",
    );
    assert.strictEqual(
      deriveJobStatus(["at_pickup", "not_started"], [collectionPart(null), deliveryPart(null)]),
      "in_execution",
    );
  });
  it("all collection parts' custody past customer_origin, none delivered → collected", () => {
    assert.strictEqual(
      deriveJobStatus(["loaded"], [collectionPart("on_vehicle"), deliveryPart(null)]),
      "collected",
    );
  });
  it("some collected → partially_collected", () => {
    assert.strictEqual(
      deriveJobStatus(
        ["loaded", "not_started"],
        [collectionPart("on_vehicle"), collectionPart(null), deliveryPart(null)],
      ),
      "partially_collected",
    );
  });
  it("all delivery parts' custody at customer_dest → completed", () => {
    assert.strictEqual(
      deriveJobStatus(["delivered"], [collectionPart("on_vehicle"), deliveryPart("customer_dest")]),
      "completed",
    );
  });
  it("some delivered → partially_delivered", () => {
    assert.strictEqual(
      deriveJobStatus(
        ["delivered", "loaded"],
        [collectionPart("on_vehicle"), deliveryPart("customer_dest"), deliveryPart("on_vehicle")],
      ),
      "partially_delivered",
    );
  });
  it("any exception → attention_needed (dominates)", () => {
    assert.strictEqual(
      deriveJobStatus(["exception", "delivered"], [collectionPart("on_vehicle"), deliveryPart("customer_dest")]),
      "attention_needed",
    );
  });

  // ── task #28 regression coverage: why custody, not assignment counting ──────
  it("sibling assignment stuck at not_started, but delivery part's custody is at customer_dest → completed (the bug this fix closes)", () => {
    // Reproduces driverAssignmentsExposed.test.ts: one assignment absorbed the
    // whole event chain to 'delivered' while its sibling never advanced. Under
    // the old assignment-counting rollup this could never reach 'completed'
    // even though the freight had genuinely arrived. Custody says otherwise.
    assert.strictEqual(
      deriveJobStatus(
        ["delivered", "not_started"],
        [collectionPart("on_vehicle"), deliveryPart("customer_dest")],
      ),
      "completed",
    );
  });
  it("relay: collection part dropped at yard (assignment shows 'delivered' for its own leg), delivery part has no custody yet → collected, NOT completed", () => {
    // B2: drop_at_yard sets the carrying assignment's execution state to
    // 'delivered' for ITS leg (A4: "delivered ... OR dropped at yard
    // (interim)"), but the delivery-type part has no custody row until the
    // second leg actually delivers. Supersedes the old D6.2 guard.
    assert.strictEqual(
      deriveJobStatus(["delivered"], [collectionPart("yard"), deliveryPart(null)]),
      "collected",
    );
  });
  it("multi-drop: two delivery parts, only one at customer_dest → partially_delivered, not completed", () => {
    assert.strictEqual(
      deriveJobStatus(
        ["delivered", "delivered", "not_started"],
        [collectionPart("on_vehicle"), deliveryPart("customer_dest"), deliveryPart("on_vehicle")],
      ),
      "partially_delivered",
    );
  });
});

// ── Integration ──────────────────────────────────────────────────────────────
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });
after(async () => { await prisma.$disconnect(); });

const PREFIX = "__RECTEST__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

test("reconcileLoadState — B1 rollup + no-override (Step 3)", async (t) => {
  const company = await prisma.company.create({
    data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() },
  });
  const planner = await prisma.user.create({
    data: {
      name: `${PREFIX}P`, email: `${PREFIX}p_${TS}@test.invalid`.toLowerCase(),
      passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } },
    },
  });
  const driverUser = await prisma.user.create({
    data: {
      name: `${PREFIX}D`, email: `${PREFIX}d_${TS}@test.invalid`.toLowerCase(),
      passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "driver", status: "active" } },
    },
  });
  const driverProfile = await prisma.driverProfile.create({
    data: { companyId: company.id, userId: driverUser.id, displayName: `${PREFIX}D`, status: "active" },
  });
  const driverToken = tok(driverUser.id, company.id, "driver");
  const app = await buildApp(prisma, { silent: true });

  const job = await prisma.job.create({
    data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C`, status: "planned" },
  });
  const collectionPart = await prisma.jobPart.create({
    data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets" },
  });
  await prisma.jobPart.create({
    data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery", quantityUnit: "pallets" },
  });
  const run = await prisma.run.create({
    data: {
      companyId: company.id, runReference: `${PREFIX}RUN-${TS}`, createdBy: planner.id,
      assignedDriverId: driverProfile.id, status: "assigned", publishedToDriver: true,
    },
  });
  await prisma.runAssignment.create({
    data: {
      companyId: company.id, runId: run.id, jobPartId: collectionPart.id, jobId: job.id,
      sequenceNumber: 1, addedBy: planner.id, status: "not_started",
    },
  });

  const send = (status: string, extra: Record<string, unknown> = {}) =>
    app.inject({
      method: "PATCH", url: `/jobs/${job.id}/status`,
      headers: { authorization: `Bearer ${driverToken}` },
      payload: { status, clientEventId: `${PREFIX}${status}-${TS}`, clientTimestamp: new Date().toISOString(), ...extra },
    });

  try {
    await t.test("mid-chain: collected → Job.status=collected, Run in_progress + actualStartTime", async () => {
      assert.strictEqual((await send("in_progress")).statusCode, 200);
      assert.strictEqual((await send("arrived_pickup")).statusCode, 200);
      assert.strictEqual((await send("collected", { actualQuantity: "10" })).statusCode, 200);

      const j = await prisma.job.findUnique({ where: { id: job.id } });
      assert.strictEqual(j?.status, "collected");
      const r = await prisma.run.findUnique({ where: { id: run.id } });
      assert.strictEqual(r?.status, "in_progress");
      assert.ok(r?.actualStartTime, "actualStartTime set once run starts");
      assert.strictEqual(r?.actualEndTime, null, "actualEndTime not set until completion");
    });

    await t.test("end of chain: completed → Job.status=completed, Run completed + actualEndTime", async () => {
      assert.strictEqual((await send("arrived_dropoff")).statusCode, 200);
      assert.strictEqual((await send("completed", { actualQuantity: "10", podNumber: "POD1" })).statusCode, 200);

      const j = await prisma.job.findUnique({ where: { id: job.id } });
      assert.strictEqual(j?.status, "completed");
      const r = await prisma.run.findUnique({ where: { id: run.id } });
      assert.strictEqual(r?.status, "completed");
      assert.ok(r?.actualEndTime, "actualEndTime set on completion");
    });

    await t.test("reconciler never overrides a cancelled job", async () => {
      const cJob = await prisma.job.create({
        data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}X`, status: "cancelled" },
      });
      const cPart = await prisma.jobPart.create({
        data: { companyId: company.id, jobId: cJob.id, sequenceNumber: 1, type: "collection" },
      });
      const cRun = await prisma.run.create({
        data: { companyId: company.id, runReference: `${PREFIX}RUNC-${TS}`, createdBy: planner.id, status: "cancelled" },
      });
      await prisma.runAssignment.create({
        data: {
          companyId: company.id, runId: cRun.id, jobPartId: cPart.id, jobId: cJob.id,
          sequenceNumber: 1, addedBy: planner.id, status: "delivered",
        },
      });

      await prisma.$transaction(tx => reconcileLoadState(tx, { jobId: cJob.id, companyId: company.id }));

      const j = await prisma.job.findUnique({ where: { id: cJob.id } });
      assert.strictEqual(j?.status, "cancelled", "cancelled job must not be reconciled");
      const r = await prisma.run.findUnique({ where: { id: cRun.id } });
      assert.strictEqual(r?.status, "cancelled", "cancelled run must not be reconciled");
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

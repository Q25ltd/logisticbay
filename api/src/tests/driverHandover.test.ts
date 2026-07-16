/**
 * Driver handover / B3 — LOAD_MOVEMENT_PLAN Step 8.
 *
 * Driver A collects and raises `handover_offered` at the meet point (no custody
 * change — A still holds the load). Driver B raises `handover_accepted` on their
 * own run: EXACTLY ONE `handover` custody row (vehicleA → vehicleB) is authored
 * at accept, both driver IDs captured; A's leg ends `delivered`; B continues and
 * delivers. Invariant 8: B cannot accept before A offers, and a consumed offer
 * cannot be accepted twice (no double custody).
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

const PREFIX = "__HANDOVERTEST__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

let seq = 0;
const ev = (eventType: string, jobId: number, extra: Record<string, unknown> = {}) => ({
  eventType, jobId,
  clientEventId: `${PREFIX}${eventType}-${TS}-${seq}`,
  clientTimestamp: new Date(TS + (seq++ * 1000)).toISOString(),
  ...extra,
});

test("driver handover — B3 custody passes A→B with one row (Step 8)", async (t) => {
  const company = await prisma.company.create({ data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() } });
  const planner = await prisma.user.create({
    data: { name: `${PREFIX}P`, email: `${PREFIX}p_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } } },
  });
  const plannerToken = tok(planner.id, company.id, "planner");
  const mkDriver = async (tag: string) => {
    const u = await prisma.user.create({
      data: { name: `${PREFIX}${tag}`, email: `${PREFIX}${tag}_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
        memberships: { create: { companyId: company.id, role: "driver", status: "active" } } },
    });
    const p = await prisma.driverProfile.create({ data: { companyId: company.id, userId: u.id, displayName: `${PREFIX}${tag}`, status: "active" } });
    return { u, p, token: tok(u.id, company.id, "driver") };
  };
  const A = await mkDriver("DA");
  const B = await mkDriver("DB");
  const C = await mkDriver("DC");
  const app = await buildApp(prisma, { silent: true });

  // Trailers registered through the fleet intake gate (form-shaped fixture).
  const regTrailer = async (reg: string) => {
    const res = await app.inject({ method: "POST", url: "/fleet/trailers",
      headers: { authorization: `Bearer ${plannerToken}` },
      payload: { registration: reg, bodyType: "flatbed" } });
    assert.strictEqual(res.statusCode, 201, res.body);
    return JSON.parse(res.body) as { id: number; registration: string };
  };
  const suffix = String(TS).slice(-8);
  const trailerX = await regTrailer(`HOX-${suffix}`);
  const trailerY = await regTrailer(`HOY-${suffix}`);

  // Job with collection + delivery stops.
  const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C`, status: "planned" } });
  const cPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets" } });
  const dPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery", quantityUnit: "pallets" } });

  // Run 1 → driver A on trailer X (collect + offer). Run 2 → driver B on trailer Y
  // (accept + deliver), dependsOnRunId links B→A per the B3 run shape.
  const run1 = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R1-${TS}`, createdBy: planner.id, assignedDriverId: A.p.id, assignedTrailerId: trailerX.id, status: "assigned", publishedToDriver: true } });
  const asgA = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run1.id, jobPartId: cPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });
  const run2 = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R2-${TS}`, createdBy: planner.id, assignedDriverId: B.p.id, assignedTrailerId: trailerY.id, status: "assigned", publishedToDriver: true, runType: "relay", dependsOnRunId: run1.id } });
  await prisma.runAssignment.create({ data: { companyId: company.id, runId: run2.id, jobPartId: dPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

  const sync = (token: string, events: unknown[]) =>
    app.inject({ method: "POST", url: "/sync/events", headers: { authorization: `Bearer ${token}` }, payload: { events } });
  const jobStatus = async () => (await prisma.job.findUnique({ where: { id: job.id } }))?.status;

  try {
    await t.test("A collects and offers — no custody change on the offer", async () => {
      const res = await sync(A.token, [
        ev("started", job.id),
        ev("arrived_pickup", job.id),
        ev("collected", job.id, { actualQuantity: "10" }),
        ev("handover_offered", job.id),
      ]);
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);

      const rows = await prisma.loadTrack.findMany({ where: { jobId: job.id }, select: { transactionType: true } });
      assert.deepStrictEqual(rows.map(r => r.transactionType), ["collect"], "offer writes NO custody row — A still holds the load");
      const a = await prisma.runAssignment.findUnique({ where: { id: asgA.id }, select: { status: true } });
      assert.strictEqual(a?.status, "loaded", "A still loaded after offering");
    });

    await t.test("B accepts — exactly one handover row, both driver IDs, A's leg ends", async () => {
      const res = await sync(B.token, [ ev("handover_accepted", job.id) ]);
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);

      const rows = await prisma.loadTrack.findMany({ where: { jobId: job.id, transactionType: "handover" } });
      assert.strictEqual(rows.length, 1, "exactly one handover custody row");
      assert.strictEqual(rows[0].fromCustody, `on_vehicle:${trailerX.id}`, "custody leaves A's vehicle");
      assert.strictEqual(rows[0].toCustody, `on_vehicle:${trailerY.id}`, "custody arrives on B's vehicle");
      assert.ok(rows[0].notes?.includes(`fromDriverId=${A.u.id}`), `notes capture A: ${rows[0].notes}`);
      assert.ok(rows[0].notes?.includes(`toDriverId=${B.u.id}`), `notes capture B: ${rows[0].notes}`);

      const a = await prisma.runAssignment.findUnique({ where: { id: asgA.id }, select: { status: true } });
      assert.strictEqual(a?.status, "delivered", "A's leg is complete once B accepts");
      const r1 = await prisma.run.findUnique({ where: { id: run1.id }, select: { status: true } });
      assert.strictEqual(r1?.status, "completed", "run 1 rolls up completed");
      assert.strictEqual(await jobStatus(), "collected", "load is on B's vehicle — not delivered yet");
    });

    await t.test("B delivers → job 'completed'; ledger reads collect→handover→deliver", async () => {
      const res = await sync(B.token, [
        ev("arrived_dropoff", job.id),
        ev("completed", job.id, { actualQuantity: "10" }),
      ]);
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);
      assert.strictEqual(await jobStatus(), "completed");

      const rows = await prisma.loadTrack.findMany({ where: { jobId: job.id }, orderBy: { id: "asc" }, select: { transactionType: true } });
      assert.deepStrictEqual(rows.map(r => r.transactionType), ["collect", "handover", "deliver"]);
    });

    await t.test("a consumed offer cannot be accepted twice (no double custody)", async () => {
      const run5 = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R5-${TS}`, createdBy: planner.id, assignedDriverId: C.p.id, status: "assigned", publishedToDriver: true } });
      await prisma.runAssignment.create({ data: { companyId: company.id, runId: run5.id, jobPartId: cPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

      const res = await sync(C.token, [ ev("handover_accepted", job.id) ]);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.failed.length, 1, res.body);
      assert.match(body.failed[0].failureReason ?? "", /already accepted/i);
      const cnt = await prisma.loadTrack.count({ where: { jobId: job.id, transactionType: "handover" } });
      assert.strictEqual(cnt, 1, "still exactly one handover row");
    });

    await t.test("accept before any offer is rejected, no custody row", async () => {
      const job2 = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C2`, status: "planned" } });
      const p2 = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job2.id, sequenceNumber: 1, type: "delivery", quantityUnit: "pallets" } });
      const r3 = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R3-${TS}`, createdBy: planner.id, assignedDriverId: B.p.id, status: "assigned", publishedToDriver: true } });
      await prisma.runAssignment.create({ data: { companyId: company.id, runId: r3.id, jobPartId: p2.id, jobId: job2.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

      const res = await sync(B.token, [ ev("handover_accepted", job2.id) ]);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.failed.length, 1, res.body);
      assert.match(body.failed[0].failureReason ?? "", /no prior handover_offered/i);
      const cnt = await prisma.loadTrack.count({ where: { jobId: job2.id } });
      assert.strictEqual(cnt, 0, "no custody row on rejected accept");
    });

  } finally {
    await app.close();
    await prisma.syncEventLog.deleteMany({ where: { companyId: company.id } });
    await prisma.loadTrack.deleteMany({ where: { companyId: company.id } });
    await prisma.jobExecutionEvent.deleteMany({ where: { companyId: company.id } });
    await prisma.runAssignment.deleteMany({ where: { companyId: company.id } });
    await prisma.run.deleteMany({ where: { companyId: company.id } });
    await prisma.jobPart.deleteMany({ where: { companyId: company.id } });
    await prisma.job.deleteMany({ where: { companyId: company.id } });
    await prisma.fleetTrailer.deleteMany({ where: { companyId: company.id } });
    await prisma.auditLog.deleteMany({ where: { companyId: company.id } });
    await prisma.driverProfile.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, A.u.id, B.u.id, C.u.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

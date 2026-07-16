/**
 * Trailer swap / B4 — LOAD_MOVEMENT_PLAN Step 7.
 *
 * Run 1 (driver A, trailer X): collect → trailer_swap (loaded trailer X left at
 * a yard; run continues on trailer Y). Run 2 (driver B): pick_from_yard →
 * deliver. Expect: the swap writes a custody row on_vehicle:X → yard (invariant
 * 1 — the dropped load is never lost); run 1's assignedTrailerId becomes Y; the
 * dropped load is pickable by another run (the swap row counts as the drop);
 * 4 ledger rows total and the job reconciles to `completed`. An unknown new
 * trailer reg never blocks the driver — run trailer goes null + needsReview.
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

const PREFIX = "__SWAPTEST__";
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

test("trailer swap — B4 dropped loaded trailer stays in custody (Step 7)", async (t) => {
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
  const app = await buildApp(prisma, { silent: true });

  // Trailers X and Y registered through the fleet intake gate (form-shaped fixture).
  const regTrailer = async (reg: string) => {
    const res = await app.inject({ method: "POST", url: "/fleet/trailers",
      headers: { authorization: `Bearer ${plannerToken}` },
      payload: { registration: reg, bodyType: "flatbed" } });
    assert.strictEqual(res.statusCode, 201, res.body);
    return JSON.parse(res.body) as { id: number; registration: string };
  };
  const suffix = String(TS).slice(-8);
  const trailerX = await regTrailer(`SWX-${suffix}`);
  const trailerY = await regTrailer(`SWY-${suffix}`);

  // Job with collection + delivery stops.
  const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C`, status: "planned" } });
  const cPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets" } });
  const dPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery", quantityUnit: "pallets" } });

  // Run 1 → driver A on trailer X (collect + swap). Run 2 → driver B (pick + deliver).
  const run1 = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R1-${TS}`, createdBy: planner.id, assignedDriverId: A.p.id, assignedTrailerId: trailerX.id, status: "assigned", publishedToDriver: true } });
  await prisma.runAssignment.create({ data: { companyId: company.id, runId: run1.id, jobPartId: cPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });
  const run2 = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R2-${TS}`, createdBy: planner.id, assignedDriverId: B.p.id, status: "assigned", publishedToDriver: true, runType: "relay", dependsOnRunId: run1.id } });
  await prisma.runAssignment.create({ data: { companyId: company.id, runId: run2.id, jobPartId: dPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

  const sync = (token: string, events: unknown[]) =>
    app.inject({ method: "POST", url: "/sync/events", headers: { authorization: `Bearer ${token}` }, payload: { events } });
  const jobStatus = async () => (await prisma.job.findUnique({ where: { id: job.id } }))?.status;

  try {
    await t.test("run 1: collect then trailer_swap → custody to yard, run continues on trailer Y", async () => {
      const res = await sync(A.token, [
        ev("started", job.id),
        ev("arrived_pickup", job.id),
        ev("collected", job.id, { actualQuantity: "10" }),
        ev("trailer_swap", job.id, { yardRef: "7", newTrailerReg: trailerY.registration, actualQuantity: "10" }),
      ]);
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);
      assert.strictEqual(await jobStatus(), "collected", "load is at yard on the dropped trailer — not delivered");

      const swapRow = await prisma.loadTrack.findFirst({ where: { jobId: job.id, transactionType: "trailer_swap" } });
      assert.ok(swapRow, "swap must write a custody row (invariant 1)");
      assert.strictEqual(swapRow.fromCustody, `on_vehicle:${trailerX.id}`, "custody leaves the DROPPED trailer");
      assert.ok(swapRow.toCustody.startsWith("yard:"), `swap → ${swapRow.toCustody}`);
      assert.strictEqual(swapRow.trailerId, String(trailerX.id), "ledger records the dropped trailer");

      const r1 = await prisma.run.findUnique({ where: { id: run1.id }, select: { assignedTrailerId: true } });
      assert.strictEqual(r1?.assignedTrailerId, trailerY.id, "run 1 continues on trailer Y");
    });

    await t.test("run 2: pick_from_yard (swap row counts as the drop) then deliver → job 'completed'", async () => {
      const res = await sync(B.token, [
        ev("pick_from_yard", job.id, { yardRef: "7" }),
        ev("arrived_dropoff", job.id),
        ev("completed", job.id, { actualQuantity: "10" }),
      ]);
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);
      assert.strictEqual(await jobStatus(), "completed");

      const rows = await prisma.loadTrack.findMany({ where: { jobId: job.id }, orderBy: { id: "asc" }, select: { transactionType: true } });
      assert.deepStrictEqual(rows.map(r => r.transactionType), ["collect", "trailer_swap", "pick_from_yard", "deliver"]);
    });

    await t.test("swap to an unknown reg never blocks — run trailer null + needsReview", async () => {
      const job2 = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C2`, status: "planned" } });
      const p2 = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job2.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets" } });
      const r3 = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R3-${TS}`, createdBy: planner.id, assignedDriverId: A.p.id, assignedTrailerId: trailerX.id, status: "assigned", publishedToDriver: true } });
      await prisma.runAssignment.create({ data: { companyId: company.id, runId: r3.id, jobPartId: p2.id, jobId: job2.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

      const events = [
        ev("started", job2.id),
        ev("arrived_pickup", job2.id),
        ev("collected", job2.id, { actualQuantity: "5" }),
        ev("trailer_swap", job2.id, { yardRef: "9", newTrailerReg: "ZZ99ZZZ", actualQuantity: "5" }),
      ];
      const swapEvent = events[3];
      const res = await sync(A.token, events);
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, `unknown reg must not fail the event: ${res.body}`);

      const r3After = await prisma.run.findUnique({ where: { id: r3.id }, select: { assignedTrailerId: true } });
      assert.strictEqual(r3After?.assignedTrailerId, null, "unknown trailer = honest null, never invented");

      const eventRow = await prisma.jobExecutionEvent.findFirst({ where: { companyId: company.id, clientEventId: swapEvent.clientEventId as string }, select: { needsReview: true, reviewReason: true } });
      assert.strictEqual(eventRow?.needsReview, true);
      assert.strictEqual(eventRow?.reviewReason, "trailer_swap_new_trailer_not_in_fleet");
    });

    await t.test("swap before collection is rejected, no custody row", async () => {
      const job3 = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C3`, status: "planned" } });
      const p3 = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job3.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets" } });
      const r4 = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R4-${TS}`, createdBy: planner.id, assignedDriverId: A.p.id, status: "assigned", publishedToDriver: true } });
      await prisma.runAssignment.create({ data: { companyId: company.id, runId: r4.id, jobPartId: p3.id, jobId: job3.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

      const res = await sync(A.token, [ ev("trailer_swap", job3.id, { yardRef: "9", newTrailerReg: trailerY.registration }) ]);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.failed.length, 1, res.body);
      const cnt = await prisma.loadTrack.count({ where: { jobId: job3.id } });
      assert.strictEqual(cnt, 0, "no custody row on rejected swap");
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
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, A.u.id, B.u.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

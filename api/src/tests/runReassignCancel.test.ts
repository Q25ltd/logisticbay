/**
 * Reassignment & cancel-with-custody / B10 B14 — LOAD_MOVEMENT_PLAN Step 12.
 *
 * B10: changing the driver on a run with NO custody resets started assignments
 *      to not_started (audited); with custody it is REFUSED (RUN_HAS_CUSTODY) —
 *      the rescue paths are handover/yard relay, never a silent repoint.
 * B14: cancelling a run whose load is on its vehicle requires a custody
 *      disposition (409 CUSTODY_DISPOSITION_REQUIRED otherwise); the disposition
 *      writes a compensating custody row (refuse_return → origin, or
 *      drop_at_yard → yard) caused by a planner 'cancelled' event. No
 *      reassignment or cancel can strand a load.
 */

import "dotenv/config";
import "../lib/env.js";
import { env } from "../lib/env.js";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { PrismaClient, Prisma } from "../generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildApp } from "../app.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });
after(async () => { await prisma.$disconnect(); });

const PREFIX = "__S12TEST__";
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

test("reassignment & cancel-with-custody — B10/B14 (Step 12)", async (t) => {
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

  let jobSeq = 0;
  const mkJob = async () => {
    const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C${jobSeq}`, status: "planned" } });
    const cPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets", quantityRequired: new Prisma.Decimal(10) } });
    const dPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery", quantityUnit: "pallets", quantityRequired: new Prisma.Decimal(10) } });
    const run = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R${jobSeq++}-${TS}`, createdBy: planner.id, assignedDriverId: A.p.id, status: "assigned", publishedToDriver: true } });
    const asg = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: cPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });
    return { job, cPart, dPart, run, asg };
  };

  const sync = (token: string, events: unknown[]) =>
    app.inject({ method: "POST", url: "/sync/events", headers: { authorization: `Bearer ${token}` }, payload: { events } });
  const patchRun = (runId: number, payload: Record<string, unknown>) =>
    app.inject({ method: "PATCH", url: `/runs/${runId}`, headers: { authorization: `Bearer ${plannerToken}` }, payload });
  const runRow = (id: number) => prisma.run.findUnique({ where: { id }, select: { status: true, assignedDriverId: true } });

  try {
    await t.test("B10: reassign before custody — started assignment resets, audited", async () => {
      const f = await mkJob();
      const r = await sync(A.token, [ ev("started", f.job.id) ]);
      assert.strictEqual(JSON.parse(r.body).failed.length, 0, r.body);
      assert.strictEqual((await prisma.runAssignment.findUnique({ where: { id: f.asg.id } }))?.status, "en_route_pickup");

      const res = await patchRun(f.run.id, { assignedDriverId: B.p.id });
      assert.strictEqual(res.statusCode, 200, res.body);

      assert.strictEqual((await runRow(f.run.id))?.assignedDriverId, B.p.id);
      assert.strictEqual((await prisma.runAssignment.findUnique({ where: { id: f.asg.id } }))?.status, "not_started", "started leg resets for the new driver");
      const audit = await prisma.auditLog.findFirst({ where: { companyId: company.id, entityType: "Run", entityId: f.run.id, action: "driver_reassigned" } });
      assert.ok(audit, "reassignment reset is audited");
    });

    await t.test("B10: reassign AFTER collection is refused — RUN_HAS_CUSTODY", async () => {
      const f = await mkJob();
      const r = await sync(A.token, [
        ev("started", f.job.id), ev("arrived_pickup", f.job.id), ev("collected", f.job.id, { actualQuantity: "10" }),
      ]);
      assert.strictEqual(JSON.parse(r.body).failed.length, 0, r.body);

      const res = await patchRun(f.run.id, { assignedDriverId: B.p.id });
      assert.strictEqual(res.statusCode, 409, res.body);
      assert.strictEqual(JSON.parse(res.body).code, "RUN_HAS_CUSTODY");
      assert.strictEqual((await runRow(f.run.id))?.assignedDriverId, A.p.id, "driver unchanged — use handover/yard rescue");

      // B14: the same loaded run cannot be cancelled without a disposition…
      const del = await app.inject({ method: "DELETE", url: `/runs/${f.run.id}`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(del.statusCode, 409, del.body);
      assert.strictEqual(JSON.parse(del.body).code, "CUSTODY_DISPOSITION_REQUIRED");
      assert.notStrictEqual((await runRow(f.run.id))?.status, "cancelled", "run NOT cancelled while the load has nowhere to go");

      // …and cancels cleanly once the planner chooses return-to-origin.
      const del2 = await app.inject({ method: "DELETE", url: `/runs/${f.run.id}`, headers: { authorization: `Bearer ${plannerToken}` },
        payload: { custodyDisposition: "return_to_origin" } });
      assert.strictEqual(del2.statusCode, 204, del2.body);
      assert.strictEqual((await runRow(f.run.id))?.status, "cancelled");

      const rows = await prisma.loadTrack.findMany({ where: { jobId: f.job.id }, orderBy: { id: "asc" } });
      assert.deepStrictEqual(rows.map(r2 => r2.transactionType), ["collect", "refuse_return"], "collect preserved + compensating return row");
      assert.ok(rows[1].fromCustody.startsWith("on_vehicle:"), rows[1].fromCustody);
      assert.ok(rows[1].toCustody.startsWith("returned:"), rows[1].toCustody);
      assert.strictEqual(Number(rows[1].quantity), 10, "returned quantity = what was on board");
      assert.ok(rows[1].eventId != null, "compensating row references the planner cancel event (invariant 5)");
    });

    await t.test("B14: leave_at_yard disposition via planning cancel → drop_at_yard row", async () => {
      const f = await mkJob();
      const r = await sync(A.token, [
        ev("started", f.job.id), ev("arrived_pickup", f.job.id), ev("collected", f.job.id, { actualQuantity: "10" }),
      ]);
      assert.strictEqual(JSON.parse(r.body).failed.length, 0, r.body);

      const res = await app.inject({ method: "PATCH", url: `/planning/runs/${f.run.id}`, headers: { authorization: `Bearer ${plannerToken}` },
        payload: { status: "cancelled", custodyDisposition: "leave_at_yard", dispositionYardRef: "Leeds yard" } });
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual((await runRow(f.run.id))?.status, "cancelled");

      const rows = await prisma.loadTrack.findMany({ where: { jobId: f.job.id }, orderBy: { id: "asc" } });
      assert.deepStrictEqual(rows.map(r2 => r2.transactionType), ["collect", "drop_at_yard"]);
      assert.strictEqual(rows[1].toCustody, "yard:Leeds yard", "load parked at the named yard — plannable, not stranded");
    });

    await t.test("cancel with no custody stays a plain cancel (no disposition needed)", async () => {
      const f = await mkJob();
      const del = await app.inject({ method: "DELETE", url: `/runs/${f.run.id}`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(del.statusCode, 204, del.body);
      assert.strictEqual((await runRow(f.run.id))?.status, "cancelled");
      assert.strictEqual(await prisma.loadTrack.count({ where: { jobId: f.job.id } }), 0);
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
    await prisma.auditLog.deleteMany({ where: { companyId: company.id } });
    await prisma.driverProfile.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, A.u.id, B.u.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

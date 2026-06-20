/**
 * LoadTrack custody write path — LOAD_MOVEMENT_PLAN Step 2.
 *
 *   - B1 (direct): collect→deliver writes exactly two append-only custody rows
 *     with the correct bases, quantities, jobPart (stop-aware), and eventId set.
 *   - Idempotency: a duplicate clientEventId writes no second custody row.
 *   - Invariant 3: deliver without a prior collect is rejected, writes nothing.
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

const PREFIX = "__LTTEST__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

test("LoadTrack custody write path (Step 2)", async (t) => {
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

  // ── B1 job: collection + delivery stops, one run, one assignment ────────────
  const job = await prisma.job.create({
    data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}Cust`, status: "planned" },
  });
  const collectionPart = await prisma.jobPart.create({
    data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets" },
  });
  const deliveryPart = await prisma.jobPart.create({
    data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery", quantityUnit: "pallets" },
  });
  const run = await prisma.run.create({
    data: {
      companyId: company.id, runReference: `${PREFIX}RUN-${TS}`, createdBy: planner.id,
      assignedDriverId: driverProfile.id, status: "assigned", publishedToDriver: true,
    },
  });
  const assignment = await prisma.runAssignment.create({
    data: {
      companyId: company.id, runId: run.id, jobPartId: collectionPart.id, jobId: job.id,
      sequenceNumber: 1, addedBy: planner.id, status: "not_started",
    },
  });

  try {
    const send = (status: string, extra: Record<string, unknown> = {}) =>
      app.inject({
        method: "PATCH", url: `/jobs/${job.id}/status`,
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { status, clientEventId: `${PREFIX}${status}-${TS}`, clientTimestamp: new Date().toISOString(), ...extra },
      });

    await t.test("B1: collect writes one custody row (stop-aware, quantity threaded)", async () => {
      assert.strictEqual((await send("in_progress")).statusCode, 200);
      assert.strictEqual((await send("arrived_pickup")).statusCode, 200);
      const res = await send("collected", { actualQuantity: "10", actualUnit: "pallets" });
      assert.strictEqual(res.statusCode, 200, res.body);

      const rows = await prisma.loadTrack.findMany({ where: { jobId: job.id }, orderBy: { id: "asc" } });
      assert.strictEqual(rows.length, 1, "exactly one custody row after collect");
      const r = rows[0];
      assert.strictEqual(r.transactionType, "collect");
      assert.strictEqual(r.jobPartId, collectionPart.id, "collect recorded against the collection stop");
      assert.ok(r.fromCustody.startsWith("customer_origin:"), `fromCustody=${r.fromCustody}`);
      assert.ok(r.toCustody.startsWith("on_vehicle:"), `toCustody=${r.toCustody}`);
      assert.strictEqual(Number(r.quantity), 10, "quantity threaded from actualQuantity");
      assert.ok(r.eventId > 0, "eventId set (invariant 5)");
    });

    await t.test("idempotent collected → no duplicate custody row", async () => {
      // Re-send the exact same collected event (same clientEventId).
      const res = await app.inject({
        method: "PATCH", url: `/jobs/${job.id}/status`,
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { status: "collected", clientEventId: `${PREFIX}collected-${TS}`, clientTimestamp: new Date().toISOString(), actualQuantity: "10" },
      });
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).duplicate, true);
      const collects = await prisma.loadTrack.count({ where: { jobId: job.id, transactionType: "collect" } });
      assert.strictEqual(collects, 1, "no duplicate collect row");
    });

    await t.test("B1: deliver writes the second custody row (on_vehicle → customer_dest)", async () => {
      assert.strictEqual((await send("arrived_dropoff")).statusCode, 200);
      const res = await send("completed", { actualQuantity: "10", actualUnit: "pallets", podNumber: "POD123" });
      assert.strictEqual(res.statusCode, 200, res.body);

      const rows = await prisma.loadTrack.findMany({ where: { jobId: job.id }, orderBy: { id: "asc" } });
      assert.strictEqual(rows.length, 2, "exactly two custody rows after deliver");
      const deliver = rows[1];
      assert.strictEqual(deliver.transactionType, "deliver");
      assert.strictEqual(deliver.jobPartId, deliveryPart.id, "deliver recorded against the delivery stop");
      assert.ok(deliver.fromCustody.startsWith("on_vehicle:"), `fromCustody=${deliver.fromCustody}`);
      assert.ok(deliver.toCustody.startsWith("customer_dest:"), `toCustody=${deliver.toCustody}`);
      // Final execution state delivered; Step 3 reconciler rolls Job.status to completed.
      const a = await prisma.runAssignment.findUnique({ where: { id: assignment.id } });
      assert.strictEqual(a?.status, "delivered");
      const j = await prisma.job.findUnique({ where: { id: job.id } });
      assert.strictEqual(j?.status, "completed");
    });

    // ── Invariant 3: deliver before collect is rejected, writes nothing ───────
    await t.test("invariant 3: deliver without prior collect → 400, no custody row", async () => {
      const job2 = await prisma.job.create({
        data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}Cust2`, status: "planned" },
      });
      const dPart = await prisma.jobPart.create({
        data: { companyId: company.id, jobId: job2.id, sequenceNumber: 1, type: "delivery", quantityUnit: "pallets" },
      });
      const run2 = await prisma.run.create({
        data: {
          companyId: company.id, runReference: `${PREFIX}RUN2-${TS}`, createdBy: planner.id,
          assignedDriverId: driverProfile.id, status: "assigned", publishedToDriver: true,
        },
      });
      const asg2 = await prisma.runAssignment.create({
        data: {
          companyId: company.id, runId: run2.id, jobPartId: dPart.id, jobId: job2.id,
          sequenceNumber: 1, addedBy: planner.id, status: "at_dropoff", // execution-valid for completed
        },
      });

      const res = await app.inject({
        method: "PATCH", url: `/jobs/${job2.id}/status`,
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { status: "completed", clientEventId: `${PREFIX}j2done-${TS}`, clientTimestamp: new Date().toISOString() },
      });
      assert.strictEqual(res.statusCode, 400, res.body);
      assert.match(JSON.parse(res.body).error ?? "", /no prior collection/i);

      const rows = await prisma.loadTrack.count({ where: { jobId: job2.id } });
      assert.strictEqual(rows, 0, "no custody row written on rejected deliver");
      const a = await prisma.runAssignment.findUnique({ where: { id: asg2.id } });
      assert.strictEqual(a?.status, "at_dropoff", "assignment unchanged on rejected deliver");
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

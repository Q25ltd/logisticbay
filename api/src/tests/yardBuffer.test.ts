/**
 * Yard buffer / B2 relay-via-depot — LOAD_MOVEMENT_PLAN Step 6.
 *
 * Run 1 (driver A): collect → drop_at_yard. Run 2 (driver B): pick_from_yard →
 * deliver. Expect 4 custody rows; the job stays `collected` while the load is at
 * the yard and only reconciles to `completed` after the final delivery; and a
 * pick_from_yard with no prior drop is rejected.
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

const PREFIX = "__YARDTEST__";
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

test("yard buffer — B2 relay reconciles via custody (Step 6)", async (t) => {
  const company = await prisma.company.create({ data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() } });
  const planner = await prisma.user.create({
    data: { name: `${PREFIX}P`, email: `${PREFIX}p_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } } },
  });
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

  // Job with collection + delivery stops.
  const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C`, status: "planned" } });
  const cPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets" } });
  const dPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery", quantityUnit: "pallets" } });

  // Run 1 → driver A (collect + drop). Run 2 → driver B (pick + deliver), depends on run 1.
  const run1 = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R1-${TS}`, createdBy: planner.id, assignedDriverId: A.p.id, status: "assigned", publishedToDriver: true } });
  await prisma.runAssignment.create({ data: { companyId: company.id, runId: run1.id, jobPartId: cPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });
  const run2 = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R2-${TS}`, createdBy: planner.id, assignedDriverId: B.p.id, status: "assigned", publishedToDriver: true, runType: "relay", dependsOnRunId: run1.id } });
  await prisma.runAssignment.create({ data: { companyId: company.id, runId: run2.id, jobPartId: dPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

  const sync = (token: string, events: unknown[]) =>
    app.inject({ method: "POST", url: "/sync/events", headers: { authorization: `Bearer ${token}` }, payload: { events } });
  const jobStatus = async () => (await prisma.job.findUnique({ where: { id: job.id } }))?.status;

  try {
    await t.test("run 1: collect then drop_at_yard → job 'collected' (at yard, not delivered)", async () => {
      const res = await sync(A.token, [
        ev("started", job.id),
        ev("arrived_pickup", job.id),
        ev("collected", job.id, { actualQuantity: "10" }),
        ev("drop_at_yard", job.id, { yardRef: "7", actualQuantity: "10" }),
      ]);
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);
      assert.strictEqual(await jobStatus(), "collected", "load is at yard — job not completed/delivered");
    });

    await t.test("run 2: pick_from_yard then deliver → job 'completed'", async () => {
      const res = await sync(B.token, [
        ev("pick_from_yard", job.id, { yardRef: "7" }),
        ev("arrived_dropoff", job.id),
        ev("completed", job.id, { actualQuantity: "10" }),
      ]);
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);
      assert.strictEqual(await jobStatus(), "completed");
    });

    await t.test("exactly four custody rows in the right order", async () => {
      const rows = await prisma.loadTrack.findMany({ where: { jobId: job.id }, orderBy: { id: "asc" }, select: { transactionType: true, fromCustody: true, toCustody: true } });
      assert.deepStrictEqual(rows.map(r => r.transactionType), ["collect", "drop_at_yard", "pick_from_yard", "deliver"]);
      assert.ok(rows[1].toCustody.startsWith("yard:"), `drop → ${rows[1].toCustody}`);
      assert.ok(rows[2].fromCustody.startsWith("yard:"), `pick ← ${rows[2].fromCustody}`);
      assert.ok(rows[3].toCustody.startsWith("customer_dest:"), `deliver → ${rows[3].toCustody}`);
    });

    await t.test("pick_from_yard with no prior drop is rejected", async () => {
      const job2 = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C2`, status: "planned" } });
      const p2 = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job2.id, sequenceNumber: 1, type: "delivery" } });
      const r3 = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R3-${TS}`, createdBy: planner.id, assignedDriverId: B.p.id, status: "assigned", publishedToDriver: true } });
      await prisma.runAssignment.create({ data: { companyId: company.id, runId: r3.id, jobPartId: p2.id, jobId: job2.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

      const res = await sync(B.token, [ ev("pick_from_yard", job2.id, { yardRef: "9" }) ]);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.failed.length, 1, res.body);
      assert.match(body.failed[0].failureReason ?? "", /no prior drop_at_yard/i);
      const cnt = await prisma.loadTrack.count({ where: { jobId: job2.id } });
      assert.strictEqual(cnt, 0, "no custody row on rejected pick");
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
    await prisma.driverProfile.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, A.u.id, B.u.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

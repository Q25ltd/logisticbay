/**
 * Multi-drop completion — task #28/#29 (2026-07-22).
 *
 * One collection + TWO delivery stops on the same run, three RunAssignments.
 * Two regressions covered together:
 *
 *  1. applyJobEvent custody targeting (D2.4): a job-wide `.find()` for the
 *     "delivery part" always returned the FIRST delivery-type JobPart,
 *     regardless of which assignment fired the `completed` event — so a
 *     second delivery's custody row silently landed on the first delivery's
 *     JobPart id and the job could never reach `completed`. Fixed by
 *     preferring the firing assignment's OWN JobPart when its type matches.
 *  2. reconcileLoadState completion (task #28): Job.status reads each
 *     delivery-type part's own latest custody, not RunAssignment-status
 *     counts — so completion only asserts once ALL delivery parts are
 *     independently at customer_dest.
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

const PREFIX = "__MULTIDROP__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

let seq = 0;
const ev = (eventType: string, jobId: number, runAssignmentId: number, extra: Record<string, unknown> = {}) => ({
  eventType, jobId, runAssignmentId,
  clientEventId: `${PREFIX}${eventType}-${TS}-${seq}`,
  clientTimestamp: new Date(TS + (seq++ * 1000)).toISOString(),
  ...extra,
});

test("multi-drop — each delivery part reconciles independently to completed", async (t) => {
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

  const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}Cust`, status: "planned" } });
  const cPart  = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets" } });
  const d1Part = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery",   quantityUnit: "pallets" } });
  const d2Part = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 3, type: "delivery",   quantityUnit: "pallets" } });
  const run = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R1-${TS}`, createdBy: planner.id, assignedDriverId: profile.id, status: "assigned", publishedToDriver: true } });
  const cAsg  = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: cPart.id,  jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });
  const d1Asg = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: d1Part.id, jobId: job.id, sequenceNumber: 2, addedBy: planner.id, status: "not_started" } });
  const d2Asg = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: d2Part.id, jobId: job.id, sequenceNumber: 3, addedBy: planner.id, status: "not_started" } });

  const sync = (events: unknown[]) =>
    app.inject({ method: "POST", url: "/sync/events", headers: { authorization: `Bearer ${driverToken}` }, payload: { events } });
  const jobStatus = async () => (await prisma.job.findUnique({ where: { id: job.id } }))?.status;
  const runChain = (asgId: number) => [
    ev("started", job.id, asgId), ev("arrived_pickup", job.id, asgId),
    ev("collected", job.id, asgId, { actualQuantity: "5" }),
    ev("arrived_dropoff", job.id, asgId), ev("completed", job.id, asgId, { actualQuantity: "5" }),
  ];

  try {
    await t.test("collect on the collection assignment", async () => {
      const res = await sync([ev("started", job.id, cAsg.id), ev("arrived_pickup", job.id, cAsg.id), ev("collected", job.id, cAsg.id, { actualQuantity: "10" })]);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);
      // The job's ONE collection part is now on the vehicle, and nothing is
      // delivered → `collected` (§A6: all parts collected, none yet delivered).
      assert.strictEqual(await jobStatus(), "collected");
    });

    await t.test("deliver stop 1 → partially_delivered, NOT completed", async () => {
      const res = await sync(runChain(d1Asg.id));
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);
      assert.strictEqual(await jobStatus(), "partially_delivered");

      const d1Row = await prisma.loadTrack.findFirst({ where: { jobId: job.id, transactionType: "deliver" }, orderBy: { id: "desc" } });
      assert.strictEqual(d1Row?.jobPartId, d1Part.id, "stop 1's deliver custody targets stop 1's own JobPart");
    });

    await t.test("deliver stop 2 → completed", async () => {
      const res = await sync(runChain(d2Asg.id));
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);
      assert.strictEqual(await jobStatus(), "completed");

      const d2Row = await prisma.loadTrack.findFirst({ where: { jobId: job.id, transactionType: "deliver" }, orderBy: { id: "desc" } });
      assert.strictEqual(d2Row?.jobPartId, d2Part.id, "stop 2's deliver custody targets stop 2's own JobPart, not stop 1's");

      const deliverRows = await prisma.loadTrack.findMany({ where: { jobId: job.id, transactionType: "deliver" }, select: { jobPartId: true } });
      assert.deepStrictEqual(new Set(deliverRows.map(r => r.jobPartId)), new Set([d1Part.id, d2Part.id]), "both delivery parts have their OWN deliver row");
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
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, driverUser.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

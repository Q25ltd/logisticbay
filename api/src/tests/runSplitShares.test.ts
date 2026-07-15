/**
 * Split shares — the ledger must balance and each run must carry only ITS
 * share of the load (user-reported: a 30-pallet job split into two runs
 * showed "collect 30 pallets" AND full weight on BOTH runs, and the capacity
 * check demanded splitting again forever).
 *
 * Chain under test:
 *  1. POST /runs/:id/assignments defaults quantityAssigned from the form-born
 *     quantities (stop quantityRequired, else job quantity) — not 0.
 *  2. POST /runs/:id/split keepQuantity=26 → 26 stays, 4 moves; 26+4 = 30.
 *  3. Derived maxLoadWeight is apportioned by share: 13 500 kg × 26/30 = 11 700
 *     and × 4/30 = 1 800 — not 13 500 on both.
 *  4. Guardrail: keeping ≥ the largest assigned quantity → NOTHING_TO_SPLIT.
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

const PREFIX = "__SPLITSHARE__";
const TS     = Date.now();

test("split shares balance and weight is apportioned per run", async (t) => {
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
  const token = jwt.sign({ userId: planner.id, companyId: company.id, role: "planner" }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
  const app = await buildApp(prisma, { silent: true });

  try {
    // Form-shaped: 30 pallets / 13 500 kg at JOB level, bare stops.
    const job = await prisma.job.create({
      data: {
        companyId: company.id, createdByUserId: planner.id,
        customerName: `${PREFIX}C`, status: "ready_to_plan",
        quantity: 30, quantityUnit: "pallets", weight: 13500,
      },
    });
    const collect = await prisma.jobPart.create({
      data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection" },
    });
    const deliver = await prisma.jobPart.create({
      data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery" },
    });

    const runRes = await app.inject({
      method: "POST", url: "/runs",
      headers: { authorization: `Bearer ${token}` }, payload: {},
    });
    const runId = JSON.parse(runRes.body).id as number;

    for (const part of [collect, deliver]) {
      const res = await app.inject({
        method: "POST", url: `/runs/${runId}/assignments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { jobPartId: part.id, jobId: job.id },
      });
      assert.strictEqual(res.statusCode, 201, res.body);
    }

    await t.test("assignments default their share from the job quantity, not 0", async () => {
      const rows = await prisma.runAssignment.findMany({ where: { runId, removedAt: null } });
      assert.deepStrictEqual(rows.map(r => Number(r.quantityAssigned)), [30, 30]);
      assert.deepStrictEqual(rows.map(r => r.quantityUnit), ["pallets", "pallets"]);
    });

    await t.test("guardrail: keep >= largest assigned quantity is refused", async () => {
      const res = await app.inject({
        method: "POST", url: `/runs/${runId}/split`,
        headers: { authorization: `Bearer ${token}` },
        payload: { keepQuantity: 30 },
      });
      assert.strictEqual(res.statusCode, 400, res.body);
      assert.strictEqual(JSON.parse(res.body).code, "NOTHING_TO_SPLIT");
    });

    let newRunId = 0;
    await t.test("split keep 26 → shares 26/4, ledger balances to 30", async () => {
      const res = await app.inject({
        method: "POST", url: `/runs/${runId}/split`,
        headers: { authorization: `Bearer ${token}` },
        payload: { keepQuantity: 26 },
      });
      assert.strictEqual(res.statusCode, 200, res.body);
      newRunId = JSON.parse(res.body).newRun.id as number;

      const kept  = await prisma.runAssignment.findMany({ where: { runId, removedAt: null } });
      const moved = await prisma.runAssignment.findMany({ where: { runId: newRunId, removedAt: null } });
      assert.deepStrictEqual(kept.map(r => Number(r.quantityAssigned)), [26, 26]);
      assert.deepStrictEqual(moved.map(r => Number(r.quantityAssigned)), [4, 4]);
    });

    await t.test("derived weight is apportioned: 11 700 / 1 800 — not 13 500 twice", async () => {
      const orig = await prisma.run.findUnique({ where: { id: runId } });
      const split = await prisma.run.findUnique({ where: { id: newRunId } });
      assert.strictEqual(Number(orig?.maxLoadWeight), 11700);
      assert.strictEqual(Number(split?.maxLoadWeight), 1800);
    });

    // ── The user-reported disappearance: delete the split leg → the 4 must
    //    come BACK to the planning board as a visible remainder, and be
    //    re-assignable (multi-trip: same stop on another run takes the rest).
    await t.test("deleting the split leg surfaces the remainder on the board", async () => {
      const movedRows = await prisma.runAssignment.findMany({ where: { runId: newRunId, removedAt: null } });
      for (const row of movedRows) {
        const res = await app.inject({
          method: "DELETE", url: `/planning/runs/${newRunId}/assignments/${row.id}`,
          headers: { authorization: `Bearer ${token}` },
        });
        assert.ok(res.statusCode < 300, res.body);
      }
      // stops carry no time window in this fixture — query the work items by
      // custody-independent path is date-bound, so assert via the ledger the
      // board uses: 26 assigned, 4 remaining.
      const rows = await prisma.runAssignment.findMany({ where: { jobPartId: collect.id, removedAt: null } });
      const assigned = rows.reduce((s, r) => s + Number(r.quantityAssigned), 0);
      assert.strictEqual(assigned, 26, "only the kept 26 remain assigned");
    });

    await t.test("multi-trip: re-adding the stop to a second run takes the REMAINDER (4)", async () => {
      const trip2 = await app.inject({
        method: "POST", url: "/runs",
        headers: { authorization: `Bearer ${token}` }, payload: {},
      });
      const trip2Id = JSON.parse(trip2.body).id as number;
      const res = await app.inject({
        method: "POST", url: `/runs/${trip2Id}/assignments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { jobPartId: collect.id, jobId: job.id },
      });
      assert.strictEqual(res.statusCode, 201, res.body);
      const created = await prisma.runAssignment.findFirst({ where: { runId: trip2Id, jobPartId: collect.id, removedAt: null } });
      assert.strictEqual(Number(created?.quantityAssigned), 4, "second trip defaults to the remainder");

      // Fully assigned now → a third assignment is refused with the breakdown
      const trip3 = await app.inject({
        method: "POST", url: "/runs",
        headers: { authorization: `Bearer ${token}` }, payload: {},
      });
      const trip3Id = JSON.parse(trip3.body).id as number;
      const refuse = await app.inject({
        method: "POST", url: `/runs/${trip3Id}/assignments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { jobPartId: collect.id, jobId: job.id },
      });
      assert.strictEqual(refuse.statusCode, 409, refuse.body);
      assert.strictEqual(JSON.parse(refuse.body).code, "FULLY_ASSIGNED");
    });

    await t.test("over-assignment is refused with the ledger breakdown", async () => {
      // deliver part still has 4 remaining (its split leg was removed too)
      const run4 = await app.inject({
        method: "POST", url: "/runs",
        headers: { authorization: `Bearer ${token}` }, payload: {},
      });
      const run4Id = JSON.parse(run4.body).id as number;
      const res = await app.inject({
        method: "POST", url: `/runs/${run4Id}/assignments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { jobPartId: deliver.id, jobId: job.id, quantityAssigned: 10 },
      });
      assert.strictEqual(res.statusCode, 400, res.body);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.code, "OVER_ASSIGNED");
      assert.match(body.error, /Only 4 of 30/);
    });
  } finally {
    await app.close();
    await prisma.runAssignment.deleteMany({ where: { companyId: company.id } });
    await prisma.run.deleteMany({ where: { companyId: company.id } });
    await prisma.jobPart.deleteMany({ where: { companyId: company.id } });
    await prisma.job.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: planner.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

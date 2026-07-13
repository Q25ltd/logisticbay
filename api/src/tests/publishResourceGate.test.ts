/**
 * B5 — hard resource gate on publish.
 *
 * Publish must be refused server-side while any HARD readiness check fails:
 *   - hazardous load + driver without ADR  → RESOURCE_NOT_READY
 *   - fix the driver's ADR                 → publish succeeds
 *   - planning publish route with no driver → RESOURCE_NOT_READY
 * Soft/unknown checks (no vehicle, MOT unknown…) must never block.
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

const PREFIX = "__B5GATE__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

test("B5 — publish blocked on hard resource failures, allowed once fixed", async (t) => {
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
  // No ADR — publishing a hazardous load with this driver must be blocked.
  const driverProfile = await prisma.driverProfile.create({
    data: { companyId: company.id, userId: driverUser.id, displayName: `${PREFIX}D`, status: "active", adrAllowed: false },
  });
  const job = await prisma.job.create({
    data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C`, status: "ready_to_plan", hazardClass: "3" },
  });
  const part = await prisma.jobPart.create({
    data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection" },
  });

  const plannerToken = tok(planner.id, company.id, "planner");
  const app = await buildApp(prisma, { silent: true });

  try {
    const createRes = await app.inject({
      method: "POST", url: "/runs",
      headers: { authorization: `Bearer ${plannerToken}` },
      payload: { assignedDriverId: driverProfile.id },
    });
    assert.strictEqual(createRes.statusCode, 201, createRes.body);
    const runId = JSON.parse(createRes.body).id as number;

    const addRes = await app.inject({
      method: "POST", url: `/runs/${runId}/assignments`,
      headers: { authorization: `Bearer ${plannerToken}` },
      payload: { jobPartId: part.id, jobId: job.id },
    });
    assert.strictEqual(addRes.statusCode, 201, addRes.body);

    await t.test("hazardous load + no ADR → publish refused with RESOURCE_NOT_READY", async () => {
      const res = await app.inject({ method: "POST", url: `/runs/${runId}/publish`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(res.statusCode, 400, res.body);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.code, "RESOURCE_NOT_READY");
      assert.match(body.error, /ADR/i);
    });

    await t.test("fixing the driver's ADR lets publish through (soft/unknown checks don't block)", async () => {
      await prisma.driverProfile.update({ where: { id: driverProfile.id }, data: { adrAllowed: true } });
      const res = await app.inject({ method: "POST", url: `/runs/${runId}/publish`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).publishedToDriver, true);
    });

    await t.test("planning publish route refuses a run with no driver", async () => {
      // Second run, stops but no driver — the planning route previously allowed this.
      const r2 = await app.inject({
        method: "POST", url: "/runs",
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: {},
      });
      assert.strictEqual(r2.statusCode, 201, r2.body);
      const run2Id = JSON.parse(r2.body).id as number;
      const part2 = await prisma.jobPart.create({
        data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery" },
      });
      const add2 = await app.inject({
        method: "POST", url: `/runs/${run2Id}/assignments`,
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { jobPartId: part2.id, jobId: job.id },
      });
      assert.strictEqual(add2.statusCode, 201, add2.body);

      const res = await app.inject({ method: "POST", url: `/planning/runs/${run2Id}/publish`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(res.statusCode, 400, res.body);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.code, "RESOURCE_NOT_READY");
      assert.match(body.error, /driver/i);
    });

  } finally {
    await app.close();
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

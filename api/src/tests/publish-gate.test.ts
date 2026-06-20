/**
 * Publish gate — LOAD_MOVEMENT_PLAN Step 4 / audit 🟠 #1.
 *
 *   - A driver assigned to an UNPUBLISHED run sees nothing (GET /jobs, /jobs/my)
 *     and gets 403 on GET /jobs/:id.
 *   - After publish → visible. After recall → hidden again.
 *   - A planner querying GET /jobs?driverId still sees the run throughout.
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

const PREFIX = "__PUBTEST__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

test("Publish gate — driver visibility follows publishedToDriver (Step 4)", async (t) => {
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
  const driverToken  = tok(driverUser.id, company.id, "driver");
  const plannerToken = tok(planner.id, company.id, "planner");
  const app = await buildApp(prisma, { silent: true });

  const job = await prisma.job.create({
    data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C`, status: "planned" },
  });
  // Collection stop dated today so it appears in /jobs/my's 7-day window.
  const collectionPart = await prisma.jobPart.create({
    data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", timeWindowStart: new Date() },
  });
  // Run starts UNPUBLISHED (draft).
  const run = await prisma.run.create({
    data: {
      companyId: company.id, runReference: `${PREFIX}RUN-${TS}`, createdBy: planner.id,
      assignedDriverId: driverProfile.id, status: "draft", publishedToDriver: false,
    },
  });
  await prisma.runAssignment.create({
    data: {
      companyId: company.id, runId: run.id, jobPartId: collectionPart.id, jobId: job.id,
      sequenceNumber: 1, addedBy: planner.id, status: "not_started",
    },
  });

  const getJobs = (token: string, qs = "") =>
    app.inject({ method: "GET", url: `/jobs${qs}`, headers: { authorization: `Bearer ${token}` } });
  const getMy = () =>
    app.inject({ method: "GET", url: `/jobs/my`, headers: { authorization: `Bearer ${driverToken}` } });
  const getOne = () =>
    app.inject({ method: "GET", url: `/jobs/${job.id}`, headers: { authorization: `Bearer ${driverToken}` } });
  const setPublished = (v: boolean) =>
    prisma.run.update({ where: { id: run.id }, data: { publishedToDriver: v } });

  try {
    await t.test("unpublished: driver sees nothing; GET /jobs/:id → 403", async () => {
      const list = await getJobs(driverToken);
      assert.strictEqual(JSON.parse(list.body).data.length, 0, "GET /jobs hides unpublished");
      const my = await getMy();
      const myBody = JSON.parse(my.body);
      assert.strictEqual([...(myBody.data ?? []), ...(myBody.upcoming ?? [])].length, 0, "/jobs/my hides unpublished");
      assert.strictEqual((await getOne()).statusCode, 403, "GET /jobs/:id → 403 when unpublished");
    });

    await t.test("planner ?driverId sees the run even while unpublished", async () => {
      const res = await getJobs(plannerToken, `?driverId=${driverProfile.id}`);
      const ids = JSON.parse(res.body).data.map((j: { id: number }) => j.id);
      assert.ok(ids.includes(job.id), "planner view is not gated by publish");
    });

    await t.test("after publish: driver sees it; GET /jobs/:id → 200", async () => {
      await setPublished(true);
      const ids = JSON.parse((await getJobs(driverToken)).body).data.map((j: { id: number }) => j.id);
      assert.ok(ids.includes(job.id), "GET /jobs shows published");
      const my = JSON.parse((await getMy()).body);
      const myIds = [...(my.data ?? []), ...(my.upcoming ?? [])].map((j: { id: number }) => j.id);
      assert.ok(myIds.includes(job.id), "/jobs/my shows published");
      assert.strictEqual((await getOne()).statusCode, 200, "GET /jobs/:id → 200 when published");
    });

    await t.test("after recall: hidden again; GET /jobs/:id → 403", async () => {
      await setPublished(false);
      assert.strictEqual(JSON.parse((await getJobs(driverToken)).body).data.length, 0, "recall hides from GET /jobs");
      assert.strictEqual((await getOne()).statusCode, 403, "recall → 403 on GET /jobs/:id");
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

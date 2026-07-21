/**
 * Driver-facing vehicle info — GET /jobs/my and GET /jobs/:id must tell the
 * driver which truck/trailer the planner assigned, and stay honestly null
 * when nothing was pinned (yard-grab — publish never hard-blocks on a missing
 * vehicle, only a missing driver, so the app's manual-entry fallback must see
 * a real null, not a phantom read of a field that was never on the wire).
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

const PREFIX = "__DRVVEH__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

test("driver vehicle info — assigned reg flows through, unassigned stays honestly null", async (t) => {
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
  const driverToken  = tok(driverUser.id, company.id, "driver");
  const app = await buildApp(prisma, { silent: true });

  const suffix = String(TS).slice(-8);
  const truck   = await prisma.fleetUnit.create({ data: { companyId: company.id, registration: `TRK-${suffix}`, bodyCategory: "rigid", gvwClass: "18t", vehicleClass: "rigid" } });
  const trailer = await prisma.fleetTrailer.create({ data: { companyId: company.id, registration: `TRL-${suffix}`, bodyType: "curtainsider", trailerType: "curtainsider" } });

  const today = new Date();
  const mkJob = async (tag: string) => {
    const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, jobReference: `${PREFIX}${tag}`, customerName: `${PREFIX}Cust`, status: "planned" } });
    const stop = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection",
      timeWindowStart: today, timeWindowEnd: today } });
    return { job, stop };
  };

  try {
    await t.test("run WITH truck+trailer assigned → registrations flow through GET /jobs/my and GET /jobs/:id", async () => {
      const { job, stop } = await mkJob("A");
      const run = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R1-${TS}`, createdBy: planner.id,
        assignedDriverId: profile.id, assignedTruckId: truck.id, assignedTrailerId: trailer.id, status: "assigned", publishedToDriver: true } });
      await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: stop.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

      const myRes = await app.inject({ method: "GET", url: "/jobs/my", headers: { authorization: `Bearer ${driverToken}` } });
      assert.strictEqual(myRes.statusCode, 200, myRes.body);
      const myBody = JSON.parse(myRes.body) as { data: { id: number; assignedTruck: string | null; assignedTrailer: string | null }[] };
      const myJob = myBody.data.find(j => j.id === job.id);
      assert.ok(myJob, "job visible on /jobs/my");
      assert.strictEqual(myJob!.assignedTruck, truck.registration, "GET /jobs/my carries the assigned truck reg");
      assert.strictEqual(myJob!.assignedTrailer, trailer.registration, "GET /jobs/my carries the assigned trailer reg");

      const oneRes = await app.inject({ method: "GET", url: `/jobs/${job.id}`, headers: { authorization: `Bearer ${driverToken}` } });
      assert.strictEqual(oneRes.statusCode, 200, oneRes.body);
      const oneBody = JSON.parse(oneRes.body) as { assignedTruck: string | null; assignedTrailer: string | null };
      assert.strictEqual(oneBody.assignedTruck, truck.registration, "GET /jobs/:id carries the assigned truck reg");
      assert.strictEqual(oneBody.assignedTrailer, trailer.registration, "GET /jobs/:id carries the assigned trailer reg");
    });

    await t.test("run with NO truck/trailer assigned (yard-grab) → honestly null, never invented", async () => {
      const { job, stop } = await mkJob("B");
      const run = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R2-${TS}`, createdBy: planner.id,
        assignedDriverId: profile.id, status: "assigned", publishedToDriver: true } });
      await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: stop.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

      const myRes = await app.inject({ method: "GET", url: "/jobs/my", headers: { authorization: `Bearer ${driverToken}` } });
      const myBody = JSON.parse(myRes.body) as { data: { id: number; assignedTruck: string | null; assignedTrailer: string | null }[] };
      const myJob = myBody.data.find(j => j.id === job.id);
      assert.strictEqual(myJob!.assignedTruck, null, "no truck pinned — null, not a fake value (driver enters manually)");
      assert.strictEqual(myJob!.assignedTrailer, null);

      const oneRes = await app.inject({ method: "GET", url: `/jobs/${job.id}`, headers: { authorization: `Bearer ${driverToken}` } });
      const oneBody = JSON.parse(oneRes.body) as { assignedTruck: string | null; assignedTrailer: string | null };
      assert.strictEqual(oneBody.assignedTruck, null);
      assert.strictEqual(oneBody.assignedTrailer, null);
    });

  } finally {
    await app.close();
    await prisma.runAssignment.deleteMany({ where: { companyId: company.id } });
    await prisma.run.deleteMany({ where: { companyId: company.id } });
    await prisma.jobPart.deleteMany({ where: { companyId: company.id } });
    await prisma.job.deleteMany({ where: { companyId: company.id } });
    await prisma.fleetUnit.deleteMany({ where: { companyId: company.id } });
    await prisma.fleetTrailer.deleteMany({ where: { companyId: company.id } });
    await prisma.driverProfile.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, driverUser.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

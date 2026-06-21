/**
 * GET /planning/propose-runs — Phase A3 (advisory proposal engine).
 *
 * Two unplanned jobs delivering into the same corridor → at least one candidate
 * run proposal is returned, and NOTHING is created (proposals are advisory).
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

const PREFIX = "__PROPTEST__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

test("propose-runs — returns advisory candidates, creates nothing (A3)", async (t) => {
  const company = await prisma.company.create({ data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() } });
  const planner = await prisma.user.create({
    data: { name: `${PREFIX}P`, email: `${PREFIX}p_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } } },
  });
  const token = tok(planner.id, company.id, "planner");
  const app = await buildApp(prisma, { silent: true });

  // Two ready_to_plan jobs delivering into the same corridor (Reading area).
  const mkJob = async (tag: string, dLat: number, dLng: number) => {
    const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}${tag}`, status: "ready_to_plan" } });
    await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", postcode: "M1 1AA" } });
    await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery", lat: dLat, lng: dLng } });
    return job;
  };
  await mkJob("A", 51.4543, -0.9781);
  await mkJob("B", 51.4600, -0.9900);

  try {
    await t.test("returns proposals and creates no runs", async () => {
      const res = await app.inject({ method: "GET", url: "/planning/propose-runs", headers: { authorization: `Bearer ${token}` } });
      assert.strictEqual(res.statusCode, 200, res.body);
      const body = JSON.parse(res.body);
      assert.ok(Array.isArray(body.proposals), "proposals is an array");
      assert.ok(body.proposals.length >= 1, "at least one candidate proposed");
      for (const p of body.proposals) {
        assert.ok(["direct", "multi_drop", "groupage"].includes(p.strategy), `strategy: ${p.strategy}`);
        assert.ok(typeof p.why === "string" && p.why.length > 0, "has a why");
        assert.ok("compatibility" in p && "geometry" in p, "scored with compatibility + geometry");
      }
      // Advisory: nothing materialised.
      const runs = await prisma.run.count({ where: { companyId: company.id } });
      assert.strictEqual(runs, 0, "proposals must not create runs");
    });
  } finally {
    await app.close();
    await prisma.jobPart.deleteMany({ where: { companyId: company.id } });
    await prisma.job.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: planner.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

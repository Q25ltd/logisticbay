/**
 * Derived run requirements must come from FORM-BORN job data (four-intake-gates).
 *
 * Regression: hasHazardous/hasTemperatureLoad/hasOversized/maxLoadWeight were
 * derived ONLY from JobPart columns (hazardous/tempControlled/oversized/
 * stopWeight) that no intake form writes — so every run's requirement badges
 * and requiredTrailerType were permanently false/null in production, and a
 * flatbed could be allocated against a temperature-controlled or hazardous
 * load with no visible requirement. The fixture here creates the job exactly
 * as the CJP/PRF do: job-level hazardClass/tempControlled/specialRequirements/
 * weight, stop rows bare.
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

const PREFIX = "__DERIVEDREQ__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

test("run requirements derive from job-level form data when stop flags are bare", async (t) => {
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
  const plannerToken = tok(planner.id, company.id, "planner");
  const app = await buildApp(prisma, { silent: true });

  try {
    // The job exactly as the intake forms create it: everything at JOB level,
    // stop rows carrying only location/sequence (no stop-level load flags).
    const job = await prisma.job.create({
      data: {
        companyId: company.id, createdByUserId: planner.id,
        customerName: `${PREFIX}C`, status: "ready_to_plan",
        hazardClass: "3", tempControlled: true, tempRange: "chilled",
        specialRequirements: ["oversized"], weight: 12000,
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
      headers: { authorization: `Bearer ${plannerToken}` },
      payload: {},
    });
    assert.strictEqual(runRes.statusCode, 201, runRes.body);
    const runId = JSON.parse(runRes.body).id as number;

    for (const part of [collect, deliver]) {
      const addRes = await app.inject({
        method: "POST", url: `/runs/${runId}/assignments`,
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { jobPartId: part.id, jobId: job.id },
      });
      assert.strictEqual(addRes.statusCode, 201, addRes.body);
    }

    const run = await prisma.run.findUnique({ where: { id: runId } });
    assert.ok(run, "run exists");

    await t.test("hazardous/temp/oversized derive from job-level fields", () => {
      assert.strictEqual(run!.hasHazardous, true, "hazardClass '3' → hasHazardous");
      assert.strictEqual(run!.hasTemperatureLoad, true, "job.tempControlled → hasTemperatureLoad");
      assert.strictEqual(run!.hasOversized, true, "specialRequirements ['oversized'] → hasOversized");
    });

    await t.test("requiredTrailerType fires (temperature wins)", () => {
      assert.strictEqual(run!.requiredTrailerType, "temperature_controlled");
    });

    await t.test("maxLoadWeight uses job weight once, not doubled across collect+deliver", () => {
      assert.strictEqual(Number(run!.maxLoadWeight), 12000);
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

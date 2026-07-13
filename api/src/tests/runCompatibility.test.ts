/**
 * Run vehicle compatibility — LOAD_MOVEMENT_PLAN Step 5 / audit 🟠 #2, #3.
 *
 *   - computeRunCompatibility pure rules (no DB).
 *   - integration: a temp load on a dry trailer → trailerCompatible=false →
 *     publish blocked; override → publish allowed; non-existent trailer → 400.
 */

import "dotenv/config";
import "../lib/env.js";
import { env } from "../lib/env.js";
import { describe, it, test, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { PrismaClient } from "../generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildApp } from "../app.js";
import { computeRunCompatibility } from "../lib/runCompatibility.js";

// ── Pure rule units (no DB) ──────────────────────────────────────────────────
describe("computeRunCompatibility (pure rules)", () => {
  const noLoad = { hasHazardous: false, hasTemperatureLoad: false, maxLoadWeightKg: null };

  it("temp load on a dry (box) trailer → trailer incompatible", () => {
    const r = computeRunCompatibility({ bodyType: "box" }, null, { ...noLoad, hasTemperatureLoad: true });
    assert.strictEqual(r.trailerCompatible, false);
  });
  it("temp load on a fridge trailer → compatible", () => {
    const r = computeRunCompatibility({ bodyType: "fridge" }, null, { ...noLoad, hasTemperatureLoad: true });
    assert.strictEqual(r.trailerCompatible, true);
  });
  it("hazardous load in a box body → trailer incompatible", () => {
    const r = computeRunCompatibility({ bodyType: "box" }, null, { ...noLoad, hasHazardous: true });
    assert.strictEqual(r.trailerCompatible, false);
  });
  it("hazardous load on a curtainsider → compatible", () => {
    const r = computeRunCompatibility({ bodyType: "curtainsider" }, null, { ...noLoad, hasHazardous: true });
    assert.strictEqual(r.trailerCompatible, true);
  });
  it("overweight for vehicle category → vehicle incompatible", () => {
    const r = computeRunCompatibility(null, { vehicleClass: "van", bodyCategory: "" }, { ...noLoad, maxLoadWeightKg: 20000 });
    assert.strictEqual(r.vehicleCompatible, false);
  });
  it("within category payload → vehicle compatible", () => {
    const r = computeRunCompatibility(null, { vehicleClass: "tractor", bodyCategory: "" }, { ...noLoad, maxLoadWeightKg: 20000 });
    assert.strictEqual(r.vehicleCompatible, true);
  });
  it("no trailer / no truck → both compatible (planner assigns later)", () => {
    const r = computeRunCompatibility(null, null, { hasHazardous: true, hasTemperatureLoad: true, maxLoadWeightKg: 99999 });
    assert.deepStrictEqual(r, { trailerCompatible: true, vehicleCompatible: true });
  });
});

// ── Integration ──────────────────────────────────────────────────────────────
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });
after(async () => { await prisma.$disconnect(); });

const PREFIX = "__VCTEST__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

test("run compatibility — temp load + dry trailer blocks publish (Step 5)", async (t) => {
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
    // canUseTrailer: the B5 resource gate hard-fails publish when a trailer is
    // assigned to a driver who isn't trailer-rated — this test is about the
    // COMPAT override, so its driver must be trailer-capable.
    data: { companyId: company.id, userId: driverUser.id, displayName: `${PREFIX}D`, status: "active", canUseTrailer: true },
  });
  const job = await prisma.job.create({
    data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C`, status: "ready_to_plan" },
  });
  const part = await prisma.jobPart.create({
    data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", tempControlled: true },
  });
  const dryTrailer = await prisma.fleetTrailer.create({
    data: { companyId: company.id, registration: `${PREFIX}TR`, trailerType: "box", bodyType: "box", status: "available" },
  });

  const plannerToken = tok(planner.id, company.id, "planner");
  const app = await buildApp(prisma, { silent: true });

  const patchRun = (id: number, body: Record<string, unknown>) =>
    app.inject({ method: "PATCH", url: `/runs/${id}`, headers: { authorization: `Bearer ${plannerToken}` }, payload: body });

  try {
    // Create run with the driver assigned (needed for publish).
    const createRes = await app.inject({
      method: "POST", url: "/runs",
      headers: { authorization: `Bearer ${plannerToken}` },
      payload: { assignedDriverId: driverProfile.id },
    });
    assert.strictEqual(createRes.statusCode, 201, createRes.body);
    const runId = JSON.parse(createRes.body).id as number;

    // Add the temp-controlled stop → recalc requirements + compat (no trailer yet).
    const addRes = await app.inject({
      method: "POST", url: `/runs/${runId}/assignments`,
      headers: { authorization: `Bearer ${plannerToken}` },
      payload: { jobPartId: part.id, jobId: job.id },
    });
    assert.strictEqual(addRes.statusCode, 201, addRes.body);

    // Regression: an assignment created via the real endpoint must start at the
    // EXECUTION_STATES initial state so the driver can actually start it (Step 1).
    const createdAsg = await prisma.runAssignment.findFirst({ where: { runId, companyId: company.id } });
    assert.strictEqual(createdAsg?.status, "not_started", "new assignment must be 'not_started', not legacy 'pending'");

    await t.test("assigning a dry trailer to a temp load sets trailerCompatible=false", async () => {
      const res = await patchRun(runId, { assignedTrailerId: dryTrailer.id });
      assert.strictEqual(res.statusCode, 200, res.body);
      const run = JSON.parse((await app.inject({ method: "GET", url: `/runs/${runId}`, headers: { authorization: `Bearer ${plannerToken}` } })).body);
      assert.strictEqual(run.trailerCompatible, false, "temp load on box trailer → incompatible");
    });

    await t.test("publish is blocked while incompatible", async () => {
      const res = await app.inject({ method: "POST", url: `/runs/${runId}/publish`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(res.statusCode, 400, res.body);
      assert.strictEqual(JSON.parse(res.body).code, "COMPATIBILITY_FAILED");
    });

    await t.test("override allows publish", async () => {
      await patchRun(runId, { compatibilityOverridden: true, compatibilityOverrideReason: "fridge unit fitted on site" });
      const res = await app.inject({ method: "POST", url: `/runs/${runId}/publish`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(res.statusCode, 200, res.body);
    });

    await t.test("assigning a non-existent trailer is rejected", async () => {
      const res = await patchRun(runId, { assignedTrailerId: 999999999 });
      assert.strictEqual(res.statusCode, 400, res.body);
      assert.strictEqual(JSON.parse(res.body).code, "TRAILER_NOT_FOUND");
    });

  } finally {
    await app.close();
    await prisma.runAssignment.deleteMany({ where: { companyId: company.id } });
    await prisma.run.deleteMany({ where: { companyId: company.id } });
    await prisma.fleetTrailer.deleteMany({ where: { companyId: company.id } });
    await prisma.jobPart.deleteMany({ where: { companyId: company.id } });
    await prisma.job.deleteMany({ where: { companyId: company.id } });
    await prisma.driverProfile.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, driverUser.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

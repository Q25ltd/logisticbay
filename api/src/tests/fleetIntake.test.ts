/**
 * Fleet intake gate + shift trailer ownership (four-intake-gates rule)
 *
 * 1. Unit/trailer registration rejects non-canonical body types, invalid
 *    statuses, and out-of-range dimensions — garbage can no longer enter the
 *    registry that candidates/readiness/capacity algorithms read.
 * 2. trailerType is a legacy alias and is always persisted as the canonical
 *    bodyType (self-heals old free-typed rows on edit).
 * 3. A shift segment's trailerReg is matched against the company fleet:
 *    company trailer → "company"; unknown + driver claim → claim stored;
 *    unknown + no claim → "unregistered" + warning (never blocks).
 * 4. GET /fleet/trailers/lookup lets the driver app ask at vehicle setup.
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

const PREFIX = "__FLEETGATE__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

test("fleet intake gate + shift trailer ownership", async (t) => {
  const company = await prisma.company.create({
    data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() },
  });
  const otherCompany = await prisma.company.create({
    data: { name: `${PREFIX}Other_${TS}`, slug: `${PREFIX}other-${TS}`.toLowerCase() },
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

  const plannerToken = tok(planner.id, company.id, "planner");
  const driverToken  = tok(driverUser.id, company.id, "driver");
  const otherToken   = tok(planner.id, otherCompany.id, "planner");
  const app = await buildApp(prisma, { silent: true });

  const FLEET_REG = `${PREFIX}TR1`;

  try {
    await t.test("trailer with non-canonical bodyType 'Flatbed' is rejected", async () => {
      const res = await app.inject({
        method: "POST", url: "/fleet/trailers",
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { registration: `${PREFIX}BAD1`, bodyType: "Flatbed" },
      });
      assert.strictEqual(res.statusCode, 400, res.body);
      assert.match(JSON.parse(res.body).error, /body type/i);
    });

    await t.test("trailer with made-up status is rejected by the enum", async () => {
      const res = await app.inject({
        method: "POST", url: "/fleet/trailers",
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { registration: `${PREFIX}BAD2`, bodyType: "flatbed", status: "broken" },
      });
      assert.strictEqual(res.statusCode, 400, res.body);
    });

    await t.test("client cannot register a trailer as 'deleted'", async () => {
      const res = await app.inject({
        method: "POST", url: "/fleet/trailers",
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { registration: `${PREFIX}BAD3`, bodyType: "flatbed", status: "deleted" },
      });
      assert.strictEqual(res.statusCode, 400, res.body);
    });

    await t.test("unit with height typed in cm (480) is rejected", async () => {
      const res = await app.inject({
        method: "POST", url: "/fleet/units",
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { registration: `${PREFIX}U1`, bodyCategory: "tractor", gvwClass: "44t", heightM: 480 },
      });
      assert.strictEqual(res.statusCode, 400, res.body);
    });

    let trailerId = 0;
    await t.test("canonical trailer registers; trailerType persisted as the canonical bodyType", async () => {
      const res = await app.inject({
        method: "POST", url: "/fleet/trailers",
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { registration: FLEET_REG, bodyType: "flatbed" },
      });
      assert.strictEqual(res.statusCode, 201, res.body);
      const body = JSON.parse(res.body);
      trailerId = body.id;
      assert.strictEqual(body.bodyType, "flatbed");
      assert.strictEqual(body.trailerType, "flatbed");
    });

    await t.test("legacy client: trailerType 'Flatbed' with no bodyType maps to canonical", async () => {
      const res = await app.inject({
        method: "POST", url: "/fleet/trailers",
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { registration: `${PREFIX}LEG1`, trailerType: "Flatbed" },
      });
      assert.strictEqual(res.statusCode, 201, res.body);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.bodyType, "flatbed");
      assert.strictEqual(body.trailerType, "flatbed"); // canonical, never the raw string
    });

    await t.test("PATCH bodyType self-heals the trailerType alias", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/fleet/trailers/${trailerId}`,
        headers: { authorization: `Bearer ${plannerToken}` },
        payload: { bodyType: "fridge" },
      });
      assert.strictEqual(res.statusCode, 200, res.body);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.bodyType, "fridge");
      assert.strictEqual(body.trailerType, "fridge");
    });

    await t.test("driver can look up a company trailer by reg", async () => {
      const res = await app.inject({
        method: "GET", url: `/fleet/trailers/lookup?reg=${encodeURIComponent(FLEET_REG)}`,
        headers: { authorization: `Bearer ${driverToken}` },
      });
      assert.strictEqual(res.statusCode, 200, res.body);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.known, true);
      assert.strictEqual(body.trailer.registration, FLEET_REG.toUpperCase());
    });

    await t.test("lookup of an unknown reg → known: false", async () => {
      const res = await app.inject({
        method: "GET", url: `/fleet/trailers/lookup?reg=${PREFIX}NOPE`,
        headers: { authorization: `Bearer ${driverToken}` },
      });
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).known, false);
    });

    await t.test("lookup is tenant-scoped — another company cannot see our trailer", async () => {
      const res = await app.inject({
        method: "GET", url: `/fleet/trailers/lookup?reg=${encodeURIComponent(FLEET_REG)}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).known, false);
    });

    // ── Shift segments: trailer ownership resolution ──────────────────────
    const mkShift = async () => {
      const res = await app.inject({
        method: "POST", url: "/shifts",
        headers: { authorization: `Bearer ${driverToken}` },
        payload: {},
      });
      assert.strictEqual(res.statusCode, 201, res.body);
      return JSON.parse(res.body).id as number;
    };

    await t.test("segment with a company-fleet trailer → ownership 'company', no warning", async () => {
      const shiftId = await mkShift();
      const res = await app.inject({
        method: "POST", url: `/shifts/${shiftId}/segments`,
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { truckReg: `${PREFIX}TRUCK`, trailerReg: FLEET_REG },
      });
      assert.strictEqual(res.statusCode, 201, res.body);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.trailerOwnership, "company");
      assert.strictEqual(body.warning, undefined);
    });

    await t.test("segment with an unknown trailer and no claim → 'unregistered' + warning, never blocks", async () => {
      const shiftId = await mkShift();
      const res = await app.inject({
        method: "POST", url: `/shifts/${shiftId}/segments`,
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { truckReg: `${PREFIX}TRUCK`, trailerReg: `${PREFIX}MYSTERY` },
      });
      assert.strictEqual(res.statusCode, 201, res.body);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.trailerOwnership, "unregistered");
      assert.match(body.warning, /not registered in your company fleet/i);
      const seg = await prisma.shiftSegment.findUnique({ where: { id: body.segmentId } });
      assert.strictEqual(seg?.trailerOwnership, "unregistered");
    });

    await t.test("segment with an unknown trailer + contractor claim → 'contractor'", async () => {
      const shiftId = await mkShift();
      const res = await app.inject({
        method: "POST", url: `/shifts/${shiftId}/segments`,
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { truckReg: `${PREFIX}TRUCK`, trailerReg: `${PREFIX}SUBBY`, trailerOwnership: "contractor" },
      });
      assert.strictEqual(res.statusCode, 201, res.body);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.trailerOwnership, "contractor");
      assert.strictEqual(body.warning, undefined);
    });

    await t.test("driver cannot claim 'company' — enum rejects it", async () => {
      const shiftId = await mkShift();
      const res = await app.inject({
        method: "POST", url: `/shifts/${shiftId}/segments`,
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { truckReg: `${PREFIX}TRUCK`, trailerReg: `${PREFIX}FAKE`, trailerOwnership: "company" },
      });
      assert.strictEqual(res.statusCode, 400, res.body);
    });
  } finally {
    await app.close();
    await prisma.shiftSegment.deleteMany({ where: { companyId: company.id } });
    await prisma.shift.deleteMany({ where: { companyId: company.id } });
    await prisma.fleetTrailer.deleteMany({ where: { companyId: company.id } });
    await prisma.fleetUnit.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: { in: [company.id, otherCompany.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, driverUser.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [company.id, otherCompany.id] } } });
  }
});

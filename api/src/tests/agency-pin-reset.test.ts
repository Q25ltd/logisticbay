/**
 * TASK 3.4 — Agency-driver PIN reset safety
 *
 * Verifies that POST /drivers/:id/reset-password returns 409 MULTI_COMPANY_DRIVER
 * when the target driver's User account has active memberships in more than one company.
 *
 * This prevents Company A planner from resetting a shared driver's PIN and
 * silently breaking their Company B login.
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

const PREFIX = "__PINTEST__";
const TS     = Date.now();

function makeToken(userId: number, companyId: number, role: string) {
  return jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
}

test("POST /drivers/:id/reset-password — agency driver (multi-company) → 409", async (t) => {

  // ── Setup ──────────────────────────────────────────────────────────────────
  // Two companies
  const compA = await prisma.company.create({
    data: { name: `${PREFIX}CompA_${TS}`, slug: `${PREFIX}compa-${TS}`.toLowerCase() },
  });
  const compB = await prisma.company.create({
    data: { name: `${PREFIX}CompB_${TS}`, slug: `${PREFIX}compb-${TS}`.toLowerCase() },
  });

  // Planner in Company A
  const plannerA = await prisma.user.create({
    data: {
      name: `${PREFIX}PlannerA`, email: `${PREFIX}pa_${TS}@test.invalid`.toLowerCase(),
      passwordHash: "x", status: "active",
      memberships: { create: { companyId: compA.id, role: "planner", status: "active" } },
    },
  });

  // Agency driver — active member of BOTH companies
  const agencyUser = await prisma.user.create({
    data: {
      name: `${PREFIX}AgencyDriver`, email: `${PREFIX}agency_${TS}@test.invalid`.toLowerCase(),
      passwordHash: "x", status: "active",
      memberships: {
        create: [
          { companyId: compA.id, role: "driver", status: "active" },
          { companyId: compB.id, role: "driver", status: "active" },
        ],
      },
    },
  });

  // DriverProfile for the agency driver in Company A
  const driverProfile = await prisma.driverProfile.create({
    data: {
      companyId:   compA.id,
      userId:      agencyUser.id,
      displayName: `${PREFIX}AgencyDriver`,
    },
  });

  const tokenA = makeToken(plannerA.id, compA.id, "planner");
  const app    = await buildApp(prisma, { silent: true });

  try {

    // ── Test: reset should be blocked ─────────────────────────────────────────
    await t.test("returns 409 MULTI_COMPANY_DRIVER for shared driver", async () => {
      const res = await app.inject({
        method:  "POST",
        url:     `/drivers/${driverProfile.id}/reset-password`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      assert.strictEqual(res.statusCode, 409, `Expected 409, got ${res.statusCode}: ${res.body}`);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.code, "MULTI_COMPANY_DRIVER", `got: ${res.body}`);
      assert.ok(
        body.error.toLowerCase().includes("multiple companies"),
        `Expected message about multiple companies, got: ${body.error}`,
      );
    });

    // ── Test: single-company driver should succeed ────────────────────────────
    await t.test("succeeds for single-company driver", async () => {
      // Driver belonging only to Company A
      const soloUser = await prisma.user.create({
        data: {
          name: `${PREFIX}SoloDriver`, email: `${PREFIX}solo_${TS}@test.invalid`.toLowerCase(),
          passwordHash: "x", status: "active",
          memberships: { create: { companyId: compA.id, role: "driver", status: "active" } },
        },
      });
      const soloProfile = await prisma.driverProfile.create({
        data: { companyId: compA.id, userId: soloUser.id, displayName: `${PREFIX}SoloDriver` },
      });

      const res = await app.inject({
        method:  "POST",
        url:     `/drivers/${soloProfile.id}/reset-password`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.body}`);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.ok, true);

      // Cleanup solo user
      await prisma.driverProfile.delete({ where: { id: soloProfile.id } });
      await prisma.companyMembership.deleteMany({ where: { userId: soloUser.id } });
      await prisma.user.delete({ where: { id: soloUser.id } });
    });

  } finally {
    await app.close();
    // Cleanup
    await prisma.driverProfile.deleteMany({ where: { companyId: { in: [compA.id, compB.id] } } });
    await prisma.companyMembership.deleteMany({ where: { userId: { in: [plannerA.id, agencyUser.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [plannerA.id, agencyUser.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [compA.id, compB.id] } } });
  }
});

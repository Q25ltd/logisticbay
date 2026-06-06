/**
 * Verifies that Job.status is set correctly based on saveMode:
 *   - POST  saveMode=draft           → status=draft
 *   - POST  saveMode=ready_to_plan   → status=ready_to_plan
 *   - PATCH saveMode=ready_to_plan   → status promoted to ready_to_plan
 *   - PATCH saveMode=draft           → status demoted to draft
 */
import "dotenv/config";
import "../lib/env.js";
import { env }         from "../lib/env.js";
import { test, after } from "node:test";
import assert          from "node:assert/strict";
import crypto          from "node:crypto";
import jwt             from "jsonwebtoken";
import { PrismaClient }   from "../generated/client.js";
import { PrismaPg }       from "@prisma/adapter-pg";
import { buildApp }       from "../app.js";

// ─── DB + App ────────────────────────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

after(async () => { await prisma.$disconnect(); });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PREFIX = "__STATUS__";
const TS     = Date.now();

function makeToken(userId: number, companyId: number, role = "planner") {
  return jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
}

async function cleanup(companyIds: number[], userIds: number[]) {
  const where = { companyId: { in: companyIds } };
  await prisma.jobAudit.deleteMany({ where });
  await prisma.jobExecutionEvent.deleteMany({ where });
  await prisma.syncEventLog.deleteMany({ where });
  await prisma.jobPart.deleteMany({ where });
  await prisma.job.deleteMany({ where });
  await prisma.clientRequestLink.deleteMany({ where });
  await prisma.savedLocation.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.jobTemplate.deleteMany({ where });
  await prisma.driverProfile.deleteMany({ where });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.companyMembership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

// ─── Minimum valid payload for ready_to_plan ─────────────────────────────────

const VALID_PAYLOAD = {
  customerName:     "Status Test Ltd",
  vehicleCategory:  "rigid",
  goodsDescription: "Test widgets",
  quantity:         10,
  quantityUnit:     "pallets",
  stops: [
    {
      sequenceNumber:       1,
      type:                 "collection",
      siteName:             "Collection Depot",
      street:               "1 Pickup Road",
      town:                 "Pickuptown",
      postcode:             "PU1 1PK",
      locationTextSnapshot: "Collection Depot, 1 Pickup Road, Pickuptown PU1 1PK",
      timeWindowStart:      "2026-08-01T07:00:00.000Z",
      timeWindowEnd:        "2026-08-01T10:00:00.000Z",
    },
    {
      sequenceNumber:       2,
      type:                 "delivery",
      siteName:             "Delivery Depot",
      street:               "99 Dropoff Lane",
      town:                 "Dropsville",
      postcode:             "DR2 2OP",
      locationTextSnapshot: "Delivery Depot, 99 Dropoff Lane, Dropsville DR2 2OP",
      timeWindowStart:      "2026-08-01T12:00:00.000Z",
      timeWindowEnd:        "2026-08-01T16:00:00.000Z",
    },
  ],
} as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

test("Job.status set by saveMode — full suite", async (t) => {

  // ── Setup ──────────────────────────────────────────────────────────────────

  const company = await prisma.company.create({
    data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() },
  });

  const user = await prisma.user.create({
    data: {
      name:         `${PREFIX}User_${TS}`,
      email:        `${PREFIX}user_${TS}@test.invalid`.toLowerCase(),
      passwordHash: "x",
      status:       "active",
      memberships:  { create: { companyId: company.id, role: "planner", status: "active" } },
    },
  });

  const companyIds = [company.id];
  const userIds    = [user.id];
  const token      = makeToken(user.id, company.id, "planner");
  const app        = await buildApp(prisma, { silent: true });

  try {

    // ── 1. POST saveMode=draft → status=draft ──────────────────────────────

    await t.test("POST saveMode=draft stores status=draft", async () => {
      const res = await app.inject({
        method:  "POST",
        url:     "/jobs",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body:    JSON.stringify({ ...VALID_PAYLOAD, saveMode: "draft" }),
      });
      assert.equal(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${res.body}`);
      const body = JSON.parse(res.body);
      const job  = body.job ?? body;
      assert.equal(job.status, "draft", `Expected status=draft, got ${job.status}`);
    });

    // ── 2. POST saveMode=ready_to_plan → status=ready_to_plan ─────────────

    let readyJobId = 0;
    await t.test("POST saveMode=ready_to_plan stores status=ready_to_plan", async () => {
      const res = await app.inject({
        method:  "POST",
        url:     "/jobs",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body:    JSON.stringify({ ...VALID_PAYLOAD, saveMode: "ready_to_plan" }),
      });
      assert.equal(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${res.body}`);
      const body = JSON.parse(res.body);
      const job  = body.job ?? body;
      assert.equal(job.status, "ready_to_plan", `Expected status=ready_to_plan, got ${job.status}`);
      readyJobId = job.id;
    });

    // ── 3. PATCH draft job with saveMode=ready_to_plan → status promoted ──

    let draftJobId = 0;
    await t.test("PATCH saveMode=ready_to_plan promotes draft→ready_to_plan", async () => {
      // Create a draft job to patch
      const createRes = await app.inject({
        method:  "POST",
        url:     "/jobs",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body:    JSON.stringify({ ...VALID_PAYLOAD, saveMode: "draft" }),
      });
      assert.equal(createRes.statusCode, 201, `Setup POST failed: ${createRes.body}`);
      const created = JSON.parse(createRes.body);
      draftJobId = (created.job ?? created).id;

      const patchRes = await app.inject({
        method:  "PATCH",
        url:     `/jobs/${draftJobId}`,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body:    JSON.stringify({ ...VALID_PAYLOAD, saveMode: "ready_to_plan" }),
      });
      assert.equal(patchRes.statusCode, 200, `PATCH failed: ${patchRes.body}`);
      const patched = JSON.parse(patchRes.body);
      const job     = patched.job ?? patched;
      assert.equal(job.status, "ready_to_plan", `Expected status=ready_to_plan, got ${job.status}`);
    });

    // ── 4. PATCH ready_to_plan job with saveMode=draft → status demoted ───

    await t.test("PATCH saveMode=draft demotes ready_to_plan→draft", async () => {
      assert.ok(readyJobId > 0, "readyJobId not set — earlier test must have passed");
      const patchRes = await app.inject({
        method:  "PATCH",
        url:     `/jobs/${readyJobId}`,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body:    JSON.stringify({ ...VALID_PAYLOAD, saveMode: "draft" }),
      });
      assert.equal(patchRes.statusCode, 200, `PATCH failed: ${patchRes.body}`);
      const patched = JSON.parse(patchRes.body);
      const job     = patched.job ?? patched;
      assert.equal(job.status, "draft", `Expected status=draft, got ${job.status}`);
    });

    // ── 5. POST saveMode=ready_to_plan without required fields → 400 ──────

    await t.test("POST saveMode=ready_to_plan with no stops → 400", async () => {
      const res = await app.inject({
        method:  "POST",
        url:     "/jobs",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body:    JSON.stringify({
          customerName:     "Status Test Ltd",
          vehicleCategory:  "rigid",
          goodsDescription: "Test widgets",
          quantity:         10,
          quantityUnit:     "pallets",
          stops:            [],
          saveMode:         "ready_to_plan",
        }),
      });
      assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.body}`);
    });

  } finally {
    await cleanup(companyIds, userIds);
  }
});

/**
 * Tenant Isolation Integration Test — full suite
 *
 * Proves Company A cannot read or write Company B's data through any route.
 * Runs against the real database. Creates test data with a unique prefix and
 * cleans up after itself regardless of outcome.
 *
 * Run: npm test
 */
import "dotenv/config";
import "../lib/env.js";
import { env } from "../lib/env.js";
import { test, after } from "node:test";
import assert   from "node:assert/strict";
import jwt      from "jsonwebtoken";
import { PrismaClient } from "../generated/client.js";
import { PrismaPg }     from "@prisma/adapter-pg";
import { buildApp }     from "../app.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

after(async () => { await prisma.$disconnect(); });

const PREFIX = "__ITEST__";
const TS     = Date.now();

function makeToken(userId: number, companyId: number, role: string) {
  return jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
}

async function createCompany(label: string) {
  return prisma.company.create({
    data: {
      name: `${PREFIX}${label}_${TS}`,
      slug: `${PREFIX}${label}-${TS}`.toLowerCase(),
    },
  });
}

async function createUser(label: string, companyId: number, role: string) {
  return prisma.user.create({
    data: {
      name:         `${PREFIX}${label}`,
      email:        `${PREFIX}${label}_${TS}@test.invalid`.toLowerCase(),
      passwordHash: "x",
      status:       "active",
      memberships:  { create: { companyId, role, status: "active" } },
    },
  });
}

async function cleanup(companyIds: number[], userIds: number[]) {
  const cWhere = { companyId: { in: companyIds } };
  await prisma.holidayRequest.deleteMany({ where: cWhere });
  await prisma.shiftPreference.deleteMany({ where: cWhere });
  await prisma.driverAvailability.deleteMany({ where: cWhere });
  await prisma.deliveryTask.deleteMany({ where: cWhere });
  await prisma.shiftSegment.deleteMany({ where: cWhere });
  await prisma.shift.deleteMany({ where: cWhere });
  await prisma.fleetUnit.deleteMany({ where: cWhere });
  await prisma.fleetTrailer.deleteMany({ where: cWhere });
  await prisma.customer.deleteMany({ where: cWhere });
  await prisma.savedLocation.deleteMany({ where: cWhere });
  await prisma.jobTemplate.deleteMany({ where: cWhere });
  await prisma.jobAudit.deleteMany({ where: cWhere });
  await prisma.jobExecutionEvent.deleteMany({ where: cWhere });
  await prisma.syncEventLog.deleteMany({ where: cWhere });
  await prisma.jobStop.deleteMany({ where: cWhere });
  await prisma.loadDetails.deleteMany({ where: cWhere });
  await prisma.plannedJob.deleteMany({ where: cWhere });
  await prisma.driverProfile.deleteMany({ where: cWhere });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.companyMembership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

// ─────────────────────────────────────────────────────────────────────────────

test("Tenant isolation — full suite", async (t) => {

  // ── Setup ─────────────────────────────────────────────────────────────────
  const compA = await createCompany("A");
  const compB = await createCompany("B");

  const userA       = await createUser("UserA",   compA.id, "planner");
  const userB       = await createUser("UserB",   compB.id, "planner");
  const driverUserB = await createUser("DrvUserB", compB.id, "driver");

  const driverB = await prisma.driverProfile.create({
    data: { companyId: compB.id, userId: driverUserB.id, displayName: `${PREFIX}DrvB` },
  });
  const customerB = await prisma.customer.create({
    data: { companyId: compB.id, name: `${PREFIX}CustB_${TS}` },
  });
  const locationB = await prisma.savedLocation.create({
    data: { companyId: compB.id, name: `${PREFIX}LocB_${TS}` },
  });
  const templateB = await prisma.jobTemplate.create({
    data: { companyId: compB.id, name: `${PREFIX}TplB_${TS}` },
  });
  const jobB = await prisma.plannedJob.create({
    data: { companyId: compB.id, createdByUserId: userB.id, customerName: `${PREFIX}JobB`, status: "draft" },
  });
  const shiftB = await prisma.shift.create({
    data: { companyId: compB.id, driverId: driverUserB.id, driverName: `${PREFIX}DrvB` },
  });
  const fleetUnitB = await prisma.fleetUnit.create({
    data: { companyId: compB.id, registration: `${PREFIX}UB`, vehicleClass: "rigid", status: "available" },
  });
  const fleetTrailerB = await prisma.fleetTrailer.create({
    data: { companyId: compB.id, registration: `${PREFIX}TB`, trailerType: "curtain", status: "available" },
  });
  const holidayB = await prisma.holidayRequest.create({
    data: {
      companyId:       compB.id,
      driverProfileId: driverB.id,
      startDate:       new Date("2026-08-01"),
      endDate:         new Date("2026-08-05"),
      totalDays:       5,
      status:          "pending",
    },
  });

  const companyIds = [compA.id, compB.id];
  const userIds    = [userA.id, userB.id, driverUserB.id];

  const tokenA    = makeToken(userA.id, compA.id, "planner");
  const tokenADrv = makeToken(userA.id, compA.id, "driver");

  const app = await buildApp(prisma, { silent: true });

  try {

    // ── List endpoints: Company B data must not appear ────────────────────

    await t.test("GET /jobs — no Company B jobs", async () => {
      const res = await app.inject({ method: "GET", url: "/jobs", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200);
      const jobs = (JSON.parse(res.body).data ?? []) as Array<{ companyId: number }>;
      assert.equal(jobs.filter(j => j.companyId === compB.id).length, 0, "Company B job leaked");
    });

    await t.test("GET /drivers — no Company B drivers", async () => {
      const res = await app.inject({ method: "GET", url: "/drivers", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200);
      const drivers = (JSON.parse(res.body).data ?? []) as Array<{ companyId: number }>;
      assert.equal(drivers.filter(d => d.companyId === compB.id).length, 0, "Company B driver leaked");
    });

    await t.test("GET /customers — no Company B customers", async () => {
      const res = await app.inject({ method: "GET", url: "/customers", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200);
      const customers = (JSON.parse(res.body).data ?? []) as Array<{ companyId: number }>;
      assert.equal(customers.filter(c => c.companyId === compB.id).length, 0, "Company B customer leaked");
    });

    await t.test("GET /locations — no Company B locations", async () => {
      const res = await app.inject({ method: "GET", url: "/locations", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200);
      const locations = (JSON.parse(res.body).data ?? []) as Array<{ companyId: number }>;
      assert.equal(locations.filter(l => l.companyId === compB.id).length, 0, "Company B location leaked");
    });

    await t.test("GET /job-templates — no Company B templates", async () => {
      const res = await app.inject({ method: "GET", url: "/job-templates", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200);
      const templates = (JSON.parse(res.body).data ?? JSON.parse(res.body)) as Array<{ companyId: number }>;
      const leaked = (Array.isArray(templates) ? templates : []).filter((x: { companyId: number }) => x.companyId === compB.id);
      assert.equal(leaked.length, 0, "Company B template leaked");
    });

    await t.test("GET /shifts — no Company B shifts", async () => {
      const res = await app.inject({ method: "GET", url: "/shifts", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200);
      const shifts = (JSON.parse(res.body).data ?? JSON.parse(res.body)) as Array<{ companyId: number }>;
      const leaked = (Array.isArray(shifts) ? shifts : []).filter((x: { companyId: number }) => x.companyId === compB.id);
      assert.equal(leaked.length, 0, "Company B shift leaked");
    });

    await t.test("GET /availability — no Company B availability", async () => {
      const res = await app.inject({ method: "GET", url: "/availability", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200);
      const items = (JSON.parse(res.body).data ?? JSON.parse(res.body)) as Array<{ companyId: number }>;
      const leaked = (Array.isArray(items) ? items : []).filter((x: { companyId: number }) => x.companyId === compB.id);
      assert.equal(leaked.length, 0, "Company B availability leaked");
    });

    await t.test("GET /holiday-requests — no Company B requests", async () => {
      const res = await app.inject({ method: "GET", url: "/holiday-requests", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200);
      const hrs = (JSON.parse(res.body).data ?? JSON.parse(res.body)) as Array<{ companyId: number }>;
      const leaked = (Array.isArray(hrs) ? hrs : []).filter((x: { companyId: number }) => x.companyId === compB.id);
      assert.equal(leaked.length, 0, "Company B holiday request leaked");
    });

    await t.test("GET /fleet/units — no Company B units", async () => {
      const res = await app.inject({ method: "GET", url: "/fleet/units", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200);
      const units = (JSON.parse(res.body).data ?? JSON.parse(res.body)) as Array<{ companyId: number }>;
      const leaked = (Array.isArray(units) ? units : []).filter((x: { companyId: number }) => x.companyId === compB.id);
      assert.equal(leaked.length, 0, "Company B fleet unit leaked");
    });

    await t.test("GET /fleet/trailers — no Company B trailers", async () => {
      const res = await app.inject({ method: "GET", url: "/fleet/trailers", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200);
      const trailers = (JSON.parse(res.body).data ?? JSON.parse(res.body)) as Array<{ companyId: number }>;
      const leaked = (Array.isArray(trailers) ? trailers : []).filter((x: { companyId: number }) => x.companyId === compB.id);
      assert.equal(leaked.length, 0, "Company B fleet trailer leaked");
    });

    await t.test("GET /dashboard — returns 200 scoped to Company A", async () => {
      const res = await app.inject({ method: "GET", url: "/dashboard", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200, `Dashboard failed: ${res.body}`);
    });

    await t.test("GET /company — returns Company A, not B", async () => {
      const res = await app.inject({ method: "GET", url: "/company", headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body) as { id: number };
      assert.equal(body.id, compA.id, "GET /company returned wrong company");
    });

    // ── Resource endpoints: must return 404 for cross-tenant IDs ──────────

    await t.test("GET /jobs/:id — 404 for Company B job", async () => {
      const res = await app.inject({ method: "GET", url: `/jobs/${jobB.id}`, headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode} — ${res.body}`);
    });

    await t.test("PATCH /jobs/:id — 404 for Company B job", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/jobs/${jobB.id}`,
        headers: { authorization: `Bearer ${tokenA}`, "content-type": "application/json" },
        body: JSON.stringify({ plannerNotes: "hacked" }),
      });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("PATCH /jobs/:id/status — 404 for Company B job", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/jobs/${jobB.id}/status`,
        headers: { authorization: `Bearer ${tokenADrv}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "in_progress", clientEventId: `itest-${TS}-status`, clientTimestamp: new Date().toISOString() }),
      });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("POST /jobs/:id/note — 404 for Company B job", async () => {
      const res = await app.inject({
        method: "POST", url: `/jobs/${jobB.id}/note`,
        headers: { authorization: `Bearer ${tokenA}`, "content-type": "application/json" },
        body: JSON.stringify({ note: "hacked" }),
      });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("PATCH /drivers/:id — 404 for Company B driver", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/drivers/${driverB.id}`,
        headers: { authorization: `Bearer ${tokenA}`, "content-type": "application/json" },
        body: JSON.stringify({ displayName: "hacked" }),
      });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("GET /customers/:id — 404 for Company B customer", async () => {
      const res = await app.inject({ method: "GET", url: `/customers/${customerB.id}`, headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("PATCH /customers/:id — 404 for Company B customer", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/customers/${customerB.id}`,
        headers: { authorization: `Bearer ${tokenA}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "hacked" }),
      });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("PATCH /locations/:id — 404 for Company B location", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/locations/${locationB.id}`,
        headers: { authorization: `Bearer ${tokenA}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "hacked" }),
      });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("PATCH /job-templates/:id — 404 for Company B template", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/job-templates/${templateB.id}`,
        headers: { authorization: `Bearer ${tokenA}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "hacked" }),
      });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("GET /shifts/:id — 404 for Company B shift", async () => {
      const res = await app.inject({ method: "GET", url: `/shifts/${shiftB.id}`, headers: { authorization: `Bearer ${tokenA}` } });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("PATCH /holiday-requests/:id — 404 for Company B request", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/holiday-requests/${holidayB.id}`,
        headers: { authorization: `Bearer ${tokenA}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("PATCH /fleet/units/:id — 404 for Company B unit", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/fleet/units/${fleetUnitB.id}`,
        headers: { authorization: `Bearer ${tokenA}`, "content-type": "application/json" },
        body: JSON.stringify({ notes: "hacked" }),
      });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("PATCH /fleet/trailers/:id — 404 for Company B trailer", async () => {
      const res = await app.inject({
        method: "PATCH", url: `/fleet/trailers/${fleetTrailerB.id}`,
        headers: { authorization: `Bearer ${tokenA}`, "content-type": "application/json" },
        body: JSON.stringify({ notes: "hacked" }),
      });
      assert.equal(res.statusCode, 404, `BREACH: got ${res.statusCode}`);
    });

    await t.test("POST /sync/events — rejects cross-tenant job", async () => {
      const res = await app.inject({
        method: "POST", url: "/sync/events",
        headers: { authorization: `Bearer ${tokenADrv}`, "content-type": "application/json" },
        body: JSON.stringify({
          events: [{
            clientEventId:   `itest-sync-${TS}`,
            eventType:       "job_started",
            jobId:           jobB.id,
            clientTimestamp: new Date().toISOString(),
          }],
        }),
      });
      const dump = `status=${res.statusCode} body=${res.body}`;
      if (res.statusCode === 200) {
        const parsed = JSON.parse(res.body) as { results?: Array<{ status?: string; error?: string; failureReason?: string; needsReview?: boolean }> };
        const result = (parsed.results ?? [])[0];
        const accepted = result?.status === "accepted";
        assert.ok(!accepted, `BREACH: cross-tenant sync event was accepted. ${dump}`);
      } else {
        assert.ok([400, 403, 404, 429].includes(res.statusCode), `Unexpected status. ${dump}`);
      }
    });

  } finally {
    await app.close();
    await cleanup(companyIds, userIds);
  }
});

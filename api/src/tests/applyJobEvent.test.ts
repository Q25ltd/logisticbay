/**
 * TASK 2.3 — applyJobEvent integration tests
 *
 * Tests the shared state machine via the PATCH /jobs/:id/status route.
 * Key behaviours:
 *   - B.5: missing clientEventId → 400
 *   - cancelled via normal path → 400 TRANSITION_FAILED (use override endpoint)
 *   - same clientEventId twice → 200 { duplicate: true }
 *   - invalid transition (e.g. completed → in_progress) → 400
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

const PREFIX = "__AJTEST__";
const TS     = Date.now();

function makeToken(userId: number, companyId: number, role: string) {
  return jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
}

test("applyJobEvent — shared state machine", async (t) => {

  // ── Setup ──────────────────────────────────────────────────────────────────
  const company = await prisma.company.create({
    data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() },
  });
  const planner = await prisma.user.create({
    data: {
      name: `${PREFIX}Planner`, email: `${PREFIX}planner_${TS}@test.invalid`.toLowerCase(),
      passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } },
    },
  });
  const job = await prisma.job.create({
    data: {
      companyId:   company.id,
      createdByUserId: planner.id,
      customerName: `${PREFIX}Customer`,
      status:      "in_progress",
    },
  });

  const token = makeToken(planner.id, company.id, "planner");
  const app   = await buildApp(prisma, { silent: true });

  try {

    // ── B.5: clientEventId required ──────────────────────────────────────────
    await t.test("B.5: missing clientEventId → 400", async () => {
      const res = await app.inject({
        method:  "PATCH",
        url:     `/jobs/${job.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "arrived_pickup" },   // no clientEventId
      });
      assert.strictEqual(res.statusCode, 400, `body: ${res.body}`);
      const body = JSON.parse(res.body);
      // New envelope: { error: "<message>", code: "BAD_REQUEST" }
      assert.ok(
        body.code === "BAD_REQUEST" || body.error?.toLowerCase().includes("clienteventid"),
        `Expected BAD_REQUEST code, got: ${res.body}`,
      );
    });

    // ── E.1 / two-path model: cancel not available via normal path ────────────
    await t.test("cancel via normal path → 400 TRANSITION_FAILED", async () => {
      const res = await app.inject({
        method:  "PATCH",
        url:     `/jobs/${job.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "cancelled", clientEventId: `${PREFIX}cancel-${TS}`, clientTimestamp: new Date().toISOString() },
      });
      assert.strictEqual(res.statusCode, 400, `body: ${res.body}`);
      const body = JSON.parse(res.body);
      // New envelope: { error: "<reason>", code: "TRANSITION_FAILED" }
      assert.ok(
        body.code === "TRANSITION_FAILED" || body.code === "BAD_REQUEST",
        `Expected TRANSITION_FAILED or BAD_REQUEST code, got: ${res.body}`,
      );
    });

    // ── Idempotency: duplicate clientEventId returns duplicate ────────────────
    await t.test("duplicate clientEventId → 200 { duplicate: true }", async () => {
      const clientEventId = `${PREFIX}dup-${TS}`;
      // Seed a JobExecutionEvent with that clientEventId
      await prisma.jobExecutionEvent.create({
        data: {
          companyId:       company.id,
          jobId:           job.id,
          driverId:        planner.id,
          eventType:       "started",
          note:            "",
          clientEventId,
          clientTimestamp: new Date(),
          needsReview:     false,
        },
      });
      const res = await app.inject({
        method:  "PATCH",
        url:     `/jobs/${job.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "in_progress", clientEventId, clientTimestamp: new Date().toISOString() },
      });
      assert.strictEqual(res.statusCode, 200, `body: ${res.body}`);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.duplicate, true, `Expected duplicate: true, got: ${res.body}`);
    });

    // ── Invalid transition: in_progress → completed (skips steps) ────────────
    await t.test("invalid transition → 400 TRANSITION_FAILED", async () => {
      const res = await app.inject({
        method:  "PATCH",
        url:     `/jobs/${job.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "completed", clientEventId: `${PREFIX}invalid-${TS}`, clientTimestamp: new Date().toISOString() },
      });
      assert.strictEqual(res.statusCode, 400, `body: ${res.body}`);
      const body = JSON.parse(res.body);
      // New envelope: { error: "<reason>", code: "TRANSITION_FAILED" }
      assert.strictEqual(body.code, "TRANSITION_FAILED", `got: ${res.body}`);
    });

  } finally {
    await app.close();
    // Cleanup
    await prisma.jobExecutionEvent.deleteMany({ where: { companyId: company.id } });
    await prisma.job.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: planner.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

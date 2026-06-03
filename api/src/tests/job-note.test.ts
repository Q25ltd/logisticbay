/**
 * TASK 3.2 — POST /jobs/:id/note requires clientEventId
 *
 * Tests:
 *   - missing clientEventId → 400
 *   - valid note + clientEventId → 201 { ok: true }
 *   - same clientEventId twice → 200 { ok: true, duplicate: true }
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

const PREFIX = "__NOTE32__";
const TS     = Date.now();

function makeToken(userId: number, companyId: number, role: string) {
  return jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
}

test("POST /jobs/:id/note — clientEventId required (TASK 3.2)", async (t) => {
  const app = await buildApp(prisma, { silent: true });
  after(() => app.close());

  // ── Setup ─────────────────────────────────────────────────────────────────
  const company = await prisma.company.create({
    data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() },
  });
  const driver = await prisma.user.create({
    data: {
      name:         "Note Driver",
      email:        `driver${TS}@${PREFIX}.test`.toLowerCase(),
      passwordHash: "x",
      status:       "active",
      memberships:  { create: { companyId: company.id, role: "driver", status: "active" } },
    },
  });
  const job = await prisma.job.create({
    data: { companyId: company.id, createdByUserId: driver.id, status: "in_progress" },
  });

  const token   = makeToken(driver.id, company.id, "driver");
  const url     = `/jobs/${job.id}/note`;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  // ── Test 1: missing clientEventId → 400 ──────────────────────────────────
  await t.test("missing clientEventId → 400", async () => {
    const res = await app.inject({
      method: "POST", url, headers,
      body: JSON.stringify({ note: "A valid note" }),
    });
    assert.equal(res.statusCode, 400, `expected 400, got ${res.statusCode}: ${res.body}`);
  });

  // ── Test 2: valid note + clientEventId → 201 ─────────────────────────────
  const clientEventId = `note-32-${TS}-first`;
  await t.test("valid note + clientEventId → 201", async () => {
    const res = await app.inject({
      method: "POST", url, headers,
      body: JSON.stringify({ note: "First note", clientEventId }),
    });
    assert.equal(res.statusCode, 201, `expected 201, got ${res.statusCode}: ${res.body}`);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.ok(!body.duplicate, "first call must not be a duplicate");
  });

  // ── Test 3: same clientEventId → 200 { duplicate: true } ─────────────────
  await t.test("duplicate clientEventId → 200 with duplicate:true", async () => {
    const res = await app.inject({
      method: "POST", url, headers,
      body: JSON.stringify({ note: "Same note again", clientEventId }),
    });
    assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    assert.equal(body.duplicate, true);
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await prisma.jobExecutionEvent.deleteMany({ where: { jobId: job.id } });
  await prisma.job.deleteMany({ where: { companyId: company.id } });
  await prisma.companyMembership.deleteMany({ where: { userId: driver.id } });
  await prisma.user.delete({ where: { id: driver.id } });
  await prisma.company.delete({ where: { id: company.id } });
});

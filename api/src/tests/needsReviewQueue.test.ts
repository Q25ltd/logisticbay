/**
 * Needs-review queue + live board — LOAD_MOVEMENT_PLAN Step 15 (P0.13).
 *
 * A flagged event (delay) AND an exception event (breakdown) both appear in the
 * planner queue; resolving stamps reviewedAt/reviewedBy and removes the item;
 * the live board shows the reconciled run status, per-stop execution state, and
 * latest custody. Tenant + role scoped: a driver cannot read the queue and a
 * second company sees nothing.
 */

import "dotenv/config";
import "../lib/env.js";
import { env } from "../lib/env.js";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { PrismaClient, Prisma } from "../generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildApp } from "../app.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });
after(async () => { await prisma.$disconnect(); });

const PREFIX = "__S15TEST__";
const TS     = Date.now();
const tok = (userId: number, companyId: number, role: string) =>
  jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

let seq = 0;
const ev = (eventType: string, jobId: number, extra: Record<string, unknown> = {}) => ({
  eventType, jobId,
  clientEventId: `${PREFIX}${eventType}-${TS}-${seq}`,
  clientTimestamp: new Date(TS + (seq++ * 1000)).toISOString(),
  ...extra,
});

test("needs-review queue + live board — no exception invisible (Step 15)", async (t) => {
  const company = await prisma.company.create({ data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() } });
  const other   = await prisma.company.create({ data: { name: `${PREFIX}Other_${TS}`, slug: `${PREFIX}other-${TS}`.toLowerCase() } });
  const planner = await prisma.user.create({
    data: { name: `${PREFIX}P`, email: `${PREFIX}p_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } } },
  });
  const otherPlanner = await prisma.user.create({
    data: { name: `${PREFIX}OP`, email: `${PREFIX}op_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: other.id, role: "planner", status: "active" } } },
  });
  const driverUser = await prisma.user.create({
    data: { name: `${PREFIX}D`, email: `${PREFIX}d_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "driver", status: "active" } } },
  });
  const profile = await prisma.driverProfile.create({ data: { companyId: company.id, userId: driverUser.id, displayName: `${PREFIX}Drv`, status: "active" } });
  const plannerToken = tok(planner.id, company.id, "planner");
  const driverToken  = tok(driverUser.id, company.id, "driver");
  const app = await buildApp(prisma, { silent: true });

  const today = new Date().toISOString().slice(0, 10);
  const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, jobReference: `${PREFIX}JOB-1`, customerName: `${PREFIX}Cust`, status: "planned" } });
  const cPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets", quantityRequired: new Prisma.Decimal(10) } });
  const run = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R1-${TS}`, createdBy: planner.id, assignedDriverId: profile.id, status: "assigned", publishedToDriver: true, plannedDate: new Date(`${today}T00:00:00Z`) } });
  await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: cPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

  const getQueue = (token: string) =>
    app.inject({ method: "GET", url: "/live/needs-review", headers: { authorization: `Bearer ${token}` } });

  try {
    await t.test("delay (flagged) and breakdown (exception) both land in the planner queue", async () => {
      const res = await app.inject({ method: "POST", url: "/sync/events", headers: { authorization: `Bearer ${driverToken}` },
        payload: { events: [
          ev("started", job.id),
          ev("delay_reported", job.id, { note: "roadworks on the M1" }),
          ev("arrived_pickup", job.id),
          ev("collected", job.id, { actualQuantity: "10" }),
          ev("breakdown", job.id, { note: "airline burst", gpsLat: 52.4, gpsLng: -1.9 }),
        ] } });
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);

      const q = await getQueue(plannerToken);
      assert.strictEqual(q.statusCode, 200, q.body);
      const body = JSON.parse(q.body) as { items: { eventType: string; jobReference: string | null; actorName: string | null; runReference: string | null }[]; openCount: number };
      const types = body.items.map(i => i.eventType);
      assert.ok(types.includes("delay_reported"), `queue: ${types.join(",")}`);
      assert.ok(types.includes("breakdown"), "the attention_needed cause is visible");
      assert.ok(!types.includes("started"), "clean events are not queue noise");
      const bd = body.items.find(i => i.eventType === "breakdown")!;
      assert.strictEqual(bd.jobReference, `${PREFIX}JOB-1`);
      assert.strictEqual(bd.runReference, run.runReference);
      assert.strictEqual(bd.actorName, `${PREFIX}D`);
    });

    await t.test("role + tenant scoping: driver forbidden, other company sees nothing", async () => {
      const asDriver = await getQueue(driverToken);
      assert.strictEqual(asDriver.statusCode, 403, asDriver.body);
      const asOther = await getQueue(tok(otherPlanner.id, other.id, "planner"));
      assert.strictEqual(JSON.parse(asOther.body).items.length, 0, "tenant scoped");
    });

    await t.test("resolving stamps reviewedAt/reviewedBy and clears the item", async () => {
      const q1 = JSON.parse((await getQueue(plannerToken)).body) as { items: { id: number; eventType: string }[] };
      const delay = q1.items.find(i => i.eventType === "delay_reported")!;

      const res = await app.inject({ method: "POST", url: `/live/needs-review/${delay.id}/resolve`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(res.statusCode, 200, res.body);

      const row = await prisma.jobExecutionEvent.findUnique({ where: { id: delay.id }, select: { reviewedAt: true, reviewedBy: true } });
      assert.ok(row?.reviewedAt, "reviewedAt stamped");
      assert.strictEqual(row?.reviewedBy, planner.id);

      const q2 = JSON.parse((await getQueue(plannerToken)).body) as { items: { eventType: string }[] };
      assert.ok(!q2.items.some(i => i.eventType === "delay_reported"), "resolved item left the queue");
      assert.ok(q2.items.some(i => i.eventType === "breakdown"), "unresolved items remain");

      const again = await app.inject({ method: "POST", url: `/live/needs-review/${delay.id}/resolve`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(again.statusCode, 404, "double-resolve is a 404, not a silent overwrite");
    });

    await t.test("live board shows reconciled status, execution state, and custody", async () => {
      const res = await app.inject({ method: "GET", url: `/live/runs?date=${today}`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(res.statusCode, 200, res.body);
      const body = JSON.parse(res.body) as { runs: { runReference: string; status: string; driverName: string | null; stops: { executionState: string; jobStatus: string | null; custody: { toCustody: string } | null }[] }[] };
      const board = body.runs.find(r => r.runReference === run.runReference);
      assert.ok(board, res.body);
      assert.strictEqual(board.status, "in_progress", "reconciled run status (driver started)");
      assert.strictEqual(board.driverName, `${PREFIX}Drv`);
      assert.strictEqual(board.stops.length, 1);
      assert.strictEqual(board.stops[0].executionState, "exception", "breakdown visible on the stop");
      assert.strictEqual(board.stops[0].jobStatus, "attention_needed");
      assert.ok(board.stops[0].custody?.toCustody.startsWith("on_vehicle:"), "the load's real location (stranded with the vehicle)");
    });

  } finally {
    await app.close();
    for (const companyId of [company.id, other.id]) {
      await prisma.syncEventLog.deleteMany({ where: { companyId } });
      await prisma.loadTrack.deleteMany({ where: { companyId } });
      await prisma.jobExecutionEvent.deleteMany({ where: { companyId } });
      await prisma.runAssignment.deleteMany({ where: { companyId } });
      await prisma.run.deleteMany({ where: { companyId } });
      await prisma.jobPart.deleteMany({ where: { companyId } });
      await prisma.job.deleteMany({ where: { companyId } });
      await prisma.notification.deleteMany({ where: { companyId } });
      await prisma.driverProfile.deleteMany({ where: { companyId } });
      await prisma.companyMembership.deleteMany({ where: { companyId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, otherPlanner.id, driverUser.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [company.id, other.id] } } });
  }
});

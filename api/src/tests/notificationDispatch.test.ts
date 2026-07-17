/**
 * Notification dispatch — LOAD_MOVEMENT_PLAN Step 14 exit criteria.
 *
 * Publishing a run triggers a driver notification (row + push send call);
 * an accepted exception event triggers a planner notification; a recall
 * notifies the driver losing the run. Push transport is mocked via
 * setPushTransport — no network. Non-exception events dispatch nothing.
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
import { setPushTransport } from "../services/notificationService.js";
import type { PushPayload } from "../lib/expoPush.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });
after(async () => { await prisma.$disconnect(); });

const PREFIX = "__NOTIFY__";
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

test("notification dispatch — publish/recall → driver, exceptions → planner (Step 14)", async (t) => {
  // Spy transport — records every send call, touches no network.
  const sends: { tokens: string[]; payload: PushPayload }[] = [];
  const prevTransport = setPushTransport(async (tokens, payload) => { sends.push({ tokens, payload }); });

  const company = await prisma.company.create({ data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() } });
  const planner = await prisma.user.create({
    data: { name: `${PREFIX}P`, email: `${PREFIX}p_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } } },
  });
  const plannerToken = tok(planner.id, company.id, "planner");
  const driverUser = await prisma.user.create({
    data: { name: `${PREFIX}D`, email: `${PREFIX}d_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "driver", status: "active" } } },
  });
  const profile = await prisma.driverProfile.create({ data: { companyId: company.id, userId: driverUser.id, displayName: `${PREFIX}Danny`, status: "active" } });
  const driverToken = tok(driverUser.id, company.id, "driver");
  const app = await buildApp(prisma, { silent: true });

  const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}Cust`, status: "planned" } });
  const cPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets" } });
  const run = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R1-${TS}`, createdBy: planner.id, assignedDriverId: profile.id, status: "draft" } });
  await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: cPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });

  const DRIVER_PUSH_TOKEN  = `ExponentPushToken[${PREFIX}drv-${TS}]`;
  const PLANNER_PUSH_TOKEN = `ExponentPushToken[${PREFIX}pln-${TS}]`;

  const rows = (userId: number, type?: string) =>
    prisma.notification.findMany({ where: { companyId: company.id, recipientUserId: userId, ...(type ? { type } : {}) }, orderBy: { id: "asc" } });

  try {
    await t.test("device registration — POST /devices upserts by token", async () => {
      const res = await app.inject({ method: "POST", url: "/devices", headers: { authorization: `Bearer ${driverToken}` },
        payload: { token: DRIVER_PUSH_TOKEN, platform: "ios" } });
      assert.strictEqual(res.statusCode, 201, res.body);
      const res2 = await app.inject({ method: "POST", url: "/devices", headers: { authorization: `Bearer ${plannerToken}` },
        payload: { token: PLANNER_PUSH_TOKEN, platform: "android" } });
      assert.strictEqual(res2.statusCode, 201, res2.body);
      assert.strictEqual(await prisma.deviceToken.count({ where: { companyId: company.id } }), 2);
    });

    await t.test("publish → driver notification row + push send call", async () => {
      const res = await app.inject({ method: "POST", url: `/runs/${run.id}/publish`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(res.statusCode, 200, res.body);

      const driverRows = await rows(driverUser.id, "run_published");
      assert.strictEqual(driverRows.length, 1, "one run_published row for the driver");
      assert.ok(driverRows[0].body.includes(run.runReference), driverRows[0].body);

      const call = sends.find(s => s.tokens.includes(DRIVER_PUSH_TOKEN));
      assert.ok(call, "push transport was called with the driver's device token");
      assert.strictEqual(call.payload.title, "New run published");
    });

    await t.test("breakdown via sync → planner notification; started dispatches nothing", async () => {
      const sync = (events: unknown[]) =>
        app.inject({ method: "POST", url: "/sync/events", headers: { authorization: `Bearer ${driverToken}` }, payload: { events } });
      const res = await sync([
        ev("started", job.id),
        ev("breakdown", job.id, { note: "clutch gone on the A1", gpsLat: 53.9, gpsLng: -1.4 }),
      ]);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);

      const plannerRows = await rows(planner.id, "breakdown");
      assert.strictEqual(plannerRows.length, 1, "one breakdown row for the planner");
      assert.ok(plannerRows[0].body.includes(`${PREFIX}Danny`), "body names the driver");
      assert.ok(plannerRows[0].body.includes("clutch gone"), "body carries the driver's note");

      const call = sends.find(s => s.tokens.includes(PLANNER_PUSH_TOKEN));
      assert.ok(call, "push transport was called with the planner's device token");

      const startedRows = await prisma.notification.count({ where: { companyId: company.id, type: "started" } });
      assert.strictEqual(startedRows, 0, "non-exception events dispatch nothing");
    });

    await t.test("recall → run_recalled notification to the driver losing the run", async () => {
      const res = await app.inject({ method: "PATCH", url: `/planning/runs/${run.id}`, headers: { authorization: `Bearer ${plannerToken}` },
        payload: { status: "draft", publishedToDriver: false } });
      assert.strictEqual(res.statusCode, 200, res.body);

      const recalled = await rows(driverUser.id, "run_recalled");
      assert.strictEqual(recalled.length, 1);
      assert.ok(recalled[0].body.includes(run.runReference));
    });

    await t.test("GET /notifications + mark read", async () => {
      const list = await app.inject({ method: "GET", url: "/notifications", headers: { authorization: `Bearer ${plannerToken}` } });
      const body = JSON.parse(list.body) as { notifications: { id: number; type: string }[]; unreadCount: number };
      assert.ok(body.unreadCount >= 1, list.body);
      const breakdown = body.notifications.find(nn => nn.type === "breakdown");
      assert.ok(breakdown, "planner sees the breakdown in their queue");

      const read = await app.inject({ method: "PATCH", url: `/notifications/${breakdown.id}/read`, headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(read.statusCode, 200, read.body);
      const list2 = await app.inject({ method: "GET", url: "/notifications", headers: { authorization: `Bearer ${plannerToken}` } });
      assert.strictEqual(JSON.parse(list2.body).unreadCount, body.unreadCount - 1);

      // Tenant/recipient scoping: the driver cannot read the planner's notification.
      const foreign = await app.inject({ method: "PATCH", url: `/notifications/${breakdown.id}/read`, headers: { authorization: `Bearer ${driverToken}` } });
      assert.strictEqual(foreign.statusCode, 404, foreign.body);
    });

  } finally {
    setPushTransport(prevTransport);
    await app.close();
    await prisma.notification.deleteMany({ where: { companyId: company.id } });
    await prisma.deviceToken.deleteMany({ where: { companyId: company.id } });
    await prisma.syncEventLog.deleteMany({ where: { companyId: company.id } });
    await prisma.loadTrack.deleteMany({ where: { companyId: company.id } });
    await prisma.jobExecutionEvent.deleteMany({ where: { companyId: company.id } });
    await prisma.runAssignment.deleteMany({ where: { companyId: company.id } });
    await prisma.run.deleteMany({ where: { companyId: company.id } });
    await prisma.jobPart.deleteMany({ where: { companyId: company.id } });
    await prisma.job.deleteMany({ where: { companyId: company.id } });
    await prisma.driverProfile.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, driverUser.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

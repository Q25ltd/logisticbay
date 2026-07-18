/**
 * Dependency lock / invariant 8 — LOAD_MOVEMENT_PLAN Step 13.
 *
 * A dependent relay leg (dependsOnRunId set) cannot be PUBLISHED before its
 * feeding leg has produced the load (drop_at_yard / trailer_swap / handover
 * custody row, a handover_offered event, or a completed feeder) — and once the
 * feed exists, publish unlocks. Event-time matching: a dependent leg's
 * pick_from_yard only unlocks on ITS feeder's drop (not any run on the job),
 * and handover_accepted only accepts ITS feeder's offer.
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

const PREFIX = "__DEPLOCK__";
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

test("dependency lock — relay timing cannot be violated (Step 13)", async (t) => {
  const company = await prisma.company.create({ data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() } });
  const planner = await prisma.user.create({
    data: { name: `${PREFIX}P`, email: `${PREFIX}p_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } } },
  });
  const plannerToken = tok(planner.id, company.id, "planner");
  const mkDriver = async (tag: string) => {
    const u = await prisma.user.create({
      data: { name: `${PREFIX}${tag}`, email: `${PREFIX}${tag}_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
        memberships: { create: { companyId: company.id, role: "driver", status: "active" } } },
    });
    const p = await prisma.driverProfile.create({ data: { companyId: company.id, userId: u.id, displayName: `${PREFIX}${tag}`, status: "active" } });
    return { u, p, token: tok(u.id, company.id, "driver") };
  };
  const A = await mkDriver("DA");
  const B = await mkDriver("DB");
  const app = await buildApp(prisma, { silent: true });

  let n = 0;
  const mkJob = async () => {
    const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C${n}`, status: "planned" } });
    const cPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets", quantityRequired: new Prisma.Decimal(10) } });
    const dPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery", quantityUnit: "pallets", quantityRequired: new Prisma.Decimal(10) } });
    n++;
    return { job, cPart, dPart };
  };
  const mkRun = async (driverId: number, jobId: number, jobPartId: number, opts: { dependsOnRunId?: number; published?: boolean } = {}) => {
    const run = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R${n}-${TS}-${seq++}`, createdBy: planner.id,
      assignedDriverId: driverId, status: "assigned", publishedToDriver: opts.published ?? false,
      ...(opts.dependsOnRunId != null ? { runType: "relay", dependsOnRunId: opts.dependsOnRunId } : {}) } });
    const asg = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId, jobId, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });
    return { run, asg };
  };

  const sync = (token: string, events: unknown[]) =>
    app.inject({ method: "POST", url: "/sync/events", headers: { authorization: `Bearer ${token}` }, payload: { events } });
  // S16: one publish route — the planning twin was deleted with the run-system unification.
  const publish = (runId: number) =>
    app.inject({ method: "POST", url: `/runs/${runId}/publish`, headers: { authorization: `Bearer ${plannerToken}` } });

  try {
    await t.test("publish of a dependent leg is blocked until the feeder drops — then unlocks", async () => {
      const f = await mkJob();
      const leg1 = await mkRun(A.p.id, f.job.id, f.cPart.id, { published: true });
      const leg2 = await mkRun(B.p.id, f.job.id, f.dPart.id, { dependsOnRunId: leg1.run.id });

      // Blocked while the feeder has produced nothing.
      const res0 = await publish(leg2.run.id);
      assert.strictEqual(res0.statusCode, 409, res0.body);
      assert.strictEqual(JSON.parse(res0.body).code, "DEPENDENCY_NOT_READY");
      const still = await prisma.run.findUnique({ where: { id: leg2.run.id }, select: { publishedToDriver: true } });
      assert.strictEqual(still?.publishedToDriver, false);

      // Feeder collects and drops at the yard → publish unlocks.
      const r = await sync(A.token, [
        ev("started", f.job.id), ev("arrived_pickup", f.job.id),
        ev("collected", f.job.id, { actualQuantity: "10" }),
        ev("drop_at_yard", f.job.id, { yardRef: "7", actualQuantity: "10" }),
      ]);
      assert.strictEqual(JSON.parse(r.body).failed.length, 0, r.body);

      const ok = await publish(leg2.run.id);
      assert.strictEqual(ok.statusCode, 200, ok.body);
      const after2 = await prisma.run.findUnique({ where: { id: leg2.run.id }, select: { publishedToDriver: true } });
      assert.strictEqual(after2?.publishedToDriver, true, "the block lifts once the feed exists");
    });

    await t.test("pick_from_yard on a dependent leg requires ITS feeder's drop, not any drop", async () => {
      const f = await mkJob();
      // Feeder that actually dropped the load…
      const realFeeder = await mkRun(A.p.id, f.job.id, f.cPart.id, { published: true });
      const r = await sync(A.token, [
        ev("started", f.job.id), ev("arrived_pickup", f.job.id),
        ev("collected", f.job.id, { actualQuantity: "10" }),
        ev("drop_at_yard", f.job.id, { yardRef: "7", actualQuantity: "10" }),
      ]);
      assert.strictEqual(JSON.parse(r.body).failed.length, 0, r.body);
      // …and an idle run the dependent leg wrongly points at.
      const idle = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}IDLE-${TS}`, createdBy: planner.id, assignedDriverId: A.p.id, status: "assigned" } });
      const leg2 = await mkRun(B.p.id, f.job.id, f.dPart.id, { dependsOnRunId: idle.id, published: true });

      const blocked = await sync(B.token, [ ev("pick_from_yard", f.job.id, { yardRef: "7" }) ]);
      const body = JSON.parse(blocked.body);
      assert.strictEqual(body.failed.length, 1, blocked.body);
      assert.match(body.failed[0].failureReason ?? "", /feeding run .* has not dropped/i);

      // Point the dependency at the run that really dropped it → pick succeeds.
      await prisma.run.update({ where: { id: leg2.run.id }, data: { dependsOnRunId: realFeeder.run.id } });
      const ok = await sync(B.token, [ ev("pick_from_yard", f.job.id, { yardRef: "7" }) ]);
      assert.strictEqual(JSON.parse(ok.body).failed.length, 0, ok.body);
    });

    await t.test("handover_accepted on a dependent leg only accepts ITS feeder's offer", async () => {
      const f = await mkJob();
      const offering = await mkRun(A.p.id, f.job.id, f.cPart.id, { published: true });
      const r = await sync(A.token, [
        ev("started", f.job.id), ev("arrived_pickup", f.job.id),
        ev("collected", f.job.id, { actualQuantity: "10" }),
        ev("handover_offered", f.job.id),
      ]);
      assert.strictEqual(JSON.parse(r.body).failed.length, 0, r.body);

      const idle = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}IDLE2-${TS}`, createdBy: planner.id, assignedDriverId: A.p.id, status: "assigned" } });
      const leg2 = await mkRun(B.p.id, f.job.id, f.dPart.id, { dependsOnRunId: idle.id, published: true });

      const blocked = await sync(B.token, [ ev("handover_accepted", f.job.id) ]);
      const body = JSON.parse(blocked.body);
      assert.strictEqual(body.failed.length, 1, blocked.body);
      assert.match(body.failed[0].failureReason ?? "", /feeding run .* has not offered/i);
      assert.strictEqual(await prisma.loadTrack.count({ where: { jobId: f.job.id, transactionType: "handover" } }), 0);

      await prisma.run.update({ where: { id: leg2.run.id }, data: { dependsOnRunId: offering.run.id } });
      const ok = await sync(B.token, [ ev("handover_accepted", f.job.id) ]);
      assert.strictEqual(JSON.parse(ok.body).failed.length, 0, ok.body);
      assert.strictEqual(await prisma.loadTrack.count({ where: { jobId: f.job.id, transactionType: "handover" } }), 1);
    });

    await t.test("a handover relay's dependent leg can publish once the feeder OFFERS (no deadlock)", async () => {
      const f = await mkJob();
      const offering = await mkRun(A.p.id, f.job.id, f.cPart.id, { published: true });
      const leg2 = await mkRun(B.p.id, f.job.id, f.dPart.id, { dependsOnRunId: offering.run.id });

      const blocked = await publish(leg2.run.id);
      assert.strictEqual(blocked.statusCode, 409, blocked.body);

      const r = await sync(A.token, [
        ev("started", f.job.id), ev("arrived_pickup", f.job.id),
        ev("collected", f.job.id, { actualQuantity: "10" }),
        ev("handover_offered", f.job.id),
      ]);
      assert.strictEqual(JSON.parse(r.body).failed.length, 0, r.body);

      const ok = await publish(leg2.run.id);
      assert.strictEqual(ok.statusCode, 200, ok.body);
    });

    await t.test("a run with no dependency publishes as before", async () => {
      const f = await mkJob();
      const solo = await mkRun(A.p.id, f.job.id, f.cPart.id);
      const ok = await publish(solo.run.id);
      assert.strictEqual(ok.statusCode, 200, ok.body);
    });

  } finally {
    await app.close();
    await prisma.syncEventLog.deleteMany({ where: { companyId: company.id } });
    await prisma.loadTrack.deleteMany({ where: { companyId: company.id } });
    await prisma.jobExecutionEvent.deleteMany({ where: { companyId: company.id } });
    await prisma.runAssignment.deleteMany({ where: { companyId: company.id } });
    await prisma.run.updateMany({ where: { companyId: company.id }, data: { dependsOnRunId: null } });
    await prisma.run.deleteMany({ where: { companyId: company.id } });
    await prisma.jobPart.deleteMany({ where: { companyId: company.id } });
    await prisma.job.deleteMany({ where: { companyId: company.id } });
    await prisma.auditLog.deleteMany({ where: { companyId: company.id } });
    await prisma.driverProfile.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, A.u.id, B.u.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

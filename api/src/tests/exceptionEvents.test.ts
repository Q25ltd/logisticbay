/**
 * Exception events / B8 B9 B11 B12 B13 — LOAD_MOVEMENT_PLAN Step 11.
 *
 * B8  delay_reported   — no custody, state unchanged, driver continues; flagged.
 * B9  breakdown        — assignment 'exception', job 'attention_needed', custody
 *                        stays on_vehicle (no new row; GPS on the event pins it).
 * B11 delivery_refused — refuse_return custody; partial refusal = deliver(8) +
 *                        refuse(2), conservation 8+2=10.
 * B12 partial/over qty — collect/deliver record the HONEST actual; drift vs the
 *                        form-born expected is flagged, never silently accepted.
 * B13 damage           — report is state-preserving + flagged; writeoff moves the
 *                        current custody to written_off and ends the leg in
 *                        'exception'.
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

const PREFIX = "__EXCTEST__";
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

test("exception events — B8/B9/B11/B12/B13 (Step 11)", async (t) => {
  const company = await prisma.company.create({ data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() } });
  const planner = await prisma.user.create({
    data: { name: `${PREFIX}P`, email: `${PREFIX}p_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } } },
  });
  const driver = await prisma.user.create({
    data: { name: `${PREFIX}D`, email: `${PREFIX}d_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "driver", status: "active" } } },
  });
  const profile = await prisma.driverProfile.create({ data: { companyId: company.id, userId: driver.id, displayName: `${PREFIX}D`, status: "active" } });
  const driverToken = tok(driver.id, company.id, "driver");
  const app = await buildApp(prisma, { silent: true });

  // Form-shaped job fixture: job-level fields, bare stops with form-born quantities.
  let jobSeq = 0;
  const mkJob = async (quantityRequired: number | null) => {
    const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}C${jobSeq}`, status: "planned" } });
    const cPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets",
      quantityRequired: quantityRequired != null ? new Prisma.Decimal(quantityRequired) : null } });
    const dPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery", quantityUnit: "pallets",
      quantityRequired: quantityRequired != null ? new Prisma.Decimal(quantityRequired) : null } });
    const run = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}R${jobSeq++}-${TS}`, createdBy: planner.id, assignedDriverId: profile.id, status: "assigned", publishedToDriver: true } });
    const asg = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: cPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });
    return { job, cPart, dPart, run, asg };
  };

  const sync = (events: unknown[]) =>
    app.inject({ method: "POST", url: "/sync/events", headers: { authorization: `Bearer ${driverToken}` }, payload: { events } });
  const jobStatus  = async (id: number) => (await prisma.job.findUnique({ where: { id } }))?.status;
  const asgStatus  = async (id: number) => (await prisma.runAssignment.findUnique({ where: { id } }))?.status;
  const eventRow   = (clientEventId: string) =>
    prisma.jobExecutionEvent.findFirst({ where: { companyId: company.id, clientEventId }, select: { needsReview: true, reviewReason: true } });

  try {
    await t.test("B8 delay: no custody, state unchanged, flagged — and the driver continues", async () => {
      const f = await mkJob(10);
      const events = [ ev("started", f.job.id), ev("delay_reported", f.job.id, { note: "stuck in traffic on M62" }) ];
      const delay = events[1];
      const res = await sync(events);
      assert.strictEqual(res.statusCode, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);

      assert.strictEqual(await asgStatus(f.asg.id), "en_route_pickup", "delay must not change execution state");
      assert.strictEqual(await prisma.loadTrack.count({ where: { jobId: f.job.id } }), 0, "delay writes no custody");
      const row = await eventRow(delay.clientEventId as string);
      assert.strictEqual(row?.needsReview, true);
      assert.strictEqual(row?.reviewReason, "delay_reported");

      // The driver keeps working after a delay.
      const res2 = await sync([ ev("arrived_pickup", f.job.id) ]);
      assert.strictEqual(JSON.parse(res2.body).failed.length, 0, res2.body);
      assert.strictEqual(await asgStatus(f.asg.id), "at_pickup");
    });

    await t.test("B9 breakdown: exception + attention_needed, custody stays on_vehicle", async () => {
      const f = await mkJob(10);
      const res = await sync([
        ev("started", f.job.id),
        ev("arrived_pickup", f.job.id),
        ev("collected", f.job.id, { actualQuantity: "10" }),
        ev("breakdown", f.job.id, { note: "engine failure", gpsLat: 53.79, gpsLng: -1.54 }),
      ]);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);

      assert.strictEqual(await asgStatus(f.asg.id), "exception");
      assert.strictEqual(await jobStatus(f.job.id), "attention_needed");
      const rows = await prisma.loadTrack.findMany({ where: { jobId: f.job.id }, select: { transactionType: true, toCustody: true } });
      assert.strictEqual(rows.length, 1, "breakdown writes no custody row — the load is stranded WITH the vehicle");
      assert.ok(rows[0].toCustody.startsWith("on_vehicle:"), "custody still on_vehicle");
    });

    await t.test("B11 refusal: deliver(8) + refuse_return(2) = collected 10 (conservation)", async () => {
      const f = await mkJob(10);
      const events = [
        ev("started", f.job.id),
        ev("arrived_pickup", f.job.id),
        ev("collected", f.job.id, { actualQuantity: "10" }),
        ev("arrived_dropoff", f.job.id),
        ev("completed", f.job.id, { actualQuantity: "8" }),
        ev("delivery_refused", f.job.id, { actualQuantity: "2", note: "2 pallets water-damaged, consignee refused" }),
      ];
      const deliverEv = events[4];
      const res = await sync(events);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);

      const rows = await prisma.loadTrack.findMany({ where: { jobId: f.job.id }, orderBy: { id: "asc" } });
      assert.deepStrictEqual(rows.map(r => r.transactionType), ["collect", "deliver", "refuse_return"]);
      assert.strictEqual(Number(rows[1].quantity) + Number(rows[2].quantity), Number(rows[0].quantity), "delivered + returned = collected (invariant 2)");
      assert.strictEqual(rows[2].toCustody, `returned:${f.dPart.id}`);

      assert.strictEqual(await asgStatus(f.asg.id), "exception");
      assert.strictEqual(await jobStatus(f.job.id), "attention_needed");
      const dRow = await eventRow(deliverEv.clientEventId as string);
      assert.strictEqual(dRow?.reviewReason, "partial_delivery", "the short deliver is flagged too");
    });

    await t.test("B12 partial and over collection are flagged, honest quantities recorded", async () => {
      const partial = await mkJob(10);
      const events1 = [ ev("started", partial.job.id), ev("arrived_pickup", partial.job.id), ev("collected", partial.job.id, { actualQuantity: "6" }) ];
      const shortEv = events1[2];
      const res1 = await sync(events1);
      assert.strictEqual(JSON.parse(res1.body).failed.length, 0, res1.body);
      const sRow = await eventRow(shortEv.clientEventId as string);
      assert.strictEqual(sRow?.needsReview, true);
      assert.strictEqual(sRow?.reviewReason, "partial_collection");
      const collect = await prisma.loadTrack.findFirst({ where: { jobId: partial.job.id, transactionType: "collect" } });
      assert.strictEqual(Number(collect?.quantity), 6, "ledger records the honest actual — the shortfall never left origin");

      const over = await mkJob(10);
      const events2 = [ ev("started", over.job.id), ev("arrived_pickup", over.job.id), ev("collected", over.job.id, { actualQuantity: "12" }) ];
      const overEv = events2[2];
      const res2 = await sync(events2);
      assert.strictEqual(JSON.parse(res2.body).failed.length, 0, res2.body);
      const oRow = await eventRow(overEv.clientEventId as string);
      assert.strictEqual(oRow?.reviewReason, "over_collection", "quantity drift is never silently accepted");
    });

    await t.test("B13 damage: report preserves state; writeoff → written_off + exception", async () => {
      const f = await mkJob(10);
      const events = [
        ev("started", f.job.id),
        ev("arrived_pickup", f.job.id),
        ev("collected", f.job.id, { actualQuantity: "10" }),
        ev("damage_reported", f.job.id, { note: "forklift punctured 3 boxes", gpsLat: 53.8, gpsLng: -1.5 }),
      ];
      const reportEv = events[3];
      const res = await sync(events);
      assert.strictEqual(JSON.parse(res.body).failed.length, 0, res.body);
      assert.strictEqual(await asgStatus(f.asg.id), "loaded", "damage report does not stop the run");
      const rRow = await eventRow(reportEv.clientEventId as string);
      assert.strictEqual(rRow?.reviewReason, "damage_reported");
      assert.strictEqual(await prisma.loadTrack.count({ where: { jobId: f.job.id } }), 1, "report writes no custody");

      const res2 = await sync([ ev("damage_writeoff", f.job.id, { actualQuantity: "10", note: "full load contaminated" }) ]);
      assert.strictEqual(JSON.parse(res2.body).failed.length, 0, res2.body);
      const rows = await prisma.loadTrack.findMany({ where: { jobId: f.job.id }, orderBy: { id: "asc" } });
      assert.deepStrictEqual(rows.map(r => r.transactionType), ["collect", "damage_writeoff"]);
      assert.strictEqual(rows[1].fromCustody, rows[0].toCustody, "writeoff moves the load from its CURRENT custody");
      assert.strictEqual(rows[1].toCustody, "written_off");
      assert.strictEqual(Number(rows[1].quantity), 10, "written-off quantity recorded (conservation auditable)");
      assert.strictEqual(await asgStatus(f.asg.id), "exception");
      assert.strictEqual(await jobStatus(f.job.id), "attention_needed");
    });

  } finally {
    await app.close();
    await prisma.syncEventLog.deleteMany({ where: { companyId: company.id } });
    await prisma.loadTrack.deleteMany({ where: { companyId: company.id } });
    await prisma.jobExecutionEvent.deleteMany({ where: { companyId: company.id } });
    await prisma.runAssignment.deleteMany({ where: { companyId: company.id } });
    await prisma.run.deleteMany({ where: { companyId: company.id } });
    await prisma.jobPart.deleteMany({ where: { companyId: company.id } });
    await prisma.job.deleteMany({ where: { companyId: company.id } });
    await prisma.driverProfile.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, driver.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

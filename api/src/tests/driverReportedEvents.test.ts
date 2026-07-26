/**
 * Driver-reported events — the exact contract the mobile app now sends.
 *
 * The app's report sheet (mobile/src/constants/driverActions.ts) posts these
 * through POST /sync/events with an explicit `runAssignmentId` plus whichever
 * of `note` / `yardRef` / `newTrailerReg` / `actualQuantity` the action needs.
 * The individual behaviours already have scenario tests (exceptionEvents,
 * trailerSwap, yardBuffer); what is proven HERE is the client contract:
 *
 *   - each action is accepted from the execution state the app offers it from
 *     (so a button the driver can see never 400s), and
 *   - the app's payload shape survives the wire intact — note text lands on
 *     the event, the state-preserving ones really do leave the driver's step
 *     alone, and the state-changing ones move exactly one assignment.
 *
 * These event types are unreachable via PATCH /jobs/:id/status (EVENT_TYPE_MAP
 * carries only the five happy-path statuses), which is why every one of them
 * goes through the offline queue whether the driver has signal or not.
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

const PREFIX = "__DRVREPORT__";
const TS     = Date.now();
const tok = (u: number, c: number, r: string) => jwt.sign({ userId: u, companyId: c, role: r }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

let seq = 0;
const ev = (eventType: string, jobId: number, runAssignmentId: number, extra: Record<string, unknown> = {}) => ({
  eventType, jobId, runAssignmentId,
  clientEventId:   `${PREFIX}${eventType}-${TS}-${seq}`,
  clientTimestamp: new Date(TS + (seq++ * 1000)).toISOString(),
  ...extra,
});

test("driver-reported events — the app's payload is accepted from the states it offers", async (t) => {
  const company = await prisma.company.create({ data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() } });
  const planner = await prisma.user.create({
    data: { name: `${PREFIX}P`, email: `${PREFIX}p_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } } },
  });
  const driverUser = await prisma.user.create({
    data: { name: `${PREFIX}D`, email: `${PREFIX}d_${TS}@test.invalid`.toLowerCase(), passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "driver", status: "active" } } },
  });
  const profile = await prisma.driverProfile.create({ data: { companyId: company.id, userId: driverUser.id, displayName: `${PREFIX}Drv`, status: "active" } });
  const token = tok(driverUser.id, company.id, "driver");
  const app = await buildApp(prisma, { silent: true });

  const sync = (events: unknown[]) =>
    app.inject({ method: "POST", url: "/sync/events", headers: { authorization: `Bearer ${token}` }, payload: { events } });

  /** A fresh two-stop job on its own run, so each subtest is independent. */
  async function freshJob(tag: string) {
    const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: planner.id, customerName: `${PREFIX}${tag}`, status: "planned", quantity: 10, quantityUnit: "pallets" } });
    const cPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 1, type: "collection", quantityUnit: "pallets" } });
    const dPart = await prisma.jobPart.create({ data: { companyId: company.id, jobId: job.id, sequenceNumber: 2, type: "delivery", quantityUnit: "pallets" } });
    const run = await prisma.run.create({ data: { companyId: company.id, runReference: `${PREFIX}${tag}-${TS}`, createdBy: planner.id, assignedDriverId: profile.id, status: "assigned", publishedToDriver: true } });
    const cAsg = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: cPart.id, jobId: job.id, sequenceNumber: 1, addedBy: planner.id, status: "not_started" } });
    const dAsg = await prisma.runAssignment.create({ data: { companyId: company.id, runId: run.id, jobPartId: dPart.id, jobId: job.id, sequenceNumber: 2, addedBy: planner.id, status: "not_started" } });
    return { job, cAsg, dAsg, run };
  }

  const stateOf = async (id: number) => (await prisma.runAssignment.findUnique({ where: { id } }))?.status;
  const ok = (res: Awaited<ReturnType<typeof sync>>) => {
    const body = JSON.parse(res.body) as { failed: { failureReason?: string }[] };
    assert.strictEqual(body.failed.length, 0, res.body);
  };

  try {
    await t.test("running late — driver keeps working, planner still told", async () => {
      const { job, cAsg } = await freshJob("DELAY");
      ok(await sync([ev("started", job.id, cAsg.id)]));
      assert.strictEqual(await stateOf(cAsg.id), "en_route_pickup");

      ok(await sync([ev("delay_reported", job.id, cAsg.id, { note: "Held up on the M6, about 40 minutes late" })]));

      // State-preserving: the whole point is the driver carries on.
      assert.strictEqual(await stateOf(cAsg.id), "en_route_pickup", "a delay must not move the driver's step");
      const logged = await prisma.jobExecutionEvent.findFirst({ where: { jobId: job.id, eventType: "delay_reported" } });
      assert.match(logged?.note ?? "", /M6/, "the driver's own words reach the planner");
      assert.strictEqual(logged?.needsReview, true, "a delay always surfaces on the planner's queue");
    });

    await t.test("breakdown — assignment goes to exception, job needs attention, GPS pins the load", async () => {
      const { job, cAsg } = await freshJob("BRKDN");
      ok(await sync([
        ev("started", job.id, cAsg.id),
        ev("arrived_pickup", job.id, cAsg.id),
        ev("collected", job.id, cAsg.id, { actualQuantity: "10" }),
      ]));
      ok(await sync([ev("breakdown", job.id, cAsg.id, { note: "Air line burst", gpsLat: 53.8, gpsLng: -1.55 })]));

      assert.strictEqual(await stateOf(cAsg.id), "exception");
      const j = await prisma.job.findUnique({ where: { id: job.id } });
      assert.strictEqual(j?.status, "attention_needed");
      const logged = await prisma.jobExecutionEvent.findFirst({ where: { jobId: job.id, eventType: "breakdown" } });
      assert.strictEqual(logged?.gpsLat, 53.8, "GPS pins where the load is stranded");
    });

    await t.test("refused delivery — accepted at the dropoff with a quantity and a reason", async () => {
      const { job, cAsg, dAsg } = await freshJob("REFUSE");
      ok(await sync([
        ev("started", job.id, cAsg.id),
        ev("arrived_pickup", job.id, cAsg.id),
        ev("collected", job.id, cAsg.id, { actualQuantity: "10" }),
        ev("arrived_dropoff", job.id, cAsg.id),
      ]));
      ok(await sync([ev("delivery_refused", job.id, cAsg.id, { actualQuantity: "10", note: "Pallets damaged in transit, customer would not sign" })]));

      assert.strictEqual(await stateOf(cAsg.id), "exception");
      assert.strictEqual(await stateOf(dAsg.id), "not_started", "only the acting assignment moves");
      const custody = await prisma.loadTrack.findFirst({ where: { jobId: job.id, transactionType: "refuse_return" } });
      assert.ok(custody, "a refusal writes the return custody row");
    });

    await t.test("damage — recorded and flagged, driver carries on", async () => {
      const { job, cAsg } = await freshJob("DMG");
      ok(await sync([
        ev("started", job.id, cAsg.id),
        ev("arrived_pickup", job.id, cAsg.id),
        ev("collected", job.id, cAsg.id, { actualQuantity: "10" }),
      ]));
      ok(await sync([ev("damage_reported", job.id, cAsg.id, { note: "Corner of pallet 3 crushed" })]));

      assert.strictEqual(await stateOf(cAsg.id), "loaded", "damage report must not stop the run");
      const logged = await prisma.jobExecutionEvent.findFirst({ where: { jobId: job.id, eventType: "damage_reported" } });
      assert.strictEqual(logged?.needsReview, true);
    });

    await t.test("trailer swap — the app's newTrailerReg + yardRef shape is honoured", async () => {
      const { job, cAsg, run } = await freshJob("SWAP");
      const newTrailer = await prisma.fleetTrailer.create({ data: { companyId: company.id, registration: `${PREFIX}TR-${TS}`.slice(0, 20).toUpperCase(), trailerType: "curtainsider", status: "available" } });
      ok(await sync([
        ev("started", job.id, cAsg.id),
        ev("arrived_pickup", job.id, cAsg.id),
        ev("collected", job.id, cAsg.id, { actualQuantity: "10" }),
      ]));
      ok(await sync([ev("trailer_swap", job.id, cAsg.id, { newTrailerReg: newTrailer.registration, yardRef: "Leeds depot" })]));

      const after = await prisma.run.findUnique({ where: { id: run.id } });
      assert.strictEqual(after?.assignedTrailerId, newTrailer.id, "the run continues on the trailer the driver typed");
      const custody = await prisma.loadTrack.findFirst({ where: { jobId: job.id, transactionType: "trailer_swap" } });
      assert.match(custody?.toCustody ?? "", /^yard:/, "the load stays tracked on the dropped trailer");
    });

    await t.test("an unknown trailer reg never blocks the driver — flagged, not refused", async () => {
      const { job, cAsg, run } = await freshJob("SWAPX");
      ok(await sync([
        ev("started", job.id, cAsg.id),
        ev("arrived_pickup", job.id, cAsg.id),
        ev("collected", job.id, cAsg.id, { actualQuantity: "10" }),
      ]));
      // The app lets the driver send a swap without knowing the reg (the field
      // is explicitly optional) — this must still be accepted.
      ok(await sync([ev("trailer_swap", job.id, cAsg.id, { yardRef: "Roadside" })]));

      const after = await prisma.run.findUnique({ where: { id: run.id } });
      assert.strictEqual(after?.assignedTrailerId, null, "honest unknown rather than an invented fleet row");
      const logged = await prisma.jobExecutionEvent.findFirst({ where: { jobId: job.id, eventType: "trailer_swap" } });
      assert.strictEqual(logged?.needsReview, true, "the planner is asked to fill the gap");
    });

    await t.test("drop at yard — accepted with just the yard the driver typed", async () => {
      const { job, cAsg } = await freshJob("YARD");
      ok(await sync([
        ev("started", job.id, cAsg.id),
        ev("arrived_pickup", job.id, cAsg.id),
        ev("collected", job.id, cAsg.id, { actualQuantity: "10" }),
      ]));
      ok(await sync([ev("drop_at_yard", job.id, cAsg.id, { yardRef: "Warrington depot" })]));

      const custody = await prisma.loadTrack.findFirst({ where: { jobId: job.id, transactionType: "drop_at_yard" } });
      assert.strictEqual(custody?.toCustody, "yard:Warrington depot");
      const j = await prisma.job.findUnique({ where: { id: job.id } });
      assert.strictEqual(j?.status, "collected", "at a yard is not delivered");
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
    await prisma.fleetTrailer.deleteMany({ where: { companyId: company.id } });
    await prisma.driverProfile.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: { in: [planner.id, driverUser.id] } } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});

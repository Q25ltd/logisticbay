/**
 * checkRun confidence + buffer — Phase A2 Q3 (no DB, no network).
 *
 * Stops carry lat/lng so no postcode lookup; ORS is keyless in test so legs fall
 * back to deterministic haversine. Tests the confidence/buffer logic only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkRun } from "./checkRunService.js";

const LONDON  = { lat: 51.5074, lng: -0.1278 };
const READING = { lat: 51.4543, lng: -0.9781 };
const EDINBURGH = { lat: 55.9533, lng: -3.1883 };

const MAX_9H  = 540;  // 9h driving (minutes)
const MAX_10H = 600;  // 10h driving (minutes)

describe("checkRun — confidence + contingency buffer (A2 Q3)", () => {
  it("always reports the applied buffer (15% drive, 45 min dwell)", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", ...LONDON },
        { sequenceNumber: 2, type: "delivery", ...READING },
      ],
      estimatedStartTime: "2026-06-10T06:00:00Z",
    });
    assert.strictEqual(r.buffer.driveBufferPct, 0.15);
    assert.strictEqual(r.buffer.dwellPerStopMin, 45);
  });

  it("a comfortable run scores high confidence and no concern", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", ...LONDON },
        { sequenceNumber: 2, type: "delivery", ...READING, timeWindowEnd: "2026-06-10T12:00:00Z" },
      ],
      estimatedStartTime: "2026-06-10T06:00:00Z",
    });
    assert.strictEqual(r.concern, false);
    assert.strictEqual(r.severity, "none");
    assert.ok((r.confidence ?? 0) >= 80, `expected high confidence, got ${r.confidence}`);
  });

  it("an impossible window scores low confidence even with the buffer", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", ...LONDON },
        // ~530 km away, but window closes 1h after start → impossible.
        { sequenceNumber: 2, type: "delivery", ...EDINBURGH, timeWindowEnd: "2026-06-10T07:00:00Z" },
      ],
      estimatedStartTime: "2026-06-10T06:00:00Z",
    });
    assert.strictEqual(r.concern, true);
    assert.ok((r.confidence ?? 100) <= 40, `expected low confidence, got ${r.confidence}`);
    assert.ok(r.buffer.minSlackMin !== null && r.buffer.minSlackMin < 0, "slack should be negative");
  });

  it("no coordinates → confidence null (cannot assess)", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", lat: null, lng: null, postcode: null },
        { sequenceNumber: 2, type: "delivery", lat: null, lng: null, postcode: null },
      ],
      estimatedStartTime: "2026-06-10T06:00:00Z",
    });
    assert.strictEqual(r.confidence, null);
    assert.strictEqual(r.severity, "none");
  });
});

describe("checkRun — geometry: direction / empty miles (A2 Q2)", () => {
  it("reports routed vs ideal distance and a detour ratio ≥ 1", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", ...LONDON },
        { sequenceNumber: 2, type: "delivery", ...EDINBURGH },
      ],
      estimatedStartTime: "2026-06-10T06:00:00Z",
    });
    assert.ok((r.geometry.routedKm ?? 0) > 0, "routedKm set");
    assert.ok((r.geometry.idealKm ?? 0) > 0, "idealKm set");
    assert.ok((r.geometry.detourRatio ?? 0) >= 1, "detour ratio ≥ 1 (road ≥ straight line)");
  });

  it("deadhead (empty miles) only when a base location is provided", async () => {
    const stops = [
      { sequenceNumber: 1, type: "collection", ...LONDON },
      { sequenceNumber: 2, type: "delivery", ...READING },
    ];
    const withoutBase = await checkRun({ stops, estimatedStartTime: "2026-06-10T06:00:00Z" });
    assert.strictEqual(withoutBase.geometry.deadheadKm, null, "no base → no deadhead");

    const withBase = await checkRun({ stops, estimatedStartTime: "2026-06-10T06:00:00Z", base: { lat: 52.4862, lng: -1.8904 } });
    assert.ok((withBase.geometry.deadheadKm ?? 0) > 0, "base → deadhead computed");
  });

  it("no coordinates → geometry is all null", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", lat: null, lng: null, postcode: null },
        { sequenceNumber: 2, type: "delivery", lat: null, lng: null, postcode: null },
      ],
    });
    assert.deepStrictEqual(r.geometry, { routedKm: null, idealKm: null, detourRatio: null, deadheadKm: null });
  });
});

describe("checkRun — collection coverage (Q4)", () => {
  it("matched collect + deliver (same job) → covered", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", jobId: 1, ...LONDON },
        { sequenceNumber: 2, type: "delivery", jobId: 1, ...READING },
      ],
    });
    assert.strictEqual(r.coverage.ok, true);
  });

  it("the screenshot bug: a delivery with no collection → NOT covered, confidence tanks", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", jobId: 1, customerName: "Midlands Fresh Foods", ...LONDON },
        { sequenceNumber: 2, type: "delivery",   jobId: 1, customerName: "Midlands Fresh Foods", ...READING },
        { sequenceNumber: 3, type: "delivery",   jobId: 2, customerName: "NHS Supply Chain", lat: 51.46, lng: -0.99 },
      ],
      estimatedStartTime: "2026-06-10T06:00:00Z",
    });
    assert.strictEqual(r.coverage.ok, false);
    assert.ok(r.coverage.uncovered.some(u => /NHS/.test(u)), `uncovered: ${r.coverage.uncovered}`);
    assert.strictEqual(r.concern, true);
    assert.strictEqual(r.severity, "high");
    assert.ok((r.confidence ?? 100) <= 25, `unserviceable run must not read green, got ${r.confidence}`);
  });

  it("a yard pickup waypoint sources the goods → covered", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "yard_pickup", ...LONDON },
        { sequenceNumber: 2, type: "delivery", jobId: 9, ...READING },
      ],
    });
    assert.strictEqual(r.coverage.ok, true);
  });

  it("a feeding relay run sources the goods → covered", async () => {
    const r = await checkRun({
      stops: [ { sequenceNumber: 1, type: "delivery", jobId: 9, ...READING } ],
      hasFeederRun: true,
    });
    assert.strictEqual(r.coverage.ok, true);
  });
});

describe("checkRun — fleet-aware capacity (Q5a)", () => {
  const STANDARD_ONLY = { maxPalletSpaces: 26, hasDoubleDeck: false, trailerCount: 2 };
  const HAS_DOUBLEDECK = { maxPalletSpaces: 52, hasDoubleDeck: true, trailerCount: 2 };

  it("40 non-stackable pallets on a standard-only fleet → capacity fails, split into 2", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", jobId: 1, pallets: 40, stackable: false, ...LONDON },
        { sequenceNumber: 2, type: "delivery",   jobId: 1, ...READING },
      ],
      estimatedStartTime: "2026-06-10T06:00:00Z",
      fleet: STANDARD_ONLY,
    });
    assert.strictEqual(r.capacity.ok, false);
    assert.strictEqual(r.capacity.splitInto, 2);
    assert.strictEqual(r.concern, true);
    assert.ok((r.confidence ?? 100) <= 60, `over-capacity run must score low, got ${r.confidence}`);
  });

  it("same 40 pallets fit whole when the fleet has a double-deck", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", jobId: 1, pallets: 40, stackable: false, ...LONDON },
        { sequenceNumber: 2, type: "delivery",   jobId: 1, ...READING },
      ],
      estimatedStartTime: "2026-06-10T06:00:00Z",
      fleet: HAS_DOUBLEDECK,
    });
    assert.strictEqual(r.capacity.ok, true);
    assert.strictEqual(r.capacity.splitInto, null);
  });

  it("no fleet profile supplied → capacity is a no-op pass", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", jobId: 1, pallets: 40, stackable: false, ...LONDON },
        { sequenceNumber: 2, type: "delivery",   jobId: 1, ...READING },
      ],
    });
    assert.strictEqual(r.capacity.ok, true);
    assert.strictEqual(r.capacity.footprint, null);
  });
});

describe("checkRun — drivers' hours: breaks + working time (Q3b)", () => {
  // ORS is keyless in test → deterministic haversine × 1.25 road factor ÷ 60 km/h.
  const NORTH_9H5 = { lat: 55.60, lng: -0.1278 };  // ~9.5h driving from London (extension band)

  it("a short run needs no break and reports a legal summary", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", ...LONDON },
        { sequenceNumber: 2, type: "delivery", ...READING },
      ],
    });
    assert.strictEqual(r.legal.drivingBreakCount, 0);
    assert.ok(r.legal.drivingMin > 0 && r.legal.drivingMin < MAX_9H, `driving ${r.legal.drivingMin}`);
    assert.strictEqual(r.legal.usesExtension, false);
    assert.ok(r.legal.dutyMin >= r.legal.drivingMin);
  });

  it("THE FIX: a single 11h leg (London→Edinburgh) requires TWO 45-min breaks, not one", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", ...LONDON },
        { sequenceNumber: 2, type: "delivery", ...EDINBURGH },
      ],
      estimatedStartTime: "2026-06-10T05:00:00Z",
    });
    assert.strictEqual(r.legal.drivingBreakCount, 2, "repeating breaks: 2 per ~11h driving");
    assert.ok(r.legal.drivingMin > 600, `driving over 10h, got ${r.legal.drivingMin}`);
    assert.strictEqual(r.concern, true);
    assert.strictEqual(r.severity, "high");        // over the 10h absolute limit
    assert.strictEqual(r.legal.usesExtension, false); // >10h is not an "extension", it's illegal
  });

  it("driving in the 9–10h band flags the 10-hour extension (advisory, not a hard fail)", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", ...LONDON },
        { sequenceNumber: 2, type: "delivery", ...NORTH_9H5 },
      ],
      estimatedStartTime: "2026-06-10T04:00:00Z",
    });
    assert.ok(r.legal.drivingMin > MAX_9H && r.legal.drivingMin <= MAX_10H, `driving ${r.legal.drivingMin}`);
    assert.strictEqual(r.legal.usesExtension, true);
    assert.strictEqual(r.legal.drivingBreakCount, 2);
  });

  it("duty time includes the breaks (more than driving + dwell alone)", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", ...LONDON },
        { sequenceNumber: 2, type: "delivery", ...EDINBURGH },
      ],
    });
    // dutyMin = buffered drive + dwell + 2×45 breaks → strictly above raw driving.
    assert.ok(r.legal.dutyMin > r.legal.drivingMin + 2 * 45, `duty ${r.legal.dutyMin} vs driving ${r.legal.drivingMin}`);
  });
});

describe("checkRun — vehicle suitability (Q5b)", () => {
  it("THE SCREENSHOT: a 22-pallet 11t artic load + an 85kg van parcel job → vehicle conflict, confidence drops", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", jobId: 1, customerName: "Midlands Fresh Foods", weightKg: 11000, pallets: 22, ...LONDON },
        { sequenceNumber: 2, type: "delivery",   jobId: 1, customerName: "Midlands Fresh Foods", weightKg: 11000, ...READING },
        { sequenceNumber: 3, type: "collection", jobId: 2, customerName: "NHS Supply Chain", weightKg: 85, lat: 51.46, lng: -0.99 },
        { sequenceNumber: 4, type: "delivery",   jobId: 2, customerName: "NHS Supply Chain", weightKg: 85, ...READING },
      ],
      estimatedStartTime: "2026-06-10T06:00:00Z",
    });
    assert.strictEqual(r.vehicleSuitability.ok, false);
    assert.ok(r.vehicleSuitability.conflicts.some(c => /different vehicles/i.test(c.reason)), JSON.stringify(r.vehicleSuitability.conflicts));
    assert.strictEqual(r.concern, true);
    assert.ok((r.confidence ?? 100) < 70, `mixed-vehicle run must score lower, got ${r.confidence}`);
  });

  it("an allocated van under an 11t load is flagged too small", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", jobId: 1, weightKg: 11000, ...LONDON },
        { sequenceNumber: 2, type: "delivery",   jobId: 1, weightKg: 11000, ...READING },
      ],
      assignedVehicle: { category: "van" },
    });
    assert.strictEqual(r.vehicleSuitability.ok, false);
    assert.ok(r.vehicleSuitability.conflicts.some(c => /too small/i.test(c.reason)));
  });

  it("a single coherent HGV load is fine", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", jobId: 1, weightKg: 9000, ...LONDON },
        { sequenceNumber: 2, type: "delivery",   jobId: 1, weightKg: 9000, ...READING },
      ],
    });
    assert.strictEqual(r.vehicleSuitability.ok, true);
    assert.strictEqual(r.vehicleSuitability.conflicts.length, 0);
  });
});

describe("checkRun — window waiting + real duty spread (Q3c)", () => {
  const D = (hhmm: string) => `2026-06-10T${hhmm}:00Z`;

  it("THE FIX: an out-of-order plan (collect slot closes before the driver can reach it) is infeasible", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", ...LONDON,  timeWindowStart: D("07:00"), timeWindowEnd: D("09:00") },
        { sequenceNumber: 2, type: "delivery",   ...READING, timeWindowStart: D("12:00"), timeWindowEnd: D("15:00") },
        // This collection's window (11:00–12:00) has already closed by the time the
        // driver finishes the 12:00–15:00 delivery and drives back — impossible.
        { sequenceNumber: 3, type: "collection", ...LONDON,  timeWindowStart: D("11:00"), timeWindowEnd: D("12:00") },
        { sequenceNumber: 4, type: "delivery",   ...READING, timeWindowStart: D("13:00"), timeWindowEnd: D("14:00") },
      ],
      estimatedStartTime: D("03:00"),
    });
    assert.strictEqual(r.concern, true);
    assert.strictEqual(r.severity, "high");
    assert.ok(r.buffer.minSlackMin !== null && r.buffer.minSlackMin < 0, `expected negative slack, got ${r.buffer.minSlackMin}`);
    assert.ok((r.confidence ?? 100) < 60, `out-of-order run must not read feasible, got ${r.confidence}`);
  });

  it("an in-order plan with early arrival waits for the window — still feasible, but duty reflects the wait", async () => {
    const r = await checkRun({
      stops: [
        { sequenceNumber: 1, type: "collection", ...LONDON,  timeWindowStart: D("08:00"), timeWindowEnd: D("10:00") },
        { sequenceNumber: 2, type: "delivery",   ...READING, timeWindowStart: D("12:00"), timeWindowEnd: D("16:00") },
      ],
      estimatedStartTime: D("03:00"),  // 5h early — driver idles until 08:00
    });
    assert.strictEqual(r.concern, false);
    // Spread runs 03:00 → ~12:45 (incl. the long wait) — far more than drive + dwell alone.
    assert.ok(r.legal.dutyMin > 480, `duty should include the wait, got ${r.legal.dutyMin}`);
  });
});

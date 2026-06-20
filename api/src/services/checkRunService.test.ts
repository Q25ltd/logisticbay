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

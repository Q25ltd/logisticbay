/**
 * runReadinessService — Runs B1 (pure, no DB, no network).
 *
 * Readiness is a GATE (ready boolean + named blockers), not a blended %. Hard
 * failures block publish; soft/unknown never block on their own.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRunReadiness, type ReadinessDriver } from "./runReadinessService.js";

const DAVE: ReadinessDriver = {
  id: 1, displayName: "Dave", status: "active",
  licenceClass: "C+E", canUseTrailer: true, trailerTypesAllowed: [], adrAllowed: false,
};
const TRUCK   = { id: 1, registration: "AB12 XYZ" };
const TRAILER = { id: 1, registration: "TR101", trailerType: "curtain" };

describe("computeRunReadiness — the publish gate", () => {
  it("no driver → not ready, with a clear blocker", () => {
    const r = computeRunReadiness({ hasStops: true, loads: [{}] });
    assert.strictEqual(r.ready, false);
    assert.ok(r.blockers.some(b => /no driver/i.test(b)), JSON.stringify(r.blockers));
  });

  it("driver + truck + trailer, all compatible → ready (unknowns don't block)", () => {
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE, truck: TRUCK, trailer: TRAILER,
      loads: [{ requiresTrailer: true }], trailerCompatible: true, vehicleCompatible: true,
    });
    assert.strictEqual(r.ready, true);
    assert.strictEqual(r.blockers.length, 0);
    // MOT / VOR / hours are surfaced as unknown but never block.
    assert.ok(r.resources.checks.some(c => c.key === "mot_inspection" && c.status === "unknown"));
  });

  it("hazardous load + driver without ADR → blocked", () => {
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE, truck: TRUCK, trailer: TRAILER,
      loads: [{ hazardous: true, requiresTrailer: true }], trailerCompatible: true, vehicleCompatible: true,
    });
    assert.strictEqual(r.ready, false);
    assert.ok(r.blockers.some(b => /ADR/i.test(b)));
  });

  it("no trailer pinned → READY with a yard-grab warning carrying the needed type", () => {
    // Yard-grab ops: drivers collect a suitable trailer at the yard and register
    // it at shift start — a missing trailer must not block publish.
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE, truck: TRUCK,
      loads: [{ requiresTrailer: true }], vehicleCompatible: true,
      requiredTrailerText: "temperature-controlled (fridge)",
    });
    assert.strictEqual(r.ready, true, JSON.stringify(r.blockers));
    const warn = r.resources.checks.find(c => c.key === "trailer_assigned");
    assert.strictEqual(warn?.status, "warn");
    assert.match(warn?.reason ?? "", /temperature-controlled \(fridge\)/);
  });

  it("no trailer pinned but driver isn't trailer-rated → blocked (he'll pull one)", () => {
    const noRating: ReadinessDriver = { ...DAVE, canUseTrailer: false };
    const r = computeRunReadiness({
      hasStops: true, driver: noRating, truck: TRUCK,
      loads: [{ requiresTrailer: true }], vehicleCompatible: true,
    });
    assert.strictEqual(r.ready, false);
    assert.ok(r.blockers.some(b => /trailer-rated/i.test(b)));
  });

  it("carries the S5 compat flag — incompatible trailer blocks (not recomputed here)", () => {
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE, trailer: { id: 2, registration: "TR9", trailerType: "box" },
      loads: [{ requiresTrailer: true }], trailerCompatible: false,
    });
    assert.strictEqual(r.ready, false);
    assert.ok(r.blockers.some(b => /not compatible/i.test(b)));
  });

  it("a driver not cleared for the trailer type is blocked", () => {
    const fussy: ReadinessDriver = { ...DAVE, trailerTypesAllowed: ["fridge"] };
    const r = computeRunReadiness({
      hasStops: true, driver: fussy, trailer: TRAILER, // curtain, not fridge
      loads: [{ requiresTrailer: true }], trailerCompatible: true,
    });
    assert.strictEqual(r.ready, false);
    assert.ok(r.blockers.some(b => /cleared/i.test(b)));
  });

  it("pinned trailer loaded with ANOTHER job → blocked (it's full)", () => {
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE,
      trailer: { id: 3, registration: "TR77", trailerType: "curtain", status: "loaded", loadedWithOtherJob: true },
      loads: [{ requiresTrailer: true }], trailerCompatible: true,
    });
    assert.strictEqual(r.ready, false);
    assert.ok(r.blockers.some(b => /loaded with another job/i.test(b)), JSON.stringify(r.blockers));
  });

  it("pinned trailer pre-loaded with THIS run's job → ready (that's the right trailer)", () => {
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE,
      trailer: { id: 3, registration: "TR77", trailerType: "curtain", status: "loaded", loadedWithThisRun: true },
      loads: [{ requiresTrailer: true }], trailerCompatible: true,
    });
    assert.strictEqual(r.ready, true, JSON.stringify(r.blockers));
  });

  it("no stops → never ready (nothing to execute)", () => {
    const r = computeRunReadiness({ hasStops: false, driver: DAVE, loads: [] });
    assert.strictEqual(r.ready, false);
  });

  it("a missing vehicle is a soft warning, not a blocker (unit is a later phase)", () => {
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE, trailer: TRAILER,
      loads: [{ requiresTrailer: true }], trailerCompatible: true,
    });
    assert.strictEqual(r.ready, true);   // no truck, but that's soft
    assert.ok(r.resources.checks.some(c => c.key === "truck_assigned" && c.status === "warn" && !c.hard));
  });
});

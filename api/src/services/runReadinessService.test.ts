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

  it("expired MOT on an assigned asset → blocked (hard fail)", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE,
      truck: { ...TRUCK, motExpiryDate: past },
      trailer: { ...TRAILER, motExpiryDate: new Date(Date.now() + 90 * 86400000).toISOString() },
      loads: [{}],
    });
    assert.strictEqual(r.ready, false);
    assert.ok(r.blockers.some(b => /expired/i.test(b)), JSON.stringify(r.blockers));
  });

  it("MOT due within 30 days → warn, does NOT block", () => {
    const soon = new Date(Date.now() + 10 * 86400000).toISOString();
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE,
      truck: { ...TRUCK, motExpiryDate: soon },
      trailer: { ...TRAILER, motExpiryDate: new Date(Date.now() + 90 * 86400000).toISOString() },
      loads: [{}],
    });
    assert.strictEqual(r.ready, true);
    const mot = r.resources.checks.find(c => c.key === "mot_inspection");
    assert.strictEqual(mot?.status, "warn");
  });

  it("no MOT date recorded → honest unknown, does NOT block", () => {
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE, truck: TRUCK, trailer: TRAILER, loads: [{}],
    });
    assert.strictEqual(r.ready, true);
    const mot = r.resources.checks.find(c => c.key === "mot_inspection");
    assert.strictEqual(mot?.status, "unknown");
    assert.match(mot?.reason ?? "", /No test date recorded/);
  });

  it("assigned asset off road (VOR) → blocked", () => {
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE,
      truck: { ...TRUCK, status: "vor" }, trailer: TRAILER, loads: [{}],
    });
    assert.strictEqual(r.ready, false);
    assert.ok(r.blockers.some(b => /off road/i.test(b)), JSON.stringify(r.blockers));
  });

  it("assets in service → VOR check passes (real data, not a stub)", () => {
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE,
      truck: { ...TRUCK, status: "available" }, trailer: { ...TRAILER, status: "available" }, loads: [{}],
    });
    const vor = r.resources.checks.find(c => c.key === "vor_defects");
    assert.strictEqual(vor?.status, "pass");
  });

  it("no stops → never ready, and the empty run is NAMED as the blocker", () => {
    // Regression: `ready` used to be false via a separate `hasStops` term while
    // no check failed, so the planner got "Not ready" with an empty blocker
    // list and publish answered with the bare "run is not ready".
    const r = computeRunReadiness({ hasStops: false, driver: DAVE, loads: [] });
    assert.strictEqual(r.ready, false);
    assert.ok(r.blockers.length > 0, "an unready run must always name why");
    assert.ok(r.blockers.some(b => /no stops on this run/i.test(b)), JSON.stringify(r.blockers));
    const stops = r.resources.checks.find(c => c.key === "stops_assigned");
    assert.strictEqual(stops?.status, "fail");
    assert.strictEqual(stops?.source, "planning", "points the planner at the board that fixes it");
  });

  it("no stops → driver hours is n/a, not an unknown blamed on the driver's day", () => {
    const r = computeRunReadiness({ hasStops: false, driver: DAVE, loads: [] });
    const hours = r.resources.checks.find(c => c.key === "driver_hours");
    assert.strictEqual(hours?.status, "na");
    assert.strictEqual(hours?.reason, undefined, "no stray 'not estimable' text under Driver hours");
    assert.ok(!r.resources.checks.some(c => /not estimable/i.test(c.reason ?? "")));
  });

  it("stops present → stops_assigned passes and counts toward the tally", () => {
    const r = computeRunReadiness({
      hasStops: true, driver: DAVE, truck: TRUCK, trailer: TRAILER,
      loads: [{ requiresTrailer: true }], trailerCompatible: true, vehicleCompatible: true,
    });
    assert.strictEqual(r.resources.checks.find(c => c.key === "stops_assigned")?.status, "pass");
    assert.strictEqual(r.ready, true);
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

// ── Driver hours — run length vs the driver's day (2026-07-18) ────────────────

describe("computeRunReadiness — driver hours (day fit)", () => {
  const base = { hasStops: true, driver: DAVE, truck: TRUCK, trailer: TRAILER,
    loads: [{ requiresTrailer: true }], trailerCompatible: true, vehicleCompatible: true };
  const hoursCheck = (r: ReturnType<typeof computeRunReadiness>) =>
    r.resources.checks.find(c => c.key === "driver_hours")!;

  it("run fits the driver's day → pass, with the estimate in the reason", () => {
    const r = computeRunReadiness({ ...base,
      day: { estimated: { dutyMin: 7 * 60, drivingMin: 5 * 60, usesExtension: false },
        stopsMissingPins: false, availableHours: 8, hoursSource: "driver_profile", unavailable: false } });
    const c = hoursCheck(r);
    assert.strictEqual(c.status, "pass");
    assert.match(c.reason ?? "", /7h/);
    assert.strictEqual(r.ready, true);
  });

  it("run longer than the driver's day → warn, never a silent overrun", () => {
    const r = computeRunReadiness({ ...base,
      day: { estimated: { dutyMin: 9 * 60 + 30, drivingMin: 6 * 60, usesExtension: false },
        stopsMissingPins: false, availableHours: 8, hoursSource: "shift_preference", unavailable: false } });
    const c = hoursCheck(r);
    assert.strictEqual(c.status, "warn");
    assert.match(c.reason ?? "", /longer than Dave's 8h requested shift/);
    assert.strictEqual(r.ready, true, "a preference overrun is the planner's call — soft");
  });

  it("driving over the 10h legal limit → HARD fail, publish blocked", () => {
    const r = computeRunReadiness({ ...base,
      day: { estimated: { dutyMin: 12 * 60, drivingMin: 10 * 60 + 30, usesExtension: true },
        stopsMissingPins: false, availableHours: 13, hoursSource: "driver_profile", unavailable: false } });
    const c = hoursCheck(r);
    assert.strictEqual(c.status, "fail");
    assert.strictEqual(r.ready, false);
    assert.ok(r.blockers.some(b => /10h daily driving limit/.test(b)));
  });

  it("duty over the ~13h ceiling → HARD fail", () => {
    const r = computeRunReadiness({ ...base,
      day: { estimated: { dutyMin: 13 * 60 + 40, drivingMin: 8 * 60, usesExtension: false },
        stopsMissingPins: false, availableHours: 14, hoursSource: "driver_profile", unavailable: false } });
    assert.strictEqual(hoursCheck(r).status, "fail");
    assert.strictEqual(r.ready, false);
  });

  it("9–10h driving extension → warn even when the day fits", () => {
    const r = computeRunReadiness({ ...base,
      day: { estimated: { dutyMin: 11 * 60, drivingMin: 9 * 60 + 30, usesExtension: true },
        stopsMissingPins: false, availableHours: 12, hoursSource: "driver_profile", unavailable: false } });
    const c = hoursCheck(r);
    assert.strictEqual(c.status, "warn");
    assert.match(c.reason ?? "", /extension/);
  });

  it("driver marked unavailable that day → warn naming the availability plan", () => {
    const r = computeRunReadiness({ ...base,
      day: { estimated: { dutyMin: 6 * 60, drivingMin: 4 * 60, usesExtension: false },
        stopsMissingPins: false, availableHours: 8, hoursSource: "driver_profile", unavailable: true } });
    const c = hoursCheck(r);
    assert.strictEqual(c.status, "warn");
    assert.match(c.reason ?? "", /unavailable/);
  });

  it("stops missing map pins → honest unknown pointing at the JOB form", () => {
    const r = computeRunReadiness({ ...base,
      day: { estimated: null, stopsMissingPins: true, availableHours: 8, hoursSource: "driver_profile", unavailable: false } });
    const c = hoursCheck(r);
    assert.strictEqual(c.status, "unknown");
    assert.strictEqual(c.source, "job");
    assert.match(c.reason ?? "", /map pins/);
    assert.strictEqual(r.ready, true, "missing information never silently blocks");
  });
});

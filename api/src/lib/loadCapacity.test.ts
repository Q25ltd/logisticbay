/**
 * loadCapacity — Planning Q5a (pure, no DB, no network).
 *
 * Fleet-aware pallet-footprint check: a load's floor-space need vs the company's
 * largest available vehicle. Verifies the 40-pallet / no-double-deck split case.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { trailerPalletSpaces, buildFleetCapacityProfile, checkCapacity } from "./loadCapacity.js";

describe("trailerPalletSpaces", () => {
  it("a full 13.6 m single-deck trailer holds 26 floor spaces", () => {
    assert.strictEqual(trailerPalletSpaces({ lengthM: 13.6, decks: 1 }), 26);
  });

  it("a 13.6 m double-deck holds 52", () => {
    assert.strictEqual(trailerPalletSpaces({ lengthM: 13.6, decks: 2 }), 52);
  });

  it("parses a string length when lengthM is absent", () => {
    assert.strictEqual(trailerPalletSpaces({ trailerLength: "13.6m", decks: 1 }), 26);
  });

  it("defaults to a 13.6 m single deck when nothing is given", () => {
    assert.strictEqual(trailerPalletSpaces({}), 26);
  });
});

describe("buildFleetCapacityProfile", () => {
  it("no trailers → maxPalletSpaces is null", () => {
    const p = buildFleetCapacityProfile([]);
    assert.strictEqual(p.maxPalletSpaces, null);
    assert.strictEqual(p.hasDoubleDeck, false);
  });

  it("a standard-only fleet caps at 26 and has no double-deck", () => {
    const p = buildFleetCapacityProfile([
      { lengthM: 13.6, decks: 1, status: "available" },
      { lengthM: 13.6, decks: 1, status: "available" },
    ]);
    assert.strictEqual(p.maxPalletSpaces, 26);
    assert.strictEqual(p.hasDoubleDeck, false);
  });

  it("ignores unavailable trailers", () => {
    const p = buildFleetCapacityProfile([
      { lengthM: 13.6, decks: 2, status: "in_service" },   // double-deck but not available
      { lengthM: 13.6, decks: 1, status: "available" },
    ]);
    assert.strictEqual(p.maxPalletSpaces, 26, "double-deck is out of service");
    assert.strictEqual(p.hasDoubleDeck, false);
  });

  it("counts an available double-deck", () => {
    const p = buildFleetCapacityProfile([
      { lengthM: 13.6, decks: 2, status: "available" },
      { lengthM: 13.6, decks: 1, status: "available" },
    ]);
    assert.strictEqual(p.maxPalletSpaces, 52);
    assert.strictEqual(p.hasDoubleDeck, true);
  });
});

describe("checkCapacity", () => {
  const STANDARD_ONLY = buildFleetCapacityProfile([{ lengthM: 13.6, decks: 1, status: "available" }]);
  const HAS_DOUBLEDECK = buildFleetCapacityProfile([{ lengthM: 13.6, decks: 2, status: "available" }]);

  it("the 40-pallet case: non-stackable + standard-only fleet → split into 2", () => {
    const r = checkCapacity({ pallets: 40, stackable: false }, STANDARD_ONLY);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.footprint, 40);
    assert.strictEqual(r.maxSpaces, 26);
    assert.strictEqual(r.splitInto, 2);
    assert.match(r.reason ?? "", /split into 2/i);
  });

  it("40 stackable pallets fit a single standard trailer (footprint halves to 20)", () => {
    const r = checkCapacity({ pallets: 40, stackable: true }, STANDARD_ONLY);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.footprint, 20);
    assert.strictEqual(r.splitInto, null);
  });

  it("40 non-stackable pallets fit a double-deck whole", () => {
    const r = checkCapacity({ pallets: 40, stackable: false }, HAS_DOUBLEDECK);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.footprint, 40);
    assert.match(r.reason ?? "", /double-deck/i);
  });

  it("26 pallets fit exactly on a standard trailer", () => {
    const r = checkCapacity({ pallets: 26, stackable: false }, STANDARD_ONLY);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.splitInto, null);
  });

  it("60 non-stackable pallets on a standard-only fleet → split into 3", () => {
    const r = checkCapacity({ pallets: 60, stackable: false }, STANDARD_ONLY);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.splitInto, 3);
  });

  it("no pallet data → ok, no footprint", () => {
    const r = checkCapacity({ pallets: 0, stackable: false }, STANDARD_ONLY);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.footprint, null);
  });

  it("no registered fleet → ok but flags that capacity can't be checked", () => {
    const r = checkCapacity({ pallets: 40, stackable: false }, buildFleetCapacityProfile([]));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.maxSpaces, null);
    assert.match(r.reason ?? "", /no trailers registered/i);
  });
});

/**
 * checkLoadMixing — Phase A2 Q1 (pure, no DB).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkLoadMixing } from "./loadMixing.js";

const col = (over: Partial<Parameters<typeof checkLoadMixing>[0][number]> = {}) =>
  ({ type: "collection", ...over });

describe("checkLoadMixing (A2 Q1, advisory)", () => {
  it("fewer than two loads → always compatible", () => {
    assert.deepStrictEqual(checkLoadMixing([col()]), { compatible: true, conflicts: [] });
    assert.deepStrictEqual(checkLoadMixing([]), { compatible: true, conflicts: [] });
  });

  it("two ambient loads → compatible", () => {
    const r = checkLoadMixing([col(), col({ type: "delivery" })]);
    assert.strictEqual(r.compatible, true);
    assert.strictEqual(r.conflicts.length, 0);
  });

  it("temperature-controlled + ambient → high conflict", () => {
    const r = checkLoadMixing([col({ tempControlled: true }), col({ type: "delivery", tempControlled: false })]);
    assert.strictEqual(r.compatible, false);
    assert.ok(r.conflicts.some(c => c.severity === "high" && /temperature-controlled and ambient/i.test(c.reason)));
  });

  it("different temperature ranges → high conflict", () => {
    const r = checkLoadMixing([
      col({ tempControlled: true, tempRange: "0 to 4C" }),
      col({ type: "delivery", tempControlled: true, tempRange: "-18C" }),
    ]);
    assert.ok(r.conflicts.some(c => /different temperature ranges/i.test(c.reason)));
  });

  it("hazardous + food → high conflict", () => {
    const r = checkLoadMixing([
      col({ hazardous: true }),
      col({ type: "delivery", goodsType: "Fresh produce" }),
    ]);
    assert.ok(r.conflicts.some(c => c.severity === "high" && /hazardous/i.test(c.reason)));
  });

  it("oversized sharing a run → medium conflict (advisory, still reported)", () => {
    const r = checkLoadMixing([col({ oversized: true }), col({ type: "delivery" })]);
    assert.ok(r.conflicts.some(c => c.severity === "medium" && /oversized/i.test(c.reason)));
  });
});

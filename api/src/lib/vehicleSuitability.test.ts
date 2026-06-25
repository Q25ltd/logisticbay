/**
 * vehicleSuitability — Planning Q5b (pure, no DB, no network).
 *
 * Load-class agreement + allocated-vehicle fit. Covers the screenshot case: a
 * 22-pallet artic load grouped with an 85 kg van parcel job → flagged.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkVehicleSuitability } from "./vehicleSuitability.js";

describe("checkVehicleSuitability — load class agreement", () => {
  it("a single load never conflicts", () => {
    const r = checkVehicleSuitability([{ label: "A", weightKg: 11000 }]);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.conflicts.length, 0);
  });

  it("THE BUG: a van-class parcel load grouped with an HGV pallet load → high conflict", () => {
    const r = checkVehicleSuitability([
      { label: "Midlands Fresh Foods", weightKg: 11000, pallets: 22 },
      { label: "NHS Supply Chain", weightKg: 85 },
    ]);
    assert.strictEqual(r.ok, false);
    assert.ok(r.conflicts.some(c => c.severity === "high" && /different vehicles/i.test(c.reason)), JSON.stringify(r.conflicts));
  });

  it("two HGV-class loads agree → ok", () => {
    const r = checkVehicleSuitability([{ label: "A", weightKg: 8000 }, { label: "B", weightKg: 9000 }]);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.requiredClass, "rigid");
  });

  it("declared categories that conflict are caught even without weights", () => {
    const r = checkVehicleSuitability([
      { label: "A", vehicleCategory: "van" },
      { label: "B", vehicleCategory: "tractor" },
    ]);
    assert.strictEqual(r.ok, false);
  });

  it("a declared minGvwClass lifts a light load into HGV class", () => {
    const r = checkVehicleSuitability([
      { label: "Parcel", weightKg: 60 },                 // van by weight
      { label: "Heavy", weightKg: 200, minGvwClass: "44" }, // declared 44t → tractor
    ]);
    assert.strictEqual(r.ok, false);
  });
});

describe("checkVehicleSuitability — allocated-vehicle fit (substitute OK if it meets the need)", () => {
  it("a van allocated under an 11t load is too small → high", () => {
    const r = checkVehicleSuitability([{ label: "X", weightKg: 11000 }], { category: "van" });
    assert.strictEqual(r.ok, false);
    assert.ok(r.conflicts.some(c => /too small/i.test(c.reason)));
    assert.strictEqual(r.assignedClass, "van");
  });

  it("a bigger vehicle than required is fine (substitution allowed)", () => {
    const r = checkVehicleSuitability([{ label: "X", weightKg: 200 }], { category: "tractor" });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.conflicts.length, 0);
  });

  it("over the vehicle's payload → high", () => {
    const r = checkVehicleSuitability([{ label: "X", weightKg: 20000 }], { category: "tractor", payloadKg: 18000 });
    assert.strictEqual(r.ok, false);
    assert.ok(r.conflicts.some(c => /over payload/i.test(c.reason)));
  });

  it("missing required equipment (tail-lift) → medium, advisory (ok stays true)", () => {
    const r = checkVehicleSuitability(
      [{ label: "X", weightKg: 500, equipment: ["tail_lift"] }],
      { category: "rigid", equipment: [] },
    );
    assert.strictEqual(r.ok, true);  // medium doesn't flip ok
    assert.ok(r.conflicts.some(c => c.severity === "medium" && /tail_lift/i.test(c.reason)));
  });

  it("a body type not among the required → medium", () => {
    const r = checkVehicleSuitability(
      [{ label: "X", weightKg: 500, bodyTypes: ["fridge"] }],
      { category: "rigid", bodyType: "curtain_sider" },
    );
    assert.ok(r.conflicts.some(c => c.severity === "medium" && /body type/i.test(c.reason)));
  });
});

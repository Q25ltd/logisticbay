/**
 * runCandidatesService — Runs B4 (pure, no DB).
 *
 * Annotates fleet with available / suitable / recommended so the planner sees
 * fleet state at allocation. Includes the flatbed-chemicals regression: an ADR
 * load whose acceptable bodies are [curtain, flatbed] must accept the flatbed
 * (match ANY acceptable body) and reject an enclosed box.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRunCandidates } from "./runCandidatesService.js";

const FLEET = {
  trailers: [
    { id: 1, registration: "TR101", trailerType: "curtain", status: "available" },
    { id: 2, registration: "TR102", trailerType: "fridge",  status: "available" },
    { id: 3, registration: "TR103", trailerType: "flatbed", status: "available" },
    { id: 4, registration: "TR104", trailerType: "box",     status: "available" },
  ],
  trucks: [
    { id: 1, registration: "AB12", gvwClass: "44", status: "available" },
    { id: 2, registration: "CD34", gvwClass: "44", status: "in_service" },
  ],
  drivers: [
    { id: 1, displayName: "Dave", status: "active", adrAllowed: false, canUseTrailer: true, trailerTypesAllowed: [] },
    { id: 2, displayName: "Sue",  status: "active", adrAllowed: true,  canUseTrailer: true, trailerTypesAllowed: [] },
  ],
};
const NO_BUSY = { trailers: {}, trucks: {}, drivers: {} };

describe("computeRunCandidates — body-type & ADR matching", () => {
  it("THE BUG: chemicals on [curtain, flatbed] → flatbed is suitable (matches ANY), box is rejected", () => {
    const c = computeRunCandidates(
      { hazardous: true, tempControlled: false, needsTrailer: true, acceptableBodyTypes: ["curtain", "flatbed"] },
      FLEET, NO_BUSY);

    const flatbed = c.trailers.find(t => t.id === 3)!;
    assert.strictEqual(flatbed.suitable, true, `flatbed should suit a [curtain,flatbed] ADR load: ${flatbed.reasons}`);

    const curtain = c.trailers.find(t => t.id === 1)!;
    assert.strictEqual(curtain.suitable, true);

    // Enclosed box traps fumes — unsafe for ADR.
    const box = c.trailers.find(t => t.id === 4)!;
    assert.strictEqual(box.suitable, false);
    assert.ok(box.reasons.some(r => /adr/i.test(r)), JSON.stringify(box.reasons));

    // Fridge is also enclosed → unsafe for ADR.
    const fridge = c.trailers.find(t => t.id === 2)!;
    assert.strictEqual(fridge.suitable, false);

    // Recommended is a suitable, available trailer (flatbed or curtain), and an ADR driver.
    const rec = c.trailers.find(t => t.recommended)!;
    assert.ok([1, 3].includes(rec.id), `recommended should be curtain/flatbed, got ${rec.id}`);
    assert.strictEqual(c.drivers.find(d => d.id === 2)!.recommended, true); // Sue has ADR
  });

  it("temperature-controlled load → fridge suitable, curtain flagged not refrigerated", () => {
    const c = computeRunCandidates(
      { hazardous: false, tempControlled: true, needsTrailer: true, acceptableBodyTypes: ["fridge"] },
      FLEET, NO_BUSY);
    assert.strictEqual(c.trailers.find(t => t.id === 2)!.suitable, true);          // fridge
    const curtain = c.trailers.find(t => t.id === 1)!;
    assert.strictEqual(curtain.suitable, false);
    assert.ok(curtain.reasons.some(r => /refrigerated/i.test(r)));
  });

  it("availability: busy assets are flagged with the conflicting run", () => {
    const busy = { trailers: { 3: "RUN-9" }, trucks: {}, drivers: { 1: "RUN-7" } };
    const c = computeRunCandidates(
      { hazardous: false, tempControlled: false, needsTrailer: true, acceptableBodyTypes: [] },
      FLEET, busy);
    const t = c.trailers.find(x => x.id === 3)!;
    assert.strictEqual(t.available, false);
    assert.strictEqual(t.busyOn, "RUN-9");
    assert.strictEqual(c.drivers.find(d => d.id === 1)!.available, false);
  });

  it("in-service truck is unavailable; the free one is recommended", () => {
    const c = computeRunCandidates(
      { hazardous: false, tempControlled: false, needsTrailer: false, acceptableBodyTypes: [] },
      FLEET, NO_BUSY);
    assert.strictEqual(c.trucks.find(t => t.id === 1)!.recommended, true);
    assert.strictEqual(c.trucks.find(t => t.id === 2)!.available, false);
  });

  it("driver hours = full preferred shift (theoretical); a short shift is a soft note, and a covering driver is preferred", () => {
    const drivers = [
      { id: 1, displayName: "Dave", status: "active", preferredShiftHours: 8,  adrAllowed: true, canUseTrailer: true, trailerTypesAllowed: [] },
      { id: 2, displayName: "Sue",  status: "active", preferredShiftHours: 13, adrAllowed: true, canUseTrailer: true, trailerTypesAllowed: [] },
    ];
    const c = computeRunCandidates(
      { hazardous: false, tempControlled: false, needsTrailer: false, acceptableBodyTypes: [], runDurationHours: 11 },
      { trailers: [], trucks: [], drivers }, { trailers: {}, trucks: {}, drivers: {} });

    const dave = c.drivers.find(d => d.id === 1)!;
    assert.ok(dave.label.includes("8h"));                 // shows the full preferred shift
    assert.strictEqual(dave.suitable, true);              // short shift is soft, doesn't flip suitable
    assert.ok(dave.reasons.some(r => /shift/i.test(r)));  // but it's noted
    // Sue's 13h shift covers the 11h run → she's the recommended driver, not Dave.
    assert.strictEqual(c.drivers.find(d => d.id === 2)!.recommended, true);
    assert.strictEqual(dave.recommended, false);
  });

  it("nothing recommended when everything is busy", () => {
    const allBusy = { trailers: { 1: "R", 2: "R", 3: "R", 4: "R" }, trucks: { 1: "R", 2: "R" }, drivers: { 1: "R", 2: "R" } };
    const c = computeRunCandidates(
      { hazardous: false, tempControlled: false, needsTrailer: true, acceptableBodyTypes: [] },
      FLEET, allBusy);
    assert.ok(!c.trailers.some(t => t.recommended));
  });
});

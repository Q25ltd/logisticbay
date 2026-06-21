/**
 * buildProposals — Phase A3 (pure, no DB).
 *
 * Corridor grouping + compatibility split + strategy detection.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProposals, type ProposalStop } from "./proposeRunsService.js";

const READING  = { lat: 51.4543, lng: -0.9781 };
const READING2 = { lat: 51.4600, lng: -0.9900 };   // within 30 km of READING
const EDINBURGH = { lat: 55.9533, lng: -3.1883 };  // far corridor

const stop = (o: Partial<ProposalStop> & Pick<ProposalStop, "jobId" | "jobPartId" | "type">): ProposalStop => o;

describe("buildProposals (A3 proposal engine)", () => {
  it("no stops → no proposals", () => {
    assert.deepStrictEqual(buildProposals([]), []);
  });

  it("one job, one collect + one deliver → a 'direct' proposal", () => {
    const p = buildProposals([
      stop({ jobId: 1, jobPartId: 11, type: "collection", postcode: "M1 1AA" }),
      stop({ jobId: 1, jobPartId: 12, type: "delivery", ...READING }),
    ]);
    assert.strictEqual(p.length, 1);
    assert.strictEqual(p[0].strategy, "direct");
    assert.deepStrictEqual(p[0].jobIds, [1]);
  });

  it("one collect + multiple deliveries → 'multi_drop'", () => {
    const p = buildProposals([
      stop({ jobId: 2, jobPartId: 21, type: "collection", postcode: "M1 1AA" }),
      stop({ jobId: 2, jobPartId: 22, type: "delivery", ...READING }),
      stop({ jobId: 2, jobPartId: 23, type: "delivery", ...READING2 }),
    ]);
    assert.strictEqual(p.length, 1);
    assert.strictEqual(p[0].strategy, "multi_drop");
  });

  it("two compatible jobs in the same corridor → one 'groupage' proposal", () => {
    const p = buildProposals([
      stop({ jobId: 3, jobPartId: 31, type: "collection", postcode: "M1 1AA" }),
      stop({ jobId: 3, jobPartId: 32, type: "delivery", ...READING }),
      stop({ jobId: 4, jobPartId: 41, type: "collection", postcode: "OX1 1AA" }),
      stop({ jobId: 4, jobPartId: 42, type: "delivery", ...READING2 }),
    ]);
    assert.strictEqual(p.length, 1);
    assert.strictEqual(p[0].strategy, "groupage");
    assert.deepStrictEqual([...p[0].jobIds].sort(), [3, 4]);
  });

  it("incompatible loads in the same corridor → split into two proposals", () => {
    const p = buildProposals([
      stop({ jobId: 5, jobPartId: 51, type: "collection", postcode: "M1 1AA", tempControlled: true }),
      stop({ jobId: 5, jobPartId: 52, type: "delivery", ...READING, tempControlled: true }),
      stop({ jobId: 6, jobPartId: 61, type: "collection", postcode: "OX1 1AA", tempControlled: false }),
      stop({ jobId: 6, jobPartId: 62, type: "delivery", ...READING2, tempControlled: false }),
    ]);
    assert.strictEqual(p.length, 2, "temp + ambient must not be grouped");
  });

  it("jobs in different corridors → separate proposals", () => {
    const p = buildProposals([
      stop({ jobId: 7, jobPartId: 71, type: "collection", postcode: "M1 1AA" }),
      stop({ jobId: 7, jobPartId: 72, type: "delivery", ...READING }),
      stop({ jobId: 8, jobPartId: 81, type: "collection", postcode: "G1 1AA" }),
      stop({ jobId: 8, jobPartId: 82, type: "delivery", ...EDINBURGH }),
    ]);
    assert.strictEqual(p.length, 2);
  });
});

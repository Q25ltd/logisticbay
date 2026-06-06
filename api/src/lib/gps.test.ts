import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGpsPair } from './gps.js';

describe('validateGpsPair', () => {

  it('both absent → valid', () => {
    assert.deepStrictEqual(validateGpsPair(undefined, undefined), { valid: true });
    assert.deepStrictEqual(validateGpsPair(null, null), { valid: true });
  });

  it('lat present, lng absent → invalid', () => {
    const r = validateGpsPair(51.5, undefined);
    assert.strictEqual(r.valid, false);
    if (!r.valid) assert.ok(r.reason.includes('together'));
  });

  it('lng present, lat absent → invalid', () => {
    const r = validateGpsPair(undefined, -0.12);
    assert.strictEqual(r.valid, false);
    if (!r.valid) assert.ok(r.reason.includes('together'));
  });

  it('valid London coordinates → valid', () => {
    assert.deepStrictEqual(validateGpsPair(51.5074, -0.1278), { valid: true });
  });

  it('lat = -90 (boundary) → valid', () => {
    assert.deepStrictEqual(validateGpsPair(-90, 0), { valid: true });
  });

  it('lat = 90 (boundary) → valid', () => {
    assert.deepStrictEqual(validateGpsPair(90, 0), { valid: true });
  });

  it('lng = -180 (boundary) → valid', () => {
    assert.deepStrictEqual(validateGpsPair(0, -180), { valid: true });
  });

  it('lng = 180 (boundary) → valid', () => {
    assert.deepStrictEqual(validateGpsPair(0, 180), { valid: true });
  });

  it('lat = 999 (out of range) → invalid', () => {
    const r = validateGpsPair(999, 0);
    assert.strictEqual(r.valid, false);
    if (!r.valid) assert.ok(r.reason.includes('gpsLat'));
  });

  it('lng = 181 (out of range) → invalid', () => {
    const r = validateGpsPair(0, 181);
    assert.strictEqual(r.valid, false);
    if (!r.valid) assert.ok(r.reason.includes('gpsLng'));
  });

  it('lat = NaN → invalid', () => {
    const r = validateGpsPair(NaN, 0);
    assert.strictEqual(r.valid, false);
  });

  it('lat = Infinity → invalid', () => {
    const r = validateGpsPair(Infinity, 0);
    assert.strictEqual(r.valid, false);
  });

});

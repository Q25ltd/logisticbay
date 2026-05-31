import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateClientTimestamp } from './eventTimestamp.js';

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}
function isoAhead(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

const DAY_MS   = 24 * 60 * 60 * 1000;
const HOUR_MS  = 60 * 60 * 1000;

describe('validateClientTimestamp', () => {

  it('null → invalid (required)', () => {
    const r = validateClientTimestamp(null);
    assert.strictEqual(r.valid, false);
    if (!r.valid) assert.ok(r.reason.toLowerCase().includes('required'));
  });

  it('undefined → invalid (required)', () => {
    const r = validateClientTimestamp(undefined);
    assert.strictEqual(r.valid, false);
  });

  it('empty string → invalid', () => {
    const r = validateClientTimestamp('');
    assert.strictEqual(r.valid, false);
  });

  it('garbage string → invalid', () => {
    const r = validateClientTimestamp('not-a-date');
    assert.strictEqual(r.valid, false);
    if (!r.valid) assert.ok(r.reason.toLowerCase().includes('iso'));
  });

  it('recent timestamp → valid, needsReview false', () => {
    const r = validateClientTimestamp(isoAgo(5 * 60 * 1000)); // 5 min ago
    assert.strictEqual(r.valid, true);
    if (r.valid) {
      assert.strictEqual(r.needsReview, false);
      assert.ok(r.date instanceof Date);
    }
  });

  it('timestamp 6 days ago → valid, needsReview false (just inside window)', () => {
    const r = validateClientTimestamp(isoAgo(6 * DAY_MS));
    assert.strictEqual(r.valid, true);
    if (r.valid) assert.strictEqual(r.needsReview, false);
  });

  it('timestamp 8 days ago → valid, needsReview true (E.4: flag not reject)', () => {
    const r = validateClientTimestamp(isoAgo(8 * DAY_MS));
    assert.strictEqual(r.valid, true);
    if (r.valid) {
      assert.strictEqual(r.needsReview, true);
      assert.strictEqual(r.reviewReason, 'event_older_than_7d');
    }
  });

  it('timestamp 30 min in future → valid, needsReview false (inside 1h window)', () => {
    const r = validateClientTimestamp(isoAhead(30 * 60 * 1000));
    assert.strictEqual(r.valid, true);
    if (r.valid) assert.strictEqual(r.needsReview, false);
  });

  it('timestamp 2h in future → valid, needsReview true (E.4: flag not reject)', () => {
    const r = validateClientTimestamp(isoAhead(2 * HOUR_MS));
    assert.strictEqual(r.valid, true);
    if (r.valid) {
      assert.strictEqual(r.needsReview, true);
      assert.strictEqual(r.reviewReason, 'event_future_dated');
    }
  });

  it('returns a Date object for the parsed timestamp', () => {
    const iso = isoAgo(1000);
    const r = validateClientTimestamp(iso);
    assert.strictEqual(r.valid, true);
    if (r.valid) assert.ok(r.date instanceof Date);
  });

});

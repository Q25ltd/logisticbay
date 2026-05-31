/**
 * TASK 2.1 — sync.constants derivation test
 *
 * Proves that STATUS_BY_EVENT_TYPE, EVENT_TYPE_MAP, ALLOWED_JOB_TRANSITIONS,
 * and SUPPORTED_EVENT_TYPES are correctly derived from EVENT_DEFINITIONS and
 * produce output identical to the hand-maintained versions they replaced.
 *
 * If any of these assertions fail after a change to EVENT_DEFINITIONS, it
 * means the derived constants are out of sync — fix EVENT_DEFINITIONS, not
 * the assertions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_DEFINITIONS,
  SUPPORTED_EVENT_TYPES,
  STATUS_BY_EVENT_TYPE,
  EVENT_TYPE_MAP,
  ALLOWED_JOB_TRANSITIONS,
  PLANNER_ONLY_TRANSITIONS,
} from '../sync/sync.constants.js';

describe('sync.constants — derived from EVENT_DEFINITIONS', () => {

  it('SUPPORTED_EVENT_TYPES matches EVENT_DEFINITIONS keys', () => {
    const expected = ['started', 'arrived_pickup', 'collected', 'arrived_dropoff', 'completed'];
    assert.deepStrictEqual([...SUPPORTED_EVENT_TYPES].sort(), [...expected].sort());
  });

  it('cancelled is NOT in SUPPORTED_EVENT_TYPES (E.1: planner-only)', () => {
    assert.ok(
      !SUPPORTED_EVENT_TYPES.includes('cancelled' as never),
      'cancelled must not be a driver-triggerable event',
    );
  });

  it('STATUS_BY_EVENT_TYPE matches expected hand-maintained values', () => {
    const expected: Record<string, string> = {
      started:         'in_progress',
      arrived_pickup:  'arrived_pickup',
      collected:       'collected',
      arrived_dropoff: 'arrived_dropoff',
      completed:       'completed',
    };
    for (const [ev, status] of Object.entries(expected)) {
      assert.strictEqual(
        STATUS_BY_EVENT_TYPE[ev as keyof typeof STATUS_BY_EVENT_TYPE],
        status,
        `STATUS_BY_EVENT_TYPE['${ev}'] should be '${status}'`,
      );
    }
  });

  it('EVENT_TYPE_MAP is inverse of STATUS_BY_EVENT_TYPE for driver events', () => {
    for (const [ev, def] of Object.entries(EVENT_DEFINITIONS)) {
      assert.strictEqual(
        EVENT_TYPE_MAP[def.resultingStatus],
        ev,
        `EVENT_TYPE_MAP['${def.resultingStatus}'] should be '${ev}'`,
      );
    }
  });

  it('EVENT_TYPE_MAP includes cancelled → cancelled for planner use', () => {
    assert.strictEqual(EVENT_TYPE_MAP['cancelled'], 'cancelled');
  });

  it('ALLOWED_JOB_TRANSITIONS matches expected hand-maintained values', () => {
    // These are the values that were hand-maintained before TASK 2.1.
    // Order within each array does not matter.
    const expected: Record<string, string[]> = {
      pending:         ['accepted', 'in_progress', 'cancelled'],
      accepted:        ['in_progress', 'cancelled'],
      in_progress:     ['arrived_pickup', 'cancelled'],
      arrived_pickup:  ['collected', 'cancelled'],
      collected:       ['arrived_dropoff'],
      arrived_dropoff: ['completed'],
      completed:       [],
      cancelled:       [],
    };

    for (const [status, targets] of Object.entries(expected)) {
      const actual = ALLOWED_JOB_TRANSITIONS[status] ?? [];
      assert.deepStrictEqual(
        [...actual].sort(),
        [...targets].sort(),
        `ALLOWED_JOB_TRANSITIONS['${status}'] mismatch`,
      );
    }
  });

  it('all EVENT_DEFINITIONS resultingStatuses are consistent with STATUS_BY_EVENT_TYPE', () => {
    for (const [ev, def] of Object.entries(EVENT_DEFINITIONS)) {
      assert.strictEqual(
        STATUS_BY_EVENT_TYPE[ev as keyof typeof STATUS_BY_EVENT_TYPE],
        def.resultingStatus,
        `Inconsistency for event '${ev}'`,
      );
    }
  });

  it('PLANNER_ONLY_TRANSITIONS cancelled covers exactly the expected statuses', () => {
    // A planner can cancel from: pending, accepted, in_progress, arrived_pickup.
    // Once cargo is collected or the vehicle is en-route to drop-off, cancellation
    // is no longer allowed via the standard state machine (operational safety).
    const expected = ['pending', 'accepted', 'in_progress', 'arrived_pickup'];
    const actual = [...(PLANNER_ONLY_TRANSITIONS.cancelled ?? [])].sort();
    assert.deepStrictEqual(actual, [...expected].sort());
  });

});

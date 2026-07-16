/**
 * sync.constants derivation test (updated for LOAD_MOVEMENT_PLAN Step 1).
 *
 * EVENT_DEFINITIONS now drives per-RunAssignment EXECUTION states, not Job.status.
 * Proves SUPPORTED_EVENT_TYPES, RESULTING_STATE_BY_EVENT, EVENT_TYPE_MAP (the
 * inbound mobile-status alias), and EXECUTION_TRANSITIONS are correct.
 *
 * If an assertion fails after a change to EVENT_DEFINITIONS, fix EVENT_DEFINITIONS
 * (the single source) — not the derived constants.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_DEFINITIONS,
  SUPPORTED_EVENT_TYPES,
  RESULTING_STATE_BY_EVENT,
  EVENT_TYPE_MAP,
  EXECUTION_TRANSITIONS,
  PLANNER_ONLY_TRANSITIONS,
} from '../sync/sync.constants.js';

describe('sync.constants — execution-state machine (Step 1)', () => {

  it('SUPPORTED_EVENT_TYPES matches EVENT_DEFINITIONS keys', () => {
    const expected = ['started', 'arrived_pickup', 'collected', 'arrived_dropoff', 'completed', 'drop_at_yard', 'pick_from_yard', 'trailer_swap', 'handover_offered', 'handover_accepted'];
    assert.deepStrictEqual([...SUPPORTED_EVENT_TYPES].sort(), [...expected].sort());
  });

  it('cancelled is NOT in SUPPORTED_EVENT_TYPES (E.1: planner-only)', () => {
    assert.ok(
      !SUPPORTED_EVENT_TYPES.includes('cancelled' as never),
      'cancelled must not be a driver-triggerable event',
    );
  });

  it('RESULTING_STATE_BY_EVENT maps each event to its execution state', () => {
    const expected: Record<string, string> = {
      started:         'en_route_pickup',
      arrived_pickup:  'at_pickup',
      collected:       'loaded',
      arrived_dropoff: 'at_dropoff',
      completed:       'delivered',
      drop_at_yard:      'delivered',
      pick_from_yard:    'loaded',
      trailer_swap:      'delivered',
      handover_offered:  'loaded',
      handover_accepted: 'loaded',
    };
    for (const [ev, state] of Object.entries(expected)) {
      assert.strictEqual(
        RESULTING_STATE_BY_EVENT[ev as keyof typeof RESULTING_STATE_BY_EVENT],
        state,
        `RESULTING_STATE_BY_EVENT['${ev}'] should be '${state}'`,
      );
    }
  });

  it('EVENT_TYPE_MAP translates the inbound legacy status alias → event', () => {
    const expected: Record<string, string> = {
      in_progress:     'started',
      arrived_pickup:  'arrived_pickup',
      collected:       'collected',
      arrived_dropoff: 'arrived_dropoff',
      completed:       'completed',
    };
    for (const [status, ev] of Object.entries(expected)) {
      assert.strictEqual(EVENT_TYPE_MAP[status], ev, `EVENT_TYPE_MAP['${status}'] should be '${ev}'`);
    }
  });

  it('EVENT_TYPE_MAP includes cancelled → cancelled for planner use', () => {
    assert.strictEqual(EVENT_TYPE_MAP['cancelled'], 'cancelled');
  });

  it('EXECUTION_TRANSITIONS reflects allowedFromStates → resultingState', () => {
    const expected: Record<string, string[]> = {
      not_started:      ['en_route_pickup', 'loaded'],       // started | pick_from_yard | handover_accepted
      en_route_pickup:  ['at_pickup'],
      at_pickup:        ['loaded'],
      loaded:           ['at_dropoff', 'delivered', 'loaded'], // arrived_dropoff | drop_at_yard/trailer_swap | handover_offered
      en_route_dropoff: ['delivered'],                        // drop_at_yard | trailer_swap
      at_dropoff:       ['delivered'],                        // completed | drop_at_yard | trailer_swap
    };
    for (const [from, targets] of Object.entries(expected)) {
      assert.deepStrictEqual(
        [...(EXECUTION_TRANSITIONS[from] ?? [])].sort(),
        [...targets].sort(),
        `EXECUTION_TRANSITIONS['${from}'] mismatch`,
      );
    }
  });

  it('every EVENT_DEFINITIONS resultingState is consistent with RESULTING_STATE_BY_EVENT', () => {
    for (const [ev, def] of Object.entries(EVENT_DEFINITIONS)) {
      assert.strictEqual(
        RESULTING_STATE_BY_EVENT[ev as keyof typeof RESULTING_STATE_BY_EVENT],
        def.resultingState,
        `Inconsistency for event '${ev}'`,
      );
    }
  });

  it('PLANNER_ONLY_TRANSITIONS cancelled covers exactly the expected statuses', () => {
    const expected = ['pending', 'accepted', 'in_progress', 'arrived_pickup'];
    const actual = [...(PLANNER_ONLY_TRANSITIONS.cancelled ?? [])].sort();
    assert.deepStrictEqual(actual, [...expected].sort());
  });

});

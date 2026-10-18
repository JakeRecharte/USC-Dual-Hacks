// The queue merge rules: routing and severity only move up, except over a placeholder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callFromDb, mergeCall } from '../src/lib/calls.ts';
import { ROUTING_LABEL, ROUTING_RANK } from '../src/lib/types.ts';
import type { CallRow } from '../src/lib/types.ts';

const row = (over: Partial<CallRow>): CallRow => ({
  id: 'c1', call_id: 'c1', mode: 'wildfire', address: '1420 Sunset Mesa Dr', subject_name: 'Maria Lopez',
  address_id: null, routing: 'priority_queue', severity: 0, reason: '', created_at: '2026-10-17T17:00:00Z', ...over,
});

test('a call the agent answered is shown as answered, not stuck on the lookup placeholder', () => {
  const placeholder = row({ provisional: true, reason: 'call in progress — looking the address up' });
  const merged = mergeCall(placeholder, row({ routing: 'answered_by_agent', severity: 1, reason: 'cleared 40 min ago' }));
  assert.equal(merged.routing, 'answered_by_agent');
  assert.equal(merged.severity, 1);
  assert.equal(merged.provisional, false);
});

test('after the first real routing, routing and severity only move up', () => {
  const routed = row({ routing: 'priority_queue', severity: 4 });
  const later = mergeCall(routed, row({ routing: 'answered_by_agent', severity: 1 }));
  assert.equal(later.routing, 'priority_queue');
  assert.equal(later.severity, 4);
});

test('a failed transfer outranks everything and has a label', () => {
  const merged = mergeCall(row({ routing: 'human_now', severity: 5 }), row({ routing: 'callback_queue', severity: 5 }));
  assert.equal(merged.routing, 'callback_queue');
  assert.ok(ROUTING_RANK.callback_queue < ROUTING_RANK.human_now);
  assert.ok(ROUTING_LABEL.callback_queue && ROUTING_LABEL.abandoned_callback);
});

test('a bypass arriving before the lookup is not undone by the placeholder', () => {
  const bypass = row({ routing: 'human_now', severity: 5, bypass: true });
  const merged = mergeCall(bypass, row({ provisional: true }));
  assert.equal(merged.routing, 'human_now');
  assert.equal(merged.bypass, true);
});

test('a call row from Supabase: unrouted reads as in progress; a late placeholder never downgrades', () => {
  const started = callFromDb({ call_id: 'c1', created_at: '2026-10-18T02:00:00Z', routing: null });
  assert.equal(started.provisional, true);
  assert.equal(started.reason, 'call in progress');
  const routed = callFromDb({ call_id: 'c1', created_at: '2026-10-18T02:00:00Z', routing: 'answered_by_agent', severity: 2, reason: 'caller report: out', address: '468 Northfield St' });
  assert.equal(mergeCall(started, routed).routing, 'answered_by_agent');
  const late = mergeCall(routed, started);
  assert.equal(late.routing, 'answered_by_agent');
  assert.equal(late.reason, 'caller report: out');
});

// The dispatch dashboard's rules: newest decision wins, totals, ordering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardTotals, latestDecisions, orderForDashboard, pendingSuggestions } from '../src/lib/decisions.ts';
import type { DecisionCall, DecisionRow } from '../src/lib/decisions.ts';

const call = (over: Partial<DecisionCall>): DecisionCall => ({
  call_id: 'c1', created_at: '2026-10-17T20:00:00Z', status: 'ended', address: '1515 Via de la Paz', subject_name: 'Harold Kim',
  routing: 'priority_queue', severity: 4, reason: '', caller_state: 'worried', simulated: false, reasoning: [], suggestions: [], ...over,
});
const s = (id: string, requires_confirmation = true) => ({ id, resource: id, priority: 'now' as const, why: [], requires_confirmation });
const d = (call_id: string, suggestion_id: string, decision: 'confirmed' | 'dismissed', at: string): DecisionRow =>
  ({ call_id, suggestion_id, decision, decided_by: 'dispatch', decided_at: at });

test('the newest decision on a suggestion is the one that stands', () => {
  const rows = [d('c1', 'recontact', 'confirmed', '2026-10-17T20:01:00Z'), d('c1', 'recontact', 'dismissed', '2026-10-17T20:02:00Z')];
  assert.equal(latestDecisions(rows, 'c1').get('recontact')?.decision, 'dismissed');
  assert.equal(latestDecisions(rows, 'other').size, 0);
});

test('pending = needs confirmation and not yet decided; "No unit needed" is never pending', () => {
  const c = call({ suggestions: [s('recontact'), s('medical_standby'), s('none', false)] });
  assert.deepEqual(pendingSuggestions(c, [d('c1', 'recontact', 'confirmed', '2026-10-17T20:01:00Z')]).map((x) => x.id), ['medical_standby']);
});

test('totals count trips avoided, decisions awaiting the dispatcher, and confirmations', () => {
  const calls = [
    call({ call_id: 'a', routing: 'answered_by_agent', suggestions: [s('none', false)] }),
    call({ call_id: 'b', suggestions: [s('recontact'), s('medical_standby')] }),
  ];
  assert.deepEqual(dashboardTotals(calls, [d('b', 'recontact', 'confirmed', '2026-10-17T20:01:00Z')]),
    { calls: 2, tripsAvoided: 1, awaitingDispatcher: 1, confirmed: 1 });
});

test('calls with something to decide come first, then by routing urgency', () => {
  const calls = [
    call({ call_id: 'answered', routing: 'answered_by_agent', suggestions: [s('none', false)] }),
    call({ call_id: 'queue', routing: 'priority_queue', suggestions: [s('door_knock')] }),
    call({ call_id: 'human', routing: 'human_now', suggestions: [s('als')] }),
  ];
  assert.deepEqual(orderForDashboard(calls, []).map((c) => c.call_id), ['human', 'queue', 'answered']);
});

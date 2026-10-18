// Supabase's house colours on the board, and the paging that loads every household.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAll, withColors } from '../src/lib/supabase-data.ts';
import { HOUSE_COLOR, URGENCY_COLOR, houseColor } from '../src/lib/priority.ts';
import { headline } from '../src/lib/house-events.ts';
import type { AddressState } from '../src/lib/types.ts';

test('fetchAll pages past the 1,000-row cap until a short page', async () => {
  const total = 2345;
  const seen: [number, number][] = [];
  const rows = await fetchAll<number>(async (from, to) => {
    seen.push([from, to]);
    return { data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i), error: null };
  });
  assert.equal(rows.length, total);
  assert.deepEqual(seen.map(([f]) => f), [0, 1000, 2000]);
});

test('fetchAll surfaces errors instead of returning a partial board', async () => {
  await assert.rejects(fetchAll(async () => ({ data: null, error: { message: 'boom' } })), /boom/);
});

const house = (id: string): AddressState => ({
  id, address: `${id} Palisades Dr`, lat: 34, lng: -118.5, zone_id: 'PAL-03', resident_name: 'X Y', inside_perimeter: true,
  status: 'unknown', source: null, recorded_at: null, note: null, structure: 'unassessed', structure_recorded_at: null,
});

test('withColors attaches Supabase colours and ignores anything outside green/yellow/red', () => {
  const out = withColors([house('a'), house('b'), house('c')],
    [{ id: 'a', color: 'red', color_reason: 'people at this house are staying' }, { id: 'b', color: 'purple', color_reason: null }]);
  assert.equal(out[0].color, 'red');
  assert.equal(out[0].color_reason, 'people at this house are staying');
  assert.equal(out[1].color, undefined);
  assert.equal(out[2].color, undefined);
});

test('grey is a Supabase colour, drawn in the existing slate', () => {
  const out = withColors([house('a')], [{ id: 'a', color: 'grey', color_reason: 'no verified record' }]);
  assert.equal(out[0].color, 'grey');
  assert.equal(out[0].color_reason, 'no verified record');
  assert.equal(HOUSE_COLOR.grey, URGENCY_COLOR.watch);
});

test('red and green reuse the validated urgency colours', () => {
  assert.equal(HOUSE_COLOR.red, URGENCY_COLOR.critical);
  assert.equal(HOUSE_COLOR.green, URGENCY_COLOR.clear);
});

test('a Retell alert can start from grey', () => {
  assert.equal(headline({ address: '16800 Bollinger Dr', color: 'red', previous_color: 'grey', first_call: false }),
    'Retell changed 16800 Bollinger Dr: GREY → RED');
  assert.equal(headline({ address: '16800 Bollinger Dr', color: 'grey', previous_color: null, first_call: true }),
    'Retell registered 16800 Bollinger Dr as GREY');
});

test('alert headlines say what Retell did to the house', () => {
  assert.equal(headline({ address: '1515 Via de la Paz', color: 'red', previous_color: 'yellow', first_call: true }),
    'Retell registered 1515 Via de la Paz as RED');
  assert.equal(headline({ address: '1515 Via de la Paz', color: 'red', previous_color: 'yellow', first_call: false }),
    'Retell changed 1515 Via de la Paz: YELLOW → RED');
});

const NOW = Date.parse('2026-10-17T12:00:00Z');
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString();

test('five distinct colours: refused red, no answer orange, evacuating yellow, cleared green, unknown grey', () => {
  const at = (status: AddressState['status'], recorded: string | null) => houseColor({ ...house('x'), status, recorded_at: recorded }, NOW);
  assert.equal(at('refused', ago(5)), 'red');
  assert.equal(at('no_answer', ago(5)), 'orange');
  assert.equal(at('in_transit', ago(5)), 'yellow');
  assert.equal(at('cleared', ago(5)), 'green');
  assert.equal(at('self_out', ago(5)), 'green');
  assert.equal(at('unknown', null), 'grey');
  assert.equal(new Set(Object.values(HOUSE_COLOR)).size, 5);
});

test('a clear older than two hours is grey, not green', () => {
  assert.equal(houseColor({ ...house('x'), status: 'cleared', recorded_at: ago(119) }, NOW), 'green');
  assert.equal(houseColor({ ...house('x'), status: 'cleared', recorded_at: ago(121) }, NOW), 'grey');
  assert.equal(houseColor({ ...house('x'), status: 'self_out', recorded_at: null }, NOW), 'grey');
});

test('Supabase wins over the local rule, so a Retell call can colour a house the status cannot', () => {
  assert.equal(houseColor({ ...house('x'), status: 'unknown', color: 'red' }, NOW), 'red');
  assert.equal(houseColor({ ...house('x'), status: 'cleared', recorded_at: ago(5), color: 'orange' }, NOW), 'orange');
});

test('orange and yellow are valid Supabase colours', () => {
  const out = withColors([house('a'), house('b')], [{ id: 'a', color: 'orange', color_reason: 'last knock got no answer' }, { id: 'b', color: 'yellow', color_reason: null }]);
  assert.equal(out[0].color, 'orange');
  assert.equal(out[1].color, 'yellow');
  assert.equal(headline({ address: '1 A St', color: 'orange', previous_color: 'grey', first_call: false }), 'Retell changed 1 A St: GREY → ORANGE');
});

// Supabase's house colours on the board, and the paging that loads every household.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAll, withColors } from '../src/lib/supabase-data.ts';
import { HOUSE_COLOR, URGENCY_COLOR } from '../src/lib/priority.ts';
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

test('red and green reuse the validated urgency colours', () => {
  assert.equal(HOUSE_COLOR.red, URGENCY_COLOR.critical);
  assert.equal(HOUSE_COLOR.green, URGENCY_COLOR.clear);
});

test('alert headlines say what Retell did to the house', () => {
  assert.equal(headline({ address: '1515 Via de la Paz', color: 'red', previous_color: 'yellow', first_call: true }),
    'Retell registered 1515 Via de la Paz as RED');
  assert.equal(headline({ address: '1515 Via de la Paz', color: 'red', previous_color: 'yellow', first_call: false }),
    'Retell changed 1515 Via de la Paz: YELLOW → RED');
});

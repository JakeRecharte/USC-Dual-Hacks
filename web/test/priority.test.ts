// The board's colours, counts and ordering all come out of lib/priority.ts, so these are the
// rules the demo rests on. Run with `npm test` (Node's built-in runner, same as server/).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { seedAddresses } from '../src/lib/addresses.ts';
import {
  FRESH_MIN,
  doorKnockList,
  isStale,
  urgencyOf,
  zoneSummaries,
} from '../src/lib/priority.ts';
import type { AddressState, Status, Structure } from '../src/lib/types.ts';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function address(over: Partial<AddressState> = {}): AddressState {
  return {
    id: 'x1',
    address: '1 Test St',
    lat: 34.04,
    lng: -118.54,
    zone_id: 'PAC-1',
    resident_name: 'Test Resident',
    inside_perimeter: true,
    status: 'unknown' as Status,
    source: null,
    recorded_at: null,
    note: null,
    structure: 'unassessed' as Structure,
    structure_recorded_at: null,
    ...over,
  };
}

describe('staleness', () => {
  it('treats a cleared status inside the window as fresh', () => {
    assert.equal(isStale('cleared', minutesAgo(FRESH_MIN - 1), NOW), false);
  });

  it('treats a cleared status past the window as stale', () => {
    assert.equal(isStale('cleared', minutesAgo(FRESH_MIN + 1), NOW), true);
  });

  it('never calls a refusal stale: it does not expire into "probably fine"', () => {
    assert.equal(isStale('refused', minutesAgo(10_000), NOW), false);
  });
});

describe('urgency', () => {
  it('ranks a refusal critical however recent it is', () => {
    assert.equal(urgencyOf(address({ status: 'refused', recorded_at: minutesAgo(1) }), NOW), 'critical');
  });

  it('ranks an unknown address inside the perimeter above one outside it', () => {
    assert.equal(urgencyOf(address({ status: 'unknown' }), NOW), 'high');
    assert.equal(urgencyOf(address({ status: 'unknown', inside_perimeter: false }), NOW), 'watch');
  });

  it('drops a fresh clear to clear and lifts a stale one back to watch', () => {
    assert.equal(urgencyOf(address({ status: 'cleared', recorded_at: minutesAgo(30) }), NOW), 'clear');
    assert.equal(urgencyOf(address({ status: 'cleared', recorded_at: minutesAgo(400) }), NOW), 'watch');
  });

  it('stops a destroyed structure from driving the evacuation queue', () => {
    const burned = address({ status: 'unknown', structure: 'destroyed' });
    assert.equal(urgencyOf(burned, NOW), 'clear');
  });
});

describe('door-knock list', () => {
  const rows = [
    address({ id: 'fresh', status: 'cleared', recorded_at: minutesAgo(10) }),
    address({ id: 'refused', status: 'refused', recorded_at: minutesAgo(5) }),
    address({ id: 'never', status: 'unknown' }),
    address({ id: 'outside', status: 'unknown', inside_perimeter: false }),
    address({ id: 'stale', status: 'cleared', recorded_at: minutesAgo(400) }),
  ];

  it('leaves out resolved addresses and anything outside the perimeter', () => {
    const ids = doorKnockList(rows, NOW).map((a) => a.id);
    assert.deepEqual(ids, ['refused', 'never', 'stale']);
  });

  it('puts the never-contacted address above the stale one', () => {
    const ids = doorKnockList(rows, NOW).map((a) => a.id);
    assert.ok(ids.indexOf('never') < ids.indexOf('stale'));
  });
});

describe('zone rollup', () => {
  it('keeps a zone critical while one address in it has refused', () => {
    const zone = zoneSummaries(
      [
        address({ id: '1', zone_id: 'PAC-2', status: 'cleared', recorded_at: minutesAgo(5) }),
        address({ id: '2', zone_id: 'PAC-2', status: 'cleared', recorded_at: minutesAgo(5) }),
        address({ id: '3', zone_id: 'PAC-2', status: 'refused', recorded_at: minutesAgo(5) }),
      ],
      NOW,
    )[0];
    assert.equal(zone.urgency, 'critical');
    assert.equal(zone.unresolved, 1);
    assert.equal(zone.total, 3);
  });
});

describe('seed data', () => {
  const seeded = seedAddresses(NOW);

  it('carries the scripted demo cases the voice agent is tested against', () => {
    const byId = new Map(seeded.map((a) => [a.id, a]));
    assert.equal(byId.get('a1')!.status, 'cleared');
    assert.equal(urgencyOf(byId.get('a1')!, NOW), 'clear', 'a1 is the fresh clear');
    assert.equal(byId.get('a2')!.status, 'refused');
    assert.equal(byId.get('a2')!.note, '2 adults staying, 1 on oxygen');
    assert.equal(urgencyOf(byId.get('a4')!, NOW), 'watch', 'a4 is the stale clear');
    assert.equal(byId.get('a6')!.inside_perimeter, false);
  });

  it('gives every zone inside the perimeter something to knock on', () => {
    const inside = seeded.filter((a) => a.inside_perimeter);
    for (const zone of zoneSummaries(inside, NOW)) {
      assert.ok(zone.unresolved > 0, `${zone.zone_id} has no unresolved addresses`);
    }
  });

  it('ages relative to the time it is read, so the demo holds all day', () => {
    const later = NOW + 6 * 60 * 60_000;
    const a1Now = seedAddresses(NOW).find((a) => a.id === 'a1')!;
    const a1Later = seedAddresses(later).find((a) => a.id === 'a1')!;
    assert.equal(urgencyOf(a1Now, NOW), 'clear');
    assert.equal(urgencyOf(a1Later, later), 'clear');
  });
});

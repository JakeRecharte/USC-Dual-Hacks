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
  zoneUrgency,
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
    address({ id: 'asked', status: 'unknown', recorded_at: minutesAgo(30) }),
    address({ id: 'outside', status: 'unknown', inside_perimeter: false }),
    address({ id: 'stale', status: 'cleared', recorded_at: minutesAgo(400) }),
  ];

  it('leaves out resolved addresses, anything outside the perimeter, and houses with no record', () => {
    const ids = doorKnockList(rows, NOW).map((a) => a.id);
    assert.deepEqual(ids, ['refused', 'asked', 'stale']);
  });

  it('puts the unanswered address above the stale one', () => {
    const ids = doorKnockList(rows, NOW).map((a) => a.id);
    assert.ok(ids.indexOf('asked') < ids.indexOf('stale'));
  });

  it('is empty when nothing has been recorded yet', () => {
    const fresh = [address({ id: 'a' }), address({ id: 'b' })];
    assert.deepEqual(doorKnockList(fresh, NOW), []);
  });

  it('keeps a no-record house that Supabase has coloured, such as a caller who needs a person', () => {
    const flagged = [address({ id: 'caller', status: 'unknown', color: 'red' })];
    assert.deepEqual(doorKnockList(flagged, NOW).map((a) => a.id), ['caller']);
  });
});

describe('zone rollup', () => {
  it('counts what is unresolved without letting one refusal redden the zone', () => {
    const zone = zoneSummaries(
      [
        address({ id: '1', zone_id: 'PAL-05', status: 'cleared', recorded_at: minutesAgo(5) }),
        address({ id: '2', zone_id: 'PAL-05', status: 'cleared', recorded_at: minutesAgo(5) }),
        address({ id: '3', zone_id: 'PAL-05', status: 'refused', recorded_at: minutesAgo(5) }),
      ],
      NOW,
    )[0];
    assert.equal(zone.unresolved, 1);
    assert.equal(zone.total, 3);
    // One in three outstanding is a watch, not an emergency. At a few hundred households a
    // zone always contains a refusal, so worst-case rollup would paint every zone red.
    assert.equal(zone.urgency, 'watch');
  });

  it('bands a zone by the share of it still outstanding', () => {
    assert.equal(zoneUrgency(0.85), 'critical');
    assert.equal(zoneUrgency(0.6), 'critical');
    assert.equal(zoneUrgency(0.4), 'high');
    assert.equal(zoneUrgency(0.2), 'watch');
    assert.equal(zoneUrgency(0.05), 'clear');
  });
});

describe('placeholder households', () => {
  const seeded = seedAddresses();

  it('invents no status, note or damage: every household is unknown and unassessed', () => {
    assert.ok(seeded.length > 0);
    for (const a of seeded) {
      assert.equal(a.status, 'unknown', `${a.id} has a status`);
      assert.equal(a.source, null);
      assert.equal(a.note, null);
      assert.equal(a.recorded_at, null);
      assert.equal(a.structure, 'unassessed');
      assert.equal(a.structure_recorded_at, null);
    }
  });

  it('keeps the households the voice agent knows by id', () => {
    const byId = new Map(seeded.map((a) => [a.id, a]));
    assert.equal(byId.get('a1')!.address, '1420 Sunset Mesa Dr');
    assert.equal(byId.get('a8')!.address, '640 Toyopa Dr');
  });

  it('seeds nothing outside the perimeter: the board covers one incident', () => {
    assert.ok(seeded.every((a) => a.inside_perimeter), 'every seeded household is inside');
  });

  it('gives every zone inside the perimeter something to knock on', () => {
    const inside = seeded.filter((a) => a.inside_perimeter);
    for (const zone of zoneSummaries(inside, NOW)) {
      assert.ok(zone.unresolved > 0, `${zone.zone_id} has no unresolved addresses`);
    }
  });

  it('places every household on a distinct address', () => {
    assert.equal(new Set(seeded.map((a) => a.address)).size, seeded.length);
  });
});

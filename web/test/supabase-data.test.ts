// The join and the perimeter test are where a wrong board comes from: either the newest
// status is picked wrongly, or a household is placed on the wrong side of the fire line.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PERIMETER } from '../src/lib/zones.ts';
import { pointInPolygon } from '../src/lib/geo.ts';
import { joinRows } from '../src/lib/supabase-data.ts';

const address = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  address: '1420 Sunset Mesa Dr',
  lat: 34.0376,
  lng: -118.5793,
  zone_id: 'PAC-1',
  resident_name: 'Maria Lopez',
  ...over,
});

describe('perimeter test', () => {
  it('places the scripted inside addresses inside', () => {
    assert.equal(pointInPolygon([34.0376, -118.5793], PERIMETER), true, '1420 Sunset Mesa');
    assert.equal(pointInPolygon([34.0447, -118.5266], PERIMETER), true, '1515 Via de la Paz');
    assert.equal(pointInPolygon([34.0607, -118.5437], PERIMETER), true, '1100 Palisades Dr');
  });

  it('places the two outside addresses outside', () => {
    assert.equal(pointInPolygon([34.0031, -118.3349], PERIMETER), false, 'Crenshaw');
    assert.equal(pointInPolygon([34.0902, -118.2921], PERIMETER), false, 'Vermont');
  });
});

describe('joinRows', () => {
  it('takes the newest status_log row per address, not the first returned', () => {
    const rows = joinRows(
      [address()],
      [
        { address_id: 'a1', status: 'cleared', source: 'officer', note: null, recorded_at: '2026-10-17T09:00:00Z' },
        { address_id: 'a1', status: 'refused', source: 'officer', note: 'staying', recorded_at: '2026-10-17T11:00:00Z' },
        { address_id: 'a1', status: 'no_answer', source: 'officer', note: null, recorded_at: '2026-10-17T10:00:00Z' },
      ],
    );
    assert.equal(rows[0].status, 'refused');
    assert.equal(rows[0].note, 'staying');
    assert.equal(rows[0].recorded_at, '2026-10-17T11:00:00Z');
  });

  it('reports unknown with no timestamp when an address has no status at all', () => {
    const rows = joinRows([address()], []);
    assert.equal(rows[0].status, 'unknown');
    assert.equal(rows[0].recorded_at, null);
  });

  it('prefers any timestamped row over one with a null timestamp', () => {
    const rows = joinRows(
      [address()],
      [
        { address_id: 'a1', status: 'refused', source: null, note: null, recorded_at: null },
        { address_id: 'a1', status: 'cleared', source: 'officer', note: null, recorded_at: '2026-10-17T09:00:00Z' },
      ],
    );
    assert.equal(rows[0].status, 'cleared');
  });

  it('drops households outside the perimeter instead of showing them', () => {
    const rows = joinRows(
      [address(), address({ id: 'a6', lat: 34.0031, lng: -118.3349, address: '4512 Crenshaw Blvd' })],
      [],
    );
    // The board covers one incident: whatever else the table holds, it cannot reach the map.
    assert.deepEqual(rows.map((r) => r.id), ['a1']);
    assert.equal(rows[0].inside_perimeter, true);
  });

  it('degrades a missing structure column to "not assessed" instead of blanking the row', () => {
    const rows = joinRows([address()], []);
    assert.equal(rows[0].structure, 'unassessed');
  });

  it('keeps a structure value when the column is present', () => {
    const rows = joinRows([address({ structure: 'destroyed', structure_recorded_at: '2026-10-17T09:00:00Z' })], []);
    assert.equal(rows[0].structure, 'destroyed');
  });

  it('rejects a status value that is not in the contract', () => {
    const rows = joinRows(
      [address()],
      [{ address_id: 'a1', status: 'destroyed', source: 'officer', note: null, recorded_at: '2026-10-17T09:00:00Z' }],
    );
    // "destroyed" is a structure, never a status: it must not leak in through the database.
    assert.equal(rows[0].status, 'unknown');
  });

  it('drops addresses with no coordinates, which would land at (0,0) in the ocean', () => {
    const rows = joinRows([address(), address({ id: 'bad', lat: null, lng: null })], []);
    assert.deepEqual(rows.map((r) => r.id), ['a1']);
  });
});

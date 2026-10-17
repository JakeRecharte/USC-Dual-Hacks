// The officer map draws whatever `within()` returns, so these are the rules that decide
// which doors an officer is standing in front of. Run with `npm test`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NEARBY_RADIUS_FT,
  NEARBY_RADIUS_M,
  distanceMetres,
  nearest,
  pointInPolygon,
  within,
} from '../src/lib/geo.ts';
import { PERIMETER } from '../src/lib/zones.ts';

/** A real household centroid in Huntington Palisades, the demo's own block. */
const ORIGIN: [number, number] = [34.0401, -118.5232];

/** Offset a point by whole metres, using the same scaling the helper assumes. */
function offset([lat, lng]: [number, number], northM: number, eastM: number): [number, number] {
  const mPerDegLat = 111_320;
  return [lat + northM / mPerDegLat, lng + eastM / (mPerDegLat * Math.cos((lat * Math.PI) / 180))];
}

describe('distanceMetres', () => {
  it('is zero for the same point', () => {
    assert.equal(distanceMetres(ORIGIN, ORIGIN), 0);
  });

  it('is symmetric', () => {
    const b = offset(ORIGIN, 30, 40);
    assert.ok(Math.abs(distanceMetres(ORIGIN, b) - distanceMetres(b, ORIGIN)) < 1e-9);
  });

  it('measures a known north offset', () => {
    assert.ok(Math.abs(distanceMetres(ORIGIN, offset(ORIGIN, 100, 0)) - 100) < 0.1);
  });

  it('measures a known east offset, scaled for latitude', () => {
    assert.ok(Math.abs(distanceMetres(ORIGIN, offset(ORIGIN, 0, 100)) - 100) < 0.1);
  });

  it('agrees with haversine over the radius this is used at', () => {
    const R = 6_371_000;
    const haversine = ([latA, lngA]: [number, number], [latB, lngB]: [number, number]) => {
      const dLat = ((latB - latA) * Math.PI) / 180;
      const dLng = ((lngB - lngA) * Math.PI) / 180;
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((latA * Math.PI) / 180) * Math.cos((latB * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };
    for (const [n, e] of [[45, 0], [0, 45], [32, 32], [-20, 40]] as const) {
      const b = offset(ORIGIN, n, e);
      // The two differ by about 0.1%, because 111,320 m/deg is the WGS84 equatorial figure
      // and this haversine uses the mean radius. Over 150 ft that is five centimetres —
      // two orders of magnitude inside a good phone fix, so the cheap formula is the right
      // one here. Asserted as a ratio so the bound holds wherever the officer is standing.
      const ratio = distanceMetres(ORIGIN, b) / haversine(ORIGIN, b);
      assert.ok(Math.abs(ratio - 1) < 0.002, `ratio ${ratio}`);
      assert.ok(Math.abs(distanceMetres(ORIGIN, b) - haversine(ORIGIN, b)) < 0.1);
    }
  });
});

describe('NEARBY_RADIUS', () => {
  it('is 150 feet in metres', () => {
    assert.equal(NEARBY_RADIUS_FT, 150);
    assert.ok(Math.abs(NEARBY_RADIUS_M - 45.72) < 1e-9);
  });
});

describe('within', () => {
  const house = (id: string, northM: number, eastM: number) => {
    const [lat, lng] = offset(ORIGIN, northM, eastM);
    return { id, lat, lng };
  };

  it('keeps what is inside the radius and drops what is outside', () => {
    const items = [house('close', 10, 0), house('edge', 44, 0), house('far', 200, 0)];
    const ids = within(items, ORIGIN).map((n) => n.item.id);
    assert.deepEqual(ids, ['close', 'edge']);
  });

  it('cuts off at the radius, not somewhere near it', () => {
    // A metre either side of the threshold. Exactly 45.72 m is a floating-point coin flip
    // and no GPS fix ever lands there, so the boundary is asserted where it can be.
    assert.equal(within([house('just in', NEARBY_RADIUS_M - 1, 0)], ORIGIN).length, 1);
    assert.equal(within([house('just out', NEARBY_RADIUS_M + 1, 0)], ORIGIN).length, 0);
  });

  it('returns nearest first with the distance attached', () => {
    const got = within([house('b', 30, 0), house('a', 5, 0), house('c', 40, 0)], ORIGIN);
    assert.deepEqual(got.map((n) => n.item.id), ['a', 'b', 'c']);
    assert.ok(Math.abs(got[0].metres - 5) < 0.1);
  });

  it('rejects by bounding box without mis-dropping a diagonal neighbour', () => {
    // 32 m north and 32 m east is 45.25 m away: inside the radius, and inside the box.
    assert.equal(within([house('diag', 32, 32)], ORIGIN).length, 1);
    // 40 m each way is 56.6 m: still inside the box, so only the distance can reject it.
    assert.equal(within([house('corner', 40, 40)], ORIGIN).length, 0);
  });

  it('is empty rather than throwing when nothing is in range', () => {
    assert.deepEqual(within([house('far', 5_000, 0)], ORIGIN), []);
  });

  it('takes an explicit radius', () => {
    assert.equal(within([house('x', 80, 0)], ORIGIN, 100).length, 1);
    assert.equal(within([house('x', 80, 0)], ORIGIN, 50).length, 0);
  });
});

describe('nearest', () => {
  const items = [0, 100, 20, 4_000, 60].map((m, i) => {
    const [lat, lng] = offset(ORIGIN, m, 0);
    return { id: `h${i}`, lat, lng };
  });

  it('returns the closest few however far away they are', () => {
    const got = nearest(items, ORIGIN, 3);
    assert.deepEqual(got.map((n) => n.item.id), ['h0', 'h2', 'h4']);
  });

  it('never returns more than it was given', () => {
    assert.equal(nearest(items, ORIGIN, 99).length, items.length);
    assert.deepEqual(nearest([], ORIGIN, 5), []);
  });
});

describe('pointInPolygon with the perimeter', () => {
  it('places the demo block inside and downtown outside', () => {
    assert.equal(pointInPolygon(ORIGIN, PERIMETER), true);
    assert.equal(pointInPolygon([34.0522, -118.2437], PERIMETER), false);
  });
});

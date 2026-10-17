// The officer map draws whatever `within()` returns, so these are the rules that decide
// which doors an officer is standing in front of. Run with `npm test`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NEARBY_RADIUS_FT,
  NEARBY_RADIUS_M,
  distanceMetres,
  nearest,
  offsetMetres,
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
      // and this haversine uses the mean radius. Over these distances that is centimetres —
      // two orders of magnitude inside a good phone fix, so the cheap formula is the right
      // one here. Asserted as a ratio so the bound holds wherever the officer is standing.
      const ratio = distanceMetres(ORIGIN, b) / haversine(ORIGIN, b);
      assert.ok(Math.abs(ratio - 1) < 0.002, `ratio ${ratio}`);
      assert.ok(Math.abs(distanceMetres(ORIGIN, b) - haversine(ORIGIN, b)) < 0.1);
    }
  });
});

describe('NEARBY_RADIUS', () => {
  it('is 300 feet in metres', () => {
    assert.equal(NEARBY_RADIUS_FT, 300);
    assert.ok(Math.abs(NEARBY_RADIUS_M - 91.44) < 1e-9);
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
    // A metre either side of the threshold. Landing exactly on it is a floating-point coin flip
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
    // Expressed as fractions of the radius, so changing the radius cannot quietly turn this
    // into a test of nothing. The box is one radius on each axis, so a point inside the box
    // but outside the circle can only be rejected by the distance check — which is the
    // thing being tested.
    const r = NEARBY_RADIUS_M;
    // 0.7r each way is 0.99r from the origin: inside the circle and inside the box.
    assert.equal(within([house('diagonal, inside', r * 0.7, r * 0.7)], ORIGIN).length, 1);
    // 0.9r each way is 1.27r: inside the box, outside the circle.
    assert.equal(within([house('diagonal, outside', r * 0.9, r * 0.9)], ORIGIN).length, 0);
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

describe('offsetMetres', () => {
  it('moves exactly as far as it says, in the direction it says', () => {
    for (const [n, e] of [[10, 0], [0, 10], [-25, 0], [0, -25], [30, 40]] as const) {
      const moved = offsetMetres(ORIGIN, n, e);
      const expected = Math.hypot(n, e);
      assert.ok(
        Math.abs(distanceMetres(ORIGIN, moved) - expected) < 0.01,
        `${n}N ${e}E measured ${distanceMetres(ORIGIN, moved)}`,
      );
    }
  });

  it('puts north to the north and east to the east', () => {
    const [northLat, northLng] = offsetMetres(ORIGIN, 50, 0);
    assert.ok(northLat > ORIGIN[0]);
    assert.ok(Math.abs(northLng - ORIGIN[1]) < 1e-12);
    const [eastLat, eastLng] = offsetMetres(ORIGIN, 0, 50);
    assert.ok(eastLng > ORIGIN[1]);
    assert.ok(Math.abs(eastLat - ORIGIN[0]) < 1e-12);
  });

  it('does not drift when the same step is taken many times', () => {
    // 600 frames of a 0.1 m step is 60 m, the length of a block at walking pace.
    let at = ORIGIN;
    for (let i = 0; i < 600; i += 1) at = offsetMetres(at, 0.1, 0);
    assert.ok(Math.abs(distanceMetres(ORIGIN, at) - 60) < 0.05, `drifted to ${distanceMetres(ORIGIN, at)}`);
  });

  it('is reversible', () => {
    const there = offsetMetres(ORIGIN, 37, -21);
    const back = offsetMetres(there, -37, 21);
    assert.ok(distanceMetres(ORIGIN, back) < 0.01);
  });
});

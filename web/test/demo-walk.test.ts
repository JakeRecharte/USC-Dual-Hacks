// The simulated officer. This is what stands between a demo in another city and a map of an
// empty street, so the route has to pass real houses and the walk has to stay on it.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEMO_ANCHOR_ADDRESS,
  DEMO_WALK_STOPS,
  bearing,
  demoRoute,
  pointAlong,
  routeLength,
} from '../src/lib/demo-walk.ts';
import { NEARBY_RADIUS_M, distanceMetres, nearest, within } from '../src/lib/geo.ts';
import { seedAddresses } from '../src/lib/addresses.ts';

const ANCHOR: [number, number] = [34.0401, -118.5232];

describe('bearing', () => {
  it('reads north, east, south and west off the compass', () => {
    const north: [number, number] = [34.05, -118.5232];
    const east: [number, number] = [34.0401, -118.51];
    const south: [number, number] = [34.03, -118.5232];
    const west: [number, number] = [34.0401, -118.54];
    assert.ok(Math.abs(bearing(ANCHOR, north) - 0) < 0.5);
    assert.ok(Math.abs(bearing(ANCHOR, east) - 90) < 0.5);
    assert.ok(Math.abs(bearing(ANCHOR, south) - 180) < 0.5);
    assert.ok(Math.abs(bearing(ANCHOR, west) - 270) < 0.5);
  });
});

describe('demoRoute', () => {
  const addresses = seedAddresses(Date.parse('2026-10-17T12:00:00Z'));

  it('starts at the household the demo script taps', () => {
    const anchorRow = addresses.find((a) => a.address === DEMO_ANCHOR_ADDRESS);
    assert.ok(anchorRow, `${DEMO_ANCHOR_ADDRESS} is seeded, so the walk has an anchor`);
    const route = demoRoute(addresses, [anchorRow.lat, anchorRow.lng]);
    assert.deepEqual(route[0], [anchorRow.lat, anchorRow.lng]);
    // And the walk stays on its block rather than wandering off to another zone.
    assert.ok(routeLength(route) < 600);
  });

  it('builds a walkable route with no teleports', () => {
    const route = demoRoute(addresses, ANCHOR);
    assert.ok(route.length > 2, `expected several stops, got ${route.length}`);
    assert.ok(route.length <= DEMO_WALK_STOPS + 1);
    for (let i = 1; i < route.length; i += 1) {
      const leg = distanceMetres(route[i - 1], route[i]);
      assert.ok(leg > 0 && leg <= 130, `leg ${i} is ${leg.toFixed(1)} m`);
    }
  });

  it('every stop on the route is a real household', () => {
    const route = demoRoute(addresses, ANCHOR);
    for (const stop of route) {
      // Within a metre of a seeded centroid: the officer stops at doors, not in roadways.
      assert.ok(within(addresses, stop, 1).length > 0, `${stop} is not a household`);
    }
  });

  it('keeps the officer among the households for the whole walk', () => {
    const route = demoRoute(addresses, ANCHOR);
    const length = routeLength(route);
    // What has to hold is that there is always a house next door rather than across the
    // county, everywhere along the walk.
    for (let d = 0; d <= length; d += 2) {
      const at = pointAlong(route, d);
      assert.ok(at);
      const [closest] = nearest(addresses, [at.lat, at.lng], 1);
      assert.ok(closest.metres < 70, `nearest house is ${closest.metres.toFixed(0)} m at ${d.toFixed(0)} m along`);
    }
  });

  it('puts the officer at the demo household at the start of the walk', () => {
    // docs/DEMO_SCRIPT.md beat 2 taps 640 Toyopa Dr, so the walk has to open on its door.
    const anchorRow = addresses.find((a) => a.address === DEMO_ANCHOR_ADDRESS);
    assert.ok(anchorRow);
    const route = demoRoute(addresses, [anchorRow.lat, anchorRow.lng]);
    const start = pointAlong(route, 0);
    assert.ok(start);
    const inRange = within(addresses, [start.lat, start.lng], NEARBY_RADIUS_M);
    assert.ok(
      inRange.some((n) => n.item.address === DEMO_ANCHOR_ADDRESS),
      'the demo household is in range when the map opens',
    );
  });

  it('survives an empty household list', () => {
    assert.deepEqual(demoRoute([], ANCHOR), [ANCHOR]);
  });

  it('snaps a bare coordinate to the nearest door before setting off', () => {
    // ANCHOR is 640 Toyopa Dr's stated location, which is in the roadway: the seeded
    // household got snapped to a real footprint about fifty metres off.
    const route = demoRoute(addresses, ANCHOR);
    assert.ok(distanceMetres(route[0], ANCHOR) > 1, 'the raw point is not itself a house');
    const [closest] = within(addresses, route[0], 1);
    assert.ok(closest, 'the walk begins on a household');
  });
});

describe('pointAlong', () => {
  const route: [number, number][] = [
    [34.0401, -118.5232],
    [34.0405, -118.5232],
    [34.0405, -118.5226],
  ];

  it('is null for an empty route and pins a single point', () => {
    assert.equal(pointAlong([], 10), null);
    assert.deepEqual(pointAlong([ANCHOR], 999), { lat: ANCHOR[0], lng: ANCHOR[1], heading: 0 });
  });

  it('starts at the first waypoint', () => {
    const at = pointAlong(route, 0);
    assert.ok(at);
    assert.ok(distanceMetres([at.lat, at.lng], route[0]) < 0.01);
  });

  it('walks the whole route and never leaves it', () => {
    const length = routeLength(route);
    for (let d = 0; d <= length; d += 1) {
      const at = pointAlong(route, d);
      assert.ok(at);
      // Distance from the point to the nearest leg: on the route means ~zero.
      const off = Math.min(
        ...route.slice(1).map((to, i) => distanceToSegment([at.lat, at.lng], route[i], to)),
      );
      assert.ok(off < 0.05, `${off.toFixed(3)} m off the route at ${d} m`);
    }
  });

  it('turns around at the end instead of teleporting to the start', () => {
    const length = routeLength(route);
    const end = pointAlong(route, length);
    const back = pointAlong(route, length + 1);
    assert.ok(end && back);
    // One metre past the end is one metre back down the route, not at the start.
    assert.ok(distanceMetres([end.lat, end.lng], [back.lat, back.lng]) < 1.5);
    assert.ok(distanceMetres([back.lat, back.lng], route[0]) > 1);
  });

  it('faces the other way on the return leg', () => {
    const length = routeLength(route);
    const out = pointAlong(route, 1);
    const home = pointAlong(route, length * 2 - 1);
    assert.ok(out && home);
    const apart = ((out.heading - home.heading + 360) % 360);
    assert.ok(Math.abs(apart - 180) < 0.5, `${apart}° apart`);
  });

  it('is periodic, so the walk runs as long as the demo does', () => {
    const length = routeLength(route);
    const first = pointAlong(route, 7);
    const lap = pointAlong(route, 7 + length * 2);
    assert.ok(first && lap);
    assert.ok(distanceMetres([first.lat, first.lng], [lap.lat, lap.lng]) < 0.01);
  });

  it('handles a negative distance rather than falling off the route', () => {
    const at = pointAlong(route, -5);
    assert.ok(at);
    const off = Math.min(
      ...route.slice(1).map((to, i) => distanceToSegment([at.lat, at.lng], route[i], to)),
    );
    assert.ok(off < 0.05);
  });
});

/** Perpendicular distance from a point to a segment, in metres. */
function distanceToSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const len = distanceMetres(a, b);
  if (len === 0) return distanceMetres(p, a);
  // Project in the local metre frame.
  const mx = 111_320;
  const cos = Math.cos((a[0] * Math.PI) / 180);
  const ax = 0;
  const ay = 0;
  const bx = (b[1] - a[1]) * mx * cos;
  const by = (b[0] - a[0]) * mx;
  const px = (p[1] - a[1]) * mx * cos;
  const py = (p[0] - a[0]) * mx;
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (len * len)));
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
}

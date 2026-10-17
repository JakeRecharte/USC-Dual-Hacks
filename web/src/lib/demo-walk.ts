// A simulated officer walking a block, for when real GPS is nowhere near the data.
//
// The households are in Pacific Palisades and the demo will not be. Without this the
// officer map opens on an empty street somewhere in Los Angeles County — correct behaviour,
// useless demo. So when the real fix lands outside the perimeter (or the demo flag is set)
// the position is driven from a short walking route built out of the loaded households,
// which guarantees there are always doors within 150 feet.
//
// Pure, with distance injected as a parameter of position rather than wall-clock time, so
// it can be tested and so the walk is reproducible.
import { distanceMetres, nearest, type LatLng, type Located } from './geo.ts';

/** The household docs/DEMO_SCRIPT.md beat 2 taps. The walk starts at its door. */
export const DEMO_ANCHOR_ADDRESS = '640 Toyopa Dr';

/** A brisk walk with a clipboard. */
export const DEMO_WALK_SPEED_MPS = 1.25;

/**
 * Stops on the route. Six doors at a walking pace is more than a three-minute demo gets
 * through, and a short route means the walk turns around and comes back past them rather
 * than marching off the edge of the neighbourhood.
 */
export const DEMO_WALK_STOPS = 6;

/**
 * The longest leg the walk will take.
 *
 * Measured against the data rather than guessed: the tracked households are the ~2,000
 * dwellings with a record, not all 8,103 buildings in the perimeter, so they sit a median
 * 41 m apart and the demo anchor's own nearest neighbour is 110 m away. A cap near the
 * radius would leave the chain stuck at one stop here. 130 m takes in the real spacing and
 * still rejects the hop across a canyon that happens once the near households run out.
 *
 * It is longer than the 150 ft draw radius, so the officer does walk through stretches with
 * no tracked household in range. That is what the map's nearest-handful fallback is for.
 */
const MAX_LEG_M = 130;

export interface WalkPoint {
  lat: number;
  lng: number;
  /** Degrees clockwise from north, the direction of travel. */
  heading: number;
}

/**
 * A walking route through the households nearest `anchor`, nearest-neighbour chained so it
 * reads as going down a street rather than bouncing around the block.
 */
export function demoRoute(households: readonly Located[], anchor: LatLng): LatLng[] {
  // Start at a door, not at a coordinate. The caller's anchor is usually a household
  // already, but a raw point can land in the middle of a street — and then the first leg is
  // a walk across open ground with nothing in range, which is the one thing this must not
  // produce.
  const [closest] = nearest(households, anchor, 1);
  const start: LatLng = closest ? [closest.item.lat, closest.item.lng] : anchor;

  const route: LatLng[] = [start];
  const left = households.filter((h) => distanceMetres(start, [h.lat, h.lng]) < 400);
  const used = new Set<number>();

  let at = start;
  for (let stop = 0; stop < DEMO_WALK_STOPS; stop += 1) {
    let best = -1;
    let bestDist = Infinity;
    left.forEach((h, i) => {
      if (used.has(i)) return;
      const d = distanceMetres(at, [h.lat, h.lng]);
      // A household on top of the current point adds a zero-length leg and no movement.
      if (d < 4 || d > MAX_LEG_M || d >= bestDist) return;
      bestDist = d;
      best = i;
    });
    if (best < 0) break;
    used.add(best);
    at = [left[best].lat, left[best].lng];
    route.push(at);
  }
  return route;
}

/** Total walking distance of a route, in metres. */
export function routeLength(route: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i += 1) total += distanceMetres(route[i - 1], route[i]);
  return total;
}

/**
 * Where the officer is after walking `metres` along the route.
 *
 * The route is walked there and back rather than looped, so the officer never teleports
 * from the last house to the first one. A route with no length pins to its only point.
 */
export function pointAlong(route: readonly LatLng[], metres: number): WalkPoint | null {
  if (route.length === 0) return null;
  if (route.length === 1) return { lat: route[0][0], lng: route[0][1], heading: 0 };

  const length = routeLength(route);
  if (length === 0) return { lat: route[0][0], lng: route[0][1], heading: 0 };

  // Fold the distance into one there-and-back lap.
  const lap = ((metres % (length * 2)) + length * 2) % (length * 2);
  const outbound = lap <= length;
  let along = outbound ? lap : length * 2 - lap;

  for (let i = 1; i < route.length; i += 1) {
    const from = route[i - 1];
    const to = route[i];
    const leg = distanceMetres(from, to);
    if (leg === 0) continue;
    if (along > leg) {
      along -= leg;
      continue;
    }
    const t = along / leg;
    const heading = bearing(from, to);
    return {
      lat: from[0] + (to[0] - from[0]) * t,
      lng: from[1] + (to[1] - from[1]) * t,
      // Walking back, the officer faces the other way.
      heading: outbound ? heading : (heading + 180) % 360,
    };
  }

  // Rounding left a sliver past the end of the last leg.
  const end = route[route.length - 1];
  return { lat: end[0], lng: end[1], heading: bearing(route[route.length - 2], end) };
}

/** Compass bearing from one point to another, degrees clockwise from north. */
export function bearing([latA, lngA]: LatLng, [latB, lngB]: LatLng): number {
  const midLat = ((latA + latB) / 2) * (Math.PI / 180);
  const north = latB - latA;
  const east = (lngB - lngA) * Math.cos(midLat);
  const deg = (Math.atan2(east, north) * 180) / Math.PI;
  return (deg + 360) % 360;
}

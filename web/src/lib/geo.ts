// Whether a point is inside the fire perimeter.
//
// The data contract keeps the perimeter as a single GeoJSON polygon rather than a column on
// `addresses`, so this is computed rather than read. A ray-casting test is exact enough for
// a polygon this size: at these latitudes treating lat/lng as planar is off by metres, and
// zone boundaries are not drawn to the metre anyway.

export type LatLng = [number, number];

export function pointInPolygon([lat, lng]: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    // Count crossings of a ray cast east from the point.
    const straddles = latI > lat !== latJ > lat;
    if (straddles && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * How far an officer can reasonably be from a door and still be *at* it. 150 feet is about
 * the depth of two lots on these streets, so the officer map draws the houses either side
 * of the one they are standing in front of and nothing from the next block.
 */
export const NEARBY_RADIUS_FT = 150;
export const NEARBY_RADIUS_M = NEARBY_RADIUS_FT * 0.3048;

/**
 * Metres between two points, equirectangular: the latitude difference is scaled by cos(lat)
 * and the result is a flat Pythagorean distance. Over 150 feet this is within a millimetre
 * of the haversine distance, and it is a third of the trig, which matters when it runs over
 * two thousand households on every GPS tick.
 */
export function distanceMetres([latA, lngA]: LatLng, [latB, lngB]: LatLng): number {
  const mPerDegLat = 111_320;
  const midLat = ((latA + latB) / 2) * (Math.PI / 180);
  const dLat = (latB - latA) * mPerDegLat;
  const dLng = (lngB - lngA) * mPerDegLat * Math.cos(midLat);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** Anything with a position: an `AddressState`, a household site, a map feature. */
export interface Located {
  lat: number;
  lng: number;
}

export interface Nearby<T> {
  item: T;
  metres: number;
}

/**
 * The households within `radiusM` of the officer, nearest first.
 *
 * A bounding-box reject comes before the distance so the common case — a household on the
 * other side of the perimeter — costs two subtractions rather than a square root.
 */
export function within<T extends Located>(
  items: readonly T[],
  origin: LatLng,
  radiusM: number = NEARBY_RADIUS_M,
): Nearby<T>[] {
  const [lat, lng] = origin;
  // A hair wider than the radius: the box uses cos(lat) where the distance uses cos of the
  // midpoint, so without the slack the box could reject a point a fraction of a millimetre
  // inside the circle. The box is an optimisation and must never change the answer.
  const boxLat = (radiusM / 111_320) * 1.000_001;
  // Guard the pole: cos(lat) → 0 would make the longitude box infinite.
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  const boxLng = boxLat / cosLat;

  const out: Nearby<T>[] = [];
  for (const item of items) {
    if (Math.abs(item.lat - lat) > boxLat || Math.abs(item.lng - lng) > boxLng) continue;
    const metres = distanceMetres(origin, [item.lat, item.lng]);
    if (metres <= radiusM) out.push({ item, metres });
  }
  return out.sort((a, b) => a.metres - b.metres);
}

/**
 * The `count` closest households regardless of distance. The officer map falls back to this
 * when the radius is empty: a map with the nearest few houses on it is still a map, and an
 * officer standing on an undeveloped stretch of Palisades Dr should not get a blank screen.
 */
export function nearest<T extends Located>(
  items: readonly T[],
  origin: LatLng,
  count: number,
): Nearby<T>[] {
  return items
    .map((item) => ({ item, metres: distanceMetres(origin, [item.lat, item.lng]) }))
    .sort((a, b) => a.metres - b.metres)
    .slice(0, count);
}

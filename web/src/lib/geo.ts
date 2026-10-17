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

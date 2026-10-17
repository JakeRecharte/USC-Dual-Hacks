// The fire perimeter, identical to web/src/lib/addresses.ts PERIMETER and web/src/lib/geo.ts,
// so the agent and the board always agree on who is inside. `inside_perimeter` is not a
// column: the contract keeps the perimeter as one polygon and computes it.

export const PERIMETER = [
  [34.0712, -118.5842],
  [34.0695, -118.5386],
  [34.0520, -118.5158],
  [34.0298, -118.5176],
  [34.0281, -118.5524],
  [34.0330, -118.5871],
];

export function pointInPolygon([lat, lng], polygon = PERIMETER) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const straddles = latI > lat !== latJ > lat;
    if (straddles && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
  }
  return inside;
}

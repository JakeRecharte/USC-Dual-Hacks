// The fire perimeter, identical to web/src/lib/zones.ts PERIMETER (a test fails if they drift) and web/src/lib/geo.ts,
// so the agent and the board always agree on who is inside. `inside_perimeter` is not a
// column: the contract keeps the perimeter as one polygon and computes it.

export const PERIMETER = [
  [34.0335, -118.5890],
  [34.0480, -118.5910],
  [34.0625, -118.5865],
  [34.0725, -118.5795],
  [34.0835, -118.5700],
  [34.0880, -118.5555],
  [34.0865, -118.5395],
  [34.0795, -118.5235],
  [34.0700, -118.5090],
  [34.0585, -118.4985],
  [34.0455, -118.4940],
  [34.0355, -118.4960],
  [34.0290, -118.5040],
  [34.0285, -118.5300],
  [34.0300, -118.5560],
  [34.0320, -118.5760],
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

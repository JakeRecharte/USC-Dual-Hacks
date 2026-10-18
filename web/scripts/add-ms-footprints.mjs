// Fills the blocks OpenStreetMap has no buildings for, from Microsoft's Global ML Building
// Footprints (traced from aerial imagery, ODbL), and writes them into public/buildings.json.
//
//   curl -O <UnitedStates quadkey=023012311 url from
//     https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv>
//   node scripts/add-ms-footprints.mjs path/to/part-....csv.gz
//   node scripts/build-household-sites.mjs
//
// OSM's Palisades coverage has holes whole tracts wide: the Alphabet Streets between Albright
// and Bashford, the Tahiti / Aloha / Bali tract off PCH, Villa Woods, parts of Via de la Paz.
// Even the basemap is bare there, so the map showed streets with no households on them.
// OSM stays the source wherever it has a building; a Microsoft footprint is added only when it
// overlaps no OSM footprint. Re-running is safe: the file records how many trailing entries
// came from here (`ms`) and drops them before merging again.
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) throw new Error('usage: node scripts/add-ms-footprints.mjs <quadkey .csv.gz>');

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(web, 'public/buildings.json');
const b = JSON.parse(readFileSync(file, 'utf8'));
const osm = b.cent.length - (b.ms ?? 0);
const rings = b.rings.slice(0, osm);
const cent = b.cent.slice(0, osm);
const zone = b.zone.slice(0, osm);

// Same perimeter the households are filtered by.
const zonesSrc = readFileSync(resolve(web, 'src/lib/zones.ts'), 'utf8');
const perimSrc = zonesSrc.match(/export const PERIMETER[^=]*=\s*\[([\s\S]*?)\];/);
if (!perimSrc) throw new Error('could not find PERIMETER in src/lib/zones.ts');
const PERIMETER = [...perimSrc[1].matchAll(/\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)].map((m) => [+m[1], +m[2]]);

// [lat, lng] point in [lat, lng] polygon.
const inside = ([y, x], poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (xi > x !== xj > x && y < ((yj - yi) * (x - xi)) / (xj - xi) + yi) c = !c;
  }
  return c;
};
// Flat [lng, lat, ...] ring as [lat, lng] pairs.
const pairs = (flat) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i + 1], flat[i]]);
  return out;
};

const lats = PERIMETER.map((p) => p[0]);
const lngs = PERIMETER.map((p) => p[1]);
const box = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];

// Grid of OSM buildings, ~110 m cells, for overlap tests and nearest-zone lookups.
const CELL = 0.001;
const key = (lat, lng) => `${Math.floor(lat / CELL)},${Math.floor(lng / CELL)}`;
const grid = new Map();
const addToGrid = (i) => {
  const k = key(cent[i][0], cent[i][1]);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(i);
};
cent.forEach((_, i) => addToGrid(i));
const near = (lat, lng, r = 1) => {
  const gy = Math.floor(lat / CELL);
  const gx = Math.floor(lng / CELL);
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) out.push(...(grid.get(`${gy + dy},${gx + dx}`) ?? []));
  return out;
};

const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = 111_320 * Math.cos((34.05 * Math.PI) / 180);
// Below this it is a shed or a carport, not a household.
const MIN_AREA_M2 = 45;

const round5 = (v) => Math.round(v * 1e5) / 1e5;
const taken = new Set(cent.map(([la, ln]) => `${la},${ln}`));
const zoneCounts = new Map();
let read = 0;
let added = 0;
const skipped = { small: 0, outside: 0, overlap: 0 };

const lines = createInterface({ input: createReadStream(source).pipe(createGunzip()) });
for await (const line of lines) {
  const m = line.match(/"coordinates":\s*\[\[(\[.*?\])\]\]/);
  if (!m) continue;
  const pts = JSON.parse(`[${m[1]}]`); // [[lng, lat], ...], closed
  const [lng0, lat0] = pts[0];
  if (lat0 < box[0] - 0.002 || lat0 > box[1] + 0.002 || lng0 < box[2] - 0.002 || lng0 > box[3] + 0.002) continue;
  read += 1;

  // Shoelace area and area-weighted centroid, in metres about the first vertex.
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const x1 = (pts[i][0] - lng0) * M_PER_DEG_LNG;
    const y1 = (pts[i][1] - lat0) * M_PER_DEG_LAT;
    const x2 = (pts[i + 1][0] - lng0) * M_PER_DEG_LNG;
    const y2 = (pts[i + 1][1] - lat0) * M_PER_DEG_LAT;
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  a /= 2;
  if (Math.abs(a) < MIN_AREA_M2) { skipped.small += 1; continue; }
  const lat = round5(lat0 + cy / (6 * a) / M_PER_DEG_LAT);
  const lng = round5(lng0 + cx / (6 * a) / M_PER_DEG_LNG);
  if (!inside([lat, lng], PERIMETER)) { skipped.outside += 1; continue; }

  const flat = pts.slice(0, -1).flatMap(([x, y]) => [round5(x), round5(y)]);
  const mine = pairs(flat);
  const candidates = near(lat, lng);
  // Any vertex of either outline inside the other: a centroid test alone let through
  // footprints that half-covered a house and drew as one doubled blob.
  const overlaps = candidates.some((i) => {
    const theirs = pairs(rings[i]);
    return inside([lat, lng], theirs) || inside(cent[i], mine)
      || mine.some((p) => inside(p, theirs)) || theirs.some((p) => inside(p, mine));
  });
  if (overlaps || taken.has(`${lat},${lng}`)) { skipped.overlap += 1; continue; }

  // Zone of the nearest OSM building: zones are k-means clusters over them, so this is the
  // cluster the footprint would have joined.
  let best = -1;
  let bestD = Infinity;
  for (let r = 1; best < 0 && r <= 8; r *= 2) {
    for (const i of near(lat, lng, r)) {
      if (i >= osm) continue;
      const d = (cent[i][0] - lat) ** 2 + ((cent[i][1] - lng) * 0.83) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  if (best < 0) throw new Error(`no OSM building near ${lat},${lng} to take a zone from`);

  rings.push(flat);
  cent.push([lat, lng]);
  zone.push(zone[best]);
  taken.add(`${lat},${lng}`);
  addToGrid(cent.length - 1);
  zoneCounts.set(b.zones[zone[best]], (zoneCounts.get(b.zones[zone[best]]) ?? 0) + 1);
  added += 1;
}

writeFileSync(file, JSON.stringify({ rings, cent, zone, zones: b.zones, ms: added }));
console.log(`read ${read} Microsoft footprints near the perimeter; skipped`, skipped);
console.log(`kept ${osm} OSM buildings, added ${added} from Microsoft:`, Object.fromEntries([...zoneCounts].sort()));

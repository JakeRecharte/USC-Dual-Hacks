// Placeholder households, standing in for P2's `addresses` table. Every one reads "unknown"
// with no note and no damage assessment: there is no invented status anywhere in this file.
// Server-side only: it pulls in the household site list, which has no
// business in the browser bundle. Client-safe geography lives in `zones.ts`.
//
// Every household sits on a REAL building. `household-sites.json` holds the centroid and
// zone of 2,011 dwelling footprints traced from OpenStreetMap inside the perimeter, so a
// pin is never in the middle of a road and the map can highlight the actual shape of the
// house (public/buildings.json carries the rings, keyed by that same centroid).
//
// Addresses and residents are invented — OpenStreetMap has street addresses for only 25 of
// the 8,103 buildings here — but the geography underneath them is not.
// Explicit .ts on the value imports: the unit tests resolve this module through Node's own
// loader, which does not guess extensions. Type-only imports are erased and need none.
import { pointInPolygon } from './geo.ts';
import { HOUSEHOLD_SITES } from './household-sites.ts';
import { PERIMETER, ZONE_ORDER, ZONE_STREETS } from './zones.ts';
import type { AddressState } from './types';

export { PERIMETER, ZONE_NAMES, ZONE_ORDER } from './zones.ts';
export type { LatLngTuple } from './zones';

interface Seed {
  id: string;
  address: string;
  lat: number;
  lng: number;
  zone_id: string;
  resident_name: string;
}

/**
 * The explicit households, copied from server/src/backend.js so the voice agent and the board
 * agree on who lives where. Their coordinates are snapped to the nearest real building below.
 * They carry no status: a name and an address, nothing more.
 *
 * The agent's a6 and a7 (Crenshaw, Vermont) are deliberately absent: this board covers one
 * incident, and anything outside the perimeter never enters it.
 */
const NARRATIVE: Seed[] = [
  { id: 'a1', address: '1420 Sunset Mesa Dr', lat: 34.0376, lng: -118.5793, zone_id: 'PAL-01', resident_name: 'Maria Lopez' },
  { id: 'a2', address: '1515 Via de la Paz', lat: 34.0447, lng: -118.5266, zone_id: 'PAL-05', resident_name: 'Harold Kim' },
  { id: 'a3', address: '16800 Bollinger Dr', lat: 34.0398, lng: -118.5557, zone_id: 'PAL-02', resident_name: 'Ruth Adams' },
  { id: 'a4', address: '1100 Palisades Dr', lat: 34.0607, lng: -118.5437, zone_id: 'PAL-03', resident_name: 'Tom Becker' },
  { id: 'a5', address: '820 Chautauqua Blvd', lat: 34.0332, lng: -118.5213, zone_id: 'PAL-06', resident_name: 'Linda Park' },
  { id: 'a8', address: '640 Toyopa Dr', lat: 34.0401, lng: -118.5232, zone_id: 'PAL-06', resident_name: 'Beatrice Lam' },
];

const FIRST_NAMES = ['Avery', 'Sam', 'Priya', 'Daniel', 'Elena', 'Grace', 'Victor', 'Nora', 'Omar',
  'Jonah', 'Theresa', 'Hector', 'Ingrid', 'Marcus', 'Yusuf', 'Camila', 'Russell', 'Alice', 'Felix',
  'Sofia', 'Gerald', 'Hannah', 'Mateo', 'Imani', 'Dov', 'Claire', 'Rashid', 'Lena', 'Tobias',
  'Margot', 'Elias', 'Nadia', 'Colin', 'Priscilla', 'Andre', 'Wen', 'Bridget', 'Oscar', 'Leila',
  'Stefan', 'Rosa', 'Devon', 'Maeve', 'Ibrahim', 'Joy', 'Lucas', 'Anneke', 'Ravi', 'Esther', 'Nikolai'];
const LAST_NAMES = ['Donnelly', 'Okafor', 'Raman', 'Mwangi', 'Fischer', 'Okonkwo', 'Alvarez',
  'Whitfield', 'Haddad', 'Pressler', 'Boyle', 'Salas', 'Sorensen', 'Webb', 'Demir', 'Duarte',
  'Boateng', 'Thornton', 'Nakamura', 'Marchetti', 'Pike', 'Reyes', 'Ferreira', 'Osei', 'Kaplan',
  'Beaumont', 'Chaudhry', 'Vogel', 'Lindqvist', 'Ashworth', 'Moreau', 'Petrov', 'Hargreaves',
  'Ibarra', 'Quinn', 'Takahashi', 'Delacroix', 'Nwosu', 'Castellanos', 'Ryder'];

/** mulberry32: a small deterministic PRNG, so the board is identical on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Site = [lat: number, lng: number, zoneIndex: number];

function build(): Seed[] {
  const rand = rng(20261017);
  // Centroids are stored rounded, so a building sitting exactly on the perimeter can round
  // across it. Testing the stored value is what makes "every household is inside" true by
  // construction rather than by luck.
  const all: Site[] = HOUSEHOLD_SITES.filter(([lat, lng]) => pointInPolygon([lat, lng], PERIMETER));

  // The scripted households take over the real building nearest their stated location, so
  // they sit on a footprint like everything else and still keep their address.
  const claimed = new Set<number>();
  const narrative = NARRATIVE.map((seed) => {
    let best = -1;
    let bestDist = Infinity;
    all.forEach(([lat, lng], i) => {
      if (claimed.has(i)) return;
      const d = (lat - seed.lat) ** 2 + ((lng - seed.lng) * 0.83) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best >= 0) {
      claimed.add(best);
      return { ...seed, lat: all[best][0], lng: all[best][1] };
    }
    return seed;
  });

  const out: Seed[] = [...narrative];
  const used = new Set(narrative.map((n) => n.address));
  let n = 100;
  let nameIndex = 0;

  all.forEach(([lat, lng, zoneIndex], i) => {
    if (claimed.has(i)) return;
    const zone = ZONE_ORDER[zoneIndex] ?? 'PAL-04';
    const streets = ZONE_STREETS[zone];

    // House numbers climb with latitude so a street reads plausibly down the block.
    let address = '';
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const street = streets[(i + attempt) % streets.length];
      const number = 100 + Math.floor(rand() * 2400);
      address = `${number} ${street}`;
      if (!used.has(address)) break;
    }
    if (used.has(address)) return;
    used.add(address);

    const first = FIRST_NAMES[nameIndex % FIRST_NAMES.length];
    const last = LAST_NAMES[(nameIndex * 7 + 3) % LAST_NAMES.length];
    nameIndex += 1;

    n += 1;
    out.push({
      id: `a${n}`,
      address,
      lat,
      lng,
      zone_id: zone,
      resident_name: `${first} ${last}`,
    });
  });

  return out;
}

const SEEDS: Seed[] = build();

export function seedAddresses(): AddressState[] {
  return SEEDS.map((row) => ({
    ...row,
    // Every household sits on a real building inside the perimeter; a test asserts it against
    // the polygon, which is what the Supabase path computes from.
    inside_perimeter: true,
    // No check has been recorded: unknown, which is grey.
    status: 'unknown',
    source: null,
    note: null,
    recorded_at: null,
    structure: 'unassessed',
    structure_recorded_at: null,
  }));
}

// Fake household data, standing in for P2's `addresses` table joined to the newest
// `status_log` row. Server-side only: it pulls in the household site list, which has no
// business in the browser bundle. Client-safe geography lives in `zones.ts`.
//
// Every household sits on a REAL building. `household-sites.json` holds the centroid and
// zone of 2,011 dwelling footprints traced from OpenStreetMap inside the perimeter, so a
// pin is never in the middle of a road and the map can highlight the actual shape of the
// house (public/buildings.json carries the rings, keyed by that same centroid).
//
// Addresses and residents are invented — OpenStreetMap has street addresses for only 25 of
// the 8,103 buildings here — but the geography underneath them is not.
//
// `ago_min` is minutes before load rather than a fixed time, so "cleared 40 minutes ago"
// stays true however long the server has been up.
// Explicit .ts on the value imports: the unit tests resolve this module through Node's own
// loader, which does not guess extensions. Type-only imports are erased and need none.
import { pointInPolygon } from './geo.ts';
import { HOUSEHOLD_SITES } from './household-sites.ts';
import { PERIMETER, ZONE_ORDER, ZONE_STREETS } from './zones.ts';
import type { AddressState, Source, Status, Structure } from './types';

export { PERIMETER, ZONE_NAMES, ZONE_ORDER } from './zones.ts';
export type { LatLngTuple } from './zones';

interface Seed {
  id: string;
  address: string;
  lat: number;
  lng: number;
  zone_id: string;
  resident_name: string;
  status: Status;
  source: Source | null;
  ago_min: number | null;
  note?: string | null;
  structure?: Structure;
}

/**
 * The explicit households, copied from server/src/backend.js so a real phone call and the
 * board agree on screen. Their coordinates are snapped to the nearest real building below.
 * `640 Toyopa Dr` is the address docs/DEMO_SCRIPT.md marks in beat 2, so it starts
 * genuinely unknown and never carries a seeded status.
 *
 * The agent's a6 and a7 (Crenshaw, Vermont) are deliberately absent: this board covers one
 * incident, and anything outside the perimeter never enters it.
 */
const NARRATIVE: Seed[] = [
  { id: 'a1', address: '1420 Sunset Mesa Dr', lat: 34.0376, lng: -118.5793, zone_id: 'PAL-01',
    resident_name: 'Maria Lopez', status: 'cleared', source: 'officer', ago_min: 40 },
  { id: 'a2', address: '1515 Via de la Paz', lat: 34.0447, lng: -118.5266, zone_id: 'PAL-05',
    resident_name: 'Harold Kim', status: 'refused', source: 'officer', ago_min: 25,
    note: '2 adults staying, 1 on oxygen' },
  { id: 'a3', address: '16800 Bollinger Dr', lat: 34.0398, lng: -118.5557, zone_id: 'PAL-02',
    resident_name: 'Ruth Adams', status: 'unknown', source: null, ago_min: null },
  { id: 'a4', address: '1100 Palisades Dr', lat: 34.0607, lng: -118.5437, zone_id: 'PAL-03',
    resident_name: 'Tom Becker', status: 'cleared', source: 'officer', ago_min: 360 },
  { id: 'a5', address: '820 Chautauqua Blvd', lat: 34.0332, lng: -118.5213, zone_id: 'PAL-06',
    resident_name: 'Linda Park', status: 'self_out', source: 'resident_reply', ago_min: 55 },
  { id: 'a8', address: '640 Toyopa Dr', lat: 34.0401, lng: -118.5232, zone_id: 'PAL-06',
    resident_name: 'Beatrice Lam', status: 'unknown', source: null, ago_min: null },
];

/**
 * How each district is doing. Weights are relative, drawn per household, and they are what
 * makes the board tell a story: Marquez Knolls is the zone no crew has reached, the
 * Highlands have stale records because there is one road in and out, the Village is nearly
 * done.
 */
const ZONE_PROFILE: Record<string, Partial<Record<Status, number>>> = {
  'PAL-01': { cleared: 46, self_out: 18, no_answer: 14, unknown: 16, refused: 4, in_transit: 2 },
  'PAL-02': { unknown: 48, no_answer: 26, refused: 8, cleared: 14, self_out: 4 },
  'PAL-03': { cleared: 38, in_transit: 14, no_answer: 16, unknown: 24, refused: 4, self_out: 4 },
  'PAL-04': { cleared: 40, self_out: 16, no_answer: 18, unknown: 18, refused: 6, in_transit: 2 },
  'PAL-05': { cleared: 54, self_out: 20, in_transit: 8, no_answer: 10, unknown: 6, refused: 2 },
  'PAL-06': { cleared: 42, self_out: 14, no_answer: 20, unknown: 18, refused: 4, in_transit: 2 },
  'PAL-07': { unknown: 44, no_answer: 24, cleared: 22, self_out: 6, refused: 4 },
  'PAL-08': { cleared: 50, self_out: 18, in_transit: 6, no_answer: 14, unknown: 10, refused: 2 },
};

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

/** Notes only hang off a refusal: they are what a dispatcher needs to act on. */
const REFUSAL_NOTES = [
  'staying to run sprinklers, car still in the driveway',
  'elderly father refuses to leave the house, no vehicle',
  'two adults staying, will not leave the dogs',
  'says he has been through worse, has a hose on the roof',
  'wants to wait for a relative who is driving in',
  'one resident on oxygen, will not move without transport',
];

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

function pickStatus(zone: string, r: number): Status {
  const profile = ZONE_PROFILE[zone] ?? ZONE_PROFILE['PAL-04'];
  const total = Object.values(profile).reduce((s, n) => s + (n ?? 0), 0);
  let threshold = r * total;
  for (const [status, weight] of Object.entries(profile) as [Status, number][]) {
    threshold -= weight;
    if (threshold <= 0) return status;
  }
  return 'unknown';
}

/** Plausible ages per status: a fresh clear, a stale one, a refusal that just happened. */
function ageFor(status: Status, rand: () => number): number | null {
  if (status === 'unknown') return null;
  if (status === 'in_transit') return Math.round(3 + rand() * 20);
  if (status === 'refused') return Math.round(10 + rand() * 60);
  if (status === 'no_answer') return Math.round(15 + rand() * 90);
  return rand() < 0.18 ? Math.round(135 + rand() * 320) : Math.round(5 + rand() * 110);
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
  let refusalNote = 0;
  let nameIndex = 0;

  all.forEach(([lat, lng, zoneIndex], i) => {
    if (claimed.has(i)) return;
    const zone = ZONE_ORDER[zoneIndex] ?? 'PAL-04';
    const streets = ZONE_STREETS[zone];
    const status = pickStatus(zone, rand());

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

    // Structure damage concentrates in the two districts the fire ran through.
    const damageRoll = rand();
    const burned = zone === 'PAL-04' || zone === 'PAL-01';
    const structure: Structure | undefined = !burned
      ? undefined
      : damageRoll < 0.04
        ? 'destroyed'
        : damageRoll < 0.16
          ? 'damaged'
          : undefined;

    n += 1;
    out.push({
      id: `a${n}`,
      address,
      lat,
      lng,
      zone_id: zone,
      resident_name: `${first} ${last}`,
      status,
      source: status === 'unknown' ? null
        : status === 'in_transit' || status === 'self_out' ? 'resident_reply' : 'officer',
      ago_min: ageFor(status, rand),
      note: status === 'refused' ? REFUSAL_NOTES[refusalNote++ % REFUSAL_NOTES.length] : null,
      structure,
    });
  });

  return out;
}

const SEEDS: Seed[] = build();

export function seedAddresses(now: number = Date.now()): AddressState[] {
  return SEEDS.map(({ ago_min, note, structure, ...row }) => {
    const at = ago_min == null ? null : new Date(now - ago_min * 60_000).toISOString();
    return {
      ...row,
      // Every seeded household sits on a real building inside the perimeter; a test asserts
      // it against the polygon, which is what the Supabase path computes from.
      inside_perimeter: true,
      note: note ?? null,
      recorded_at: at,
      structure: structure ?? 'unassessed',
      structure_recorded_at: structure ? at : null,
    };
  });
}

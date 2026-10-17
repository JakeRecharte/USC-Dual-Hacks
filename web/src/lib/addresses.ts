// Fake household data for the board, standing in for P2's `addresses` table joined to the
// newest `status_log` row. Replace `seedAddresses()` with a Supabase read; nothing else
// changes. See docs/SUPABASE_SETUP.md §3 for the generated seed SQL.
//
// Geography is the real Pacific Palisades: the perimeter traces the neighbourhood from the
// coast up into Santa Ynez Canyon, and the zones are its actual districts, with street names
// to match. `inside_perimeter` is never stored — it is computed from this polygon, so the
// two cannot disagree (lib/geo.ts).
//
// The first eight households are explicit and must stay that way. Seven mirror
// server/src/backend.js exactly — same addresses, residents, statuses and ages — so a real
// phone call and the board agree on screen. The eighth is the one the demo script marks.
// Everything else is generated from per-zone street lists with a fixed seed, so the board is
// the same on every run and the demo's pre-flight numbers cannot drift.
//
// `ago_min` is minutes before load rather than a fixed time, so "cleared 40 minutes ago"
// stays true however long the server has been up.
import type { AddressState, Source, Status, Structure } from './types';

export type LatLngTuple = [number, number];

/**
 * The active fire perimeter: the `perimeter` polygon in the data contract. Traced around
 * Pacific Palisades from the coast at Topanga, north into Santa Ynez Canyon and the state
 * park edge, then east to the Santa Monica line and back along the shore.
 */
export const PERIMETER: LatLngTuple[] = [
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

interface ZoneSpec {
  id: string;
  name: string;
  center: LatLngTuple;
  /** Degrees of scatter around the centre; roughly the district's radius. */
  spread: number;
  streets: string[];
  /** How many households carry each status. Shapes what the board looks like. */
  mix: Partial<Record<Status, number>>;
}

/** The eight districts inside the perimeter, worst-covered last in the demo narrative. */
const ZONES: ZoneSpec[] = [
  {
    id: 'PAL-01',
    name: 'Castellammare & Sunset Mesa',
    center: [34.0388, -118.5775],
    spread: 0.0055,
    streets: ['Castellammare Dr', 'Posetano Rd', 'Tramonto Dr', 'Revello Dr', 'Breve Way', 'Porto Marina Way'],
    mix: { cleared: 5, self_out: 2, refused: 1, no_answer: 1 },
  },
  {
    id: 'PAL-02',
    name: 'Marquez Knolls',
    center: [34.0412, -118.5545],
    spread: 0.0050,
    streets: ['Marquez Ave', 'Livorno Dr', 'Charmel Ln', 'Akron St', 'Oracle Pl', 'Ida Ave'],
    // The zone no crew has reached. This is the one the board should light up.
    mix: { unknown: 5, no_answer: 2, refused: 1 },
  },
  {
    id: 'PAL-03',
    name: 'Palisades Highlands',
    center: [34.0648, -118.5460],
    spread: 0.0062,
    streets: ['Vereda de la Montura', 'Chastain Pkwy', 'Michael Ln', 'Avenida de Santa Ynez', 'Calle Arbolada', 'Enchanted Way'],
    // One road in and out, so stale records matter most here.
    mix: { cleared: 4, in_transit: 2, unknown: 2, no_answer: 1 },
  },
  {
    id: 'PAL-04',
    name: 'Alphabet Streets',
    center: [34.0478, -118.5330],
    spread: 0.0055,
    streets: ['Albright Ave', 'Bashford St', 'Carey St', 'Dryad Rd', 'El Medio Ave', 'Fiske St', 'Galloway St', 'Hartzell St', 'Iliff St', 'Jacon Way', 'Kagawa St', 'Northfield St'],
    mix: { cleared: 6, self_out: 2, refused: 1, no_answer: 2, unknown: 1 },
  },
  {
    id: 'PAL-05',
    name: 'Palisades Village',
    center: [34.0452, -118.5258],
    spread: 0.0042,
    streets: ['Antioch St', 'Swarthmore Ave', 'Haverford Ave', 'La Cruz Dr', 'Monument St', 'Radcliffe Ave'],
    mix: { cleared: 5, self_out: 2, in_transit: 1, no_answer: 1 },
  },
  {
    id: 'PAL-06',
    name: 'Huntington Palisades',
    center: [34.0392, -118.5210],
    spread: 0.0048,
    streets: ['Alma Real Dr', 'Ocampo Dr', 'Corto Pl', 'Pampas Ricas Blvd', 'Frontera Dr', 'El Cerco Pl'],
    mix: { cleared: 4, self_out: 1, no_answer: 2, unknown: 1 },
  },
  {
    id: 'PAL-07',
    name: 'Rustic Canyon',
    center: [34.0488, -118.5105],
    spread: 0.0045,
    streets: ['Latimer Rd', 'Brooktree Rd', 'Mesa Rd', 'Haldeman Rd', 'Sage Ln', 'Rivas Canyon Rd'],
    // Deep canyon, poor signal, slow to reach.
    mix: { unknown: 4, no_answer: 2, cleared: 1 },
  },
  {
    id: 'PAL-08',
    name: 'Santa Monica Canyon & Riviera',
    center: [34.0372, -118.5055],
    spread: 0.0055,
    streets: ['Entrada Dr', 'Mabery Rd', 'Amalfi Dr', 'Channel Rd', 'East Rustic Rd', 'Corsica Dr', 'Umeo Rd'],
    mix: { cleared: 6, self_out: 2, in_transit: 1 },
  },
];

export const ZONE_NAMES: Record<string, string> = Object.fromEntries(
  ZONES.map((z) => [z.id, z.name]),
);

/** The order zones appear in, for the officer's zone strip. */
export const ZONE_ORDER: string[] = ZONES.map((z) => z.id);

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
 * The explicit households. a1–a5 are copied from server/src/backend.js and must not drift
 * from it; `640 Toyopa Dr` is the address docs/DEMO_SCRIPT.md marks in beat 2, so it starts
 * genuinely unknown and never carries a seeded status.
 *
 * The agent's a6 and a7 (Crenshaw, Vermont) are deliberately absent: this board covers one
 * incident, and anything outside the perimeter is not its business. The agent still handles
 * those calls — it just does not put them on this map. Ids stay as they are so the two
 * systems still name the same households.
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

const FIRST_NAMES = ['Avery', 'Sam', 'Priya', 'Daniel', 'Elena', 'Grace', 'Victor', 'Nora', 'Omar',
  'Jonah', 'Theresa', 'Hector', 'Ingrid', 'Marcus', 'Yusuf', 'Camila', 'Russell', 'Alice', 'Felix',
  'Sofia', 'Gerald', 'Hannah', 'Mateo', 'Imani', 'Dov', 'Claire', 'Rashid', '.Lena', 'Tobias',
  'Margot', 'Elias', 'Nadia', 'Colin', 'Priscilla', 'Andre', 'Wen', 'Bridget', 'Oscar', 'Leila',
  'Stefan', 'Rosa', 'Devon', 'Maeve', 'Ibrahim', 'Joy', 'Lucas', 'Anneke', 'Ravi', 'Esther', 'Nikolai'];
const LAST_NAMES = ['Donnelly', 'Okafor', 'Raman', 'Mwangi', 'Fischer', 'Okonkwo', 'Alvarez',
  'Whitfield', 'Haddad', 'Pressler', 'Boyle', 'Salas', 'Sorensen', 'Webb', 'Demir', 'Duarte',
  'Boateng', 'Thornton', 'Nakamura', 'Marchetti', 'Pike', 'Reyes', 'Ferreira', 'Osei', 'Kaplan',
  'Beaumont', 'Chaudhry', 'Vogel', 'Lindqvist', 'Ashworth', 'Moreau', 'Petrov', 'Hargreaves',
  'Ibarra', 'Quinn', 'Takahashi', 'Delacroix', 'Nwosu', 'Castellanos', 'Ryder'];

/** Notes only ever hang off a refusal: they are what a dispatcher needs to act on. */
const REFUSAL_NOTES = [
  'staying to run sprinklers, car still in the driveway',
  'elderly father refuses to leave the house, no vehicle',
  'two adults staying, will not leave the dogs',
  'says he has been through worse, has a hose on the roof',
  'wants to wait for a relative who is driving in',
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

/** Plausible ages per status: a fresh clear, a stale one, a refusal that just happened. */
function ageFor(status: Status, rand: () => number): number | null {
  if (status === 'unknown') return null;
  if (status === 'in_transit') return Math.round(3 + rand() * 20);
  if (status === 'refused') return Math.round(10 + rand() * 60);
  if (status === 'no_answer') return Math.round(15 + rand() * 90);
  // cleared and self_out: mostly fresh, but one in four is stale enough to go amber again.
  return rand() < 0.18 ? Math.round(135 + rand() * 320) : Math.round(5 + rand() * 110);
}

function generate(): Seed[] {
  const rand = rng(20261017);
  const out: Seed[] = [];
  // Continue past the highest explicit id rather than counting them, so ids stay stable
  // even though a6 and a7 are not on this board.
  let n = Math.max(...NARRATIVE.map((s) => Number(s.id.slice(1))));
  let refusalNote = 0;
  let nameIndex = 0;

  for (const zone of ZONES) {
    const entries = (Object.entries(zone.mix) as [Status, number][]).flatMap(([status, count]) =>
      Array.from({ length: count }, () => status),
    );

    entries.forEach((status, i) => {
      n += 1;
      const street = zone.streets[i % zone.streets.length];
      // House numbers climb with the street index so a block reads plausibly.
      const number = 100 * (1 + (i % 9)) + Math.floor(rand() * 90) * 2;
      const first = FIRST_NAMES[nameIndex % FIRST_NAMES.length].replace('.', '');
      const last = LAST_NAMES[(nameIndex * 7 + 3) % LAST_NAMES.length];
      nameIndex += 1;

      // Scatter around the district centre, biased towards it so zones read as clusters.
      const angle = rand() * Math.PI * 2;
      const radius = zone.spread * Math.sqrt(rand());
      const lat = zone.center[0] + radius * Math.sin(angle);
      // Longitude degrees are shorter than latitude degrees at this latitude.
      const lng = zone.center[1] + (radius * Math.cos(angle)) / Math.cos((lat * Math.PI) / 180);

      // A few homes in the two hardest-hit districts show structure damage.
      // Partial damage is far commoner than total loss, so the thresholds are lopsided.
      const damageRoll = rand();
      const canBurn = zone.id === 'PAL-04' || zone.id === 'PAL-01';
      const structure: Structure | undefined = !canBurn
        ? undefined
        : damageRoll < 0.05
          ? 'destroyed'
          : damageRoll < 0.3
            ? 'damaged'
            : undefined;

      out.push({
        id: `a${n}`,
        address: `${number} ${street}`,
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
        zone_id: zone.id,
        resident_name: `${first} ${last}`,
        status,
        source: status === 'unknown' ? null : status === 'in_transit' || status === 'self_out' ? 'resident_reply' : 'officer',
        ago_min: ageFor(status, rand),
        note: status === 'refused' ? REFUSAL_NOTES[refusalNote++ % REFUSAL_NOTES.length] : null,
        structure,
      });
    });
  }

  return out;
}

const SEEDS: Seed[] = [...NARRATIVE, ...generate()];

export function seedAddresses(now: number = Date.now()): AddressState[] {
  return SEEDS.map(({ ago_min, note, structure, ...row }) => {
    const at = ago_min == null ? null : new Date(now - ago_min * 60_000).toISOString();
    return {
      ...row,
      // Every seeded household is inside by construction; a test asserts it against the
      // polygon, which is what the Supabase path computes from.
      inside_perimeter: true,
      note: note ?? null,
      recorded_at: at,
      structure: structure ?? 'unassessed',
      // A structure read is only ever as old as the status read that carried it.
      structure_recorded_at: structure ? at : null,
    };
  });
}

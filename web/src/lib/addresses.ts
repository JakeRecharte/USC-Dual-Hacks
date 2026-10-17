// Fake zone data for the board, standing in for P2's `addresses` table + newest `status_log`
// row per address. Replace `seedAddresses()` with a Supabase read; nothing else changes.
//
// The first seven rows are the scripted demo addresses from server/src/backend.js, with the
// same resident names, statuses and ages, so a real phone call and the board agree.
//
// `ago_min` is minutes before load, not a fixed timestamp, so "cleared 40 minutes ago" stays
// true however long the server has been up (same trick as the telephony server).
import type { AddressState, Source, Status, Structure } from './types';

interface Seed {
  id: string;
  address: string;
  lat: number;
  lng: number;
  zone_id: string;
  resident_name: string;
  inside_perimeter: boolean;
  status: Status;
  source: Source | null;
  ago_min: number | null;
  note?: string | null;
  structure?: Structure;
}

const SEEDS: Seed[] = [
  // --- The seven scripted cases. Keep in sync with server/src/backend.js. ---
  { id: 'a1', address: '1420 Sunset Mesa Dr', lat: 34.0376, lng: -118.5793, zone_id: 'PAC-1',
    resident_name: 'Maria Lopez', inside_perimeter: true, status: 'cleared', source: 'officer', ago_min: 40 },
  { id: 'a2', address: '1515 Via de la Paz', lat: 34.0447, lng: -118.5266, zone_id: 'PAC-2',
    resident_name: 'Harold Kim', inside_perimeter: true, status: 'refused', source: 'officer', ago_min: 25,
    note: '2 adults staying, 1 on oxygen' },
  { id: 'a3', address: '16800 Bollinger Dr', lat: 34.0398, lng: -118.5557, zone_id: 'PAC-3',
    resident_name: 'Ruth Adams', inside_perimeter: true, status: 'unknown', source: null, ago_min: null },
  { id: 'a4', address: '1100 Palisades Dr', lat: 34.0607, lng: -118.5437, zone_id: 'PAC-4',
    resident_name: 'Tom Becker', inside_perimeter: true, status: 'cleared', source: 'officer', ago_min: 360 },
  { id: 'a5', address: '820 Chautauqua Blvd', lat: 34.0332, lng: -118.5213, zone_id: 'PAC-2',
    resident_name: 'Linda Park', inside_perimeter: true, status: 'self_out', source: 'resident_reply', ago_min: 55 },
  { id: 'a6', address: '4512 Crenshaw Blvd', lat: 34.0031, lng: -118.3349, zone_id: 'LAC-9',
    resident_name: 'Dorothy Hayes', inside_perimeter: false, status: 'unknown', source: null, ago_min: null },
  { id: 'a7', address: '910 N Vermont Ave', lat: 34.0902, lng: -118.2921, zone_id: 'LAE-2',
    resident_name: 'Kevin Nguyen', inside_perimeter: false, status: 'unknown', source: null, ago_min: null },

  // --- PAC-1, Sunset Mesa / Castellammare. Mostly worked through, one hold-out. ---
  { id: 'a8', address: '17320 Castellammare Dr', lat: 34.0391, lng: -118.5761, zone_id: 'PAC-1',
    resident_name: 'Avery Donnelly', inside_perimeter: true, status: 'cleared', source: 'officer', ago_min: 62 },
  { id: 'a9', address: '17450 Posetano Rd', lat: 34.0402, lng: -118.5748, zone_id: 'PAC-1',
    resident_name: 'Sam Okafor', inside_perimeter: true, status: 'self_out', source: 'resident_reply', ago_min: 88 },
  { id: 'a10', address: '17615 Tramonto Dr', lat: 34.0413, lng: -118.5729, zone_id: 'PAC-1',
    resident_name: 'Priya Raman', inside_perimeter: true, status: 'refused', source: 'officer', ago_min: 15,
    note: 'staying to run sprinklers, has a car in the driveway' },
  { id: 'a11', address: '17680 Breve Way', lat: 34.0369, lng: -118.5812, zone_id: 'PAC-1',
    resident_name: 'Daniel Mwangi', inside_perimeter: true, status: 'cleared', source: 'officer', ago_min: 71 },
  { id: 'a12', address: '17210 Revello Dr', lat: 34.0385, lng: -118.5776, zone_id: 'PAC-1',
    resident_name: 'Elena Fischer', inside_perimeter: true, status: 'no_answer', source: 'officer', ago_min: 34 },

  // --- PAC-2, the village. The most worked zone; includes the structure losses. ---
  { id: 'a13', address: '881 Antioch St', lat: 34.0459, lng: -118.5281, zone_id: 'PAC-2',
    resident_name: 'Grace Okonkwo', inside_perimeter: true, status: 'cleared', source: 'officer', ago_min: 48,
    structure: 'damaged' },
  { id: 'a14', address: '1032 Swarthmore Ave', lat: 34.0441, lng: -118.5297, zone_id: 'PAC-2',
    resident_name: 'Victor Alvarez', inside_perimeter: true, status: 'self_out', source: 'resident_reply', ago_min: 110,
    structure: 'destroyed' },
  { id: 'a15', address: '1145 Monument St', lat: 34.0428, lng: -118.5245, zone_id: 'PAC-2',
    resident_name: 'Nora Whitfield', inside_perimeter: true, status: 'cleared', source: 'officer', ago_min: 300 },
  { id: 'a16', address: '1290 Alma Real Dr', lat: 34.0466, lng: -118.5229, zone_id: 'PAC-2',
    resident_name: 'Omar Haddad', inside_perimeter: true, status: 'in_transit', source: 'resident_reply', ago_min: 9 },
  { id: 'a17', address: '640 Toyopa Dr', lat: 34.0415, lng: -118.5302, zone_id: 'PAC-2',
    resident_name: 'Beatrice Lam', inside_perimeter: true, status: 'unknown', source: null, ago_min: null },
  { id: 'a18', address: '718 Fiske St', lat: 34.0403, lng: -118.5331, zone_id: 'PAC-2',
    resident_name: 'Jonah Pressler', inside_perimeter: true, status: 'cleared', source: 'officer', ago_min: 95,
    structure: 'damaged' },
  { id: 'a19', address: '955 Radcliffe Ave', lat: 34.0437, lng: -118.5338, zone_id: 'PAC-2',
    resident_name: 'Theresa Boyle', inside_perimeter: true, status: 'no_answer', source: 'officer', ago_min: 52 },

  // --- PAC-3, Marquez / Bollinger. Thinly covered: the zone the board should light up. ---
  { id: 'a20', address: '16725 Marquez Ave', lat: 34.0412, lng: -118.5541, zone_id: 'PAC-3',
    resident_name: 'Hector Salas', inside_perimeter: true, status: 'unknown', source: null, ago_min: null },
  { id: 'a21', address: '16540 Livorno Dr', lat: 34.0381, lng: -118.5578, zone_id: 'PAC-3',
    resident_name: 'Ingrid Sorensen', inside_perimeter: true, status: 'no_answer', source: 'officer', ago_min: 78 },
  { id: 'a22', address: '16902 Oracle Pl', lat: 34.0424, lng: -118.5523, zone_id: 'PAC-3',
    resident_name: 'Marcus Webb', inside_perimeter: true, status: 'unknown', source: null, ago_min: null },
  { id: 'a23', address: '17045 Lachman Ln', lat: 34.0437, lng: -118.5509, zone_id: 'PAC-3',
    resident_name: 'Yusuf Demir', inside_perimeter: true, status: 'refused', source: 'officer', ago_min: 41,
    note: 'elderly father refuses to leave the house, no vehicle' },
  { id: 'a24', address: '16388 Akron St', lat: 34.0366, lng: -118.5595, zone_id: 'PAC-3',
    resident_name: 'Camila Duarte', inside_perimeter: true, status: 'cleared', source: 'officer', ago_min: 420 },
  { id: 'a25', address: '16610 Charmel Ln', lat: 34.0393, lng: -118.5531, zone_id: 'PAC-3',
    resident_name: 'Russell Boateng', inside_perimeter: true, status: 'unknown', source: null, ago_min: null },

  // --- PAC-4, the Highlands. One road in and out, so stale records matter most here. ---
  { id: 'a26', address: '1456 Vereda de la Montura', lat: 34.0631, lng: -118.5451, zone_id: 'PAC-4',
    resident_name: 'Alice Thornton', inside_perimeter: true, status: 'cleared', source: 'officer', ago_min: 275 },
  { id: 'a27', address: '1620 Chastain Pkwy', lat: 34.0654, lng: -118.5468, zone_id: 'PAC-4',
    resident_name: 'Felix Nakamura', inside_perimeter: true, status: 'in_transit', source: 'resident_reply', ago_min: 6 },
  { id: 'a28', address: '1288 Michael Ln', lat: 34.0596, lng: -118.5412, zone_id: 'PAC-4',
    resident_name: 'Sofia Marchetti', inside_perimeter: true, status: 'unknown', source: null, ago_min: null },
  { id: 'a29', address: '1702 Capri Dr', lat: 34.0668, lng: -118.5494, zone_id: 'PAC-4',
    resident_name: 'Gerald Pike', inside_perimeter: true, status: 'no_answer', source: 'officer', ago_min: 23 },
  { id: 'a30', address: '1340 Lorenzo Pl', lat: 34.0618, lng: -118.5423, zone_id: 'PAC-4',
    resident_name: 'Hannah Reyes', inside_perimeter: true, status: 'self_out', source: 'resident_reply', ago_min: 102 },
];

/** Human-readable names for the zone strip. */
export const ZONE_NAMES: Record<string, string> = {
  'PAC-1': 'Sunset Mesa',
  'PAC-2': 'Palisades Village',
  'PAC-3': 'Marquez Knolls',
  'PAC-4': 'Palisades Highlands',
  'LAC-9': 'Crenshaw (outside)',
  'LAE-2': 'East Hollywood (outside)',
};

/** The active fire perimeter, the `perimeter` GeoJSON polygon in the contract. */
export const PERIMETER: [number, number][] = [
  [34.0712, -118.5842],
  [34.0695, -118.5386],
  [34.0520, -118.5158],
  [34.0298, -118.5176],
  [34.0281, -118.5524],
  [34.0330, -118.5871],
];

export function seedAddresses(now: number = Date.now()): AddressState[] {
  return SEEDS.map(({ ago_min, note, structure, ...row }) => ({
    ...row,
    note: note ?? null,
    recorded_at: ago_min == null ? null : new Date(now - ago_min * 60_000).toISOString(),
    structure: structure ?? 'unassessed',
    // A structure read is only ever as old as the status read that carried it.
    structure_recorded_at:
      structure && ago_min != null ? new Date(now - ago_min * 60_000).toISOString() : null,
  }));
}

// Client-safe geography: the perimeter and the zone vocabulary, and nothing heavy.
// `addresses.ts` pulls in the household site list, which has no business in the browser
// bundle, so anything both sides need lives here instead.

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

/**
 * Index order must match `zones` in public/buildings.json, which is k-means cluster order
 * over the real building centroids, not alphabetical. Changing one without the other
 * silently moves every household into the wrong zone.
 */
export const ZONE_ORDER = [
  'PAL-04', 'PAL-08', 'PAL-02', 'PAL-07', 'PAL-06', 'PAL-01', 'PAL-03', 'PAL-05',
] as const;

/** Alphabetical, for the officer's zone strip and the dispatcher's zone row. */
export const ZONE_DISPLAY_ORDER = [...ZONE_ORDER].sort();

export const ZONE_NAMES: Record<string, string> = {
  'PAL-01': 'Castellammare & Sunset Mesa',
  'PAL-02': 'Marquez Knolls',
  'PAL-03': 'Palisades Highlands',
  'PAL-04': 'Alphabet Streets',
  'PAL-05': 'Palisades Village',
  'PAL-06': 'Huntington Palisades',
  'PAL-07': 'Rustic Canyon',
  'PAL-08': 'Santa Monica Canyon & Riviera',
};

/** Streets per zone, used to name the generated households. */
export const ZONE_STREETS: Record<string, string[]> = {
  'PAL-01': ['Castellammare Dr', 'Posetano Rd', 'Tramonto Dr', 'Revello Dr', 'Breve Way', 'Porto Marina Way', 'Sunset Mesa Dr'],
  'PAL-02': ['Marquez Ave', 'Bollinger Dr', 'Livorno Dr', 'Charmel Ln', 'Akron St', 'Oracle Pl', 'Ida Ave'],
  'PAL-03': ['Palisades Dr', 'Vereda de la Montura', 'Chastain Pkwy', 'Michael Ln', 'Avenida de Santa Ynez', 'Calle Arbolada', 'Enchanted Way'],
  'PAL-04': ['Albright Ave', 'Bashford St', 'Carey St', 'Dryad Rd', 'El Medio Ave', 'Fiske St', 'Galloway St', 'Hartzell St', 'Iliff St', 'Jacon Way', 'Kagawa St', 'Northfield St'],
  'PAL-05': ['Via de la Paz', 'Antioch St', 'Swarthmore Ave', 'Haverford Ave', 'La Cruz Dr', 'Monument St', 'Radcliffe Ave'],
  'PAL-06': ['Toyopa Dr', 'Alma Real Dr', 'Ocampo Dr', 'Corto Pl', 'Pampas Ricas Blvd', 'Frontera Dr', 'Chautauqua Blvd'],
  'PAL-07': ['Latimer Rd', 'Brooktree Rd', 'Mesa Rd', 'Haldeman Rd', 'Sage Ln', 'Rivas Canyon Rd'],
  'PAL-08': ['Entrada Dr', 'Mabery Rd', 'Amalfi Dr', 'Channel Rd', 'East Rustic Rd', 'Corsica Dr', 'Umeo Rd'],
};

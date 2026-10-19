// The fire front: where the Palisades Fire is at any minute of the scenario, drawn on the map as an
// outlined area filled with thin red stripes.
//
// What is real: the places and times in SEEDS below, each from the research (LAPD and LAFD
// after-action reports, AP). The fire is at that place by that minute, and the coordinates are the
// streets' own, from OpenStreetMap. What is simulated: the shape between those points and how it
// grows. Nobody published a perimeter for these hours that this board could draw, so the front is
// a wind-driven spread (fast downwind, slow across and back) from the ignition, plus the spot fires
// the reports describe jumping ahead of it, merged into one outline. It is an illustration of
// movement, not a map of the burn.
//
// It does not touch any household. A house's colour, its street's order and its calls come from the
// engine, not from where this outline is, so a house can sit inside the stripes before it is
// ordered out (which is what the AP reporting found: homes burning before the order).
//
// Deterministic: the same minute always gives the same outline. Value imports carry .ts because
// the tests load this through Node's own loader.
import { PERIMETER } from '../zones.ts';
import { at } from './palisades.ts';
import { hashString } from './rng.ts';

/** A closed ring of [lng, lat], first point repeated last, as GeoJSON wants it. */
export type FireRing = [number, number][];

/** The fire at one minute: zero or more separate burning areas. */
export interface FireFront {
  rings: FireRing[];
}

/** A place the fire is documented to be, and when it was there. */
export interface FireSeed {
  id: string;
  /** Minutes after 10:00. */
  t: number;
  lat: number;
  lng: number;
  /** Metres: how big the burning patch is the moment it is reported. A spot fire starts bigger than a spark. */
  r0: number;
  /** Minutes this patch keeps spreading before it stops adding area of its own. */
  grow: number;
  /** Minutes after that run that it keeps creeping, slowly, as crews hold the flanks. Defaults to none. */
  tail?: number;
  /** How fast it spreads next to the ignition's run (1). Spot fires and the evening burn are slower. */
  pace?: number;
  /** Degrees clockwise from north that it spreads toward. Defaults to the wind, south-southwest. */
  heading?: number;
  /** What the research says, in a line. */
  what: string;
  source: string;
}

export const SEEDS: FireSeed[] = [
  {
    id: 'ignition', t: at('10:23'), lat: 34.069, lng: -118.547, r0: 35, grow: 30, tail: 700,
    what: 'First report: fire west of Temescal Ridge Trail above Skull Rock, with the first call from Piedra Morada Dr',
    source: 'LAPD AAR p. 48; LAFD AAR p. 17',
  },
  {
    id: 'via-floresta', t: at('11:05'), lat: 34.0615, lng: -118.5459, r0: 60, grow: 25, pace: 0.35,
    what: 'Fire reaches Via Floresta and Floresta Pl (defended, mostly saved)',
    source: 'LAFD AAR p. 24; LAPD AAR p. 11',
  },
  {
    id: 'bienveneda', t: at('11:12'), lat: 34.0633, lng: -118.5426, r0: 60, grow: 25, pace: 0.35,
    what: 'Eastern flank reaches the cul-de-sac east of Bienveneda Ave',
    source: 'LAFD AAR p. 25',
  },
  {
    id: 'chastain', t: at('11:14'), lat: 34.0745, lng: -118.5483, r0: 60, grow: 30, pace: 0.3,
    what: 'Fire flanking within 120 ft of the homes on Chastain',
    source: 'LAFD AAR p. 25',
  },
  {
    id: 'lachman', t: at('11:22'), lat: 34.0595, lng: -118.5497, r0: 70, grow: 40, pace: 0.45,
    what: 'Spotting between Lachman Ln and Charmel Ln; homes burning on Lachman by 11:27',
    source: 'LAFD AAR p. 27; AP via PBS',
  },
  {
    id: 'palisades-dr-west', t: at('11:24'), lat: 34.0583, lng: -118.5555, r0: 55, grow: 40, pace: 0.4,
    what: 'Fire spotting on the west side of Palisades Dr',
    source: 'LAFD AAR p. 28',
  },
  {
    id: 'enchanted', t: at('11:24'), lat: 34.0514, lng: -118.549, r0: 80, grow: 60, tail: 300, pace: 0.45,
    what: 'Spot fires on Enchanted Way, with occupants evacuating',
    source: 'LAFD AAR p. 28',
  },
  {
    id: 'marquez', t: at('11:25'), lat: 34.0466, lng: -118.5465, r0: 80, grow: 60, tail: 300, pace: 0.45,
    what: 'Structures igniting in Marquez Knolls, Lower Marquez and Paseo de Miramar',
    source: 'LAFD AAR p. 28',
  },
  {
    id: 'calvary', t: at('11:59'), lat: 34.0479, lng: -118.5527, r0: 90, grow: 90, tail: 400, pace: 0.35,
    what: 'Fire on both sides of Palisades Dr near Calvary Christian School',
    source: 'LAPD AAR p. 50',
  },
  {
    id: 'palisades-dr-mid', t: at('13:06'), lat: 34.0637, lng: -118.558, r0: 90, grow: 100, tail: 300, pace: 0.3,
    what: 'Fire has overtaken both sides of Palisades Dr; drivers are told to leave their cars',
    source: 'LAPD AAR pp. 15, 51',
  },
  {
    id: 'sunset', t: at('13:06'), lat: 34.0444, lng: -118.5521, r0: 90, grow: 120, tail: 400, pace: 0.3,
    what: 'Drivers at Palisades Dr and Sunset told to leave their vehicles and go on foot',
    source: 'LAPD AAR p. 51',
  },
  {
    id: 'enchanted-homes', t: at('15:52'), lat: 34.0505, lng: -118.5495, r0: 60, grow: 200, pace: 0.25,
    what: 'Two large residence fires on the 1000 block of Enchanted Way, with live rounds going off in the fire',
    source: 'LAPD AAR p. 54',
  },
  {
    id: 'highlands-heel', t: at('18:30'), lat: 34.0715, lng: -118.5545, r0: 70, grow: 200, pace: 0.27, heading: 320,
    what: 'The fire\u2019s heel moves north, eventually affecting homes in the Highlands in the evening',
    source: 'LAFD AAR pp. 45, 50',
  },
  {
    id: 'highlands-west', t: at('21:30'), lat: 34.078, lng: -118.5667, r0: 100, grow: 100, pace: 0.27, heading: 320,
    what: 'Fire at the assisted-living facility on Vereda de la Montura, evacuated at 22:00; structures around it have burned by dawn',
    source: 'LAFD AAR p. 36 (time approximate)',
  },
];

// --- the spread field -------------------------------------------------------------------------

/** Metres per cell. Small enough that a spark is a few cells across. */
const CELL = 20;
const LAT0 = 34.03;
const LNG0 = -118.6;
const LAT1 = 34.09;
const LNG1 = -118.5;
const M_PER_DEG_LAT = 110_950;
const M_PER_DEG_LNG = 111_320 * Math.cos((34.06 * Math.PI) / 180);

/** The wind carries the fire south-southwest (a Santa Ana from the north-east), as the 11:03 report has it moving south. */
const HEADING = (200 * Math.PI) / 180;
/** Metres a minute: downwind, across the wind, and back into it. */
const V_DOWN = 40;
const V_CROSS = 3.5;
const V_BACK = 1.5;
/** The creep after a patch's run, as a share of its run's speed. */
const CREEP = 0.07;
/** How sharply speed falls away from the wind's line. */
const DOWNWIND_SHARPNESS = 3;
/** How much the edge wanders: distances are stretched or squeezed by up to this fraction. */
const WANDER = 0.12;
/** Wavelength of the wander, in metres. */
const WANDER_SCALE = 180;

const W = Math.ceil(((LNG1 - LNG0) * M_PER_DEG_LNG) / CELL) + 1;
const H = Math.ceil(((LAT1 - LAT0) * M_PER_DEG_LAT) / CELL) + 1;

/** A smooth value in [-1, 1] that is the same every time at the same place. */
function wander(x: number, y: number): number {
  const gx = x / WANDER_SCALE;
  const gy = y / WANDER_SCALE;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const lattice = (i: number, j: number) => (hashString(`fire:${i}:${j}`) / 4294967296) * 2 - 1;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = lattice(ix, iy) * (1 - sx) + lattice(ix + 1, iy) * sx;
  const bottom = lattice(ix, iy + 1) * (1 - sx) + lattice(ix + 1, iy + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

/** Metres a minute in the direction (cosine of the angle from the wind's line). */
function speedAt(cosine: number): number {
  if (cosine >= 0) return V_CROSS + (V_DOWN - V_CROSS) * Math.pow(cosine, DOWNWIND_SHARPNESS);
  return V_CROSS - (V_CROSS - V_BACK) * -cosine;
}

const xOf = (lng: number) => (lng - LNG0) * M_PER_DEG_LNG;
const yOf = (lat: number) => (lat - LAT0) * M_PER_DEG_LAT;

/** The fire stops at the perimeter, which hugs the shore, so it never runs out over the water. */
function insidePerimeter(x: number, y: number): boolean {
  let inside = false;
  for (let a = 0, b = PERIMETER.length - 1; a < PERIMETER.length; b = a, a += 1) {
    const ay = yOf(PERIMETER[a][0]);
    const by = yOf(PERIMETER[b][0]);
    if (ay > y === by > y) continue;
    const ax = xOf(PERIMETER[a][1]);
    const bx = xOf(PERIMETER[b][1]);
    if (x < ax + ((y - ay) / (by - ay)) * (bx - ax)) inside = !inside;
  }
  return inside;
}

let field: Float32Array | null = null;

/** The minute the fire reaches each cell: the soonest any seed gets there. Built once, on first use. */
function arrivalField(): Float32Array {
  if (field) return field;
  const t = new Float32Array(W * H).fill(Infinity);
  const land = new Uint8Array(W * H);
  for (let j = 0; j < H; j += 1) for (let i = 0; i < W; i += 1) land[j * W + i] = insidePerimeter(i * CELL, j * CELL) ? 1 : 0;
  for (const s of SEEDS) {
    const sx = xOf(s.lng);
    const sy = yOf(s.lat);
    const pace = s.pace ?? 1;
    const heading = s.heading === undefined ? HEADING : (s.heading * Math.PI) / 180;
    const ux = Math.sin(heading);
    const uy = Math.cos(heading);
    const tail = s.tail ?? 0;
    const reach = s.r0 + V_DOWN * pace * (s.grow + CREEP * tail) * (1 + WANDER);
    const x0 = Math.max(0, Math.floor((sx - reach) / CELL));
    const x1 = Math.min(W - 1, Math.ceil((sx + reach) / CELL));
    const y0 = Math.max(0, Math.floor((sy - reach) / CELL));
    const y1 = Math.min(H - 1, Math.ceil((sy + reach) / CELL));
    for (let j = y0; j <= y1; j += 1) {
      for (let i = x0; i <= x1; i += 1) {
        if (!land[j * W + i]) continue;
        const dx = i * CELL - sx;
        const dy = j * CELL - sy;
        const d = Math.hypot(dx, dy);
        const eff = d * (1 + WANDER * wander(i * CELL, j * CELL));
        const run = eff - s.r0;
        // Inside the patch it is already burning; outside it spreads at the wind's pace for that bearing.
        const offset = run <= 0 ? 0 : run / (pace * speedAt(d === 0 ? 1 : (dx * ux + dy * uy) / d));
        // Fast for `grow` minutes, then a slow creep for `tail` more, then it adds nothing of its own.
        const minutes = offset <= s.grow ? offset : s.grow + (offset - s.grow) / CREEP;
        if (minutes > s.grow + tail) continue;
        const arrives = s.t + minutes;
        if (arrives < t[j * W + i]) t[j * W + i] = arrives;
      }
    }
  }
  field = t;
  return t;
}

/** True if the fire has reached this spot by this minute. */
export function fireReaches(lat: number, lng: number, min: number): boolean {
  const x = xOf(lng) / CELL;
  const y = yOf(lat) / CELL;
  if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return false;
  const t = arrivalField();
  // The nearest cell is exact enough at 20 m, and it is how the outline itself is cut.
  return t[Math.round(y) * W + Math.round(x)] <= min;
}

// --- the outline ------------------------------------------------------------------------------

/** How far past the threshold a cell can be and still bend the outline toward it, in minutes. */
const CLAMP = 30;

/**
 * Marching squares over the arrival field: the cells the fire has reached by `min`, as closed
 * outlines with the burning side on the left. Counter-clockwise rings are the outer edge of a
 * burning area; clockwise rings are unburned pockets inside one, and are filled in.
 */
function outline(min: number): FireRing[] {
  const t = arrivalField();
  const v = (i: number, j: number) => {
    if (i <= 0 || j <= 0 || i >= W - 1 || j >= H - 1) return CLAMP;
    return Math.max(-CLAMP, Math.min(t[j * W + i] - min, CLAMP));
  };

  // Each crossing sits on a grid edge. Horizontal edge (i,j)-(i+1,j) is 2*(j*W+i); vertical (i,j)-(i,j+1) is that +1.
  const hEdge = (i: number, j: number) => 2 * (j * W + i);
  const vEdge = (i: number, j: number) => 2 * (j * W + i) + 1;
  const next = new Map<number, number>();
  const link = (from: number, to: number) => next.set(from, to);

  for (let j = 0; j < H - 1; j += 1) {
    for (let i = 0; i < W - 1; i += 1) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i + 1, j + 1);
      const d = v(i, j + 1);
      const code = (a <= 0 ? 1 : 0) | (b <= 0 ? 2 : 0) | (c <= 0 ? 4 : 0) | (d <= 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const bottom = hEdge(i, j);
      const right = vEdge(i + 1, j);
      const top = hEdge(i, j + 1);
      const left = vEdge(i, j);
      switch (code) {
        case 1: link(bottom, left); break;
        case 2: link(right, bottom); break;
        case 3: link(right, left); break;
        case 4: link(top, right); break;
        case 6: link(top, bottom); break;
        case 7: link(top, left); break;
        case 8: link(left, top); break;
        case 9: link(bottom, top); break;
        case 11: link(right, top); break;
        case 12: link(left, right); break;
        case 13: link(bottom, right); break;
        case 14: link(left, bottom); break;
        case 5:
        case 10: {
          // Saddle: the corners on one diagonal burn. Whether they join depends on the middle of the cell.
          const joined = (a + b + c + d) / 4 <= 0;
          if (code === 5) {
            if (joined) { link(bottom, right); link(top, left); } else { link(bottom, left); link(top, right); }
          } else if (joined) { link(left, bottom); link(right, top); } else { link(right, bottom); link(left, top); }
          break;
        }
      }
    }
  }

  /** Where along its grid edge the outline crosses, in grid units. */
  const point = (edge: number): [number, number] => {
    const cell = edge >> 1;
    const i = cell % W;
    const j = (cell - i) / W;
    if ((edge & 1) === 0) {
      const p = v(i, j);
      const q = v(i + 1, j);
      return [i + p / (p - q), j];
    }
    const p = v(i, j);
    const q = v(i, j + 1);
    return [i, j + p / (p - q)];
  };

  const rings: FireRing[] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const grid: [number, number][] = [];
    let edge = start;
    while (!seen.has(edge)) {
      seen.add(edge);
      grid.push(point(edge));
      const to = next.get(edge);
      if (to === undefined) break;
      edge = to;
    }
    if (grid.length < 4 || edge !== start) continue;
    if (signedArea(grid) <= 0) continue;
    rings.push(close(smooth(smooth(grid)).map(([gx, gy]) => [LNG0 + (gx * CELL) / M_PER_DEG_LNG, LAT0 + (gy * CELL) / M_PER_DEG_LAT])));
  }
  return rings;
}

function signedArea(ring: [number, number][]): number {
  let sum = 0;
  for (let k = 0; k < ring.length; k += 1) {
    const [x0, y0] = ring[k];
    const [x1, y1] = ring[(k + 1) % ring.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

/** Chaikin corner cutting on a closed ring: rounds the staircase of the grid without moving the shape. */
function smooth(ring: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < ring.length; k += 1) {
    const [x0, y0] = ring[k];
    const [x1, y1] = ring[(k + 1) % ring.length];
    out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
  }
  return out;
}

const close = (ring: [number, number][]): FireRing => [...ring, ring[0]];

let last: { min: number; front: FireFront } | null = null;

/** The fire at a minute of the scenario. Nothing before the first report. */
export function fireAt(min: number): FireFront {
  if (last && last.min === min) return last.front;
  const first = SEEDS.reduce((m, s) => Math.min(m, s.t), Infinity);
  const front: FireFront = { rings: min < first ? [] : outline(min) };
  last = { min, front };
  return front;
}

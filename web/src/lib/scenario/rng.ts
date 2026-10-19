// A seeded random stream, so the scenario plays out the same way every time it is run. A demo
// that changes between rehearsals is a demo nobody can rehearse, and a test cannot pin it.

/** String to a 32-bit unsigned seed. */
export function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: small, fast, and good enough for picking who refuses to leave. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stream named by what it is for, so adding a draw in one place never shifts another. */
export const rngFor = (name: string): (() => number) => mulberry32(hashString(name));

/** One of the list, by a draw in [0, 1). */
export const pick = <T>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** One key by weight. Weights need not sum to 1. */
export function weighted<K extends string>(weights: Record<K, number>, r: number): K {
  const keys = Object.keys(weights) as K[];
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let at = r * total;
  for (const k of keys) {
    at -= weights[k];
    if (at < 0) return k;
  }
  return keys[keys.length - 1];
}

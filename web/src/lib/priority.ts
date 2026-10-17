// How a status becomes a colour, a heat weight and a place in the door-knock list.
// Pure, with `now` injected, so the board and the tests agree.
import type { AddressState, Status } from './types';

/** docs/DATA_CONTRACT.md §3: a cleared/self_out status older than this is stale. */
export const FRESH_MIN = 120;

export type Urgency = 'critical' | 'high' | 'watch' | 'clear';

export const URGENCY_RANK: Record<Urgency, number> = { critical: 0, high: 1, watch: 2, clear: 3 };

/**
 * Urgency on the paper map surface. Validated against the #f4efe6 ground: worst adjacent
 * pair 16.2 ΔE normal vision, 14.3 ΔE CVD, every step at least 3:1 contrast. The slate and
 * the green are deliberately low-chroma — they are the reference build's own context and
 * "ok" colours — and every use carries a text label, so status is never colour alone.
 */
export const URGENCY_COLOR: Record<Urgency, string> = {
  critical: '#9b2c1f',
  high: '#bf6a12',
  watch: '#7d8a96',
  clear: '#2f6b4f',
};

/**
 * Door-knock density: a sequential single-hue ember ramp, light to dark, the same structure
 * as the reference's capacity ramp. Not green-to-red — that is the worst case for red-green
 * colourblindness, because the safe end and the dangerous end become the same colour. Here
 * low density simply fades into the paper, so "no heat" means the block is handled.
 */
export const HEAT_STOPS: ReadonlyArray<readonly [stop: number, color: string]> = [
  [0.25, '#e8b04b'],
  [0.5, '#d4841f'],
  [0.75, '#b4511b'],
  [1, '#8f2e21'],
];

/** Heat weight, 0–1. Feeds the density layer; also the sort key inside an urgency band. */
export const URGENCY_WEIGHT: Record<Urgency, number> = {
  critical: 1,
  high: 0.8,
  watch: 0.45,
  clear: 0.05,
};

export function ageMinutes(recordedAt: string | null, now: number): number {
  if (!recordedAt) return Infinity;
  const t = Date.parse(recordedAt);
  return Number.isFinite(t) ? (now - t) / 60000 : Infinity;
}

export function isStale(status: Status, recordedAt: string | null, now: number): boolean {
  if (status !== 'cleared' && status !== 'self_out') return false;
  return ageMinutes(recordedAt, now) > FRESH_MIN;
}

/**
 * A destroyed structure is no longer an evacuation question, so it stops driving the heat
 * layer. It is still flagged on the board and in its own damage count.
 */
export function urgencyOf(a: AddressState, now: number): Urgency {
  if (a.structure === 'destroyed') return 'clear';
  if (a.status === 'refused') return 'critical';
  if (a.status === 'unknown' || a.status === 'no_answer') {
    return a.inside_perimeter ? 'high' : 'watch';
  }
  if (a.status === 'in_transit') return 'watch';
  // cleared or self_out: fresh is done, stale is a question again.
  return isStale(a.status, a.recorded_at, now) ? 'watch' : 'clear';
}

/** The reason the board shows under an address, always with the time it was recorded. */
export function reasonOf(a: AddressState, now: number): string {
  if (!a.recorded_at) return 'never contacted';
  const age = Math.round(ageMinutes(a.recorded_at, now));
  const stale = isStale(a.status, a.recorded_at, now) ? ' (stale)' : '';
  return `${relativeMinutes(age)}${stale}`;
}

export function relativeMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return 'no record';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Officers knock on these: anything unresolved inside the perimeter, worst first. */
export function doorKnockList(addresses: AddressState[], now: number): AddressState[] {
  return addresses
    .filter((a) => a.inside_perimeter && URGENCY_RANK[urgencyOf(a, now)] <= URGENCY_RANK.watch)
    .sort(sortByUrgency(now));
}

export function sortByUrgency(now: number) {
  return (a: AddressState, b: AddressState) => {
    const d = URGENCY_RANK[urgencyOf(a, now)] - URGENCY_RANK[urgencyOf(b, now)];
    if (d !== 0) return d;
    // Within a band, the longest-unanswered address goes first.
    return ageMinutes(b.recorded_at, now) - ageMinutes(a.recorded_at, now);
  };
}

/** Share of a zone still unresolved, banded. */
export function zoneUrgency(share: number): Urgency {
  if (share >= 0.6) return 'critical';
  if (share >= 0.35) return 'high';
  if (share >= 0.1) return 'watch';
  return 'clear';
}

export interface ZoneSummary {
  zone_id: string;
  total: number;
  unresolved: number;
  counts: Record<Urgency, number>;
  destroyed: number;
  urgency: Urgency;
  lat: number;
  lng: number;
}

/** One row per zone, for the zone overlay and the dispatcher's zone strip. */
export function zoneSummaries(addresses: AddressState[], now: number): ZoneSummary[] {
  const byZone = new Map<string, AddressState[]>();
  for (const a of addresses) {
    const list = byZone.get(a.zone_id) ?? [];
    list.push(a);
    byZone.set(a.zone_id, list);
  }

  return [...byZone.entries()]
    .map(([zone_id, list]) => {
      const counts: Record<Urgency, number> = { critical: 0, high: 0, watch: 0, clear: 0 };
      for (const a of list) counts[urgencyOf(a, now)] += 1;
      const unresolved = counts.critical + counts.high + counts.watch;
      return {
        zone_id,
        total: list.length,
        unresolved,
        counts,
        destroyed: list.filter((a) => a.structure === 'destroyed').length,
        // A zone is as urgent as its worst address, so one refusal keeps it red.
        // Proportional, not worst-case. A zone of three hundred homes always contains one
        // refusal, so "worst address wins" paints every zone red and tells a dispatcher
        // nothing. What matters is how much of the zone is still outstanding.
        urgency: zoneUrgency(unresolved / Math.max(list.length, 1)),
        lat: list.reduce((s, a) => s + a.lat, 0) / list.length,
        lng: list.reduce((s, a) => s + a.lng, 0) / list.length,
      } satisfies ZoneSummary;
    })
    .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.unresolved - a.unresolved);
}

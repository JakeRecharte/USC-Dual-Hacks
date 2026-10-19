// How a status becomes a colour and a place in the door-knock list.
// Pure, with `now` injected, so the board and the tests agree.
import type { AddressState, HouseColor, Status } from './types';

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
 * Status, not urgency, on the officer's own map.
 *
 * The dispatcher's board colours by urgency, which is the right question for allocating
 * crews. An officer standing on the street is asking a narrower one — what has this house
 * already told us — so these map the six contracted statuses onto the SAME four validated
 * steps above rather than inventing hues. No new colours means the contrast and CVD figures
 * in URGENCY_COLOR still hold.
 *
 * `unknown` and `no_answer` share the slate on purpose: both mean "nobody has heard from
 * this house", and the officer map tells them apart by fill opacity and by the status line
 * in the sheet, never by colour alone.
 */
export const STATUS_COLOR: Record<Status, string> = {
  cleared: URGENCY_COLOR.clear,
  self_out: URGENCY_COLOR.clear,
  in_transit: URGENCY_COLOR.high,
  refused: URGENCY_COLOR.critical,
  no_answer: URGENCY_COLOR.watch,
  unknown: URGENCY_COLOR.watch,
};

/**
 * The five house colours (houses.color, docs/sql/house_colors.sql). Red, green and grey reuse
 * the validated urgency steps (grey is the slate: "nobody has current word from this house").
 * Orange and yellow are new, picked so that all five hold 3:1 against the #f4efe6 paper ground
 * and stay at least ΔE 10 apart (CIEDE2000) even under deuteranopia and protanopia. The old
 * amber and ochre were ΔE 0.5 apart for a deuteranope. Every use also carries a text label.
 */
export const HOUSE_COLOR: Record<HouseColor, string> = {
  red: URGENCY_COLOR.critical, // refused, or a caller needs a person
  orange: '#b8440a', //           no answer at the door
  yellow: '#b37f05', //           evacuating
  green: URGENCY_COLOR.clear, //  cleared within 2 hours
  grey: URGENCY_COLOR.watch, //   unknown, or the clear has gone stale
};

/**
 * The colour to draw for a house: Supabase's when it has supplied one, otherwise the same rule
 * worked out here from the status (house_color() in docs/sql/house_colors.sql, minus the Retell
 * calls it cannot see). The fallback is what the mock version and a project that has not run
 * house_colors.sql show, so the map and its legend describe one scheme in every mode.
 */
export function houseColor(a: AddressState, now: number): HouseColor {
  if (a.color) return a.color;
  switch (a.status) {
    case 'refused':
      return 'red';
    case 'no_answer':
      return 'orange';
    case 'in_transit':
      return 'yellow';
    case 'cleared':
    case 'self_out':
      return isStale(a.status, a.recorded_at, now, a.fresh_min) ? 'grey' : 'green';
    default:
      return 'grey';
  }
}

export function ageMinutes(recordedAt: string | null, now: number): number {
  if (!recordedAt) return Infinity;
  const t = Date.parse(recordedAt);
  return Number.isFinite(t) ? (now - t) / 60000 : Infinity;
}

export function isStale(status: Status, recordedAt: string | null, now: number, freshMin: number = FRESH_MIN): boolean {
  if (status !== 'cleared' && status !== 'self_out') return false;
  return ageMinutes(recordedAt, now) > freshMin;
}

/**
 * A destroyed structure is no longer an evacuation question, so it stops counting as
 * unresolved. It is still flagged on the board and in its own damage count.
 */
export function urgencyOf(a: AddressState, now: number): Urgency {
  if (a.structure === 'destroyed') return 'clear';
  if (a.status === 'refused') return 'critical';
  if (a.status === 'unknown' || a.status === 'no_answer') {
    return a.inside_perimeter ? 'high' : 'watch';
  }
  if (a.status === 'in_transit') return 'watch';
  // cleared or self_out: fresh is done, stale is a question again.
  return isStale(a.status, a.recorded_at, now, a.fresh_min) ? 'watch' : 'clear';
}

/** The reason the board shows under an address, always with the time it was recorded. */
export function reasonOf(a: AddressState, now: number): string {
  if (!a.recorded_at) return 'never contacted';
  const age = Math.round(ageMinutes(a.recorded_at, now));
  const stale = isStale(a.status, a.recorded_at, now, a.fresh_min) ? ' (stale)' : '';
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

/**
 * Officers knock on these: houses inside the perimeter with a record that still needs a
 * person, worst first. A household nobody has any record for is left off. Every one of them
 * is in that state until the first call or tap, so listing them buries the ones that matter
 * under thousands of placeholders; the map still draws them grey and the board counts them.
 */
export function doorKnockList(addresses: AddressState[], now: number): AddressState[] {
  return addresses
    .filter(
      (a) =>
        a.inside_perimeter &&
        URGENCY_RANK[urgencyOf(a, now)] <= URGENCY_RANK.watch &&
        (a.recorded_at !== null || houseColor(a, now) !== 'grey'),
    )
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

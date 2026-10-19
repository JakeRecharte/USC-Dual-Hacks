// What to send, as suggestions a dispatcher confirms.
//
// Deterministic rules, each carrying the facts that triggered it, so a dispatcher can see why a
// unit is being suggested and disagree. Nothing here dispatches anything: every suggestion needs
// a person to confirm it (docs/DATA_CONTRACT.md §8).
//
// Two kinds:
//   - per call: the rules server/src/resources.js applied to each call at `log_call` (commit
//     37e16bb, removed in ef14a91 when the decisions page went), ported to TypeScript. The
//     street's fire threat decides how urgent the resource is.
//   - per street: what the board as a whole says is needed, from how many houses on a
//     threatened street are still unreached, staying, or unanswered.
import type { CallerState, Routing, Status, Suggestion, SuggestionPriority, ThreatLevel } from '../types';

const PRIORITY_RANK: Record<SuggestionPriority, number> = { now: 0, soon: 1, when_free: 2, none: 3 };

export const THREAT_RANK: Record<ThreatLevel, number> = { extreme: 0, high: 1, moderate: 2, low: 3 };

const LIFE = {
  medical: /\b(hurt|bleeding|injur\w*|not breathing|can'?t breathe|unconscious|unresponsive|fell|fall|can'?t get up|collapsed|chest|stroke|seizure)\b/i,
  rescue: /\b(trapped|stuck inside|can'?t get out|still inside|someone inside|on fire|fire in the house)\b/i,
  violence: /\b(gun|shot|knife|stabbed)\b/i,
};
const MEDICAL_NOTE = /\b(oxygen|o2|dialysis|insulin|ventilator|medical|medication|bedridden|hospice|cpap|non-ambulatory)\b/i;
const MOBILITY_NOTE = /\b(wheelchair|walker|mobility|can'?t walk|cannot walk|bedridden|elderly|frail|no vehicle|no car|non-ambulatory)\b/i;

/** What the call-taker's line knew about the call. */
export interface CallSuggestionFacts {
  routing: Routing;
  address: string;
  reason: string;
  bypass?: boolean;
  emergency_reason?: string;
  caller_update?: string;
  caller_state?: CallerState | null;
  inside_perimeter: boolean | null;
  reported_status?: 'staying' | 'out' | null;
  reported_by?: 'resident' | 'caller';
  prior_callers?: number;
  vulnerability?: { age?: number; medical?: string; mobility?: string; lives_alone?: boolean };
  from_number?: string | null;
  /** True when the address is not in the records at all. */
  not_in_records?: boolean;
}

/** The dispatcher's view of the household: the true record, not the caller-facing one. */
export interface HouseRecord {
  status: Status | null;
  note?: string | null;
}

// A call a person is taking right now makes its resources "now" too; otherwise the street's threat decides.
const urgency = (routing: Routing, threat: ThreatLevel | null): SuggestionPriority =>
  routing === 'human_now' || threat === 'extreme' || threat === 'high' ? 'now' : 'soon';

export function suggestForCall(call: CallSuggestionFacts, record: HouseRecord, threat: ThreatLevel | null): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (id: string, resource: string, priority: SuggestionPriority, why: (string | false | null | undefined)[]) => {
    if (!out.some((s) => s.id === id)) {
      out.push({ id, resource, priority, why: why.filter((w): w is string => Boolean(w)), requires_confirmation: true });
    }
  };

  const where = call.address || 'the address';
  const threatWhy = threat && `fire threat on this street: ${threat}`;
  const status = record.status && record.status !== 'unknown' ? record.status : null;
  const note = record.note || '';
  const life = `${call.emergency_reason || ''} ${call.reason || ''} ${call.caller_update || ''}`;
  const v = call.vulnerability || {};
  const inside = call.inside_perimeter;

  // 1. Life safety first.
  if (LIFE.medical.test(life)) add('als', 'ALS ambulance', 'now', ['injury or medical words heard on the call', `at ${where}`]);
  if (LIFE.rescue.test(life)) add('rescue', 'Engine company (rescue)', 'now', ['someone may be trapped or the house is burning', `at ${where}`, threatWhy]);
  if (LIFE.violence.test(life)) add('police', 'Patrol unit (code 3)', 'now', ['a weapon was mentioned']);

  // 2. People staying in the fire area.
  const staying = status === 'refused' || call.reported_status === 'staying';
  if (staying && inside !== false) {
    add('recontact', 'Patrol or engine to re-contact the occupants', urgency(call.routing, threat), [
      'people at this house are staying',
      note && `officer note: "${note}"`,
      call.reported_by === 'resident' && 'the resident called in themselves',
      threatWhy,
    ]);
  }
  if ((staying || call.routing === 'human_now') && (MEDICAL_NOTE.test(note) || v.medical)) {
    add('medical_standby', 'Medical transport on standby', urgency(call.routing, threat), [
      note && MEDICAL_NOTE.test(note) && `officer note mentions a medical need: "${note}"`,
      v.medical && `caller reports medical need: ${v.medical}`,
    ]);
  }
  if ((staying || call.routing === 'human_now') && (MOBILITY_NOTE.test(note) || v.mobility || Number(v.age) >= 80)) {
    add('accessible_vehicle', 'Wheelchair-accessible evacuation vehicle', urgency(call.routing, threat), [
      MOBILITY_NOTE.test(note) && `officer note: "${note}"`,
      v.mobility && `caller reports trouble getting around: ${v.mobility}`,
      Number(v.age) >= 80 && `age ${v.age}`,
    ]);
  }

  // 3. Houses nobody has confirmed, inside the fire area.
  const unresolved = !staying && (status === null || status === 'no_answer' || status === 'in_transit');
  if (inside === true && unresolved && call.routing !== 'human_now') {
    const prior = call.prior_callers ?? 0;
    add('door_knock', call.not_in_records ? 'Door-knock (house not in our records)' : 'Door-knock by the nearest patrol', prior >= 1 ? 'now' : urgency(call.routing, threat), [
      status === 'no_answer' ? 'last knock got no answer' : status === 'in_transit' ? 'reported leaving, no follow-up' : 'never checked',
      prior >= 1 && `${prior + 1} separate callers about this house`,
      threatWhy,
    ]);
  }

  // 4. Old "cleared".
  if ((status === 'cleared' || status === 'self_out') && call.routing === 'priority_queue' && !staying) {
    add('recheck', 'Re-check on the next pass', 'when_free', ['last check is too old to rely on', threatWhy]);
  }

  // 5. Someone we owe a call back.
  if ((call.routing === 'callback_queue' || call.routing === 'abandoned_callback') && call.from_number) {
    add('callback', `Call-taker callback to ${call.from_number}`, call.routing === 'callback_queue' ? 'now' : 'soon', [
      call.routing === 'callback_queue' ? 'transfer to a person did not connect' : 'caller hung up before routing',
    ]);
  }

  // 6. Nothing to send: the line answered it from the record. This is the "trip avoided".
  if (!out.length && call.routing === 'answered_by_agent') {
    out.push({
      id: 'none',
      resource: 'No unit needed',
      priority: 'none',
      requires_confirmation: false,
      why: [
        call.reported_status === 'out' || status === 'self_out' ? 'resident reported out of the area' : `officer record: ${status ?? 'on file'}, recent`,
        'answered by the line',
      ],
    });
  }

  return out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

/** A suggestion for the whole board: a street, or a moment in the incident. */
export interface ScenarioSuggestion extends Suggestion {
  /** Stable while the condition holds, so a confirm or dismiss sticks to it. */
  key: string;
  scope: 'area' | 'event';
  /** The street it is about, when it is about one. */
  street?: string;
  threat?: ThreatLevel | null;
}

/** What the board counted on one street. */
export interface StreetTally {
  street: string;
  threat: ThreatLevel;
  /** Minutes since the street was ordered out. */
  sinceAlert: number;
  /** Houses with no record at all. */
  unreached: number;
  noAnswer: number;
  refused: number;
  inTransitStuck: number;
  total: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Drop the facts that did not apply, so a `why` list never carries a null. */
const facts = (...list: (string | false | null | undefined)[]): string[] => list.filter((w): w is string => Boolean(w));

/**
 * Street-level suggestions from what the board shows right now. A street only appears once it
 * has been under an evacuation order long enough that its houses should have been reached, so a
 * fresh order does not instantly flood the list.
 */
export function suggestForStreets(tallies: StreetTally[], reasonFor: (street: string) => string | null): ScenarioSuggestion[] {
  const out: ScenarioSuggestion[] = [];

  for (const t of tallies) {
    const hot = t.threat === 'extreme' || t.threat === 'high';
    const reason = reasonFor(t.street);
    const threatWhy = `fire threat on ${t.street}: ${t.threat}`;

    if (t.sinceAlert >= 15 && t.unreached >= (hot ? 8 : 20)) {
      out.push({
        key: `area:${t.street}:door_knock`,
        scope: 'area',
        street: t.street,
        threat: t.threat,
        id: 'door_knock',
        resource: `Door-knock team to ${t.street}`,
        priority: t.threat === 'extreme' ? 'now' : hot ? 'soon' : 'when_free',
        why: facts(`${plural(t.unreached, 'house')} under the evacuation order, not yet reached`, threatWhy, reason && `research: ${reason}`),
        requires_confirmation: true,
      });
    }

    if (t.refused >= 3) {
      out.push({
        key: `area:${t.street}:recontact`,
        scope: 'area',
        street: t.street,
        threat: t.threat,
        id: 'recontact',
        resource: `Patrol and engine to re-contact households on ${t.street}`,
        priority: hot ? 'now' : 'soon',
        why: facts(`${plural(t.refused, 'household')} staying`, threatWhy, reason && `research: ${reason}`),
        requires_confirmation: true,
      });
    }

    if (t.noAnswer >= 6) {
      out.push({
        key: `area:${t.street}:second_pass`,
        scope: 'area',
        street: t.street,
        threat: t.threat,
        id: 'door_knock',
        resource: `Second-pass door-knock on ${t.street}`,
        priority: hot ? 'soon' : 'when_free',
        why: [`${plural(t.noAnswer, 'house')} with no answer at the door`, threatWhy],
        requires_confirmation: true,
      });
    }

    if (t.inTransitStuck >= 8) {
      out.push({
        key: `area:${t.street}:stuck`,
        scope: 'area',
        street: t.street,
        threat: t.threat,
        id: 'traffic',
        resource: `Traffic control on ${t.street}`,
        priority: hot ? 'now' : 'soon',
        why: [`${plural(t.inTransitStuck, 'household')} reported leaving with no follow-up`, 'evacuees may be stuck on the road', threatWhy],
        requires_confirmation: true,
      });
    }
  }

  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) =>
      PRIORITY_RANK[a.s.priority] - PRIORITY_RANK[b.s.priority] ||
      THREAT_RANK[a.s.threat ?? 'low'] - THREAT_RANK[b.s.threat ?? 'low'] ||
      a.i - b.i)
    .map((x) => x.s);
}

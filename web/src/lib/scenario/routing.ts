// How the phone line routes a call, for the scenario's simulated calls.
//
// server/src/routing.js is the real thing (docs/DATA_CONTRACT.md §3). This is the wildfire half
// of it, ported so a simulated call lands in the queue with the routing, severity and reason the
// line would have given it. Routine welfare checks are left out: the scenario is one incident.
// The test (test/scenario.test.ts) runs the cases the contract spells out.
import { FRESH_MIN } from '../priority.ts';
import type { CallerState, Routing, Status } from '../types';

export interface CallFacts {
  caller_state?: CallerState | null;
  with_them_now?: boolean;
  emergency?: boolean;
  emergency_reason?: string;
  /** Who is on the line: the resident themselves, or someone calling about them. */
  reported_by?: 'resident' | 'caller';
  reported_status?: 'staying' | 'out' | null;
  caller_update?: string;
  /** Other people who already called about this address. */
  prior_callers?: number;
}

/** What the record said when the caller was looked up. */
export interface Lookup {
  status: Status | null;
  note?: string | null;
  /** When that status was recorded, in ms. */
  recorded_at: number | null;
  inside_perimeter: boolean;
}

export interface Routed {
  routing: Routing;
  severity: number;
  reason: string;
  rule: string;
}

interface Decision {
  routing: Routing;
  severity: number;
  reason: string;
  rule: string;
}

// A third separate caller about an unresolved house gets a person now; an earlier one moves it up.
function repeatCallers(d: Decision, prior: number): Decision {
  if (!prior || d.routing === 'answered_by_agent' || d.routing === 'human_now') return d;
  const note = `; ${prior + 1} separate callers about this address`;
  if (prior >= 2 && d.routing === 'priority_queue') {
    return { routing: 'human_now', severity: 5, reason: d.reason + note, rule: 'repeat_callers' };
  }
  return { routing: 'priority_queue', severity: Math.min(5, Math.max(d.severity, 3) + 1), reason: d.reason + note, rule: 'repeat_callers' };
}

function routeOnFacts(call: CallFacts, lookup: Lookup, now: number, freshMin: number): Decision {
  const status = lookup.status;
  const ageMin = lookup.recorded_at !== null ? (now - lookup.recorded_at) / 60_000 : Infinity;

  // A resident calling about themselves is "with them"; their own rules below say what that means.
  const withThem = Boolean(call.with_them_now) && call.reported_by !== 'resident';
  if (withThem && call.reported_status === 'out' && !call.emergency && call.caller_state !== 'panicked' && call.caller_state !== 'distressed') {
    return { routing: 'answered_by_agent', severity: 2, reason: 'caller is with them, out of the area', rule: 'with_them_out' };
  }
  if (withThem || call.emergency) {
    return {
      routing: 'human_now',
      severity: 5,
      reason: withThem ? 'caller is with them now' : (call.emergency_reason || 'emergency'),
      rule: withThem ? 'with_them_now' : 'emergency',
    };
  }
  // The resident calling about themselves is a first-hand report.
  if (call.reported_by === 'resident' && call.reported_status === 'staying') {
    return lookup.inside_perimeter === false
      ? { routing: 'priority_queue', severity: 4, reason: 'resident called: staying (outside the perimeter)', rule: 'resident_staying_outside' }
      : { routing: 'human_now', severity: 5, reason: 'resident called: still at the address inside the perimeter', rule: 'resident_staying' };
  }
  if (call.reported_by === 'resident' && call.reported_status === 'out') {
    return status === 'refused'
      ? { routing: 'answered_by_agent', severity: 3, reason: 'resident says they left; house was marked staying, officer to confirm', rule: 'resident_out_conflict' }
      : { routing: 'answered_by_agent', severity: 1, reason: 'resident called: out of the area', rule: 'resident_out' };
  }
  // "They got out" is good news the board records; it doesn't need a person on the phone.
  if (call.reported_status === 'out') {
    return {
      routing: 'answered_by_agent',
      severity: 2,
      reason: `caller report: out${call.caller_update ? ` (${call.caller_update})` : ''}`,
      rule: 'caller_report_out',
    };
  }
  if (call.reported_status) {
    return {
      routing: 'priority_queue',
      severity: 4,
      reason: `caller report: ${call.reported_status}${call.caller_update ? ` (${call.caller_update})` : ''}`,
      rule: 'caller_report',
    };
  }
  // Order is docs/DATA_CONTRACT.md §3, top to bottom.
  if (status === 'refused') {
    return { routing: 'priority_queue', severity: 4, reason: `refused${lookup.note ? `, note: ${lookup.note}` : ''}`, rule: 'refused' };
  }
  if (status === 'cleared' || status === 'self_out') {
    return ageMin <= freshMin
      ? { routing: 'answered_by_agent', severity: 1, reason: `${status} ${Math.round(ageMin)} min ago`, rule: 'fresh_record' }
      : { routing: 'priority_queue', severity: 3, reason: `${status} but stale (${Math.round(ageMin)} min old)`, rule: 'stale_record' };
  }
  if (lookup.inside_perimeter) {
    return { routing: 'priority_queue', severity: 4, reason: `${status && status !== 'unknown' ? status : 'no status'} inside the perimeter`, rule: 'inside_unresolved' };
  }
  return { routing: 'priority_queue', severity: 3, reason: 'address not on record', rule: 'default_escalate' };
}

/** The caller's state can only move a call up: panicked goes to a person, distressed is never left with the agent alone. */
export function routeSim(call: CallFacts, lookup: Lookup, now: number, freshMin: number = FRESH_MIN): Routed {
  let d: Decision;
  if (call.caller_state === 'panicked' && !call.with_them_now && !call.emergency) {
    d = { routing: 'human_now', severity: 5, reason: 'caller panicked', rule: 'caller_panicked' };
  } else {
    d = routeOnFacts(call, lookup, now, freshMin);
    if (call.caller_state === 'distressed' && (d.routing === 'answered_by_agent' || d.routing === 'scheduled_followup')) {
      d = { routing: 'priority_queue', severity: Math.max(d.severity, 4), reason: `${d.reason}; caller distressed`, rule: 'caller_distressed' };
    }
    d = repeatCallers(d, call.prior_callers ?? 0);
  }
  if (call.caller_update && !d.reason.includes(call.caller_update)) d = { ...d, reason: `${d.reason}; caller says: ${call.caller_update}` };
  return d;
}

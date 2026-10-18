// Taking a real phone call into the scenario.
//
// The telephony server streams every call it handles (docs/DATA_CONTRACT.md §5), and the row it
// sends for a logged call includes `report_written`: the status the line wrote to the record for
// what the caller reported (server/src/reports.js). That, plus the line's own routing, is the
// call's whole effect on a house, so the scenario copies it rather than working it out again.
//
// Only calls that arrive after the scenario starts count. A baseline of the calls already on the
// board is taken then, so an earlier call, or the feed replaying one, never reaches the scenario.
import type { CallRow, Status } from '../types';
import type { LiveCallInput } from './engine';

/** The statuses the line can write for a report (reports.js): staying, a relative's "out", the resident's "out". */
const REPORTED: ReadonlySet<Status> = new Set(['refused', 'self_out', 'in_transit']);

export interface LiveBaseline {
  /** Calls already on the board when the scenario started. */
  ids: Set<string>;
  /** When it started, in ms. */
  since: number;
}

export const callKey = (c: Pick<CallRow, 'call_id' | 'id'>): string => c.call_id || c.id;

export const baselineOf = (calls: CallRow[], now: number = Date.now()): LiveBaseline => ({
  ids: new Set(calls.map(callKey)),
  since: now,
});

/** Slack for the phone server's clock against this browser's: a minute either way. */
const CLOCK_SLACK_MS = 60_000;

/** True for a call that began after the scenario did. */
export function isNewLiveCall(c: CallRow, baseline: LiveBaseline): boolean {
  const key = callKey(c);
  if (!key || baseline.ids.has(key)) return false;
  // A call that cannot be dated is not taken in: better to miss one than to replay an old one.
  const began = Date.parse(c.created_at);
  return Number.isFinite(began) && began >= baseline.since - CLOCK_SLACK_MS;
}

/**
 * What a real call does in the scenario, or null while it is still only "looking the address up":
 * that placeholder has no routing yet, and the line may still change its mind.
 */
export function liveCallInput(c: CallRow): LiveCallInput | null {
  if (c.provisional) return null;
  const key = callKey(c);
  if (!key) return null;

  const written = c.report_written && REPORTED.has(c.report_written) ? c.report_written : null;
  return {
    key,
    house: c.address_id ?? null,
    address: c.address || 'Address not given',
    subject_name: c.subject_name,
    routing: c.routing,
    severity: c.severity,
    reason: c.reason,
    caller_state: c.caller_state,
    distress_score: c.distress_score,
    bypass: c.bypass,
    from_number: c.from_number,
    prior_callers: c.prior_callers,
    // The same three the database's house_color() treats as urgent: a person now, a failed transfer, a bypass.
    urgent: c.routing === 'human_now' || c.routing === 'callback_queue' || Boolean(c.bypass),
    report: written ? { status: written, note: `live call: ${c.caller_update || `reported ${written.replace('_', ' ')}`}` } : null,
  };
}

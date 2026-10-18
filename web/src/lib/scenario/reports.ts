// What a caller's report does to a house.
//
// server/src/reports.js is the real thing: what a caller tells the line becomes a status_log row
// with source 'call', so the next caller and the board see it. This is the same decision in
// TypeScript, so a simulated call changes its house the way a real one does. It decides; it
// writes nothing.
//
// A phone report is weaker than an officer at the door, so it can only raise concern:
//   "he told me he's staying" (anyone)        -> refused, onto the door-knock list
//   "I'm still here" (the resident)           -> refused
//   "I'm out" (the resident)                  -> self_out; in_transit if the house was marked staying
//   "she texted she's out" (relative/friend)  -> in_transit, unverified. A second-hand "out" never
//                                                clears a house, and is never written over "staying"
//                                                or a fresh clear.
import { FRESH_MIN } from '../priority.ts';
import type { Status } from '../types';

export interface ReportedCall {
  reported_status?: 'staying' | 'out' | null;
  reported_by?: 'resident' | 'caller';
  caller_update?: string;
}

/** The house's record when the call came in. */
export interface CurrentRecord {
  status: Status | null;
  /** When it was recorded, in ms. */
  recorded_at: number | null;
}

export type Report = { status: Status; note: string; source: 'call' } | { skip: string } | null;

export function callReport(call: ReportedCall, current: CurrentRecord, now: number, freshMin: number = FRESH_MIN): Report {
  if (!call.reported_status) return null;

  const resident = call.reported_by === 'resident';
  const who = resident ? 'resident' : 'relative or friend';

  if (call.reported_status === 'staying') {
    return { status: 'refused', source: 'call', note: `phone report (${who}): ${call.caller_update || 'staying at the address'}` };
  }

  if (call.reported_status === 'out') {
    if (!resident) {
      if (current.status === 'refused') return { skip: 'a relative says out but the house is marked staying; a person checks' };
      const age = current.recorded_at !== null ? (now - current.recorded_at) / 60_000 : Infinity;
      if ((current.status === 'cleared' || current.status === 'self_out') && age <= freshMin) {
        return { skip: 'house already cleared recently' };
      }
      return { status: 'in_transit', source: 'call', note: `phone report (${who}, unverified): ${call.caller_update || 'says they got out'}` };
    }
    // They were staying and now say they left: evacuating, not cleared, until an officer confirms.
    if (current.status === 'refused') {
      return { status: 'in_transit', source: 'call', note: 'phone report (resident): says they left; house was marked staying, officer to confirm' };
    }
    return { status: 'self_out', source: 'call', note: 'phone report (resident): out of the area' };
  }

  return { skip: `unknown reported_status: ${String(call.reported_status)}` };
}

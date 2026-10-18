// The scenario engine: builds a whole day from the board's households, then plays it back to any
// minute.
//
// Nothing here touches a database or the phone line. `createEngine` takes the households (their
// ids, addresses and, where Supabase supplied it, the street's fire threat) and decides, from a
// seeded random stream, what happens to each one: when its street is ordered out, whether the
// officer finds the house empty, whether nobody answers, whether the occupants refuse. The
// street's researched threat drives it: extreme streets are ordered out first and see more
// refusals, no-answers and calls; low streets are last and quiet. `at(minute)` then returns the
// board as it would look at that minute, in the shapes both portals already render.
//
// Same households + same seed = the same day, so a demo can be rehearsed and a test can pin it.
//
// A real phone call can be taken in on top (`live`): it lands at the scenario's current minute
// with the effect the real line recorded, and its house is then frozen against everything the
// scenario had planned for it. The scenario never writes anywhere; it only reads the call.
//
// Value imports carry .ts because the tests load this through Node's own loader.
import type { AddressState, CallRow, CallerState, Routing, Source, Status, ThreatLevel } from '../types';
import { simHouseColor } from './colors.ts';
import { fireAt, type FireFront } from './fire.ts';
import {
  ALERT_WINDOW,
  BEATS,
  FATE,
  GRIDLOCK,
  REFUSE_NOTES,
  SCENARIO_FRESH_MIN,
  SCENARIO_ID,
  SIM_END_MIN,
  SIM_START_MS,
  STREET_ALERT_AT,
  TRANSIT_NOTES,
  type Beat,
} from './palisades.ts';
import { callReport } from './reports.ts';
import { hashString, pick, rngFor, weighted } from './rng.ts';
import { routeSim, type CallFacts } from './routing.ts';
import { suggestForCall, suggestForStreets, type ScenarioSuggestion, type StreetTally } from './suggest.ts';
import { researchFor, researchReason, streetKeyOf, streetNameOf, threatOf } from './threat.ts';

export const simTime = (min: number): number => SIM_START_MS + min * 60_000;
const iso = (min: number): string => new Date(simTime(min)).toISOString();

/** One thing that happens to one house at one minute. An event with no status only recolours. */
interface Ev {
  t: number;
  h: number;
  status?: Status;
  source?: Source;
  note?: string | null;
  /** An urgent call arrived about this house (it goes red until a newer status). */
  urgentCall?: boolean;
  /** Came from a real call, not the plan. Nothing the plan does later can undo it. */
  live?: boolean;
}

interface StreetInfo {
  key: string;
  name: string;
  threat: ThreatLevel;
  /** Minutes after 10:00 when the order reaches this street. */
  alert: number;
  houses: number[];
}

/** A real call, as the scenario takes it in. `live.ts` builds this from a call on the phone line's feed. */
export interface LiveCallInput {
  /** The call's own id, so a call that updates is one call, not several. */
  key: string;
  /** The household the line matched it to (an addresses.id), if any. */
  house: string | null;
  address: string;
  subject_name: string;
  routing: Routing;
  severity: number;
  reason: string;
  caller_state?: CallerState | null;
  distress_score?: number;
  bypass?: boolean;
  from_number?: string | null;
  prior_callers?: number;
  /** The line sent it to a person (human_now, a failed transfer, or a bypass): the house goes red. */
  urgent: boolean;
  /** The status the line wrote for what the caller reported, if it wrote one. */
  report: { status: Status; note: string } | null;
}

export interface Snapshot {
  min: number;
  /** Simulated wall-clock time, in ms. */
  now: number;
  addresses: AddressState[];
  calls: CallRow[];
  /** Beats that have happened, newest first. */
  beats: Beat[];
  /** What the board suggests right now: documented moments first, then street by street. */
  suggestions: ScenarioSuggestion[];
  /** How long a clear is trusted in this scenario, in minutes. */
  freshMin: number;
  /** Where the simulated fire is at this minute. A drawing only: no household is read from it. */
  fire: FireFront;
  /** Real calls taken in so far, and the houses they have frozen. */
  live: { calls: number; locked: number };
}

export interface Engine {
  endMin: number;
  at: (min: number) => Snapshot;
  /** Take in a real call (or an update to one) at the minute last played. Safe to repeat. */
  live: (call: LiveCallInput) => void;
  /** Forget every real call: the plan plays as if none had come in. */
  clearLive: () => void;
  /** For tests and the console: what was built, without playing it. */
  inspect: () => { streets: { key: string; name: string; threat: ThreatLevel; alert: number; houses: number }[]; events: number; calls: number };
}

const CLEARED: ReadonlySet<Status> = new Set(['cleared', 'self_out']);

const EMERGENCY_REASONS = ["she can't breathe", "he fell and can't get up", 'smoke in the house and chest pain'];
const VULNERABLE = [
  (r: () => number) => ({ age: 82 + Math.floor(r() * 14) }),
  () => ({ medical: 'oxygen' }),
  () => ({ mobility: 'wheelchair' }),
  () => ({ age: 88, lives_alone: true }),
];
const DISTRESS_SCORE: Record<CallerState, number> = { calm: 0, worried: 1, distressed: 2, panicked: 4 };
const EMERGENCY_CHANCE: Record<ThreatLevel, number> = { extreme: 0.04, high: 0.03, moderate: 0.015, low: 0.005 };
const STAYING_CALL_CHANCE: Record<ThreatLevel, number> = { extreme: 0.035, high: 0.035, moderate: 0.015, low: 0.015 };
const FEAR: Record<ThreatLevel, number> = { extreme: 1.4, high: 1.1, moderate: 0.8, low: 0.6 };

/** What else a caller reports. A relative saying "they got out" is far more common than a resident ringing in. */
const REPORT_ODDS = {
  residentOut: 0.04,
  relativeOutUnresolved: 0.25,
  relativeOutResolved: 0.2,
  relativeStayUnresolved: 0.05,
  relativeStayResolved: 0.02,
};
const STAY_UPDATES = ['says he is not leaving', 'told me they are staying to protect the house', 'says she will leave later'];
const OUT_UPDATES = ['texted that they got out', 'left an hour ago, heading to a shelter', 'says they are already at a friend’s house'];

/** A clear recolours the instant it stops being trusted: one micro-minute past the window. */
const AGES_AFTER = 1e-6;

/** Streets nearest the fire are walked again before a clear goes stale: at four fifths of the window. */
const RECHECK_EVERY = Math.round(SCENARIO_FRESH_MIN * 0.8);

export function createEngine(addresses: AddressState[], seed: string = SCENARIO_ID): Engine {
  const n = addresses.length;

  // --- streets: where each household sits, and when the order reaches it ---
  const streetList: StreetInfo[] = [];
  const streetByKey = new Map<string, StreetInfo>();
  const streetOf: StreetInfo[] = new Array(n);
  addresses.forEach((a, h) => {
    const key = streetKeyOf(a.address);
    let s = streetByKey.get(key);
    if (!s) {
      const threat = threatOf(a);
      const [lo, hi] = ALERT_WINDOW[threat];
      s = { key, name: streetNameOf(a.address), threat, alert: STREET_ALERT_AT[key] ?? lo + rngFor(`${seed}:street:${key}`)() * (hi - lo), houses: [] };
      streetByKey.set(key, s);
      streetList.push(s);
    }
    s.houses.push(h);
    streetOf[h] = s;
  });
  const houseIndex = new Map(addresses.map((a, h) => [a.id, h]));

  // --- events: what happens to each house ---
  const events: Ev[] = [];
  const history: Ev[][] = Array.from({ length: n }, () => []);

  /** Record a status for a house. A clear is trusted for a while, so the board recolours it then. */
  const emit = (h: number, t: number, status: Status, source: Source, note: string | null = null) => {
    if (t > SIM_END_MIN) return;
    const e: Ev = { t, h, status, source, note };
    events.push(e);
    history[h].push(e);
    if (CLEARED.has(status)) events.push({ t: t + SCENARIO_FRESH_MIN + AGES_AFTER, h });
  };

  /** The newest record for a house at a minute, as the phone line would find it. */
  const recordAt = (h: number, t: number): { status: Status | null; note: string | null; at: number | null } => {
    let best: Ev | undefined;
    for (const e of history[h]) if (e.t <= t && (!best || e.t >= best.t)) best = e;
    return best ? { status: best.status ?? null, note: best.note ?? null, at: simTime(best.t) } : { status: null, note: null, at: null };
  };

  // Holdouts the timeline pins to a moment (elderly residents refusing at 17:30): the first few
  // houses on the street, by a stable hash, refuse then instead of at their street's usual time.
  const holdouts = new Map<number, { t: number; note: string }>();
  for (const beat of BEATS) {
    if (!beat.holdouts) continue;
    const s = streetByKey.get(beat.holdouts.street.toLowerCase());
    if (!s) continue;
    [...s.houses]
      .sort((a, b) => hashString(`${seed}:holdout:${addresses[a].id}`) - hashString(`${seed}:holdout:${addresses[b].id}`))
      .slice(0, beat.holdouts.count)
      .forEach((h) => holdouts.set(h, { t: beat.t, note: beat.holdouts!.note }));
  }

  for (let h = 0; h < n; h += 1) {
    const s = streetOf[h];
    const p = FATE[s.threat];
    const r = rngFor(`${seed}:house:${addresses[h].id}`);

    const held = holdouts.get(h);
    if (held) {
      emit(h, held.t + r() * 10, 'refused', 'officer', held.note);
      continue;
    }

    const T = s.alert + r() * 30;
    const roll = r();
    const gridlocked = GRIDLOCK.streets.includes(s.key) && T >= GRIDLOCK.from - 10 && T <= GRIDLOCK.until;

    if (roll < p.refuse) {
      emit(h, T, 'refused', 'officer', pick(REFUSE_NOTES, r()));
      // Some are talked round on a second visit; most stay.
      if (r() < 0.35) {
        const t2 = T + 45 + r() * 45;
        emit(h, t2, 'in_transit', 'officer', 'changed their mind, leaving now');
        emit(h, t2 + 15 + r() * 25, 'cleared', 'officer', 'second visit: house empty');
      }
    } else if (roll < p.refuse + p.noAnswer) {
      emit(h, T, 'no_answer', 'officer');
      const t2 = T + 30 + r() * 30;
      const r2 = r();
      if (r2 < 0.55) emit(h, t2, 'cleared', 'officer', 'second knock: house empty');
      else if (r2 < 0.7) emit(h, t2, 'self_out', 'resident_reply', 'resident texted that they are out');
      else {
        emit(h, t2, 'no_answer', 'officer', 'second knock: still no answer');
        if (r() < 0.5) emit(h, t2 + 60, 'cleared', 'officer', 'third knock: house empty');
      }
    } else if (roll < p.refuse + p.noAnswer + p.transit) {
      emit(h, T, 'in_transit', r() < 0.5 ? 'officer' : 'resident_reply', gridlocked ? `stuck in traffic on ${s.name}` : pick(TRANSIT_NOTES, r()));
      const delay = gridlocked ? 60 + r() * 50 : s.threat === 'extreme' ? 25 + r() * 50 : 10 + r() * 30;
      emit(h, T + delay, r() < 0.85 ? 'cleared' : 'self_out', r() < 0.85 ? 'officer' : 'resident_reply', 'reached a checkpoint');
    } else if (r() < 0.75) {
      emit(h, T, 'cleared', 'officer', null);
    } else {
      emit(h, T, 'self_out', 'resident_reply', 'resident texted that they are out');
    }

    // Streets the fire is closest to are walked again, so a clear is renewed before it goes stale.
    if (s.threat === 'extreme' || (s.threat === 'high' && (addresses[h].zone_id === 'PAL-02' || addresses[h].zone_id === 'PAL-03'))) {
      const last = history[h].filter((e) => CLEARED.has(e.status!)).sort((a, b) => b.t - a.t)[0];
      const settled = history[h].every((e) => e.t <= (last?.t ?? -1));
      if (last && settled) {
        for (let k = 1; k <= 3 && last.t + k * RECHECK_EVERY <= s.alert + 600; k += 1) {
          emit(h, last.t + k * RECHECK_EVERY, 'cleared', 'officer', 're-checked on the next pass');
        }
      }
    }
  }

  // --- calls: who rings the line about whom, and what it does to the board ---
  const calls: { t: number; row: CallRow }[] = [];
  let callNo = 0;
  const phone = () => `+1310555${String(100 + (callNo % 100)).padStart(4, '0')}`;

  for (let h = 0; h < n; h += 1) {
    const a = addresses[h];
    const s = streetOf[h];
    const level = s.threat;
    const rc = rngFor(`${seed}:call:${a.id}`);
    if (rc() >= FATE[level].call) continue;

    // One caller, sometimes a second and rarely a third, about the same house.
    const callers = 1 + (rc() < 0.2 ? 1 : 0) + (rc() < 0.04 ? 1 : 0);
    for (let j = 0; j < callers; j += 1) {
      const tc = s.alert + 10 + rc() * 140 + j * (8 + rc() * 25);
      if (tc > SIM_END_MIN - 5) continue;

      const rec = recordAt(h, tc);
      const unresolved = !rec.status || rec.status === 'unknown' || rec.status === 'no_answer' || rec.status === 'in_transit' || rec.status === 'refused';
      const isEmergency = j === 0 && rc() < EMERGENCY_CHANCE[level];

      // What the caller says about the household, if anything. Who they are decides what the line may write.
      let reportedBy: 'resident' | 'caller' = 'caller';
      let reported: 'staying' | 'out' | null = null;
      if (!isEmergency) {
        const u = rc();
        const stay = j === 0 ? STAYING_CALL_CHANCE[level] : 0;
        const relOut = unresolved ? REPORT_ODDS.relativeOutUnresolved : REPORT_ODDS.relativeOutResolved;
        const relStay = unresolved ? REPORT_ODDS.relativeStayUnresolved : REPORT_ODDS.relativeStayResolved;
        if (u < stay) {
          reportedBy = 'resident';
          reported = 'staying';
        } else if (u < stay + REPORT_ODDS.residentOut) {
          reportedBy = 'resident';
          reported = 'out';
        } else if (u < stay + REPORT_ODDS.residentOut + relOut) reported = 'out';
        else if (u < stay + REPORT_ODDS.residentOut + relOut + relStay) reported = 'staying';
      }
      const residentStaying = reportedBy === 'resident' && reported === 'staying';

      const base = unresolved
        ? { calm: 0.05, worried: 0.4, distressed: 0.3, panicked: 0.25 }
        : { calm: 0.25, worried: 0.55, distressed: 0.15, panicked: 0.05 };
      const state: CallerState = isEmergency
        ? 'panicked'
        : residentStaying
          ? 'worried'
          : weighted({ calm: base.calm / FEAR[level], worried: base.worried, distressed: base.distressed * FEAR[level], panicked: base.panicked * FEAR[level] }, rc());
      const vulnerability = rc() < 0.14 ? pick(VULNERABLE, rc())(rc) : undefined;

      const facts: CallFacts = {
        caller_state: state,
        with_them_now: isEmergency,
        emergency: isEmergency,
        emergency_reason: isEmergency ? pick(EMERGENCY_REASONS, rc()) : undefined,
        reported_by: reportedBy,
        reported_status: reported,
        caller_update: reported === 'staying' ? pick(STAY_UPDATES, rc()) : reported === 'out' ? pick(OUT_UPDATES, rc()) : undefined,
        prior_callers: j,
      };
      const lookup = { status: rec.status, note: rec.note, recorded_at: rec.at, inside_perimeter: true };
      const routed = routeSim(facts, lookup, simTime(tc), SCENARIO_FRESH_MIN);
      const urgent = routed.routing === 'human_now' || isEmergency;

      // What the line writes back to the record for this report, as server/src/reports.js decides it.
      const report = reported
        ? callReport({ reported_status: reported, reported_by: reportedBy, caller_update: facts.caller_update }, { status: rec.status, recorded_at: rec.at }, simTime(tc), SCENARIO_FRESH_MIN)
        : null;
      const reason = report && 'skip' in report ? `${routed.reason}; not recorded: ${report.skip}` : routed.reason;

      callNo += 1;
      const id = `sim-${String(callNo).padStart(4, '0')}`;
      const row: CallRow = {
        id,
        call_id: id,
        mode: 'wildfire',
        address: a.address,
        subject_name: a.resident_name,
        address_id: a.id,
        routing: routed.routing,
        severity: routed.severity,
        reason,
        created_at: iso(tc),
        from_number: phone(),
        bypass: isEmergency,
        provisional: false,
        caller_state: state,
        distress_score: DISTRESS_SCORE[state],
        suggestions: suggestForCall(
          {
            routing: routed.routing,
            address: a.address,
            reason,
            bypass: isEmergency,
            emergency_reason: facts.emergency_reason,
            caller_state: state,
            inside_perimeter: true,
            reported_status: facts.reported_status,
            reported_by: facts.reported_by,
            prior_callers: j,
            vulnerability,
            from_number: null,
          },
          { status: rec.status, note: rec.note },
          level,
        ),
      };
      calls.push({ t: tc, row });

      if (report && 'status' in report) emit(h, tc, report.status, 'call', report.note);

      if (urgent) {
        events.push({ t: tc, h, urgentCall: true });
        // The dispatcher answers an urgent call, so an officer reaches the house a little later.
        const visit = tc + 15 + rc() * 35;
        const odds: Record<string, number> = residentStaying
          ? { cleared: 0.25, in_transit: 0.35, refused: 0.4 }
          : { cleared: 0.6, in_transit: 0.2, refused: 0.12, no_answer: 0.08 };
        const outcome = isEmergency ? 'cleared' : weighted(odds, rc());
        const notes: Record<string, string | null> = {
          cleared: isEmergency ? 'medical aid on scene, household evacuated' : 'visited after a call: house empty',
          in_transit: 'visited after a call: leaving now',
          refused: 'visited after a call: occupants staying',
          no_answer: null,
        };
        emit(h, visit, outcome as Status, 'officer', notes[outcome]);
      }
    }
  }

  // The timeline's own calls, at block level: no household, so no recolouring.
  BEATS.forEach((beat, bi) => {
    for (const [ci, c] of (beat.calls ?? []).entries()) {
      const id = `sim-b${String(bi).padStart(2, '0')}${ci}`;
      const key = c.street.toLowerCase();
      const level = streetByKey.get(key)?.threat ?? researchFor(key)?.level ?? null;
      const t = beat.t + 1;
      calls.push({
        t,
        row: {
          id,
          call_id: id,
          mode: 'wildfire',
          address: c.address,
          subject_name: c.who,
          address_id: null,
          routing: c.routing,
          severity: c.severity,
          reason: c.reason,
          created_at: iso(t),
          from_number: null,
          bypass: false,
          provisional: false,
          caller_state: c.caller,
          distress_score: DISTRESS_SCORE[c.caller],
          suggestions: suggestForCall(
            {
              routing: c.routing,
              address: c.address,
              reason: c.reason,
              inside_perimeter: true,
              reported_status: 'staying',
              reported_by: 'caller',
              vulnerability: c.vulnerability,
            },
            { status: null },
            level,
          ),
        },
      });
    }
  });

  events.sort((a, b) => a.t - b.t);
  calls.sort((a, b) => a.t - b.t || a.row.id.localeCompare(b.row.id));
  const callRows = calls.map((c) => c.row);
  const callTimes = calls.map((c) => c.t);

  // --- playback ---
  const blank = (a: AddressState, h: number): AddressState => ({
    ...a,
    status: 'unknown',
    source: null,
    recorded_at: null,
    note: null,
    structure: 'unassessed',
    structure_recorded_at: null,
    color: 'grey',
    color_reason: 'no verified record',
    threat: streetOf[h].threat,
    fresh_min: SCENARIO_FRESH_MIN,
  });
  const base = addresses.map(blank);

  const status: Status[] = new Array(n);
  const source: (Source | null)[] = new Array(n);
  const note: (string | null)[] = new Array(n);
  const recAt = new Float64Array(n);
  const urgentAt = new Float64Array(n);
  let out: AddressState[] = base;
  /** The array last handed out. It only becomes a new array when a house changed. */
  let lastOut: AddressState[] = base;
  let ptr = 0;
  let cur = -1;
  const dirty = new Set<number>();

  // Real calls: each is one row in the queue and, if it changed anything, a lock on its house.
  interface LiveCall {
    t0: number;
    house: number | undefined;
    applied: { urgent: boolean; status: Status | null };
    row: CallRow;
  }
  const liveCalls = new Map<string, LiveCall>();
  /** House index -> the minute a real call froze it. Everything planned for it after that is skipped. */
  const locks = new Map<number, number>();
  let liveVersion = 0;

  const reset = () => {
    status.fill('unknown');
    source.fill(null);
    note.fill(null);
    recAt.fill(NaN);
    urgentAt.fill(NaN);
    out = base.slice();
    lastOut = out;
    ptr = 0;
    dirty.clear();
  };
  reset();

  const streetIndex = new Map(streetList.map((s, i) => [s, i]));
  let beatsCache: { n: number; list: Beat[] } = { n: -1, list: [] };
  let callsCache: { key: string; list: CallRow[] } = { key: '', list: [] };

  /** Put a real call's event in time order, after everything already played. */
  const insertLive = (e: Ev) => {
    let lo = ptr;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].t <= e.t) lo = mid + 1;
      else hi = mid;
    }
    events.splice(lo, 0, e);
  };

  const live = (input: LiveCallInput) => {
    const t = Math.max(0, cur);
    const house = input.house ? houseIndex.get(input.house) : undefined;
    let L = liveCalls.get(input.key);
    if (!L) {
      L = { t0: t, house, applied: { urgent: false, status: null }, row: undefined as unknown as CallRow };
      liveCalls.set(input.key, L);
    }

    if (house !== undefined) {
      let changed = false;
      if (input.urgent && !L.applied.urgent) {
        L.applied.urgent = true;
        insertLive({ t, h: house, urgentCall: true, live: true });
        changed = true;
      }
      if (input.report && L.applied.status !== input.report.status) {
        L.applied.status = input.report.status;
        insertLive({ t, h: house, status: input.report.status, source: 'call', note: input.report.note, live: true });
        // A clear ages like any other: it recolours when it stops being trusted.
        if (CLEARED.has(input.report.status)) insertLive({ t: t + SCENARIO_FRESH_MIN + AGES_AFTER, h: house, live: true });
        changed = true;
      }
      // The first change a real call makes is the moment the house is frozen.
      if (changed && !locks.has(house)) locks.set(house, t);
    }

    const threat = house !== undefined ? streetOf[house].threat : null;
    const record = house !== undefined ? { status: status[house], note: note[house] } : { status: null };
    L.row = {
      id: `live-${input.key}`,
      call_id: `live-${input.key}`,
      mode: 'wildfire',
      address: input.address,
      subject_name: input.subject_name,
      address_id: input.house,
      routing: input.routing,
      severity: input.severity,
      reason: input.reason,
      created_at: iso(L.t0),
      from_number: input.from_number ?? null,
      bypass: Boolean(input.bypass),
      provisional: false,
      caller_state: input.caller_state ?? null,
      distress_score: input.distress_score ?? 0,
      live: true,
      suggestions: suggestForCall(
        {
          routing: input.routing,
          address: input.address,
          reason: input.reason,
          bypass: input.bypass,
          caller_state: input.caller_state,
          inside_perimeter: true,
          reported_status: input.report ? (input.report.status === 'refused' ? 'staying' : 'out') : null,
          reported_by: 'caller',
          prior_callers: input.prior_callers ?? 0,
          from_number: input.from_number,
        },
        record,
        threat,
      ),
    };
    liveVersion += 1;
  };

  const clearLive = () => {
    for (let i = events.length - 1; i >= 0; i -= 1) if (events[i].live) events.splice(i, 1);
    liveCalls.clear();
    locks.clear();
    liveVersion += 1;
    reset();
    cur = -1;
  };

  const tally = (min: number, now: number): StreetTally[] => {
    const size = streetList.length;
    const acc = {
      unreached: new Int32Array(size),
      noAnswer: new Int32Array(size),
      refused: new Int32Array(size),
      stuck: new Int32Array(size),
    };
    for (let h = 0; h < n; h += 1) {
      const s = streetOf[h];
      if (min < s.alert) continue;
      const i = streetIndex.get(s)!;
      switch (status[h]) {
        case 'unknown': acc.unreached[i] += 1; break;
        case 'no_answer': acc.noAnswer[i] += 1; break;
        case 'refused': acc.refused[i] += 1; break;
        case 'in_transit': if (now - recAt[h] > 40 * 60_000) acc.stuck[i] += 1; break;
        default: break;
      }
    }
    const rows: StreetTally[] = [];
    streetList.forEach((s, i) => {
      if (min < s.alert) return;
      rows.push({
        street: s.name,
        threat: s.threat,
        sinceAlert: min - s.alert,
        unreached: acc.unreached[i],
        noAnswer: acc.noAnswer[i],
        refused: acc.refused[i],
        inTransitStuck: acc.stuck[i],
        total: s.houses.length,
      });
    });
    return rows;
  };

  const at = (rawMin: number): Snapshot => {
    const min = Math.max(0, Math.min(SIM_END_MIN, rawMin));
    if (min < cur) reset();
    const now = simTime(min);

    while (ptr < events.length && events[ptr].t <= min) {
      const e = events[ptr];
      ptr += 1;
      // A real call outranks the plan: once a house is frozen, what the plan had for it later is skipped.
      // (Recolouring is not a change the plan makes: a clear still ages whatever froze it.)
      const frozen = locks.get(e.h);
      if (frozen !== undefined && !e.live && e.t > frozen && (e.status || e.urgentCall)) continue;
      if (e.status) {
        status[e.h] = e.status;
        source[e.h] = e.source ?? null;
        note[e.h] = e.note ?? null;
        recAt[e.h] = simTime(e.t);
      }
      if (e.urgentCall) urgentAt[e.h] = simTime(e.t);
      dirty.add(e.h);
    }
    cur = min;

    if (dirty.size > 0) {
      for (const h of dirty) {
        const checked = Number.isNaN(recAt[h]) ? null : recAt[h];
        const { color, reason } = simHouseColor(
          { status: status[h], checkedAt: checked, urgentCallAt: Number.isNaN(urgentAt[h]) ? null : urgentAt[h] },
          now,
          SCENARIO_FRESH_MIN,
        );
        const frozen = locks.get(h);
        out[h] = {
          ...base[h],
          status: status[h],
          source: source[h],
          recorded_at: checked === null ? null : new Date(checked).toISOString(),
          note: note[h],
          color,
          color_reason: frozen !== undefined && min >= frozen ? `live call · ${reason}` : reason,
        };
      }
      dirty.clear();
      lastOut = out.slice();
    }

    // Calls and beats are append-only in time, so a snapshot reuses the last list until one more lands.
    let c = 0;
    while (c < callTimes.length && callTimes[c] <= min) c += 1;
    const callsKey = `${c}:${liveVersion}:${Math.floor(min)}`;
    if (callsCache.key !== callsKey) {
      const list: CallRow[] = [];
      for (let i = 0; i < c; i += 1) {
        const row = callRows[i];
        // A frozen house takes no more calls from the plan: the real call is the last word on it.
        const hi = row.address_id ? houseIndex.get(row.address_id) : undefined;
        const frozen = hi !== undefined ? locks.get(hi) : undefined;
        if (frozen !== undefined && callTimes[i] > frozen) continue;
        list.push(row);
      }
      for (const L of liveCalls.values()) if (L.t0 <= min) list.push(L.row);
      callsCache = { key: callsKey, list };
    }

    const past = BEATS.filter((b) => b.t <= min);
    if (beatsCache.n !== past.length) beatsCache = { n: past.length, list: past.slice().reverse() };

    const event: ScenarioSuggestion[] = [];
    BEATS.forEach((beat, bi) => {
      for (const s of beat.suggestions ?? []) {
        if (min >= beat.t && min < beat.t + s.lastsMin) {
          event.push({ key: `event:${bi}:${s.id}`, scope: 'event', id: s.id, resource: s.resource, priority: s.priority, why: s.why, requires_confirmation: true });
        }
      }
    });
    const area = suggestForStreets(tally(min, now), (street) => researchReason(streetKeyOf(street)));

    let liveCount = 0;
    for (const L of liveCalls.values()) if (L.t0 <= min) liveCount += 1;
    let lockedCount = 0;
    for (const t of locks.values()) if (t <= min) lockedCount += 1;

    return {
      min,
      now,
      addresses: lastOut,
      calls: callsCache.list,
      beats: beatsCache.list,
      suggestions: [...event, ...area],
      freshMin: SCENARIO_FRESH_MIN,
      fire: fireAt(min),
      live: { calls: liveCount, locked: lockedCount },
    };
  };

  return {
    endMin: SIM_END_MIN,
    at,
    live,
    clearLive,
    inspect: () => ({
      streets: streetList.map((s) => ({ key: s.key, name: s.name, threat: s.threat, alert: s.alert, houses: s.houses.length })),
      events: events.length,
      calls: calls.length,
    }),
  };
}

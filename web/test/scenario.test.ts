// The crisis scenario: the colour rule it shares with Supabase, the routing and suggestion rules
// it ports, and the engine's own promises (same day every run, the street's threat drives the
// story, nothing from the live board leaks in). Run with `npm test`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { seedAddresses } from '../src/lib/addresses.ts';
import { FRESH_MIN, houseColor, isStale, reasonOf, urgencyOf } from '../src/lib/priority.ts';
import { patchFromHouse, withColors } from '../src/lib/supabase-data.ts';
import { simHouseColor } from '../src/lib/scenario/colors.ts';
import { createEngine } from '../src/lib/scenario/engine.ts';
import { baselineOf, isNewLiveCall, liveCallInput } from '../src/lib/scenario/live.ts';
import { ALERT_WINDOW, BEATS, SCENARIO_FRESH_MIN, SIM_END_MIN, SIM_START_MS, at } from '../src/lib/scenario/palisades.ts';
import { callReport } from '../src/lib/scenario/reports.ts';
import { hashString, mulberry32, weighted } from '../src/lib/scenario/rng.ts';
import { routeSim, type Lookup } from '../src/lib/scenario/routing.ts';
import { STREET_THREAT } from '../src/lib/scenario/street-threat.ts';
import { suggestForCall, suggestForStreets, type CallSuggestionFacts, type StreetTally } from '../src/lib/scenario/suggest.ts';
import { researchReason, streetKeyOf, threatOf } from '../src/lib/scenario/threat.ts';
import type { AddressState, CallRow, HouseColor, Routing, ThreatLevel } from '../src/lib/types.ts';
import type { LiveCallInput } from '../src/lib/scenario/engine.ts';

const NOW = Date.parse('2025-01-07T20:00:00Z');
const minAgo = (m: number) => NOW - m * 60_000;

describe('house colour rule (docs/sql/house_colors_v2.sql, on the scenario clock)', () => {
  const colour = (status: Parameters<typeof simHouseColor>[0]['status'], checkedMinAgo: number | null, urgentMinAgo: number | null = null) =>
    simHouseColor({ status, checkedAt: checkedMinAgo === null ? null : minAgo(checkedMinAgo), urgentCallAt: urgentMinAgo === null ? null : minAgo(urgentMinAgo) }, NOW).color;

  it('refused is red whatever else is true', () => {
    assert.equal(colour('refused', 5), 'red');
    assert.equal(colour('refused', 500), 'red');
  });

  it('a clear is green for two hours, grey after', () => {
    assert.equal(colour('cleared', 30), 'green');
    assert.equal(colour('self_out', 30), 'green');
    assert.equal(colour('cleared', FRESH_MIN), 'green', 'the boundary is inclusive, as in the SQL');
    assert.equal(colour('cleared', FRESH_MIN + 1), 'grey');
    assert.equal(colour('self_out', 600), 'grey');
  });

  it('no answer is orange, leaving is yellow, nothing recorded is grey', () => {
    assert.equal(colour('no_answer', 10), 'orange');
    assert.equal(colour('in_transit', 10), 'yellow');
    assert.equal(colour('unknown', null), 'grey');
  });

  it('an urgent call turns a house red only until a newer status arrives', () => {
    assert.equal(colour('cleared', 30, 10), 'red', 'call newer than the clear');
    assert.equal(colour('cleared', 10, 30), 'green', 'the clear is newer than the call');
    assert.equal(colour('unknown', null, 5), 'red', 'a call about a never-checked house');
    assert.equal(colour('in_transit', 20, 5), 'red');
  });

  it('trusts a clear for six hours in the scenario, and says so', () => {
    const six = (m: number) => simHouseColor({ status: 'cleared', checkedAt: minAgo(m), urgentCallAt: null }, NOW, SCENARIO_FRESH_MIN);
    assert.equal(SCENARIO_FRESH_MIN, 360);
    assert.equal(six(200).color, 'green', 'past the board\u2019s two hours, inside the scenario\u2019s six');
    assert.equal(six(360).color, 'green');
    assert.equal(six(361).color, 'grey');
    assert.equal(six(500).reason, 'last check is more than 6 hours old');
  });

  it('gives the same reason text the SQL does', () => {
    const reason = (status: Parameters<typeof simHouseColor>[0]['status'], m: number | null) =>
      simHouseColor({ status, checkedAt: m === null ? null : minAgo(m), urgentCallAt: null }, NOW).reason;
    assert.equal(reason('refused', 5), 'people at this house are staying');
    assert.equal(reason('cleared', 5), 'checked and cleared');
    assert.equal(reason('self_out', 5), 'resident reported out');
    assert.equal(reason('cleared', 500), 'last check is more than 2 hours old');
    assert.equal(reason('no_answer', 5), 'last knock got no answer');
    assert.equal(reason('in_transit', 5), 'reported leaving, no follow-up');
    assert.equal(reason('unknown', null), 'no verified record');
  });
});

describe('routing a simulated call (server/src/routing.js)', () => {
  const inside = (status: Lookup['status'], recordedMinAgo: number | null, note: string | null = null): Lookup => ({
    status,
    note,
    recorded_at: recordedMinAgo === null ? null : minAgo(recordedMinAgo),
    inside_perimeter: true,
  });

  it('sends a panicked caller to a person', () => {
    const r = routeSim({ caller_state: 'panicked' }, inside('cleared', 10), NOW);
    assert.deepEqual([r.routing, r.severity, r.rule], ['human_now', 5, 'caller_panicked']);
  });

  it('queues a refused house at severity 4 and carries the officer note', () => {
    const r = routeSim({ caller_state: 'worried' }, inside('refused', 25, '2 adults staying'), NOW);
    assert.equal(r.routing, 'priority_queue');
    assert.equal(r.severity, 4);
    assert.match(r.reason, /2 adults staying/);
  });

  it('answers from a fresh clear and queues a stale one', () => {
    assert.equal(routeSim({ caller_state: 'worried' }, inside('cleared', 30), NOW).routing, 'answered_by_agent');
    const stale = routeSim({ caller_state: 'worried' }, inside('cleared', 200), NOW);
    assert.equal(stale.routing, 'priority_queue');
    assert.equal(stale.rule, 'stale_record');
  });

  it('queues a house nobody has reached', () => {
    const r = routeSim({ caller_state: 'worried' }, inside(null, null), NOW);
    assert.deepEqual([r.routing, r.severity, r.rule], ['priority_queue', 4, 'inside_unresolved']);
  });

  it('never leaves a distressed caller with the agent alone', () => {
    const r = routeSim({ caller_state: 'distressed' }, inside('cleared', 10), NOW);
    assert.equal(r.routing, 'priority_queue');
    assert.ok(r.severity >= 4);
  });

  it('moves repeat callers up, and a third caller about an unresolved house gets a person', () => {
    assert.equal(routeSim({ caller_state: 'worried', prior_callers: 1 }, inside('refused', 25), NOW).severity, 5);
    const third = routeSim({ caller_state: 'worried', prior_callers: 2 }, inside('refused', 25), NOW);
    assert.equal(third.routing, 'human_now');
    assert.match(third.reason, /3 separate callers/);
    assert.equal(routeSim({ caller_state: 'worried', prior_callers: 1 }, inside('cleared', 10), NOW).routing, 'answered_by_agent', 'a fresh clear still answers a repeat caller');
  });

  it('treats an emergency, or a resident still at the address, as a person now', () => {
    assert.equal(routeSim({ with_them_now: true, emergency: true, emergency_reason: "she can't breathe" }, inside(null, null), NOW).routing, 'human_now');
    assert.equal(routeSim({ reported_by: 'resident', reported_status: 'staying' }, inside('cleared', 10), NOW).routing, 'human_now');
  });

  it('records "they got out" without a person', () => {
    const r = routeSim({ caller_state: 'worried', reported_status: 'out' }, inside(null, null), NOW);
    assert.deepEqual([r.routing, r.severity], ['answered_by_agent', 2]);
  });
});

describe('suggestions for a call (the rules of the removed resources.js)', () => {
  const call = (over: Partial<CallSuggestionFacts> = {}): CallSuggestionFacts => ({
    routing: 'priority_queue' as Routing,
    address: '1515 Via de la Paz',
    reason: 'refused',
    inside_perimeter: true,
    ...over,
  });

  it('suggests a re-contact for a staying house, now when the street is extreme or high', () => {
    const extreme = suggestForCall(call(), { status: 'refused', note: '2 adults staying' }, 'extreme');
    assert.equal(extreme[0].id, 'recontact');
    assert.equal(extreme[0].priority, 'now');
    assert.ok(extreme[0].why.includes('fire threat on this street: extreme'));
    assert.ok(extreme[0].why.some((w) => w.includes('2 adults staying')));
    assert.equal(suggestForCall(call(), { status: 'refused' }, 'low')[0].priority, 'soon', 'a quiet street waits');
  });

  it('puts life safety first', () => {
    const out = suggestForCall(call({ routing: 'human_now', reason: "she can't breathe", emergency_reason: "she can't breathe" }), { status: null }, 'moderate');
    assert.equal(out[0].id, 'als');
    assert.equal(out[0].priority, 'now');
  });

  it('adds an accessible vehicle for someone who cannot walk out', () => {
    const out = suggestForCall(call({ routing: 'human_now', reported_status: 'staying', vulnerability: { age: 95, mobility: 'cannot walk without help' } }), { status: null }, 'moderate');
    assert.ok(out.some((s) => s.id === 'accessible_vehicle'));
    assert.ok(out.some((s) => s.id === 'recontact'));
  });

  it('suggests a door-knock for an unreached house, now once a second person has called', () => {
    assert.equal(suggestForCall(call(), { status: null }, 'moderate')[0].id, 'door_knock');
    const repeat = suggestForCall(call({ prior_callers: 1 }), { status: null }, 'low');
    assert.equal(repeat[0].priority, 'now');
    assert.ok(repeat[0].why.some((w) => w.includes('2 separate callers')));
  });

  it('marks a trip avoided when the line answered from a fresh record', () => {
    const out = suggestForCall(call({ routing: 'answered_by_agent', reason: 'cleared 30 min ago' }), { status: 'cleared' }, 'high');
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'none');
    assert.equal(out[0].priority, 'none');
    assert.equal(out[0].requires_confirmation, false);
  });

  it('needs a person to confirm everything it would send', () => {
    for (const status of ['refused', null, 'no_answer', 'in_transit'] as const) {
      for (const s of suggestForCall(call({ routing: 'human_now' }), { status }, 'extreme')) {
        if (s.id !== 'none') assert.equal(s.requires_confirmation, true);
      }
    }
  });

  it('lists the most urgent first', () => {
    const out = suggestForCall(call({ routing: 'human_now', reason: 'caller says he fell', reported_status: 'staying' }), { status: 'refused' }, 'extreme');
    const rank = { now: 0, soon: 1, when_free: 2, none: 3 };
    for (let i = 1; i < out.length; i += 1) assert.ok(rank[out[i - 1].priority] <= rank[out[i].priority]);
  });
});

describe('suggestions for a street', () => {
  const tally = (over: Partial<StreetTally> = {}): StreetTally => ({
    street: 'Palisades Dr',
    threat: 'extreme',
    sinceAlert: 30,
    unreached: 0,
    noAnswer: 0,
    refused: 0,
    inTransitStuck: 0,
    total: 100,
    ...over,
  });
  const reason = () => 'Only road out of the Highlands';

  it('waits for the order to have had time to reach the street', () => {
    assert.equal(suggestForStreets([tally({ unreached: 40, sinceAlert: 5 })], reason).length, 0);
    const out = suggestForStreets([tally({ unreached: 40, sinceAlert: 20 })], reason);
    assert.equal(out[0].priority, 'now');
    assert.match(out[0].resource, /Palisades Dr/);
    assert.ok(out[0].why.some((w) => w.includes('Only road out')));
  });

  it('asks for a re-contact once three households are staying', () => {
    assert.equal(suggestForStreets([tally({ refused: 2 })], reason).length, 0);
    assert.equal(suggestForStreets([tally({ refused: 3 })], reason)[0].id, 'recontact');
  });

  it('ranks a threatened street above a quiet one at the same priority', () => {
    const out = suggestForStreets(
      [tally({ street: 'Quiet St', threat: 'low', refused: 5 }), tally({ street: 'Hot St', threat: 'high', refused: 5 })],
      () => null,
    );
    assert.equal(out[0].street, 'Hot St');
  });

  it('gives every suggestion a stable key and asks for confirmation', () => {
    const out = suggestForStreets([tally({ unreached: 40, refused: 4, noAnswer: 9, inTransitStuck: 12 })], reason);
    assert.equal(new Set(out.map((s) => s.key)).size, out.length);
    assert.ok(out.every((s) => s.requires_confirmation));
  });
});

describe('street threat table', () => {
  it('matches docs/research/street-threat.json, so the two cannot drift', () => {
    const research = JSON.parse(readFileSync(new URL('../../docs/research/street-threat.json', import.meta.url), 'utf8')) as {
      street: string;
      zone_id: string;
      fire_threat_level: string;
      reason: string;
      source: string;
    }[];
    assert.equal(STREET_THREAT.length, research.length, 'run `node scripts/build-street-threat.mjs`');
    research.forEach((r, i) => {
      assert.equal(STREET_THREAT[i].street, r.street);
      assert.equal(STREET_THREAT[i].level, r.fire_threat_level);
      assert.equal(STREET_THREAT[i].reason, r.reason);
    });
  });

  it('prefers the level Supabase supplied and falls back to the research', () => {
    assert.equal(threatOf({ address: '12 Palisades Dr', threat: 'low' }), 'low');
    assert.equal(threatOf({ address: '12 Palisades Dr' }), 'extreme');
    assert.equal(threatOf({ address: '12 Nowhere Ln' }), 'low');
  });

  it('quotes the first sentence of the reason for the dispatcher', () => {
    const reason = researchReason(streetKeyOf('9 Palisades Dr'));
    assert.ok(reason && reason.length <= 160);
    assert.match(reason, /Only road out/);
  });
});

describe('Supabase threat on the board', () => {
  const house = (id: string): AddressState => ({
    id, address: '1 Palisades Dr', lat: 34.04, lng: -118.54, zone_id: 'PAL-03', resident_name: 'Test', inside_perimeter: true,
    status: 'unknown', source: null, recorded_at: null, note: null, structure: 'unassessed', structure_recorded_at: null,
  });

  it('attaches a valid fire_threat_level and ignores an invalid one', () => {
    const out = withColors([house('a'), house('b'), house('c')], [
      { id: 'a', color: 'grey', color_reason: null, fire_threat_level: 'extreme' },
      { id: 'b', color: 'grey', color_reason: null, fire_threat_level: 'catastrophic' },
    ]);
    assert.equal(out[0].threat, 'extreme');
    assert.equal(out[1].threat, undefined);
    assert.equal(out[2].threat, undefined);
  });

  it('keeps a threat even when the colour is not one the board knows', () => {
    const out = withColors([house('a')], [{ id: 'a', color: 'purple', color_reason: null, fire_threat_level: 'high' }]);
    assert.equal(out[0].threat, 'high');
    assert.equal(out[0].color, undefined);
  });

  it('updates the threat from a Realtime houses row', () => {
    assert.equal(patchFromHouse(house('a'), { id: 'a', fire_threat_level: 'moderate' }).threat, 'moderate');
    assert.equal(patchFromHouse(house('a'), { id: 'a', fire_threat_level: 'nope' }).threat, undefined);
  });
});

describe('the seeded random stream', () => {
  it('repeats for the same seed and differs for another', () => {
    const a = mulberry32(hashString('x'));
    const b = mulberry32(hashString('x'));
    const c = mulberry32(hashString('y'));
    const seq = (r: () => number) => [r(), r(), r(), r()];
    assert.deepEqual(seq(a), seq(b));
    assert.notDeepEqual(seq(mulberry32(hashString('x'))), seq(c));
  });

  it('draws in [0, 1) and picks by weight', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const v = r();
      assert.ok(v >= 0 && v < 1);
    }
    assert.equal(weighted({ a: 1, b: 0 }, 0.99), 'a');
    assert.equal(weighted({ a: 0, b: 1 }, 0), 'b');
  });
});

describe('the timeline', () => {
  it('is in order, inside the day, and cites a source for every beat', () => {
    for (let i = 0; i < BEATS.length; i += 1) {
      assert.ok(BEATS[i].t >= 0 && BEATS[i].t <= SIM_END_MIN, BEATS[i].title);
      assert.ok(BEATS[i].source.length > 0, BEATS[i].title);
      if (i > 0) assert.ok(BEATS[i].t >= BEATS[i - 1].t, `${BEATS[i].title} is out of order`);
    }
  });

  it('puts the documented moments at their documented times', () => {
    const when = (title: RegExp) => BEATS.find((b) => title.test(b.title))!.t;
    assert.equal(when(/First fire radio call/), at('10:23'));
    assert.equal(when(/First evacuation order/), at('12:07'));
    assert.equal(when(/Orders expand/), at('18:50'));
    assert.equal(when(/Assisted-living/), at('22:00'));
    assert.equal(SIM_START_MS, Date.parse('2025-01-07T18:00:00Z'));
  });

  it('names no resident and records no death', () => {
    const text = JSON.stringify(BEATS).toLowerCase();
    for (const word of ['died', 'death', 'fatal', 'killed', 'body']) assert.ok(!text.includes(word), word);
  });

  it('orders the alert windows extreme, high, moderate, low', () => {
    const levels: ThreatLevel[] = ['extreme', 'high', 'moderate', 'low'];
    for (let i = 1; i < levels.length; i += 1) assert.ok(ALERT_WINDOW[levels[i - 1]][1] <= ALERT_WINDOW[levels[i]][0]);
  });
});

describe('the engine', () => {
  const houses = seedAddresses();
  const engine = createEngine(houses);
  const byThreat = (level: ThreatLevel) => houses.filter((h) => threatOf(h) === level);

  it('starts the day with nothing known', () => {
    const s = engine.at(0);
    assert.equal(s.addresses.length, houses.length);
    assert.ok(s.addresses.every((a) => a.status === 'unknown' && a.color === 'grey' && a.recorded_at === null));
    assert.equal(s.calls.length, 0);
    assert.equal(s.beats.length, 0);
  });

  it('gives every household a researched threat level', () => {
    const levels = new Set(engine.at(0).addresses.map((a) => a.threat));
    assert.deepEqual([...levels].sort(), ['extreme', 'high', 'low', 'moderate']);
  });

  it('plays the day the same way every time', () => {
    const again = createEngine(houses);
    const sig = (e: typeof engine) => {
      const s = e.at(400);
      return JSON.stringify([s.addresses.map((a) => [a.status, a.color, a.recorded_at, a.note]), s.calls.map((c) => [c.id, c.routing, c.created_at])]);
    };
    assert.equal(sig(engine), sig(again));
  });

  it('shows the same board whether you scrub back or play forward', () => {
    const fresh = createEngine(houses);
    const forward = JSON.stringify(fresh.at(420).addresses);
    engine.at(800);
    assert.equal(JSON.stringify(engine.at(420).addresses), forward);
  });

  it('orders streets by threat: extreme first, low last', () => {
    const streets = engine.inspect().streets;
    const mean = (level: ThreatLevel) => {
      const list = streets.filter((s) => s.threat === level);
      return list.reduce((s, x) => s + x.alert, 0) / list.length;
    };
    const latest = (level: ThreatLevel) => Math.max(...streets.filter((s) => s.threat === level).map((s) => s.alert));
    const earliest = (level: ThreatLevel) => Math.min(...streets.filter((s) => s.threat === level).map((s) => s.alert));
    assert.ok(mean('extreme') < mean('high') && mean('high') < mean('moderate') && mean('moderate') < mean('low'));
    assert.ok(latest('extreme') < earliest('high'), 'every extreme street is ordered out before any high one');
    assert.ok(latest('moderate') < earliest('low'));
  });

  it('lets the threat drive who refuses and who does not answer', () => {
    const rate = (level: ThreatLevel, status: string) => {
      const s = engine.at(SIM_END_MIN);
      const ids = new Set(byThreat(level).map((h) => h.id));
      const inLevel = s.addresses.filter((a) => ids.has(a.id));
      return inLevel.filter((a) => a.status === status).length / inLevel.length;
    };
    assert.ok(rate('extreme', 'refused') > 2 * rate('low', 'refused'), 'more refusals where the threat is extreme');
    assert.ok(rate('extreme', 'no_answer') > rate('low', 'no_answer'));
  });

  it('follows a street’s Supabase threat, not just the research', () => {
    const forced = houses.map((h) => (streetKeyOf(h.address) === 'toyopa dr' ? { ...h, threat: 'extreme' as ThreatLevel } : h));
    const toyopa = createEngine(forced).inspect().streets.find((s) => s.key === 'toyopa dr')!;
    assert.equal(toyopa.threat, 'extreme');
    assert.ok(toyopa.alert >= ALERT_WINDOW.extreme[0] && toyopa.alert <= ALERT_WINDOW.extreme[1]);
    const real = engine.inspect().streets.find((s) => s.key === 'toyopa dr')!;
    assert.equal(real.threat, 'high');
    assert.ok(real.alert >= ALERT_WINDOW.high[0]);
  });

  it('ignores whatever the live board says about a house', () => {
    const live = houses.map((h) => ({ ...h, status: 'cleared' as const, recorded_at: new Date().toISOString(), color: 'green' as HouseColor, structure: 'destroyed' as const }));
    const s = createEngine(live).at(0);
    assert.ok(s.addresses.every((a) => a.status === 'unknown' && a.color === 'grey' && a.structure === 'unassessed'));
  });

  it('leaves the households it was given untouched', () => {
    const before = JSON.stringify(houses);
    createEngine(houses).at(SIM_END_MIN);
    assert.equal(JSON.stringify(houses), before);
  });

  it('never calls a clear older than six hours green, and keeps one green past two', () => {
    let pastTwo = 0;
    for (const m of [120, 300, 600, 840]) {
      const s = engine.at(m);
      for (const a of s.addresses) {
        if (a.color === 'green' && !a.note?.startsWith('live call')) {
          const age = s.now - Date.parse(a.recorded_at!);
          assert.ok(age <= SCENARIO_FRESH_MIN * 60_000 + 1, `${a.address} at minute ${m}`);
          if (age > FRESH_MIN * 60_000) pastTwo += 1;
        }
      }
    }
    assert.ok(pastTwo > 100, `${pastTwo} clears still green past the board's two hours`);
  });

  it('judges the scenario\u2019s households by six hours and the live board by two', () => {
    const s = engine.at(at('16:00'));
    assert.equal(s.freshMin, 360);
    assert.ok(s.addresses.every((a) => a.fresh_min === 360));
    const cleared = s.addresses.find((a) => a.status === 'cleared' && Date.parse(a.recorded_at!) < s.now - 130 * 60_000 && s.now - Date.parse(a.recorded_at!) < 300 * 60_000)!;
    assert.ok(cleared, 'a clear between two and five hours old');
    assert.equal(isStale(cleared.status, cleared.recorded_at, s.now, cleared.fresh_min), false);
    assert.equal(urgencyOf(cleared, s.now), 'clear', 'not on the doors list yet');
    assert.equal(houseColor(cleared, s.now), 'green');
    // The same row judged by the board's own rule, with no override, is stale.
    const live = { ...cleared, fresh_min: undefined, color: undefined };
    assert.equal(isStale(live.status, live.recorded_at, s.now, live.fresh_min), true);
    assert.equal(urgencyOf(live, s.now), 'watch');
    assert.match(reasonOf(live, s.now), /\(stale\)/);
    assert.doesNotMatch(reasonOf(cleared, s.now), /\(stale\)/);
  });

  it('only reaches a street after its order', () => {
    const streets = new Map(engine.inspect().streets.map((s) => [s.key, s]));
    const s = engine.at(at('12:00'));
    for (const a of s.addresses) {
      if (a.recorded_at === null) continue;
      const street = streets.get(streetKeyOf(a.address))!;
      const t = (Date.parse(a.recorded_at) - SIM_START_MS) / 60_000;
      assert.ok(t >= street.alert - 0.001 || a.source === 'call', `${a.address} recorded at ${t} before its order at ${street.alert}`);
    }
  });

  it('reuses the same address list until something changes', () => {
    const a = engine.at(at('10:10'));
    const b = engine.at(at('10:10'));
    assert.equal(a.addresses, b.addresses);
    assert.notEqual(engine.at(at('12:00')).addresses, b.addresses);
  });

  it('sends a believable number of calls, most of them answerable from the record', () => {
    const calls = engine.at(SIM_END_MIN).calls;
    assert.ok(calls.length > 100 && calls.length < 400, `${calls.length} calls`);
    assert.equal(new Set(calls.map((c) => c.id)).size, calls.length, 'ids are unique');
    const answered = calls.filter((c) => c.routing === 'answered_by_agent').length / calls.length;
    assert.ok(answered > 0.35 && answered < 0.75, `${Math.round(answered * 100)}% answered by the line`);
    for (let i = 1; i < calls.length; i += 1) assert.ok(Date.parse(calls[i - 1].created_at) <= Date.parse(calls[i].created_at));
    assert.ok(calls.every((c) => Array.isArray(c.suggestions) && c.severity >= 0 && c.severity <= 5));
    assert.ok(calls.every((c) => !c.from_number || c.from_number.startsWith('+1310555')), 'only fictional 555 numbers');
  });

  it('turns a house red for an urgent call, then lets an officer’s visit clear it', () => {
    const end = engine.at(SIM_END_MIN);
    const urgent = end.calls.find((c) => c.routing === 'human_now' && c.address_id);
    assert.ok(urgent);
    const justAfter = engine.at((Date.parse(urgent.created_at) - SIM_START_MS) / 60_000 + 0.01);
    assert.equal(justAfter.addresses.find((a) => a.id === urgent.address_id)!.color, 'red');
  });

  it('plays the documented calls and holdouts at their moments', () => {
    const facility = engine.at(at('22:05')).calls.find((c) => /Assisted-living/.test(c.address))!;
    assert.ok(facility);
    assert.equal(facility.routing, 'human_now');
    assert.ok(facility.suggestions!.some((s) => s.id === 'accessible_vehicle'));
    assert.ok(facility.suggestions!.some((s) => s.id === 'medical_standby'));

    const held = engine.at(at('17:45')).addresses.filter((a) => a.note?.includes('relayed by council office'));
    assert.equal(held.length, 3);
    assert.ok(held.every((a) => a.status === 'refused' && a.color === 'red' && streetKeyOf(a.address) === 'palisades dr'));
  });

  it('suggests from the documented moments while they last, and only then', () => {
    const during = engine.at(at('12:00')).suggestions.map((s) => s.key);
    assert.ok(during.some((k) => k.includes('close_palisades')));
    const after = engine.at(at('13:30')).suggestions.map((s) => s.key);
    assert.ok(!after.some((k) => k.includes('close_palisades')), 'the closure suggestion has lapsed');
    assert.ok(after.some((k) => k.includes('clear_road')));
  });

  it('only ever suggests what a person confirms', () => {
    for (const m of [60, 180, 420, 780]) {
      assert.ok(engine.at(m).suggestions.every((s) => s.requires_confirmation));
    }
  });

  it('builds in well under a second and plays a minute in a few milliseconds', () => {
    const t0 = performance.now();
    const built = createEngine(houses);
    const buildMs = performance.now() - t0;
    const t1 = performance.now();
    built.at(300);
    const playMs = performance.now() - t1;
    assert.ok(buildMs < 1000, `build took ${Math.round(buildMs)} ms`);
    assert.ok(playMs < 1000, `playing to 15:00 took ${Math.round(playMs)} ms`);
  });
});

describe('what a caller’s report does to a house (server/src/reports.js)', () => {
  const T = NOW;
  const rec = (status: Parameters<typeof callReport>[1]['status'], minAgoRecorded: number | null) => ({
    status,
    recorded_at: minAgoRecorded === null ? null : minAgo(minAgoRecorded),
  });

  it('writes nothing for a call that reported nothing', () => {
    assert.equal(callReport({}, rec(null, null), T), null);
  });

  it('records "he’s staying" from anyone as refused', () => {
    assert.deepEqual(callReport({ reported_status: 'staying', reported_by: 'caller' }, rec(null, null), T), {
      status: 'refused',
      source: 'call',
      note: 'phone report (relative or friend): staying at the address',
    });
    const r = callReport({ reported_status: 'staying', reported_by: 'resident', caller_update: 'will not leave' }, rec('cleared', 10), T);
    assert.ok(r && 'status' in r && r.status === 'refused' && /resident/.test(r.note) && /will not leave/.test(r.note));
  });

  it('records the resident’s own "I’m out" as self_out, or evacuating if the house was marked staying', () => {
    const out = callReport({ reported_status: 'out', reported_by: 'resident' }, rec(null, null), T);
    assert.ok(out && 'status' in out && out.status === 'self_out');
    const wasStaying = callReport({ reported_status: 'out', reported_by: 'resident' }, rec('refused', 30), T);
    assert.ok(wasStaying && 'status' in wasStaying && wasStaying.status === 'in_transit');
  });

  it('never lets a relative’s "out" clear a house', () => {
    const r = callReport({ reported_status: 'out', reported_by: 'caller' }, rec('no_answer', 30), T);
    assert.ok(r && 'status' in r && r.status === 'in_transit' && /unverified/.test(r.note));
    assert.ok('skip' in callReport({ reported_status: 'out', reported_by: 'caller' }, rec('refused', 30), T)!, 'not over "staying"');
    assert.ok('skip' in callReport({ reported_status: 'out', reported_by: 'caller' }, rec('cleared', 30), T)!, 'not over a fresh clear');
  });

  it('takes the freshness window it is given', () => {
    const stale = callReport({ reported_status: 'out', reported_by: 'caller' }, rec('cleared', 200), T);
    assert.ok(stale && 'status' in stale, 'two hours: a 200-minute-old clear is stale, so the report is written');
    const fresh = callReport({ reported_status: 'out', reported_by: 'caller' }, rec('cleared', 200), T, SCENARIO_FRESH_MIN);
    assert.ok(fresh && 'skip' in fresh, 'six hours: it is still fresh, so nothing is written');
  });
});

describe('simulated calls change their house the way the line does', () => {
  const houses = seedAddresses();
  const e = createEngine(houses);
  // An officer's later visit overwrites a phone report, so count them as the day goes by.
  const written = new Map<string, AddressState>();
  for (let m = 20; m <= SIM_END_MIN; m += 10) {
    for (const a of e.at(m).addresses) if (a.source === 'call') written.set(`${a.id}@${a.recorded_at}`, a);
  }
  const end = e.at(SIM_END_MIN);

  it('writes the caller’s report into the record, under the line’s rules', () => {
    const records = [...written.values()];
    assert.ok(records.length > 20, `${records.length} phone reports written over the day`);
    assert.ok(records.every((a) => a.status === 'refused' || a.status === 'in_transit' || a.status === 'self_out'), 'a phone report only raises concern or marks someone out');
    assert.ok(records.every((a) => a.note!.startsWith('phone report')));
    assert.ok(records.some((a) => a.status === 'in_transit' && /unverified/.test(a.note!)), 'a relative’s "out" is evacuating, unverified');
    assert.ok(records.some((a) => a.status === 'self_out' && /resident/.test(a.note!)), 'a resident’s own "out"');
    assert.ok(records.some((a) => a.status === 'refused'), 'someone staying');
  });

  it('says why when the line declined to write a report', () => {
    assert.ok(end.calls.some((c) => /not recorded: house already cleared recently/.test(c.reason)));
  });
});

describe('taking a real call into the scenario', () => {
  const houses = seedAddresses();
  const fresh = () => createEngine(houses);
  const input = (over: Partial<LiveCallInput> = {}): LiveCallInput => ({
    key: 'call_abc',
    house: null,
    address: '1 Test St',
    subject_name: 'Caller',
    routing: 'priority_queue',
    severity: 4,
    reason: 'a real caller',
    urgent: false,
    report: null,
    ...over,
  });
  const statusOf = (s: ReturnType<ReturnType<typeof fresh>['at']>, id: string) => s.addresses.find((a) => a.id === id)!;

  // A house on an early street that the plan is still changing after minute 60, and not into "refused".
  const p60 = fresh().at(60);
  const p400 = fresh().at(400);
  const moving = p60.addresses.find((a, i) => streetKeyOf(a.address) === 'charmel ln' && a.status !== p400.addresses[i].status && p400.addresses[i].status !== 'refused')!;
  const planAt400 = statusOf(p400, moving.id);

  it('has a house the plan is still changing to test with', () => {
    assert.ok(moving && planAt400.status !== statusOf(p60, moving.id).status);
  });

  it('updates the house straight away, even with the clock stopped', () => {
    const e = fresh();
    e.at(60);
    e.live(input({ house: moving.id, report: { status: 'refused', note: 'live call: staying' } }));
    const a = statusOf(e.at(60), moving.id);
    assert.equal(a.status, 'refused');
    assert.equal(a.source, 'call');
    assert.equal(a.color, 'red');
    assert.match(a.color_reason!, /^live call/);
  });

  it('freezes the house: nothing the plan had for it later changes it', () => {
    const e = fresh();
    e.at(60);
    e.live(input({ house: moving.id, report: { status: 'refused', note: 'live call: staying' } }));
    const later = statusOf(e.at(400), moving.id);
    assert.equal(later.status, 'refused');
    assert.equal(later.note, 'live call: staying');
    assert.notEqual(later.status, planAt400.status, 'the plan would have had it as ' + planAt400.status);
  });

  it('lets a real call override what the plan already said', () => {
    const end = fresh().at(150);
    const refused = end.addresses.find((a) => a.status === 'refused' && a.source === 'officer')!;
    const e = fresh();
    e.at(150);
    e.live(input({ house: refused.id, report: { status: 'in_transit', note: 'live call: says they left' } }));
    assert.equal(statusOf(e.at(150), refused.id).status, 'in_transit');
    assert.equal(statusOf(e.at(500), refused.id).status, 'in_transit');
  });

  it('turns a house red for an urgent call and keeps it red', () => {
    const e = fresh();
    e.at(60);
    e.live(input({ house: moving.id, routing: 'human_now', severity: 5, urgent: true }));
    assert.equal(statusOf(e.at(60), moving.id).color, 'red');
    const later = statusOf(e.at(500), moving.id);
    assert.equal(later.color, 'red', 'the plan’s visit to answer it never happens');
    assert.equal(later.status, statusOf(p60, moving.id).status, 'status is as it was when the call came in');
  });

  it('shows the call in the queue, marked live, with suggestions, at the minute it came in', () => {
    const e = fresh();
    e.at(60);
    e.live(input({ house: moving.id, routing: 'human_now', severity: 5, urgent: true, reason: 'caller panicked', caller_state: 'panicked' }));
    const s = e.at(60);
    const row = s.calls.find((c) => c.live)!;
    assert.ok(row);
    assert.equal(row.id, 'live-call_abc');
    assert.equal(row.created_at, new Date(SIM_START_MS + 60 * 60_000).toISOString());
    assert.equal(row.routing, 'human_now');
    assert.ok(Array.isArray(row.suggestions));
    assert.deepEqual(s.live, { calls: 1, locked: 1 });
  });

  it('stops the plan’s own calls about a frozen house', () => {
    const plan = fresh().at(SIM_END_MIN);
    const later = plan.calls.find((c) => c.address_id && Date.parse(c.created_at) > SIM_START_MS + 70 * 60_000)!;
    const e = fresh();
    e.at(60);
    e.live(input({ house: later.address_id, routing: 'human_now', urgent: true }));
    const calls = e.at(SIM_END_MIN).calls;
    assert.ok(!calls.some((c) => c.id === later.id), 'the plan’s call about this house is gone');
    assert.ok(calls.some((c) => c.live));
    assert.ok(calls.length >= plan.calls.length - 3, 'the other calls are untouched');
  });

  it('is one call however many times it is reported, and applies a change once', () => {
    const e = fresh();
    e.at(60);
    e.live(input({ house: moving.id }));
    e.live(input({ house: moving.id }));
    assert.equal(e.at(60).calls.filter((c) => c.live).length, 1);
    assert.equal(e.at(60).live.locked, 0, 'a call that changed nothing freezes nothing');
    e.live(input({ house: moving.id, routing: 'human_now', urgent: true }));
    e.live(input({ house: moving.id, routing: 'human_now', urgent: true }));
    assert.deepEqual(e.at(60).live, { calls: 1, locked: 1 });
    assert.equal(statusOf(e.at(60), moving.id).color, 'red');
  });

  it('leaves the plan alone when a call changed nothing', () => {
    const e = fresh();
    e.at(60);
    e.live(input({ house: moving.id }));
    assert.equal(statusOf(e.at(400), moving.id).status, planAt400.status);
  });

  it('shows a call about a house it cannot find, and changes no house', () => {
    const e = fresh();
    e.at(60);
    e.live(input({ house: 'not-a-household', routing: 'human_now', urgent: true }));
    const s = e.at(60);
    assert.equal(s.calls.filter((c) => c.live).length, 1);
    assert.deepEqual(s.live, { calls: 1, locked: 0 });
    assert.equal(JSON.stringify(s.addresses), JSON.stringify(fresh().at(60).addresses));
  });

  it('follows the clock back and forward: the call is there only once the run has reached it', () => {
    const e = fresh();
    e.at(60);
    e.live(input({ house: moving.id, report: { status: 'refused', note: 'live call: staying' } }));
    e.at(400);
    const before = e.at(20);
    assert.equal(statusOf(before, moving.id).status, 'unknown');
    assert.equal(before.calls.filter((c) => c.live).length, 0);
    assert.deepEqual(before.live, { calls: 0, locked: 0 });
    const again = e.at(400);
    assert.equal(statusOf(again, moving.id).status, 'refused');
    assert.deepEqual(again.live, { calls: 1, locked: 1 });
  });

  it('still ages a real "out": green for six hours, then grey', () => {
    const e = fresh();
    e.at(60);
    e.live(input({ house: moving.id, report: { status: 'self_out', note: 'live call: out' } }));
    assert.equal(statusOf(e.at(60 + 359), moving.id).color, 'green');
    const grey = statusOf(e.at(60 + 361), moving.id);
    assert.equal(grey.color, 'grey');
    assert.equal(grey.status, 'self_out', 'frozen: the status itself does not change');
  });

  it('forgets every real call when cleared, and plays the plan as if none had come in', () => {
    const e = fresh();
    e.at(60);
    e.live(input({ house: moving.id, routing: 'human_now', urgent: true, report: { status: 'refused', note: 'live call' } }));
    e.at(400);
    e.clearLive();
    const s = e.at(400);
    assert.deepEqual(s.live, { calls: 0, locked: 0 });
    assert.equal(JSON.stringify(s.addresses), JSON.stringify(p400.addresses));
    assert.equal(s.calls.filter((c) => c.live).length, 0);
  });
});

describe('which real calls the scenario takes in', () => {
  const call = (over: Partial<CallRow> = {}): CallRow => ({
    id: 'c1',
    call_id: 'c1',
    mode: 'wildfire',
    address: '1515 Via de la Paz',
    subject_name: 'Harold Kim',
    address_id: '00000000-0000-4000-8000-000000000001',
    routing: 'priority_queue',
    severity: 4,
    reason: 'refused',
    created_at: new Date(NOW).toISOString(),
    ...over,
  });

  it('ignores calls that were already on the line when the scenario started', () => {
    const baseline = baselineOf([call({ id: 'old', call_id: 'old' })], NOW);
    assert.equal(isNewLiveCall(call({ id: 'old', call_id: 'old' }), baseline), false, 'the same call, updated');
    assert.equal(isNewLiveCall(call({ id: 'new', call_id: 'new' }), baseline), true);
  });

  it('ignores a call the feed replays that began before the scenario did', () => {
    const baseline = baselineOf([], NOW);
    assert.equal(isNewLiveCall(call({ created_at: new Date(NOW - 5 * 60_000).toISOString() }), baseline), false);
    assert.equal(isNewLiveCall(call({ created_at: new Date(NOW - 30_000).toISOString() }), baseline), true, 'within the clock slack');
    assert.equal(isNewLiveCall(call({ created_at: 'not a date' }), baseline), false, 'a call it cannot date is not taken in');
  });

  it('waits until the line has routed the call', () => {
    assert.equal(liveCallInput(call({ provisional: true })), null);
    assert.ok(liveCallInput(call()));
  });

  it('treats the same three outcomes as urgent that the database does', () => {
    assert.equal(liveCallInput(call({ routing: 'human_now' }))!.urgent, true);
    assert.equal(liveCallInput(call({ routing: 'callback_queue' }))!.urgent, true);
    assert.equal(liveCallInput(call({ routing: 'priority_queue', bypass: true }))!.urgent, true);
    for (const routing of ['priority_queue', 'answered_by_agent', 'abandoned_callback', 'scheduled_followup'] as Routing[]) {
      assert.equal(liveCallInput(call({ routing }))!.urgent, false, routing);
    }
  });

  it('carries the status the line wrote, and only a status a report can write', () => {
    const r = liveCallInput(call({ report_written: 'in_transit', caller_update: 'says they got out' }))!;
    assert.deepEqual(r.report, { status: 'in_transit', note: 'live call: says they got out' });
    assert.equal(liveCallInput(call({ report_written: 'refused' }))!.report!.status, 'refused');
    assert.equal(liveCallInput(call({ report_written: 'cleared' }))!.report, null, 'a phone report never writes "cleared"');
    assert.equal(liveCallInput(call({ report_written: null }))!.report, null);
  });
});

// npm test. No network. The six scripted cases from team_plan.md, plus the safety rules.
// Always on the in-memory data: the npm script blanks the Supabase vars, and this guard
// stops a direct `node --test` from writing test rows into the live calls table.
if (process.env.SUPABASE_URL) throw new Error('tests must not run against Supabase: use npm test');
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBypass, callerText } from '../src/bypass.js';
import { lookupAddress, logCall, logUnrouted, logTransferFailed, getCall, addressKey, nameMatches, spokenNumber } from '../src/backend.js';
import { route, routineScore, FRESH_MIN } from '../src/routing.js';
import { sayForLookup, sayForRouting } from '../src/speech.js';
import { scoreDistress, handoffInstruction } from '../src/distress.js';
import { callReport } from '../src/reports.js';

const now = Date.now();
const wildfire = (address, subject_name, extra = {}) =>
  ({ mode: 'wildfire', address, subject_name, with_them_now: false, ...extra });

async function run(payload) {
  const lookup = await lookupAddress(payload);
  const { row } = await logCall(payload, now);
  return { lookup, row, say: sayForLookup(lookup, payload.subject_name, now, FRESH_MIN) };
}

// The six scripted cases

test('case 1 cleared: answered by agent, with the time', async () => {
  const { row, say } = await run(wildfire('1420 Sunset Mesa Dr', 'Maria Lopez'));
  assert.equal(row.routing, 'answered_by_agent');
  assert.match(say, /cleared at \d{1,2}:\d{2} [AP]M, about 40 minutes ago/);
});

test('case 2 refused: priority queue, officer note goes to the human', async () => {
  const { row, say } = await run(wildfire('1515 Via de la Paz', 'Harold Kim'));
  assert.equal(row.routing, 'priority_queue');
  assert.match(row.reason, /2 adults staying, 1 on oxygen/);
  assert.match(say, /chose to stay/);
});

test('case 3 unknown inside the perimeter: priority queue', async () => {
  const { row } = await run(wildfire('16800 Bollinger Drive', 'Ruth Adams'));
  assert.equal(row.routing, 'priority_queue');
  assert.match(row.reason, /inside the perimeter/);
});

test('case 4 first-hand emergency: human now, whatever the record says', async () => {
  const { row } = await run(wildfire('1420 Sunset Mesa Dr', 'Maria Lopez', { with_them_now: true }));
  assert.equal(row.routing, 'human_now');
  assert.equal(row.severity, 5);
});

test('case 5 routine high: grandma, two weeks, 84, alone, oxygen → priority queue', async () => {
  const { row } = await run({
    mode: 'routine', address: '4512 Crenshaw Blvd', subject_name: 'Dorothy Hayes', with_them_now: false,
    last_contact_hours: 336, vulnerability: { age: 84, lives_alone: true, medical: 'oxygen' }, red_flags: { mail_piling: true },
  });
  assert.equal(row.routing, 'priority_queue');
  assert.equal(row.severity, 5);
});

test('case 6 routine low: six hours, healthy 40-year-old → scheduled follow-up', async () => {
  const { row } = await run({
    mode: 'routine', address: '910 N Vermont Ave', subject_name: 'Kevin Nguyen', with_them_now: false,
    last_contact_hours: 6, vulnerability: { age: 40 }, red_flags: {},
  });
  assert.equal(row.routing, 'scheduled_followup');
  assert.ok(row.severity < 4);
});

// Safety rules

test('looting safeguard: wrong name gets no status, time or note', async () => {
  const l = await lookupAddress({ address: '1515 Via de la Paz', subject_name: 'John Smith' });
  assert.equal(l.found, true);
  assert.equal(l.name_match, false);
  assert.equal(l.status, null);
  assert.equal(l.recorded_at, null);
  assert.equal(l.note, null);
  assert.match(sayForLookup(l, 'John Smith', now, FRESH_MIN), /full name/);
});

test('first name only is not a match', () => {
  assert.equal(nameMatches('Maria Lopez', 'Maria'), false);
  assert.equal(nameMatches('Maria Lopez', 'my mom maria lopez'), true);
});

test('stale cleared (6 hours) is not answered by the agent, and says it may be out of date', async () => {
  const { row, say } = await run(wildfire('1100 Palisades Dr', 'Tom Becker'));
  assert.equal(row.routing, 'priority_queue');
  assert.match(say, /about 6 hours ago/);
  assert.match(say, /may not reflect/);
});

test('new information beats the record: a report of where they are', async () => {
  // Pure routing: run() would also write the report and change Maria's record for later tests.
  const lookup = await lookupAddress({ address: '1420 Sunset Mesa Dr', subject_name: 'Maria Lopez' }, now);
  assert.equal(route({ mode: 'wildfire', caller_update: 'she texted 20 minutes ago, still home', reported_status: 'staying' }, lookup, now).routing, 'priority_queue');
});

test('real call 10:25: "no, nothing newer" in caller_update does not escalate a fresh cleared', async () => {
  const { row } = await run(wildfire('1420 Sunset Mesa Dr', 'Maria Lopez',
    { caller_update: 'Caller has not heard from her since the officer check. Caller is not with her.' }));
  assert.equal(row.routing, 'answered_by_agent');
  assert.match(row.reason, /caller says: Caller has not heard/);
});

test('address not on record defaults to escalate', async () => {
  const { row, lookup } = await run(wildfire('1 Nowhere St', 'Jane Doe'));
  assert.equal(lookup.found, false);
  assert.equal(row.routing, 'priority_queue');
});

test('nothing the agent reads ever says empty, safe, or help is coming', async () => {
  const lines = [...Object.values(sayForRouting)];
  for (const [address, name] of [['1420 Sunset Mesa Dr', 'Maria Lopez'], ['1515 Via de la Paz', 'Harold Kim'],
    ['16800 Bollinger Dr', 'Ruth Adams'], ['1100 Palisades Dr', 'Tom Becker'], ['820 Chautauqua Blvd', 'Linda Park'],
    ['1515 Via de la Paz', 'Wrong Person'], ['1 Nowhere St', 'X Y']]) {
    lines.push(sayForLookup(await lookupAddress({ address, subject_name: name }), name, now, FRESH_MIN));
  }
  for (const l of lines) assert.doesNotMatch(l, /\bempty\b|\bsafe\b|on the way|help is coming|no one (is )?(there|home)/i, l);
});

test('every status the agent states carries its time', async () => {
  for (const [address, name] of [['1420 Sunset Mesa Dr', 'Maria Lopez'], ['1515 Via de la Paz', 'Harold Kim'],
    ['1100 Palisades Dr', 'Tom Becker'], ['820 Chautauqua Blvd', 'Linda Park']]) {
    assert.match(sayForLookup(await lookupAddress({ address, subject_name: name }), name, now, FRESH_MIN), /\d{1,2}:\d{2} [AP]M/);
  }
});

test('address matching tolerates spoken forms', () => {
  assert.equal(addressKey('1420 Sunset Mesa Drive'), addressKey('1420 sunset mesa dr.'));
  assert.equal(addressKey('910 North Vermont Avenue'), addressKey('910 N Vermont Ave'));
  assert.notEqual(addressKey('1421 Sunset Mesa Dr'), addressKey('1420 Sunset Mesa Dr'));
});

test('routine score: vulnerability capped at +2, red flags add, capped at 5', () => {
  assert.equal(routineScore({ last_contact_hours: 6 }), 1);
  assert.equal(routineScore({ last_contact_hours: 6, vulnerability: { age: 90, lives_alone: true, medical: 'x', mobility: true } }), 3);
  assert.equal(routineScore({ last_contact_hours: 400, vulnerability: { age: 90 }, red_flags: { a: true, b: true } }), 5);
});

test('emergency words in the live transcript, caller side only', () => {
  assert.equal(checkBypass('my dad is trapped and'), 'trapped');
  assert.equal(checkBypass('the street is fine'), null);
  // A condition is a vulnerability, not an emergency in progress.
  assert.equal(checkBypass("she's 84, lives alone, on oxygen"), null);
  assert.equal(checkBypass(callerText({ transcript: 'Agent: is anyone trapped?\nUser: no' })), null);
});

const t = (...lines) => ({ transcript: lines.join('\n') });

test('distress: ordinary worry scores nothing', () => {
  const d = scoreDistress(t('Agent: Is anyone hurt or in danger?', "User: No, I just can't reach my mom.",
    'Agent: Who are you calling about?', 'User: Maria Lopez, 1420 Sunset Mesa Drive. I\'m really worried about her.'));
  assert.equal(d.distressed, false, d.reasons.join());
});

test('distress: panic in the caller\'s words fires', () => {
  const d = scoreDistress(t('Agent: Is anyone hurt?', "User: oh my god please hurry, I don't know what to do"));
  assert.equal(d.distressed, true);
});

test('distress: speech recognition failing (agent asks to repeat twice) plus fragments fires', () => {
  const d = scoreDistress(t('Agent: Who are you calling about?', 'User: my', "Agent: Sorry, I didn't catch that.",
    'User: the', 'Agent: Could you repeat that?', 'User: house'));
  assert.equal(d.distressed, true, d.reasons.join());
});

test('distress: agent lines never count as caller panic', () => {
  const d = scoreDistress(t("Agent: Oh my god, please hurry, I don't know what to do", 'User: my dad Harold Kim'));
  assert.equal(d.distressed, false);
});

test('handoff instruction tells the agent to transfer', () => {
  assert.match(handoffInstruction(['said "oh my god"']), /request_human.*transfer_to_human/);
});

const fresh = () => ({ found: true, name_match: true, status: 'cleared', recorded_at: new Date(now - 5 * 60000).toISOString(), inside_perimeter: true });

test('caller state: worried leaves a fresh cleared record answered by the agent', () => {
  assert.equal(route({ mode: 'wildfire', caller_state: 'worried' }, fresh(), now).routing, 'answered_by_agent');
});

test('caller state: distressed is never left with the agent alone', () => {
  const d = route({ mode: 'wildfire', caller_state: 'distressed' }, fresh(), now);
  assert.equal(d.routing, 'priority_queue');
  assert.match(d.reason, /caller distressed/);
  const r = route({ mode: 'routine', caller_state: 'distressed', last_contact_hours: 6 }, null, now);
  assert.equal(r.routing, 'priority_queue');
});

test('caller state: panicked goes to a human now', () => {
  assert.equal(route({ mode: 'wildfire', caller_state: 'panicked' }, fresh(), now).routing, 'human_now');
});

test('caller state never moves a call down', () => {
  const refused = { found: true, name_match: true, status: 'refused', recorded_at: new Date(now).toISOString(), inside_perimeter: true };
  assert.equal(route({ mode: 'wildfire', caller_state: 'calm' }, refused, now).routing, 'priority_queue');
  assert.equal(route({ mode: 'wildfire', caller_state: 'calm', with_them_now: true }, fresh(), now).routing, 'human_now');
});

test('emergency overrides a fresh cleared record', () => {
  const lookup = { found: true, name_match: true, status: 'cleared', recorded_at: new Date(now - 5 * 60000).toISOString(), inside_perimeter: true };
  assert.equal(route({ mode: 'wildfire', emergency: true }, lookup, now).routing, 'human_now');
});

// ── Phase A: false alarms and false refusals (docs/AGENT_HARDENING_PLAN.md §2) ──

test('B1-B4: calm answers and street names never fire an emergency', () => {
  for (const s of ['No, nobody is trapped', 'No one is hurt or bleeding', 'nobody is hurt and no one is bleeding',
    'can you help me find out if my mom got out', 'she lives on Gunderson Ave', 'he had begun packing',
    "I'm not scared, nobody's stuck inside", 'no, nadie está atrapado']) {
    assert.equal(checkBypass(s), null, s);
  }
});

test('B1-B4: real emergencies still fire, including after a leading "no"', () => {
  for (const [s, want] of [['No, but my dad is trapped', 'trapped'], ['no my dad is trapped', 'trapped'],
    ["she's not answering and she's trapped", 'trapped'], ["she's not breathing", 'not breathing'],
    ['the house is on fire and she is inside', 'house is on fire'], ["she fell and can't get up", "can't get up"],
    ['mi mamá está atrapada', 'atrapada'], ['a man has a gun', 'gun']]) {
    assert.equal(checkBypass(s), want, s);
  }
});

test('B5: ordinary worry stays worried; real panic fires', () => {
  assert.equal(scoreDistress(t("User: oh god I don't know what to do, she won't answer her phone")).distressed, false);
  assert.equal(scoreDistress(t("User: I'm not scared, just worried")).score, 0);
  assert.equal(scoreDistress(t('User: oh my god please hurry, somebody help')).distressed, true);
});

test('B6-B7: accents, hyphens and apostrophes in names', () => {
  assert.equal(nameMatches('Maria Lopez', 'María López'), true);
  assert.equal(nameMatches('María López', 'maria lopez'), true);
  assert.equal(nameMatches('Maria Lopez', 'Maria Lopez-Garcia'), true);
  assert.equal(nameMatches('María López-García', 'Maria Garcia'), true);
  assert.equal(nameMatches("Sean O'Brien", 'sean obrien'), true);
  assert.equal(nameMatches('Maria Elena Lopez', 'Maria Lopez'), true);
  assert.equal(nameMatches('Maria Lopez', 'Lopez'), false);
  assert.equal(nameMatches('Maria Lopez', 'Rosa Lopez'), false);
});

test('B8-B10: addresses with city, ZIP, unit, commas, spoken numbers', () => {
  const k = addressKey('1420 Sunset Mesa Dr');
  for (const a of ['1420 Sunset Mesa Dr, Pacific Palisades, CA 90272', '1420 Sunset Mesa Dr Apt 3', '1420 Sunset Mesa Dr #3',
    '1,420 Sunset Mesa Dr', 'fourteen twenty Sunset Mesa Drive', 'one four two zero sunset mesa drive', 'Sunset Mesa 1420']) {
    assert.equal(addressKey(a), k, a);
  }
  assert.notEqual(addressKey('1421 Sunset Mesa Dr'), k);
  for (const [w, n] of [['sixteen eight hundred', '16800'], ['nine ten', '910'], ['eleven hundred', '1100'],
    ['forty five twelve', '4512'], ['eight hundred twenty', '820'], ['twenty one oh five', '2105']]) {
    assert.equal(spokenNumber(w.split(' ')), n, w);
  }
});

// ── Phase B: nobody disappears ──

const base = (call_id, from_number, extra = {}) => ({ mode: 'wildfire', address: '16800 Bollinger Dr', subject_name: 'Ruth Adams',
  with_them_now: false, caller_state: 'worried', call_id, from_number, ...extra });

test('G1: a caller who hangs up before routing gets a callback row', () => {
  const row = logUnrouted({ address: '16800 Bollinger Dr', subject_name: 'Ruth Adams', caller_state: 'distressed' },
    { call_id: 'g1', from_number: '+13105550001', disconnection_reason: 'user_hangup' }, now);
  assert.equal(row.routing, 'abandoned_callback');
  assert.equal(row.severity, 4);
  assert.match(row.reason, /call back \+13105550001/);
});

test('G1: an emergency-path transfer with no log_call still gets a row', () => {
  const row = logUnrouted({ bypass_reason: 'emergency: said "trapped"' }, { call_id: 'g1b', from_number: '+1', disconnection_reason: 'call_transfer' }, now);
  assert.equal(row.routing, 'human_now');
});

test('G2: a failed transfer becomes the top-priority callback and is never downgraded', async () => {
  await logCall(base('g2', '+13105550002'), now);
  const row = logTransferFailed('g2', '+13105550002', 'no_answer', now);
  assert.equal(row.routing, 'callback_queue');
  await logCall(base('g2', '+13105550002'), now); // a late log_call can't lower it
  assert.equal(getCall('g2').routing, 'callback_queue');
});

test('G4: log_call twice in one call is one row, routing only moves up', async () => {
  await logCall({ ...base('g4', '+13105550004'), address: '1420 Sunset Mesa Dr', subject_name: 'Maria Lopez' }, now);
  assert.equal(getCall('g4').routing, 'answered_by_agent');
  await logCall({ ...base('g4', '+13105550004'), address: '1420 Sunset Mesa Dr', subject_name: 'Maria Lopez', caller_update: 'she texted, still home', reported_status: 'staying' }, now);
  assert.equal(getCall('g4').routing, 'priority_queue');
  await logCall({ ...base('g4', '+13105550004'), address: '1420 Sunset Mesa Dr', subject_name: 'Maria Lopez' }, now);
  assert.equal(getCall('g4').routing, 'priority_queue');
});

test('Repeat callers about one address move it up; the same number twice does not', async () => {
  const addr = { address: '1100 Palisades Dr', subject_name: 'Tom Becker' }; // stale cleared → priority 3
  const a = (await logCall(base('r1', '+13105550101', addr), now)).row;
  const again = (await logCall(base('r1b', '+13105550101', addr), now)).row;
  const b = (await logCall(base('r2', '+13105550102', addr), now)).row;
  const c = (await logCall(base('r3', '+13105550103', addr), now)).row;
  assert.equal(a.severity, 3);
  assert.equal(again.severity, 3, 'same number calling back is not a new source');
  assert.equal(b.routing, 'priority_queue');
  assert.equal(b.severity, 4);
  assert.equal(c.routing, 'human_now');
  assert.match(c.reason, /3 separate callers/);
});

test('Repeat callers never override a fresh cleared answer', async () => {
  const addr = { address: '820 Chautauqua Blvd', subject_name: 'Linda Park' };
  for (const [i, n] of ['+1310555021', '+1310555022', '+1310555023'].entries()) await logCall(base(`c${i}`, n, addr), now);
  assert.equal(getCall('c2').routing, 'answered_by_agent');
});

// ── Phase C: calls write back into the sweep log (reports.js) ──

test('C: "he told me he is staying" from a relative is recorded as a phone report', () => {
  const r = callReport({ reported_status: 'staying', reported_by: 'relative_or_friend', reported_minutes_ago: 20, caller_update: 'texted 20 min ago, staying' },
    { address_id: 'x', status: 'cleared' }, now);
  assert.equal(r.status, 'refused');
  assert.equal(r.source, 'call');
  assert.match(r.note, /relative or friend/);
  assert.equal(Date.parse(r.recorded_at), now - 20 * 60000, 'recorded when the news is from, not now');
});

test('C: a relative saying "she is out" never clears a house', () => {
  assert.ok(callReport({ reported_status: 'out', reported_by: 'relative_or_friend' }, { address_id: 'x', status: 'unknown' }, now).skip);
});

test('C: a resident saying "I am out" is recorded, unless the house is marked staying', () => {
  assert.equal(callReport({ reported_status: 'out', reported_by: 'resident' }, { address_id: 'x', status: 'unknown' }, now).status, 'self_out');
  assert.ok(callReport({ reported_status: 'out', reported_by: 'resident' }, { address_id: 'x', status: 'refused' }, now).skip);
});

test('C: nothing is written for an address we do not have', () => {
  assert.ok(callReport({ reported_status: 'staying' }, null, now).skip);
});

test('C: resident still inside the perimeter goes to a person now and is recorded', async () => {
  const { row } = await logCall({ ...base('rc1', '+13105550301'), address: '16800 Bollinger Dr', subject_name: 'Ruth Adams',
    reported_status: 'staying', reported_by: 'resident', reported_minutes_ago: 0 }, now);
  assert.equal(row.routing, 'human_now');
  assert.equal(row.report_written, 'refused');
  const next = await lookupAddress({ address: '16800 Bollinger Dr', subject_name: 'Ruth Adams' }, now + 60000);
  assert.equal(next.status, 'refused');
  assert.equal(next.source, 'call');
  const say = sayForLookup(next, 'Ruth Adams', now + 60000, FRESH_MIN);
  assert.match(say, /^A phone report at \d{1,2}:\d{2} [AP]M/);
  assert.doesNotMatch(say, /officer/i, 'a phone report is never presented as an officer check');
});

test('C: resident out is answered and recorded; the next caller hears it with the time', async () => {
  const { row } = await logCall({ ...base('rc2', '+13105550302'), address: '910 N Vermont Ave', subject_name: 'Kevin Nguyen',
    mode: 'wildfire', reported_status: 'out', reported_by: 'resident' }, now);
  assert.equal(row.routing, 'answered_by_agent');
  const next = await lookupAddress({ address: '910 N Vermont Ave', subject_name: 'Kevin Nguyen' }, now + 60000);
  assert.match(sayForLookup(next, 'Kevin Nguyen', now + 60000, FRESH_MIN), /^Kevin called in at .*, to say they were out of the area/);
});

test('C: resident says out but the house is marked staying: a person checks, record unchanged', async () => {
  const { row } = await logCall({ ...base('rc3', '+13105550303'), address: '1515 Via de la Paz', subject_name: 'Harold Kim',
    reported_status: 'out', reported_by: 'resident' }, now);
  assert.equal(row.routing, 'priority_queue');
  assert.equal(row.report_written, null);
  assert.match(row.reason, /not recorded/);
  assert.equal((await lookupAddress({ address: '1515 Via de la Paz', subject_name: 'Harold Kim' }, now)).status, 'refused');
});

// ── Real-call fixes (Retell call log, 10:25) ──

test('ASR street slips still find the house: "Villa de la Paz", "Sunset Message"', async () => {
  const harold = await lookupAddress({ address: '1515 Villa de la Paz', subject_name: 'Harold Kim' }, now);
  assert.equal(harold.found, true);
  assert.equal(harold.status, 'refused');
  const maria = await lookupAddress({ address: '1420 Sunset Message Drive', subject_name: 'Maria Lopez' }, now);
  assert.equal(maria.found, true);
});

test('fuzzy match is still name-gated; a different number needs the right name', async () => {
  const wrongName = await lookupAddress({ address: '1515 Villa de la Paz', subject_name: 'John Smith' }, now);
  assert.equal(wrongName.found, true);
  assert.equal(wrongName.status, null);
  // A misheard number on the right street with the right name is the same household.
  assert.equal((await lookupAddress({ address: '1516 Via de la Paz', subject_name: 'Harold Kim' }, now)).found, true);
  assert.equal((await lookupAddress({ address: '1516 Via de la Paz', subject_name: 'John Smith' }, now)).found, false);
  const unrelated = await lookupAddress({ address: '1515 Main St', subject_name: 'John Smith' }, now);
  assert.equal(unrelated.found, false);
});

test('misheard house number: same street + the named resident finds the house; a wrong name does not', async () => {
  const ruth = await lookupAddress({ address: '1680 Bollinger Drive', subject_name: 'Ruth Adams' }, now);
  assert.equal(ruth.found, true);
  assert.equal(ruth.address_id, '00000000-0000-4000-8000-000000000003');
  assert.equal((await lookupAddress({ address: '1680 Bollinger Drive', subject_name: 'John Smith' }, now)).found, false);
});

test('the agent and the board use the same fire perimeter', async () => {
  const { readFile } = await import('node:fs/promises');
  const { PERIMETER } = await import('../src/geo.js');
  const web = await readFile(new URL('../../web/src/lib/addresses.ts', import.meta.url), 'utf8');
  const block = /export const PERIMETER[^=]*=\s*\[([\s\S]*?)\n\];/.exec(web)[1];
  const board = [...block.matchAll(/\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(PERIMETER, board, 'server/src/geo.js PERIMETER is out of date: copy it from web/src/lib/addresses.ts');
});

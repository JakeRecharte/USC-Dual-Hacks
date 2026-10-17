// npm test. No network. The six scripted cases from team_plan.md, plus the safety rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBypass, callerText } from '../src/bypass.js';
import { lookupAddress, logCall, addressKey, nameMatches } from '../src/backend.js';
import { route, routineScore, FRESH_MIN } from '../src/routing.js';
import { sayForLookup, sayForRouting } from '../src/speech.js';
import { scoreDistress, handoffInstruction } from '../src/distress.js';

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

test('new information beats the record', async () => {
  const { row } = await run(wildfire('1420 Sunset Mesa Dr', 'Maria Lopez', { caller_update: 'she texted 20 minutes ago, still home' }));
  assert.equal(row.routing, 'priority_queue');
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
  const d = scoreDistress(t('Agent: Is anyone hurt?', "User: oh my god I don't know what to do, she's not answering"));
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

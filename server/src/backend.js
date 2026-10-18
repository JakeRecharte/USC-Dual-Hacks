// lookup_address / log_call, per docs/DATA_CONTRACT.md.
// Reads and writes Supabase (the same tables the board uses, docs/SUPABASE_SETUP.md) when
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set; otherwise, or if the database fails
// mid-call, it answers from the in-memory fake data below. The line never goes down with it.
import { EventEmitter } from 'node:events';
import { route } from './routing.js';
import { db, dbFailed } from './db.js';
import { pointInPolygon } from './geo.js';
import { callReport } from './reports.js';

// One address per scripted test case in team_plan.md, plus a stale and an outside one.
// Ids match the board's seed (docs/SUPABASE_SETUP.md §3) so memory mode and Supabase agree.
// `ago` is minutes before the moment of lookup, so "cleared 40 minutes ago" stays true
// however long the server runs (the fake equivalent of P2's reset script).
const FAKE_ADDRESSES = [
  { id: '00000000-0000-4000-8000-000000000001', address: '1420 Sunset Mesa Dr', resident_name: 'Maria Lopez', inside_perimeter: true,
    status: 'cleared', source: 'officer', ago: 40, note: null },
  { id: '00000000-0000-4000-8000-000000000002', address: '1515 Via de la Paz', resident_name: 'Harold Kim', inside_perimeter: true,
    status: 'refused', source: 'officer', ago: 25, note: '2 adults staying, 1 on oxygen' },
  { id: '00000000-0000-4000-8000-000000000003', address: '16800 Bollinger Dr', resident_name: 'Ruth Adams', inside_perimeter: true,
    status: 'unknown', source: null, ago: null, note: null },
  { id: '00000000-0000-4000-8000-000000000004', address: '1100 Palisades Dr', resident_name: 'Tom Becker', inside_perimeter: true,
    status: 'cleared', source: 'officer', ago: 360, note: null },
  { id: '00000000-0000-4000-8000-000000000005', address: '820 Chautauqua Blvd', resident_name: 'Linda Park', inside_perimeter: true,
    status: 'self_out', source: 'resident_reply', ago: 55, note: null },
  { id: '00000000-0000-4000-8000-000000000006', address: '4512 Crenshaw Blvd', resident_name: 'Dorothy Hayes', inside_perimeter: false,
    status: 'unknown', source: null, ago: null, note: null },
  { id: '00000000-0000-4000-8000-000000000007', address: '910 N Vermont Ave', resident_name: 'Kevin Nguyen', inside_perimeter: false,
    status: 'unknown', source: null, ago: null, note: null },
];

const fold = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const SUFFIX = { drive: 'dr', street: 'st', avenue: 'ave', boulevard: 'blvd', road: 'rd', lane: 'ln',
  place: 'pl', court: 'ct', north: 'n', south: 's', east: 'e', west: 'w', terrace: 'ter', circle: 'cir' };
const STREET_TYPES = new Set(['dr', 'st', 'ave', 'blvd', 'rd', 'ln', 'pl', 'ct', 'way', 'ter', 'cir', 'hwy']);
const DIRECTIONS = new Set(['n', 's', 'e', 'w']);
const UNIT = new Set(['apt', 'apartment', 'unit', 'suite', 'ste', 'number', 'no']);

const ONES = { zero: 0, oh: 0, o: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const isNumberWord = (w) => w in ONES || w in TEENS || w in TENS || w === 'hundred' || w === 'thousand';

// House numbers the way people say them: "fourteen twenty" → 1420, "sixteen eight hundred"
// → 16800, "nine ten" → 910, "one four two zero" → 1420, "eleven hundred" → 1100.
export function spokenNumber(words) {
  const chunks = [];
  let cur = null;
  const push = () => { if (cur !== null) chunks.push(cur); cur = null; };
  for (const w of words) {
    if (w in ONES) {
      const d = ONES[w];
      if (cur !== null && ((cur >= 20 && cur < 100 && cur % 10 === 0) || (cur >= 100 && cur % 10 === 0 && (cur % 100 === 0 || cur % 100 >= 20)))) cur += d;
      else { push(); cur = d; }
    } else if (w in TEENS) {
      if (cur !== null && cur >= 100 && cur % 100 === 0) cur += TEENS[w];
      else { push(); cur = TEENS[w]; }
    } else if (w in TENS) {
      if (cur !== null && cur >= 100 && cur % 100 === 0) cur += TENS[w];
      else { push(); cur = TENS[w]; }
    } else if (w === 'hundred') cur = (cur ?? 1) * 100;
    else if (w === 'thousand') cur = (cur ?? 1) * 1000;
  }
  push();
  return chunks.length ? chunks.join('') : null;
}

export function addressKey(s) {
  // Commas end the street part ("..., Pacific Palisades, CA 90272"), except inside a number.
  const first = fold(s).replace(/(\d),(\d)/g, '$1$2').split(',')[0];
  let tokens = first.replace(/[^a-z0-9#\s]/g, ' ').split(/\s+/).filter(Boolean).map((t) => SUFFIX[t] || t);

  // Leading spoken number → digits.
  let n = 0;
  while (n < tokens.length && isNumberWord(tokens[n])) n++;
  if (n && !/^\d+$/.test(tokens[0])) {
    const num = spokenNumber(tokens.slice(0, n));
    if (num) tokens = [num, ...tokens.slice(n)];
  }

  const numberAt = tokens.findIndex((t) => /^\d+$/.test(t));
  if (numberAt < 0) return null;
  const number = tokens[numberAt];
  // Street: words after the number up to the street type or a unit marker; if the number came
  // last ("Sunset Mesa 1420"), the words before it.
  const after = tokens.slice(numberAt + 1);
  const pool = after.length ? after : tokens.slice(0, numberAt);
  const street = [];
  for (const t of pool) {
    if (UNIT.has(t) || t.startsWith('#') || /^\d{5}$/.test(t)) break;
    if (STREET_TYPES.has(t)) break;
    if (!DIRECTIONS.has(t)) street.push(t);
  }
  return street.length ? `${number} ${street.join(' ')}` : null;
}

// Speech recognition mishears street names ("Via de la Paz" → "Villa de la Paz" on a real
// call; "Sunset Mesa" → "Sunset Message"). The house number almost always survives, so when
// the exact key misses, look only at houses with that number and take the one the caller
// named, or else the one whose street is a single slip away. Status is still name-gated.
function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}
const similarity = (a, b) => 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);

export function findHousehold(rows, address, subject_name) {
  const key = addressKey(address);
  if (!key) return null;
  const exact = rows.find((r) => addressKey(r.address) === key);
  if (exact) return exact;
  const [number, ...said] = key.split(' ');
  const sameNumber = rows.filter((r) => addressKey(r.address)?.split(' ')[0] === number);
  const named = sameNumber.filter((r) => nameMatches(r.resident_name, subject_name));
  if (named.length === 1) return named[0];
  const close = sameNumber
    .map((r) => ({ r, score: similarity(said.join(' '), addressKey(r.address).split(' ').slice(1).join(' ')) }))
    .filter((x) => x.score >= 0.75)
    .sort((a, b) => b.score - a.score);
  if (close.length === 1 || (close.length > 1 && close[0].score > close[1].score)) return close[0].r;
  // Same number, street that sounds the same ("294 Dyerida Road" for 294 Dryad Rd).
  const saidSkel = skeleton(said.join(''));
  const alike = sameNumber.filter((r) => skeleton(addressKey(r.address).split(' ').slice(1).join('')) === saidSkel);
  if (alike.length === 1) return alike[0];
  // Number misheard ("one six eight zero zero" → 1680 on a real call): the same street and
  // the named resident. Needs the name, so it reveals nothing a wrong-name caller couldn't get.
  const street = said.join(' ');
  const byName = rows.filter((r) => nameMatches(r.resident_name, subject_name)
    && similarity(street, addressKey(r.address).split(' ').slice(1).join(' ')) >= 0.75);
  return byName.length === 1 ? byName[0] : null;
}

// Consonant skeleton: the first letter, then consonants only, doubles collapsed. Speech
// recognition keeps consonants and smears vowels, so "Dyerida" and "Dryad" both read "drd",
// "Demir" and "de la Mirror" both "dmr".
export function skeleton(s) {
  const w = fold(s).replace(/[^a-z]/g, '');
  if (!w) return '';
  return (w[0] + w.slice(1).replace(/[aeiouy]/g, '')).replace(/(.)\1+/g, '$1');
}
// a is b with at most one consonant missing, same first letter: "dmr" in "dlmr".
function nearSkeleton(a, b) {
  if (a.length < 3 || a[0] !== b[0] || b.length - a.length !== 1) return false;
  let i = 0;
  for (const c of b) if (c === a[i]) i++;
  return i === a.length;
}
const soundsLike = (a, b) => a === b || similarity(a, b) >= 0.7 || (a.length > 2 && skeleton(a) === skeleton(b));

// The record's first name plus at least one other of its names, allowing the slips a phone
// line makes. On real calls "Ibrahim Fischer" came through as "Abraham Fisher" and "Oscar
// Raman" as "Austin Raman", and the caller was asked for the name four times. So:
//   * each name may be a near miss (edit distance, or the same consonant skeleton), and a
//     spoken surname may span words ("de la Mirror" for "Demir").
// The first name still has to be heard: "Rosa Lopez" is not Maria Lopez, and "Austin Raman"
// gets one more ask (the lookup route stops asking after two misses).
export function nameMatches(resident, subject) {
  const words = (s) => fold(s).replace(/'/g, '').replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  const saidWords = words(subject);
  const said = [...saidWords];
  for (let i = 0; i < saidWords.length - 1; i++) {
    said.push(saidWords[i] + saidWords[i + 1]);
    if (i < saidWords.length - 2) said.push(saidWords[i] + saidWords[i + 1] + saidWords[i + 2]);
  }
  const [first, ...rest] = words(resident);
  if (!first || !saidWords.length) return false;
  const heard = (w) => said.some((x) => soundsLike(w, x));
  // Once the first name is right, a surname may also be heard with one extra sound in it.
  const heardLoose = (w) => heard(w) || said.some((x) => nearSkeleton(skeleton(w), skeleton(x)));
  return heard(first) && (rest.length === 0 || rest.some(heardLoose));
}

const NOT_FOUND = { found: false, address_id: null, name_match: false, status: null, recorded_at: null, note: null, source: null, inside_perimeter: null };

// A house we don't have, on a street we do: it's in the same area. (A real call: "861 Alma
// Real Drive" isn't seeded, 124 and 760 are, so it read as "area unknown" and was treated
// as a routine check during an evacuation.) True/false only if every known house agrees.
export function sameStreet(rows, address) {
  const key = addressKey(address);
  if (!key) return [];
  const street = key.split(' ').slice(1).join(' ');
  return rows.filter((r) => similarity(street, addressKey(r.address)?.split(' ').slice(1).join(' ') ?? '') >= 0.85);
}
function streetArea(same) {
  if (!same.length) return null;
  if (same.every((r) => r.inside_perimeter)) return true;
  if (same.every((r) => !r.inside_perimeter)) return false;
  return null;
}
export function streetGeo(same) {
  const placed = same.filter((r) => r.lat != null && r.lng != null);
  if (!placed.length) return null;
  const avg = (k) => placed.reduce((a, r) => a + Number(r[k]), 0) / placed.length;
  return { lat: avg('lat'), lng: avg('lng'), precision: 'street' };
}
const notFound = (rows, address) => {
  const same = sameStreet(rows, address);
  return { ...NOT_FOUND, inside_perimeter: streetArea(same), _geo: streetGeo(same) };
};

// The looting safeguard lives here, in one place for both data sources: nothing about the
// person (status, time, note, source) unless the caller named them. `structure` is never
// read, so the agent can't say "the house burned down" (FRONTEND_CONTRACT.md §1).
// Where to put the call on the map. Server-side only: index.js strips it before replying to
// the agent. 'house' = the household's own point; 'street' = the centre of the known houses on
// that street (a house we don't have); none = we can't place it.
const geoOf = (row) => (row?.lat != null && row?.lng != null ? { lat: Number(row.lat), lng: Number(row.lng), precision: 'house' } : null);

function answer(row, latest, subject_name) {
  const match = nameMatches(row.resident_name, subject_name);
  return {
    _geo: geoOf(row),
    found: true,
    address_id: row.id,
    name_match: match,
    status: match ? latest?.status ?? 'unknown' : null,
    recorded_at: match ? latest?.recorded_at ?? null : null,
    note: match ? latest?.note ?? null : null,
    source: match ? latest?.source ?? null : null,
    inside_perimeter: row.inside_perimeter,
  };
}

// Memory mode's stand-in for status_log rows written by calls (see reports.js).
const fakeReports = new Map();

function fakeLatest(row, now) {
  const seeded = row.status === 'unknown' ? null : {
    status: row.status, note: row.note, source: row.source,
    recorded_at: row.ago != null ? new Date(now - row.ago * 60000).toISOString() : null,
  };
  const reported = fakeReports.get(row.id);
  if (!reported) return seeded;
  return !seeded || Date.parse(reported.recorded_at) > Date.parse(seeded.recorded_at) ? reported : seeded;
}

function lookupFake(address, subject_name, now) {
  const row = findHousehold(FAKE_ADDRESSES, address, subject_name);
  if (!row) return notFound(FAKE_ADDRESSES, address);
  return answer(row, fakeLatest(row, now), subject_name);
}

// The true newest status, regardless of who's asking. Server-side only (deciding whether a
// phone report may be written); never returned to the agent.
async function currentStatus(address, now, subject_name) {
  if (!addressKey(address)) return null;
  if (db) {
    try {
      const row = findHousehold(await dbHouseholds(now), address, subject_name);
      if (!row) return null;
      const { data, error } = await db.from('status_log').select('status, note, recorded_at').eq('address_id', row.id)
        .order('recorded_at', { ascending: false }).limit(1);
      if (error) throw error;
      return { address_id: row.id, status: data[0]?.status ?? 'unknown', note: data[0]?.note ?? null, recorded_at: data[0]?.recorded_at ?? null };
    } catch (err) { dbFailed('current status', err); }
  }
  const row = findHousehold(FAKE_ADDRESSES, address, subject_name);
  const latest = row ? fakeLatest(row, now) : null;
  return row ? { address_id: row.id, status: latest?.status ?? 'unknown', note: latest?.note ?? null, recorded_at: latest?.recorded_at ?? null } : null;
}

// A house's colour and newest status, straight after a call changed it, so the board can
// paint it without waiting on a database change feed (index.js streams these as 'house').
export const houseEvents = new EventEmitter();
async function announceHouse(addressId) {
  if (!db || !addressId) return;
  const { data, error } = await db.from('houses')
    .select('id, color, color_reason, evacuation_status, evacuation_note, evacuation_status_source, last_checked_at')
    .eq('id', addressId).maybeSingle();
  if (!error && data) houseEvents.emit('house', data);
}

// Returns the new status_log row's id (or 'memory'), so an early write can be taken back.
async function writeReport(report, now) {
  if (db) {
    const { data, error } = await db.from('status_log').insert(report).select('id').single();
    if (!error) {
      void announceHouse(report.address_id);
      return data?.id ?? true;
    }
    dbFailed('status_log insert (call report)', error);
  }
  fakeReports.set(report.address_id, { ...report });
  return 'memory';
}

async function unwriteReport(early) {
  if (db && early.id && early.id !== 'memory') {
    const { error } = await db.from('status_log').delete().eq('id', early.id);
    if (error) dbFailed('status_log delete (early report)', error);
    else void announceHouse(early.address_id);
  } else {
    fakeReports.delete(early.address_id);
  }
}

// Reports written while the caller is still talking (recordEarly), by call_id, so the house
// changes colour the moment the caller says it rather than when the agent logs the call.
// log_call then confirms the early write, or takes it back if the final report differs.
const earlyReports = new Map();

export async function recordEarly(callId, call, now = Date.now()) {
  if (!callId || !call.reported_status) return null;
  const prev = earlyReports.get(callId);
  if ((prev?.reported === call.reported_status && prev?.by === call.reported_by) || prev?.pending) return null;
  earlyReports.set(callId, { ...prev, pending: true });
  try {
    const current = await currentStatus(call.address, now, call.subject_name);
    const report = callReport(call, current, now);
    if (!report || report.skip) { earlyReports.set(callId, prev ?? {}); return null; }
    if (prev?.id) await unwriteReport(prev);
    const id = await writeReport(report, now);
    const early = { status: report.status, reported: call.reported_status, by: call.reported_by, id, address_id: report.address_id };
    earlyReports.set(callId, early);
    return early;
  } catch (err) {
    earlyReports.set(callId, prev ?? {});
    dbFailed('early report', err);
    return null;
  }
}

// Households change rarely, so they're cached briefly; statuses are always read fresh, because
// an officer's tap a few seconds ago is exactly what the caller is asking about.
let households = { at: 0, rows: null };
async function dbHouseholds(now) {
  if (households.rows && now - households.at < 300_000) return households.rows;
  // Supabase returns at most 1,000 rows per request; the seed has ~12,000. Read every page,
  // in parallel so a cold cache doesn't hold the caller through a dozen round trips (a
  // single read once missed most households, which then looked "not in our records").
  const head = await db.from('addresses').select('id', { count: 'exact', head: true });
  if (head.error) throw head.error;
  const pages = await Promise.all(Array.from({ length: Math.ceil((head.count ?? 0) / 1000) + 1 }, (_, p) =>
    db.from('addresses').select('id, address, lat, lng, resident_name').order('id').range(p * 1000, p * 1000 + 999)));
  const failed = pages.find((page) => page.error);
  if (failed) throw failed.error;
  const data = pages.flatMap((page) => page.data);
  households = { at: now, rows: data.map((r) => ({ ...r, inside_perimeter: pointInPolygon([Number(r.lat), Number(r.lng)]) })) };
  return households.rows;
}

async function lookupDb(address, subject_name, now) {
  const rows = await dbHouseholds(now);
  const row = findHousehold(rows, address, subject_name);
  if (!row) return notFound(rows, address);
  const { data, error } = await db.from('status_log')
    .select('status, source, note, recorded_at')
    .eq('address_id', row.id)
    .order('recorded_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return answer(row, data[0] ?? null, subject_name);
}

export async function lookupAddress({ address, subject_name }, now = Date.now()) {
  const key = addressKey(address);
  if (!key) return NOT_FOUND;
  if (db) {
    try { return await lookupDb(address, subject_name, now); }
    catch (err) { dbFailed('lookup_address', err); }
  }
  return lookupFake(address, subject_name, now);
}

// One row per call (keyed by Retell's call_id). Within a call the routing only moves up:
// a second log_call, a hang-up or a failed transfer can raise it, never lower it.
const calls = new Map();

// callback_queue is highest: a caller we tried to hand to a person and couldn't is owed one.
export const ROUTE_RANK = {
  answered_by_agent: 1, scheduled_followup: 1, abandoned_callback: 2,
  priority_queue: 3, human_now: 4, callback_queue: 5,
};

let anon = 0;
function upsertRow(callId, patch, now) {
  // No call_id (shouldn't happen with Retell) must never merge unrelated callers into one row.
  if (!callId) callId = `anon_${++anon}`;
  const prev = calls.get(callId);
  if (!prev) {
    const row = { id: `call_${calls.size + 1}`, created_at: new Date(now).toISOString(), ...patch, call_id: callId };
    calls.set(callId, row);
    persist(row);
    return row;
  }
  const keepRouting = (ROUTE_RANK[prev.routing] ?? 0) > (ROUTE_RANK[patch.routing] ?? 0);
  const row = {
    ...prev,
    ...patch,
    routing: keepRouting ? prev.routing : patch.routing ?? prev.routing,
    severity: Math.max(prev.severity ?? 0, patch.severity ?? 0),
    reason: keepRouting ? prev.reason : patch.reason ?? prev.reason,
    updated_at: new Date(now).toISOString(),
  };
  calls.set(callId, row);
  persist(row);
  return row;
}

// Mirror the row into Supabase's `calls` table (docs/sql/calls.sql + calls_retell.sql) for the
// board and so a redeploy loses nothing. Fire-and-forget: the caller never waits on the database.
const BASE_COLUMNS = ['call_id', 'mode', 'address', 'address_id', 'subject_name', 'from_number', 'with_them_now',
  'emergency', 'caller_update', 'last_contact_hours', 'vulnerability', 'red_flags', 'caller_state', 'prior_callers',
  'routing', 'severity', 'reason', 'simulated', 'created_at', 'updated_at'];
const RETELL_COLUMNS = ['status', 'direction', 'started_at', 'ended_at', 'duration_s', 'disconnection_reason',
  'transfer_status', 'bypass', 'bypass_reason', 'distress_score', 'lookup_found', 'lookup_status', 'name_match',
  'inside_perimeter', 'report_written', 'transcript', 'summary', 'user_sentiment', 'recording_url', 'latency_ms'];
const MAP_COLUMNS = ['lat', 'lng', 'geo_precision', 'decision_trace'];
// Newest migration first: calls_map.sql adds MAP_COLUMNS, calls_retell.sql RETELL_COLUMNS. If a
// group's columns are missing, drop just that group and keep writing the rest; re-checked every
// minute, so running the migration takes effect without a redeploy.
const GROUPS = [BASE_COLUMNS, RETELL_COLUMNS, MAP_COLUMNS];
let level = GROUPS.length;
let levelCheckedAt = 0;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rowForDb(row, columns) {
  const out = Object.fromEntries(columns.filter((c) => row[c] !== undefined).map((c) => [c, row[c]]));
  if (out.address_id && !UUID.test(out.address_id)) out.address_id = null;
  if (!out.severity) delete out.severity; // 1-5 in the table; an unrouted call has none yet
  return out;
}

function persist(row) {
  if (!db) return;
  if (level < GROUPS.length && Date.now() - levelCheckedAt > 60_000) level = GROUPS.length;
  // Before calls_retell.sql, routing is NOT NULL: an in-progress call waits until it's routed.
  if (level < 2 && row.routing == null) return;
  const attempt = () => db.from('calls').upsert(rowForDb(row, GROUPS.slice(0, level).flat()), { onConflict: 'call_id' });
  const handle = ({ error }) => {
    if (!error) return;
    if (level > 1 && (error.code === 'PGRST204' || /column/i.test(error.message))) {
      level -= 1;
      levelCheckedAt = Date.now();
      const file = ['', 'docs/sql/calls_retell.sql', 'docs/sql/calls_map.sql'][level];
      dbFailed('calls upsert', `${error.message}: run ${file}; writing older columns until then`);
      if (level < 2 && row.routing == null) return;
      attempt().then(handle, (err) => dbFailed('calls upsert', err));
      return;
    }
    dbFailed('calls upsert', error);
  };
  attempt().then(handle, (err) => dbFailed('calls upsert', err));
}

// Any part of a call's row, as it happens (call started, lookup, transcript, transfer, analysis).
// Routing and severity still only move up (upsertRow).
export function patchCall(callId, patch, now = Date.now()) {
  if (!callId) return null;
  return upsertRow(callId, patch, now);
}

// How many *other* people have already called about this address. Repeat callers about one
// house are the pitch's "match by address": the second worried family moves it up.
const sameAddress = (a, b) => (a.address_id && a.address_id === b.address_id) || (addressKey(a.address) && addressKey(a.address) === addressKey(b.address));
function priorCallers(payload, address_id) {
  const others = new Set();
  for (const r of calls.values()) {
    if (r.call_id === payload.call_id || !r.from_number || r.from_number === payload.from_number) continue;
    if (sameAddress(r, { address_id, address: payload.address })) others.add(r.from_number);
  }
  return others.size;
}

export async function logCall(payload, now) {
  const lookup = await lookupAddress(payload, now);
  const prior_callers = priorCallers(payload, lookup.address_id);
  const { trace, ...decision } = route({ ...payload, prior_callers }, lookup, now);

  // What the caller told us goes back into the sweep log, if it's allowed to (reports.js).
  let report_written = null;
  const early = earlyReports.get(payload.call_id);
  earlyReports.delete(payload.call_id);
  if (early?.id && early.reported === payload.reported_status && early.by === payload.reported_by) {
    // Already written while the caller was talking: the agent's log confirms it.
    report_written = early.status;
  } else {
    // The final report differs from the early guess (or there is none): take the guess back.
    if (early?.id) await unwriteReport(early);
    if (payload.reported_status) {
      const report = callReport(payload, await currentStatus(payload.address, now, payload.subject_name), now);
      if (report && !report.skip) {
        await writeReport(report, now);
        report_written = report.status;
      } else if (report?.skip) {
        decision.reason += `; not recorded: ${report.skip}`;
      }
    }
  }

  const geo = lookup._geo;
  const draft = { ...payload, address_id: lookup.address_id, prior_callers, report_written, ...decision,
    lookup_found: lookup.found, lookup_status: lookup.status, inside_perimeter: lookup.inside_perimeter,
    decision_trace: trace, ...(geo ? { lat: geo.lat, lng: geo.lng, geo_precision: geo.precision } : {}) };
  const row = upsertRow(payload.call_id, draft, now);
  return { row, lookup };
}

// The call ended without log_call: the caller hung up, or the emergency path transferred
// them first. Nobody disappears from the board.
export function logUnrouted(session, call, now) {
  const transferred = Boolean(session?.bypass_reason) || call.disconnection_reason === 'call_transfer';
  return upsertRow(call.call_id, {
    call_id: call.call_id,
    from_number: call.from_number ?? session?.from_number,
    address: session?.address ?? null,
    subject_name: session?.subject_name ?? null,
    address_id: session?.lookup?.address_id ?? null,
    caller_state: session?.caller_state ?? null,
    simulated: Boolean(call.simulated),
    routing: transferred ? 'human_now' : 'abandoned_callback',
    severity: transferred ? 5 : ['distressed', 'panicked'].includes(session?.caller_state) ? 4 : 3,
    reason: transferred
      ? `transferred before routing: ${session?.bypass_reason || 'call_transfer'}`
      : `caller hung up before routing (${call.disconnection_reason || 'unknown'}); call back ${call.from_number || ''}`.trim(),
  }, now);
}

// The warm transfer rang out, was declined, or was cancelled. The caller is still owed a person.
export function logTransferFailed(callId, fromNumber, detail, now) {
  return upsertRow(callId, {
    call_id: callId,
    from_number: fromNumber,
    routing: 'callback_queue',
    severity: 5,
    reason: `transfer did not connect (${detail}); call back ${fromNumber || ''}`.trim(),
  }, now);
}

export const getCall = (callId) => calls.get(callId);

// npm run reset-demo clears the database; this clears the server's in-memory copy too, or
// repeat-caller counts would include calls from before the reset.
export function forgetAllCalls() {
  calls.clear();
  earlyReports.clear();
  fakeReports.clear();
  // reset-demo may have just replaced the households; re-read them on the next lookup.
  households = { at: 0, rows: null };
}

// Retell's playground (scripts/eval-agent.js) sends every conversation as call_id "playground";
// the harness forgets it between scenarios so one scenario's state can't leak into the next.
export function forgetCall(callId) {
  calls.delete(callId);
  if (db) db.from('calls').delete().eq('call_id', callId).then(({ error }) => error && dbFailed('forget call', error), (err) => dbFailed('forget call', err));
}
export const allCalls = () => [...calls.values()];

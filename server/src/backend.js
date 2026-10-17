// lookup_address / log_call, per docs/DATA_CONTRACT.md.
// FAKE until P2's Supabase functions are live: same inputs and outputs, in-memory data.
// To switch, replace the two function bodies with supabase.rpc(...) calls.
import { route } from './routing.js';

const BOOT = Date.now();
const ago = (min) => new Date(BOOT - min * 60000).toISOString();

// One address per scripted test case in team_plan.md, plus a stale and an outside one.
const ADDRESSES = [
  { id: 'a1', address: '1420 Sunset Mesa Dr', resident_name: 'Maria Lopez', inside_perimeter: true,
    status: 'cleared', source: 'officer', recorded_at: ago(40), note: null },
  { id: 'a2', address: '1515 Via de la Paz', resident_name: 'Harold Kim', inside_perimeter: true,
    status: 'refused', source: 'officer', recorded_at: ago(25), note: '2 adults staying, 1 on oxygen' },
  { id: 'a3', address: '16800 Bollinger Dr', resident_name: 'Ruth Adams', inside_perimeter: true,
    status: 'unknown', source: null, recorded_at: null, note: null },
  { id: 'a4', address: '1100 Palisades Dr', resident_name: 'Tom Becker', inside_perimeter: true,
    status: 'cleared', source: 'officer', recorded_at: ago(360), note: null },
  { id: 'a5', address: '820 Chautauqua Blvd', resident_name: 'Linda Park', inside_perimeter: true,
    status: 'self_out', source: 'resident_reply', recorded_at: ago(55), note: null },
  { id: 'a6', address: '4512 Crenshaw Blvd', resident_name: 'Dorothy Hayes', inside_perimeter: false,
    status: 'unknown', source: null, recorded_at: null, note: null },
  { id: 'a7', address: '910 N Vermont Ave', resident_name: 'Kevin Nguyen', inside_perimeter: false,
    status: 'unknown', source: null, recorded_at: null, note: null },
];

const SUFFIX = { drive: 'dr', street: 'st', avenue: 'ave', boulevard: 'blvd', road: 'rd', lane: 'ln',
  place: 'pl', court: 'ct', north: 'n', south: 's', east: 'e', west: 'w' };
const DROP = new Set(['dr', 'st', 'ave', 'blvd', 'rd', 'ln', 'pl', 'ct', 'way', 'n', 's', 'e', 'w']);

export function addressKey(s) {
  const tokens = (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
    .map((t) => SUFFIX[t] || t);
  const number = tokens.find((t) => /^\d+$/.test(t));
  const street = tokens.filter((t) => t !== number && !DROP.has(t)).join(' ');
  return number && street ? `${number} ${street}` : null;
}

export function nameMatches(resident, subject) {
  const words = (s) => (s || '').toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  const said = new Set(words(subject));
  const need = words(resident);
  return need.length > 0 && need.every((w) => said.has(w));
}

export async function lookupAddress({ address, subject_name }) {
  const key = addressKey(address);
  const row = key && ADDRESSES.find((a) => addressKey(a.address) === key);
  if (!row) return { found: false, address_id: null, name_match: false, status: null, recorded_at: null, note: null, source: null, inside_perimeter: null };
  const match = nameMatches(row.resident_name, subject_name);
  return {
    found: true,
    address_id: row.id,
    name_match: match,
    // The looting safeguard: nothing about the person unless the caller can name them.
    status: match ? row.status : null,
    recorded_at: match ? row.recorded_at : null,
    note: match ? row.note : null,
    source: match ? row.source : null,
    inside_perimeter: row.inside_perimeter,
  };
}

const calls = [];

export async function logCall(payload, now) {
  const lookup = await lookupAddress(payload);
  const decision = route(payload, lookup, now);
  const row = {
    id: `call_${calls.length + 1}`,
    ...payload,
    address_id: lookup.address_id,
    ...decision,
    created_at: new Date(now).toISOString(),
  };
  calls.push(row);
  return { row, lookup };
}

export const allCalls = () => calls;

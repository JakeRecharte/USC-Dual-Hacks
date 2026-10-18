// Puts the demo data back: every seeded status re-based to "N minutes before now", officer
// taps from the last run removed, call log cleared. Run before every demo or rehearsal.
//   npm run reset-demo               statuses + call log
//   npm run reset-demo -- --keep-calls
//
// The seed is read from docs/seed.sql (P4's, generated from the board's own data), so the
// board's numbers, the demo script and this reset can't drift apart. It used to be read from
// §3 of docs/SUPABASE_SETUP.md; the seed moved to its own file once it passed three thousand
// lines. The DB stores absolute times, so without this "cleared 40 minutes ago" is two hours
// old by the afternoon and demo case 1 stops working.
import { readFile } from 'node:fs/promises';
import { sign } from 'retell-sdk';
import { config } from '../src/config.js';
import { db } from '../src/db.js';

if (!db) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in server/.env');
  process.exit(1);
}

const seed = await readFile(new URL('../../docs/seed.sql', import.meta.url), 'utf8');
if (!seed.includes('insert into public.status_log')) {
  throw new Error('docs/seed.sql has no status rows; regenerate it from the board data');
}

// Split one SQL tuple body on top-level commas, respecting 'quoted, strings'.
function fields(tuple) {
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < tuple.length; i++) {
    const ch = tuple[i];
    if (ch === "'" && tuple[i + 1] === "'" && quoted) { cur += "'"; i++; continue; }
    if (ch === "'") { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}
const tuples = (sql) => [...sql.matchAll(/^\s*\(('[\s\S]*?)\)[,;]\s*$/gm)].map((m) => fields(m[1]));
const now = Date.now();
const when = (v) => {
  const m = /interval\s+'?(\d+) minutes/.exec(v); // quotes are already stripped by fields()
  return m ? new Date(now - Number(m[1]) * 60000).toISOString() : null;
};
const nul = (v) => (v === 'null' ? null : v);

const [addrSql, statusSql] = seed.split('insert into public.status_log');
const statuses = tuples(statusSql).map(([address_id, status, source, note, recorded]) =>
  ({ address_id, status, source, note: nul(note), recorded_at: when(recorded) }));
// Households come from the seed too: the board has been widened more than once and a
// database holding the previous set fails the foreign key for every new status.
const households = tuples(addrSql.split('insert into public.addresses')[1] || '')
  .filter((f) => f.length === 8)
  .map(([id, address, lat, lng, zone_id, resident_name, structure, at]) =>
    ({ id, address, lat: Number(lat), lng: Number(lng), zone_id, resident_name, structure, structure_recorded_at: when(at) }));

const check = (what, { error }) => { if (error) throw new Error(`${what}: ${error.message}`); };

// Validate everything before touching the database: a half-applied reset is worse than none.
const bad = statuses.filter((r) => !r.address_id || !r.status || !r.recorded_at);
const ids = new Set(households.map((h) => h.id));
const orphans = statuses.filter((r) => !ids.has(r.address_id));
const badHouses = households.filter((h) => !h.address || !Number.isFinite(h.lat) || !Number.isFinite(h.lng) || !h.resident_name);
if (!statuses.length || !households.length || bad.length || orphans.length || badHouses.length) {
  throw new Error(`seed parse failed (${households.length} households, ${statuses.length} statuses; ${bad.length} bad, ` +
    `${orphans.length} orphaned, ${badHouses.length} bad households): nothing changed`);
}

// Non-destructive first (upsert households), destructive last, so a failure leaves data in place.
// In batches: every row fires the houses trigger, and 12k in one statement hits the timeout.
for (let i = 0; i < households.length; i += 1000) {
  check('upsert addresses', await db.from('addresses').upsert(households.slice(i, i + 1000), { onConflict: 'id' }));
}

// Households no longer in the seed (P4 replaces it as the map grows) would show on the board as
// strays. Remove them; their statuses cascade, calls keep the row and lose the link.
const existing = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('addresses').select('id').range(from, from + 999);
  check('list addresses', { error });
  existing.push(...data.map((r) => r.id));
  if (data.length < 1000) break;
}
const stray = existing.filter((id) => !ids.has(id));
for (let i = 0; i < stray.length; i += 100) {
  check('remove stray households', await db.from('addresses').delete().in('id', stray.slice(i, i + 100)));
}
check('clear status_log', await db.from('status_log').delete().not('address_id', 'is', null));
for (let i = 0; i < statuses.length; i += 1000) {
  check('insert status_log', await db.from('status_log').insert(statuses.slice(i, i + 1000)));
}
if (!process.argv.includes('--keep-calls')) {
  check('clear calls', await db.from('calls').delete().not('call_id', 'is', null));
}
// Retell alerts from the last run (house_colors.sql); absent before that SQL runs.
await db.from('house_events').delete().not('id', 'is', null);

console.log(`reset: ${households.length} households synced (${stray.length} stray removed), ${statuses.length} statuses re-based to now, call log ${process.argv.includes('--keep-calls') ? 'kept' : 'cleared'}`);

// The telephony server keeps recent calls in memory for repeat-caller counts; clear that too.
const server = process.env.PUBLIC_URL || 'https://usc-dual-hacks-production.up.railway.app';
try {
  const raw = '{}';
  const res = await fetch(`${server}/dev/reset-memory`, { method: 'POST', body: raw,
    headers: { 'content-type': 'application/json', 'x-retell-signature': await sign(raw, config.retellApiKey) } });
  console.log(`server memory: ${res.ok ? 'cleared' : `not cleared (${res.status})`}`);
} catch (err) {
  console.log(`server memory: not cleared (${err.message})`);
}

// Puts the demo data back: every seeded status re-based to "N minutes before now", officer
// taps from the last run removed, call log cleared. Run before every demo or rehearsal.
//   npm run reset-demo               statuses + call log
//   npm run reset-demo -- --keep-calls
//
// The seed is read from docs/SUPABASE_SETUP.md §3 (P4's), so the board's numbers, the demo
// script and this reset can't drift apart. The DB stores absolute times, so without this
// "cleared 40 minutes ago" is two hours old by the afternoon and demo case 1 stops working.
import { readFile } from 'node:fs/promises';
import { db } from '../src/db.js';

if (!db) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in server/.env');
  process.exit(1);
}

const doc = await readFile(new URL('../../docs/SUPABASE_SETUP.md', import.meta.url), 'utf8');
const seed = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]).find((b) => b.includes('insert into public.status_log'));
if (!seed) throw new Error('seed block not found in docs/SUPABASE_SETUP.md');

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
const structures = tuples(addrSql.split('insert into public.addresses')[1] || '')
  .filter((f) => f.length === 8)
  .map(([id, , , , , , structure, at]) => ({ id, structure, structure_recorded_at: when(at) }));

const check = (what, { error }) => { if (error) throw new Error(`${what}: ${error.message}`); };

// Validate everything before touching the database: a half-applied reset is worse than none.
const bad = statuses.filter((r) => !r.address_id || !r.status || !r.recorded_at);
if (statuses.length === 0 || bad.length) throw new Error(`seed parse failed (${statuses.length} rows, ${bad.length} bad): nothing changed`);

check('clear status_log', await db.from('status_log').delete().not('address_id', 'is', null));
check('insert status_log', await db.from('status_log').insert(statuses));
for (const s of structures) {
  check(`structure ${s.id}`, await db.from('addresses').update({ structure: s.structure, structure_recorded_at: s.structure_recorded_at }).eq('id', s.id));
}
if (!process.argv.includes('--keep-calls')) {
  check('clear calls', await db.from('calls').delete().not('call_id', 'is', null));
}

console.log(`reset: ${statuses.length} statuses re-based to now, ${structures.length} structures, call log ${process.argv.includes('--keep-calls') ? 'kept' : 'cleared'}`);

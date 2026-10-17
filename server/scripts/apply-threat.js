// Loads per-street fire threat from research into public.houses.
//   npm run apply-threat
// Source: docs/research/street-threat.json, [{ street, zone_id, fire_threat_level, reason, source }].
// Matches each house by its street (the address minus the house number). Streets the research
// didn't classify keep a null threat, which the dashboard treats as "not assessed".
import { readFile } from 'node:fs/promises';
import { db } from '../src/db.js';

if (!db) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in server/.env');
  process.exit(1);
}

const LEVELS = new Set(['extreme', 'high', 'moderate', 'low']);
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const streetOf = (address) => norm(address).replace(/^\d+\s+/, '');

let rows;
try {
  rows = JSON.parse(await readFile(new URL('../../docs/research/street-threat.json', import.meta.url), 'utf8'));
} catch (err) {
  console.log(`no street threat data yet (${err.code || err.message}): skipped`);
  process.exit(0);
}
const byStreet = new Map(rows.filter((r) => LEVELS.has(r.fire_threat_level)).map((r) => [norm(r.street), r]));

const houses = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('houses').select('id, address').range(from, from + 999);
  if (error) {
    console.log(`houses table not ready (${error.message}): run docs/sql/houses.sql first`);
    process.exit(0);
  }
  houses.push(...data);
  if (data.length < 1000) break;
}

const counts = {};
let matched = 0;
for (const level of LEVELS) {
  const t = [...byStreet.values()].filter((r) => r.fire_threat_level === level);
  for (const r of t) {
    const ids = houses.filter((h) => streetOf(h.address) === norm(r.street)).map((h) => h.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db.from('houses')
        .update({ fire_threat_level: level, fire_threat_reason: r.reason ?? null, fire_threat_source: r.source ?? null })
        .in('id', ids.slice(i, i + 200));
      if (error) throw new Error(`update ${r.street}: ${error.message}`);
    }
    counts[level] = (counts[level] ?? 0) + ids.length;
    matched += ids.length;
  }
}
console.log(`fire threat applied to ${matched} of ${houses.length} houses:`, counts);

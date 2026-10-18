// Regenerates docs/seed.sql from src/lib/addresses.ts, so Supabase holds exactly the
// households the board and the map draw.
//
//   node --experimental-strip-types scripts/build-seed-sql.mjs
//   node ../docs/sql/build-setup-all.mjs
//
// Ids: household a<N> becomes 00000000-0000-4000-8000-<N, 12 digits>, so the scripted
// households a1..a8 keep the ids the voice agent and the tests know them by.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedAddresses } from '../src/lib/addresses.ts';
import { ZONE_NAMES } from '../src/lib/zones.ts';

const here = dirname(fileURLToPath(import.meta.url));
const now = Date.now();
const rows = seedAddresses(now);

const uuid = (id) => {
  const n = /^a(\d+)$/.exec(id);
  if (!n) throw new Error(`household id ${id} is not a<N>`);
  return `00000000-0000-4000-8000-${n[1].padStart(12, '0')}`;
};
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const ago = (iso) => (iso == null ? 'null' : `now() - interval '${Math.round((now - Date.parse(iso)) / 60_000)} minutes'`);

const perZone = new Map();
for (const r of rows) perZone.set(r.zone_id, (perZone.get(r.zone_id) ?? 0) + 1);

const households = rows.map((r) =>
  `  (${q(uuid(r.id))}, ${q(r.address)}, ${r.lat}, ${r.lng}, ${q(r.zone_id)}, ${q(r.resident_name)}, ${q(r.structure)}, ${ago(r.structure_recorded_at)})`);
const statuses = rows.filter((r) => r.status !== 'unknown').map((r) =>
  `  (${q(uuid(r.id))}, ${q(r.status)}, ${q(r.source)}, ${q(r.note)}, ${ago(r.recorded_at)})`);

const sql = `-- Seed data for the Line board. Generated from web/src/lib/addresses.ts by
-- web/scripts/build-seed-sql.mjs — do not edit by hand.
-- Run after the schema in docs/SUPABASE_SETUP.md §1-2. Re-run to reset between demo runs.
-- Timestamps are relative to now(), so the ages re-base every time this runs.

delete from public.status_log;
delete from public.addresses;

-- ${rows.length} households across ${perZone.size} zones, generated from web/src/lib/addresses.ts.
${[...perZone].map(([z, n]) => `--   ${z}  ${ZONE_NAMES[z]} (${n})`).join('\n')}

insert into public.addresses
  (id, address, lat, lng, zone_id, resident_name, structure, structure_recorded_at)
values
${households.join(',\n')};

insert into public.status_log (address_id, status, source, note, recorded_at)
values
${statuses.join(',\n')};

-- ${statuses.length} of ${rows.length} households have a recorded status; the rest read "unknown".
`;

writeFileSync(resolve(here, '../../docs/seed.sql'), sql);
console.log(`wrote ${rows.length} households, ${statuses.length} statuses to docs/seed.sql`);

// Regenerates docs/seed.sql from src/lib/addresses.ts, so Supabase holds exactly the
// households the board and the map draw. Households only: no evacuation statuses, no damage
// assessments. Every house reads "unknown" until someone records a check, and Supabase
// colours it grey. There is no invented-data variant.
//
//   node --experimental-strip-types scripts/build-seed-sql.mjs
//   node ../docs/sql/build-setup-all.mjs
//
// CAUTION: this no longer reproduces the committed docs/seed.sql. The households (ids, names,
// coordinates, zones) are the same, but removing the invented-status draws from addresses.ts shifted
// its random stream, so the street number of nearly every household differs. The committed seed keeps
// the numbers the team already seeded and tested with, so this refuses to overwrite it without --force.
//
// Ids: household a<N> becomes 00000000-0000-4000-8000-<N, 12 digits>, so the scripted
// households a1..a8 keep the ids the voice agent and the tests know them by.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedAddresses } from '../src/lib/addresses.ts';
import { ZONE_NAMES } from '../src/lib/zones.ts';

const here = dirname(fileURLToPath(import.meta.url));
const rows = seedAddresses();

const uuid = (id) => {
  const n = /^a(\d+)$/.exec(id);
  if (!n) throw new Error(`household id ${id} is not a<N>`);
  return `00000000-0000-4000-8000-${n[1].padStart(12, '0')}`;
};
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

const perZone = new Map();
for (const r of rows) perZone.set(r.zone_id, (perZone.get(r.zone_id) ?? 0) + 1);

const householdRows = rows.map((r) =>
  `  (${q(uuid(r.id))}, ${q(r.address)}, ${r.lat}, ${r.lng}, ${q(r.zone_id)}, ${q(r.resident_name)}, 'unassessed', null)`);

const zoneList = [...perZone].map(([z, n]) => `--   ${z}  ${ZONE_NAMES[z]} (${n})`).join('\n');

const seed = `-- Seed data for the Line board: households only. No evacuation statuses, no damage assessments.
-- Every house reads "unknown" (grey on the board) until a real check is recorded.
-- Generated from web/src/lib/addresses.ts by web/scripts/build-seed-sql.mjs — do not edit by hand.
-- Run after the schema in docs/SUPABASE_SETUP.md §1-2.
--
-- The households themselves are placeholders: the buildings are real (OpenStreetMap footprints),
-- but the street addresses and resident names are invented until a real source replaces them.

delete from public.status_log;
delete from public.addresses;

-- ${rows.length} households across ${perZone.size} zones, generated from web/src/lib/addresses.ts.
${zoneList}

insert into public.addresses
  (id, address, lat, lng, zone_id, resident_name, structure, structure_recorded_at)
values
${householdRows.join(',\n')};

-- No status_log rows on purpose.
`;

if (!process.argv.includes('--force')) {
  console.error('refusing to overwrite docs/seed.sql: it would change the street number of nearly every household.\n'
    + 'Re-run with --force if that is what you mean.');
  process.exit(1);
}
writeFileSync(resolve(here, '../../docs/seed.sql'), seed);
console.log(`wrote docs/seed.sql (${rows.length} households, no statuses)`);

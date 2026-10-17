// Rebuilds docs/sql/setup_all.sql from its two sources:
//   docs/SUPABASE_SETUP.md  §1 schema, §2 RLS + Realtime, §3 seed  (the board)
//   docs/sql/calls.sql      the voice agent's call log              (P1)
//
// setup_all.sql used to be maintained by hand and drifted: it still held 30 households on the
// old PAC-* zone ids after the board moved to 77 on PAL-01..PAL-08, so one paste set up a
// project the board could not read. Nothing in the app imports it — it exists to be pasted
// into the Supabase SQL editor — which is exactly why it needs a generator rather than care.
//
//   node docs/sql/build-setup-all.mjs
//
// Re-run it after any change to §1-§3 of the setup doc or to calls.sql.

import { readFile, writeFile } from 'node:fs/promises';

const here = (name) => new URL(name, import.meta.url);

const doc = await readFile(here('../SUPABASE_SETUP.md'), 'utf8');
const calls = await readFile(here('calls.sql'), 'utf8');

const blocks = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1].trimEnd());

// Pick each block by what it does, not by position, so re-ordering the doc cannot silently
// drop a section.
const pick = (needle) => {
  const found = blocks.filter((b) => b.includes(needle));
  if (found.length !== 1) {
    throw new Error(`expected exactly one SQL block containing "${needle}", found ${found.length}`);
  }
  return found[0];
};

const schema = pick('create table public.addresses');
const rls = pick('enable row level security');
const realtime = pick('alter publication supabase_realtime add table public.status_log');
const seed = pick('insert into public.status_log');

// The counts the seed actually contains, so the file's own comments cannot lie about it.
const tuples = (sql) => [...sql.matchAll(/^\s*\('[\s\S]*?\)[,;]\s*$/gm)].length;
const [addrPart, statusPart] = seed.split('insert into public.status_log');
const households = tuples(addrPart);
const statuses = tuples(`insert into public.status_log${statusPart}`);
const zones = [...new Set([...addrPart.matchAll(/'([A-Z]{3}-[0-9]+)'/g)].map((m) => m[1]))].sort();

if (!households || !statuses) throw new Error('seed block parsed to nothing; refusing to write');

const out = `-- ONE-TIME SETUP. Paste all of this into Supabase → SQL Editor → Run.
--
-- GENERATED — do not edit by hand. Run \`node docs/sql/build-setup-all.mjs\` instead.
-- Sources: docs/SUPABASE_SETUP.md §1-§3 (P4's board schema, RLS, seed) + docs/sql/calls.sql (P1).
--
-- Safe to re-run the seed part later to reset the demo; the CREATE parts error if run twice.
-- To re-base the seeded timestamps without pasting anything, use \`npm run reset-demo\` in server/.

-- ===== §1 Schema (docs/SUPABASE_SETUP.md) =====
${schema}

-- ===== §2 Row-level security (docs/SUPABASE_SETUP.md) =====
${rls}

-- ===== §2 Realtime (docs/SUPABASE_SETUP.md) =====
${realtime}

-- ===== §3 Seed data (docs/SUPABASE_SETUP.md) =====
-- ${households} rows in public.addresses across ${zones.length} zones (${zones.join(', ')}),
-- carrying ${statuses} status rows between them. Zone names are in web/src/lib/addresses.ts.
--
-- Not every row is a pin. The board computes the perimeter from lat/lng and drops anything
-- outside it, so the ${zones.filter((z) => !z.startsWith('PAL')).length} out-of-area rows here are
-- for the agent's lookups only — it reads this same table and answers NOT_FOUND for a row
-- that is missing.
${seed}

-- ===== calls table (docs/sql/calls.sql) =====
${calls.trimEnd()}
`;

await writeFile(here('setup_all.sql'), out);
console.log(
  `setup_all.sql rebuilt: ${households} households, ${statuses} statuses, zones ${zones.join(', ')}`,
);

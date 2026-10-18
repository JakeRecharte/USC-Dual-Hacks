// Rebuilds docs/sql/setup_all.sql from its sources:
//   docs/SUPABASE_SETUP.md  §1 schema, §2 RLS + Realtime  (the board)
//   docs/seed.sql           the seeded households          (generated from the board's data)
//   docs/sql/calls.sql      the voice agent's call log     (P1)
//   docs/sql/calls_retell.sql, calls_map.sql, houses.sql, house_colors.sql
//                           the layers on top: Retell fields, map placement, the per-house
//                           state table, and the colour Supabase decides for each house
//
// setup_all.sql used to be maintained by hand and drifted: it still held 30 households on the
// old PAC-* zone ids after the board moved to 77 on PAL-01..PAL-08, so one paste set up a
// project the board could not read. Nothing in the app imports it — it exists to be pasted
// into the Supabase SQL editor — which is exactly why it needs a generator rather than care.
//
//   node docs/sql/build-setup-all.mjs
//
// Re-run it after any change to §1-§3 of the setup doc or to any of the SQL files above.

import { readFile, writeFile } from 'node:fs/promises';

const here = (name) => new URL(name, import.meta.url);

const doc = await readFile(here('../SUPABASE_SETUP.md'), 'utf8');
const calls = await readFile(here('calls.sql'), 'utf8');

// The layers on top of calls.sql, in dependency order. house_colors.sql reads the bypass
// columns that calls_retell.sql adds, and it replaces houses.sql's refresh_house with a
// three-argument form, so it has to come last. (Before this list existed, a project built from
// this file had no `houses` table at all: the board fell back to its own status colours and
// Retell calls never recoloured a house.)
const LAYERS = ['calls_retell.sql', 'calls_map.sql', 'houses.sql', 'house_colors.sql', 'block_invented_data.sql'];
const layers = await Promise.all(LAYERS.map(async (name) => [name, (await readFile(here(name), 'utf8')).trimEnd()]));
// The seed moved out of §3 and into its own file once it passed three thousand lines.
const seedFile = await readFile(here('../seed.sql'), 'utf8');

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
// Strip the generated file's own header; setup_all.sql writes its own.
const seed = seedFile.replace(/^(--[^\n]*\n|\s*\n)+/, '').trimEnd();

// The counts the seed actually contains, so the file's own comments cannot lie about it.
const tuples = (sql) => [...sql.matchAll(/^\s*\('[\s\S]*?\)[,;]\s*$/gm)].length;
const [addrPart, statusPart = ''] = seed.split('insert into public.status_log');
const households = tuples(addrPart);
// The seed carries households only; there are no invented statuses.
const statuses = statusPart ? tuples(`insert into public.status_log${statusPart}`) : 0;
const zones = [...new Set([...addrPart.matchAll(/'([A-Z]{3}-[0-9]+)'/g)].map((m) => m[1]))].sort();

if (!households) throw new Error('seed block parsed to nothing; refusing to write');

const out = `-- ONE-TIME SETUP. Paste all of this into Supabase → SQL Editor → Run.
--
-- GENERATED — do not edit by hand. Run \`node docs/sql/build-setup-all.mjs\` instead.
-- Sources: docs/SUPABASE_SETUP.md §1-§2 (schema, RLS), docs/seed.sql (households), docs/sql/calls.sql (P1),
-- then the layers ${LAYERS.join(', ')}.
--
-- Safe to re-run the seed part later to reset the demo; the CREATE parts error if run twice.
-- Do NOT re-run houses.sql on its own afterwards: house_colors.sql replaces its refresh_house, and
-- running both leaves two overloads, after which every Retell call that links a house fails to save
-- ("function public.refresh_house(uuid) is not unique"). To redo the colour layer, re-run
-- house_colors.sql alone. docs/sql/check_house_colors.sql tells you if the project is in that state.
-- This file is large (the seed alone is ~${Math.round(seed.length / 1024)}KB). If the SQL editor
-- baulks, run the sections in order instead, or \`psql -f docs/seed.sql\` for the seed.
-- To re-base the seeded timestamps without pasting anything, use \`npm run reset-demo\` in server/.

-- ===== §1 Schema (docs/SUPABASE_SETUP.md) =====
${schema}

-- ===== §2 Row-level security (docs/SUPABASE_SETUP.md) =====
${rls}

-- ===== §2 Realtime (docs/SUPABASE_SETUP.md) =====
${realtime}

-- ===== §3 Seed data (docs/SUPABASE_SETUP.md) =====
-- ${households} rows in public.addresses across ${zones.length} zones (${zones.join(', ')}),
-- carrying ${statuses} status rows (the seed has none). Zone names are in web/src/lib/addresses.ts.
--
-- Every household sits on a real OpenStreetMap building footprint inside the perimeter. The
-- board computes inside/outside from lat/lng and drops anything outside, so extra rows
-- elsewhere in LA are safe to add for the agent's lookups: they simply never become pins.
--
-- This block begins with two DELETEs, so re-running just this section resets the demo.
${seed}

-- ===== calls table (docs/sql/calls.sql) =====
${calls.trimEnd()}
${layers.map(([name, body]) => `
-- ===== docs/sql/${name} =====
${body}
`).join('')}`;

await writeFile(here('setup_all.sql'), out);
console.log(
  `setup_all.sql rebuilt: ${households} households, ${statuses} statuses, zones ${zones.join(', ')}; layers ${LAYERS.join(', ')}`,
);

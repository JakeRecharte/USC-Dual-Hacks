-- ONE-TIME SETUP. Paste all of this into Supabase → SQL Editor → Run.
--
-- GENERATED — do not edit by hand. Run `node docs/sql/build-setup-all.mjs` instead.
-- Sources: docs/SUPABASE_SETUP.md §1-§3 (P4's board schema, RLS, seed) + docs/sql/calls.sql (P1).
--
-- Safe to re-run the seed part later to reset the demo; the CREATE parts error if run twice.
-- To re-base the seeded timestamps without pasting anything, use `npm run reset-demo` in server/.

-- ===== §1 Schema (docs/SUPABASE_SETUP.md) =====
-- Enums exactly as the contract names them.
create type public.status_kind as enum
  ('cleared', 'refused', 'no_answer', 'self_out', 'in_transit', 'unknown');
create type public.status_source as enum ('officer', 'resident_reply', 'call');
create type public.structure_kind as enum ('intact', 'damaged', 'destroyed', 'unassessed');

create table public.addresses (
  id                    uuid primary key default gen_random_uuid(),
  address               text not null,
  lat                   double precision not null,
  lng                   double precision not null,
  zone_id               text not null,
  resident_name         text not null,
  -- Board-only. Never returned by lookup_address, never spoken to a caller.
  structure             public.structure_kind not null default 'unassessed',
  structure_recorded_at timestamptz
);

-- Append-only: the board's promise is what was recorded and WHEN, so nothing is overwritten.
create table public.status_log (
  id          uuid primary key default gen_random_uuid(),
  address_id  uuid not null references public.addresses(id) on delete cascade,
  status      public.status_kind not null,
  source      public.status_source not null default 'officer',
  note        text,
  -- Set by the client, not defaulted here: an officer's tap may be queued offline for an
  -- hour, and the time that matters is when they stood at the door.
  recorded_at timestamptz not null
);

-- The board reads the newest row per address on every change, so make that cheap.
create index status_log_newest on public.status_log (address_id, recorded_at desc);

-- ===== §2 Row-level security (docs/SUPABASE_SETUP.md) =====
alter table public.addresses  enable row level security;
alter table public.status_log enable row level security;

-- Readable only with a token minted behind the shift code. `anon` matches neither policy.
create policy "signed-in portals can read addresses"
  on public.addresses for select to authenticated using (true);

create policy "signed-in portals can read the status log"
  on public.status_log for select to authenticated using (true);

-- No insert/update/delete policies at all: writes go through our route handler with the
-- service-role key, which bypasses RLS. That keeps "only officers may write" enforced in one
-- place, where the role cookie is already checked.

-- ===== §2 Realtime (docs/SUPABASE_SETUP.md) =====
alter publication supabase_realtime add table public.status_log;
alter publication supabase_realtime add table public.addresses;

-- ===== §3 Seed data (docs/SUPABASE_SETUP.md) =====
-- 79 rows in public.addresses across 10 zones (LAC-9, LAE-2, PAL-01, PAL-02, PAL-03, PAL-04, PAL-05, PAL-06, PAL-07, PAL-08),
-- carrying 62 status rows between them. Zone names are in web/src/lib/addresses.ts.
--
-- Not every row is a pin. The board computes the perimeter from lat/lng and drops anything
-- outside it, so the 2 out-of-area rows here are
-- for the agent's lookups only — it reads this same table and answers NOT_FOUND for a row
-- that is missing.
delete from public.status_log;
delete from public.addresses;

-- 77 households across 8 zones, generated from web/src/lib/addresses.ts.
--   PAL-01  Castellammare & Sunset Mesa (10)
--   PAL-05  Palisades Village (10)
--   PAL-02  Marquez Knolls (9)
--   PAL-03  Palisades Highlands (10)
--   PAL-06  Huntington Palisades (10)
--   PAL-04  Alphabet Streets (12)
--   PAL-07  Rustic Canyon (7)
--   PAL-08  Santa Monica Canyon & Riviera (9)
--
-- Plus the agent's two out-of-area records (ids 6 and 7, the `a6`/`a7` of
-- server/src/backend.js). They are NOT board households and never become pins: the board
-- drops anything outside the perimeter. They are here because the agent looks households up
-- in this same table once the database is live, and `lookup_address` answers NOT_FOUND for a
-- row that is missing — which would silently break the demo's routine-mode call about
-- Dorothy Hayes. 79 rows in the table, 77 on the map, and that gap is the point.

insert into public.addresses
  (id, address, lat, lng, zone_id, resident_name, structure, structure_recorded_at)
values
  ('00000000-0000-4000-8000-000000000001', '1420 Sunset Mesa Dr', 34.0376, -118.5793, 'PAL-01', 'Maria Lopez', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000002', '1515 Via de la Paz', 34.0447, -118.5266, 'PAL-05', 'Harold Kim', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000003', '16800 Bollinger Dr', 34.0398, -118.5557, 'PAL-02', 'Ruth Adams', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000004', '1100 Palisades Dr', 34.0607, -118.5437, 'PAL-03', 'Tom Becker', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000005', '820 Chautauqua Blvd', 34.0332, -118.5213, 'PAL-06', 'Linda Park', 'unassessed', null),
  -- Outside the incident: for the agent's lookups only, never a pin on this board.
  ('00000000-0000-4000-8000-000000000006', '4512 Crenshaw Blvd', 34.0031, -118.3349, 'LAC-9', 'Dorothy Hayes', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000007', '910 N Vermont Ave', 34.0902, -118.2921, 'LAE-2', 'Kevin Nguyen', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000008', '640 Toyopa Dr', 34.0401, -118.5232, 'PAL-06', 'Beatrice Lam', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000009', '130 Castellammare Dr', 34.03946, -118.57844, 'PAL-01', 'Avery Mwangi', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000010', '202 Posetano Rd', 34.03939, -118.57893, 'PAL-01', 'Sam Boyle', 'destroyed', now() - interval '92 minutes'),
  ('00000000-0000-4000-8000-000000000011', '362 Tramonto Dr', 34.03854, -118.57099, 'PAL-01', 'Priya Thornton', 'destroyed', now() - interval '36 minutes'),
  ('00000000-0000-4000-8000-000000000012', '534 Revello Dr', 34.03728, -118.57156, 'PAL-01', 'Daniel Kaplan', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000013', '646 Breve Way', 34.03606, -118.57364, 'PAL-01', 'Elena Petrov', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000014', '678 Porto Marina Way', 34.03468, -118.57598, 'PAL-01', 'Grace Castellanos', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000015', '796 Castellammare Dr', 34.03789, -118.57168, 'PAL-01', 'Victor Okonkwo', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000016', '842 Posetano Rd', 34.03472, -118.58117, 'PAL-01', 'Nora Sorensen', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000017', '1066 Tramonto Dr', 34.04168, -118.57857, 'PAL-01', 'Omar Marchetti', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000018', '104 Marquez Ave', 34.03748, -118.55265, 'PAL-02', 'Jonah Chaudhry', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000019', '364 Livorno Dr', 34.04486, -118.55041, 'PAL-02', 'Theresa Ibarra', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000020', '316 Charmel Ln', 34.04282, -118.55032, 'PAL-02', 'Hector Donnelly', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000021', '544 Akron St', 34.03957, -118.55047, 'PAL-02', 'Ingrid Whitfield', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000022', '536 Oracle Pl', 34.04306, -118.55133, 'PAL-02', 'Marcus Demir', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000023', '712 Ida Ave', 34.04351, -118.55312, 'PAL-02', 'Yusuf Reyes', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000024', '744 Marquez Ave', 34.04023, -118.55454, 'PAL-02', 'Camila Lindqvist', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000025', '968 Livorno Dr', 34.0392, -118.55486, 'PAL-02', 'Russell Takahashi', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000026', '274 Vereda de la Montura', 34.05898, -118.54456, 'PAL-03', 'Alice Raman', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000027', '242 Chastain Pkwy', 34.06939, -118.55, 'PAL-03', 'Felix Pressler', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000028', '312 Michael Ln', 34.06262, -118.53938, 'PAL-03', 'Sofia Boateng', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000029', '402 Avenida de Santa Ynez', 34.05992, -118.5484, 'PAL-03', 'Gerald Osei', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000030', '508 Calle Arbolada', 34.05991, -118.54409, 'PAL-03', 'Hannah Moreau', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000031', '608 Enchanted Way', 34.06924, -118.54847, 'PAL-03', 'Mateo Nwosu', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000032', '796 Vereda de la Montura', 34.06732, -118.54445, 'PAL-03', 'Imani Fischer', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000033', '848 Chastain Pkwy', 34.06526, -118.5433, 'PAL-03', 'Dov Salas', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000034', '1054 Michael Ln', 34.06382, -118.54879, 'PAL-03', 'Claire Nakamura', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000035', '252 Albright Ave', 34.04512, -118.53497, 'PAL-04', 'Rashid Beaumont', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000036', '378 Bashford St', 34.05288, -118.53482, 'PAL-04', 'Lena Hargreaves', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000037', '464 Carey St', 34.05061, -118.52855, 'PAL-04', 'Tobias Ryder', 'destroyed', now() - interval '93 minutes'),
  ('00000000-0000-4000-8000-000000000038', '418 Dryad Rd', 34.04612, -118.52776, 'PAL-04', 'Margot Alvarez', 'damaged', now() - interval '32 minutes'),
  ('00000000-0000-4000-8000-000000000039', '584 El Medio Ave', 34.04903, -118.53039, 'PAL-04', 'Elias Webb', 'damaged', now() - interval '70 minutes'),
  ('00000000-0000-4000-8000-000000000040', '704 Fiske St', 34.04557, -118.53213, 'PAL-04', 'Nadia Pike', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000041', '796 Galloway St', 34.04661, -118.53831, 'PAL-04', 'Colin Vogel', 'damaged', now() - interval '26 minutes'),
  ('00000000-0000-4000-8000-000000000042', '872 Hartzell St', 34.0444, -118.53326, 'PAL-04', 'Priscilla Quinn', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000043', '1060 Iliff St', 34.04898, -118.53105, 'PAL-04', 'Andre Okafor', 'damaged', now() - interval '12 minutes'),
  ('00000000-0000-4000-8000-000000000044', '232 Jacon Way', 34.04822, -118.5345, 'PAL-04', 'Wen Haddad', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000045', '356 Kagawa St', 34.05079, -118.53239, 'PAL-04', 'Bridget Duarte', 'destroyed', now() - interval '61 minutes'),
  ('00000000-0000-4000-8000-000000000046', '434 Northfield St', 34.04702, -118.53912, 'PAL-04', 'Oscar Ferreira', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000047', '144 Antioch St', 34.04239, -118.52429, 'PAL-05', 'Leila Ashworth', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000048', '316 Swarthmore Ave', 34.04137, -118.52666, 'PAL-05', 'Stefan Delacroix', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000049', '416 Haverford Ave', 34.04455, -118.52423, 'PAL-05', 'Rosa Mwangi', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000050', '468 La Cruz Dr', 34.04307, -118.52309, 'PAL-05', 'Devon Boyle', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000051', '580 Monument St', 34.04585, -118.5247, 'PAL-05', 'Maeve Thornton', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000052', '626 Radcliffe Ave', 34.0436, -118.5297, 'PAL-05', 'Ibrahim Kaplan', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000053', '840 Antioch St', 34.04643, -118.52735, 'PAL-05', 'Joy Petrov', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000054', '958 Swarthmore Ave', 34.04732, -118.52315, 'PAL-05', 'Lucas Castellanos', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000055', '1036 Haverford Ave', 34.04404, -118.52218, 'PAL-05', 'Anneke Okonkwo', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000056', '124 Alma Real Dr', 34.04048, -118.52328, 'PAL-06', 'Ravi Sorensen', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000057', '354 Ocampo Dr', 34.03752, -118.52541, 'PAL-06', 'Esther Marchetti', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000058', '412 Corto Pl', 34.03873, -118.52297, 'PAL-06', 'Nikolai Chaudhry', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000059', '452 Pampas Ricas Blvd', 34.03852, -118.51934, 'PAL-06', 'Avery Ibarra', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000060', '612 Frontera Dr', 34.04078, -118.51889, 'PAL-06', 'Sam Donnelly', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000061', '678 El Cerco Pl', 34.03769, -118.51594, 'PAL-06', 'Priya Whitfield', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000062', '760 Alma Real Dr', 34.03818, -118.52512, 'PAL-06', 'Daniel Demir', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000063', '826 Ocampo Dr', 34.04204, -118.51776, 'PAL-06', 'Elena Reyes', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000064', '178 Latimer Rd', 34.04693, -118.50995, 'PAL-07', 'Grace Lindqvist', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000065', '376 Brooktree Rd', 34.04961, -118.50943, 'PAL-07', 'Victor Takahashi', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000066', '384 Mesa Rd', 34.04872, -118.50546, 'PAL-07', 'Nora Raman', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000067', '444 Haldeman Rd', 34.04624, -118.50609, 'PAL-07', 'Omar Pressler', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000068', '562 Sage Ln', 34.0482, -118.5079, 'PAL-07', 'Jonah Boateng', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000069', '606 Rivas Canyon Rd', 34.04707, -118.51407, 'PAL-07', 'Theresa Osei', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000070', '840 Latimer Rd', 34.04481, -118.50981, 'PAL-07', 'Hector Moreau', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000071', '184 Entrada Dr', 34.03641, -118.50623, 'PAL-08', 'Ingrid Nwosu', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000072', '290 Mabery Rd', 34.03339, -118.50992, 'PAL-08', 'Marcus Fischer', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000073', '352 Amalfi Dr', 34.03446, -118.50423, 'PAL-08', 'Yusuf Salas', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000074', '530 Channel Rd', 34.03962, -118.50304, 'PAL-08', 'Camila Nakamura', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000075', '560 East Rustic Rd', 34.04018, -118.50451, 'PAL-08', 'Russell Beaumont', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000076', '678 Corsica Dr', 34.03999, -118.50879, 'PAL-08', 'Alice Hargreaves', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000077', '838 Umeo Rd', 34.04182, -118.50389, 'PAL-08', 'Felix Ryder', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000078', '882 Entrada Dr', 34.0407, -118.50357, 'PAL-08', 'Sofia Alvarez', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000079', '912 Mabery Rd', 34.03606, -118.50128, 'PAL-08', 'Gerald Webb', 'unassessed', null);

insert into public.status_log (address_id, status, source, note, recorded_at)
values
  ('00000000-0000-4000-8000-000000000001', 'cleared', 'officer', null, now() - interval '40 minutes'),
  ('00000000-0000-4000-8000-000000000002', 'refused', 'officer', '2 adults staying, 1 on oxygen', now() - interval '25 minutes'),
  ('00000000-0000-4000-8000-000000000004', 'cleared', 'officer', null, now() - interval '360 minutes'),
  ('00000000-0000-4000-8000-000000000005', 'self_out', 'resident_reply', null, now() - interval '55 minutes'),
  ('00000000-0000-4000-8000-000000000009', 'cleared', 'officer', null, now() - interval '60 minutes'),
  ('00000000-0000-4000-8000-000000000010', 'cleared', 'officer', null, now() - interval '92 minutes'),
  ('00000000-0000-4000-8000-000000000011', 'cleared', 'officer', null, now() - interval '36 minutes'),
  ('00000000-0000-4000-8000-000000000012', 'cleared', 'officer', null, now() - interval '83 minutes'),
  ('00000000-0000-4000-8000-000000000013', 'cleared', 'officer', null, now() - interval '214 minutes'),
  ('00000000-0000-4000-8000-000000000014', 'self_out', 'resident_reply', null, now() - interval '247 minutes'),
  ('00000000-0000-4000-8000-000000000015', 'self_out', 'resident_reply', null, now() - interval '22 minutes'),
  ('00000000-0000-4000-8000-000000000016', 'refused', 'officer', 'staying to run sprinklers, car still in the driveway', now() - interval '54 minutes'),
  ('00000000-0000-4000-8000-000000000017', 'no_answer', 'officer', null, now() - interval '71 minutes'),
  ('00000000-0000-4000-8000-000000000023', 'no_answer', 'officer', null, now() - interval '38 minutes'),
  ('00000000-0000-4000-8000-000000000024', 'no_answer', 'officer', null, now() - interval '39 minutes'),
  ('00000000-0000-4000-8000-000000000025', 'refused', 'officer', 'elderly father refuses to leave the house, no vehicle', now() - interval '14 minutes'),
  ('00000000-0000-4000-8000-000000000026', 'cleared', 'officer', null, now() - interval '65 minutes'),
  ('00000000-0000-4000-8000-000000000027', 'cleared', 'officer', null, now() - interval '69 minutes'),
  ('00000000-0000-4000-8000-000000000028', 'cleared', 'officer', null, now() - interval '89 minutes'),
  ('00000000-0000-4000-8000-000000000029', 'cleared', 'officer', null, now() - interval '28 minutes'),
  ('00000000-0000-4000-8000-000000000030', 'in_transit', 'resident_reply', null, now() - interval '17 minutes'),
  ('00000000-0000-4000-8000-000000000031', 'in_transit', 'resident_reply', null, now() - interval '6 minutes'),
  ('00000000-0000-4000-8000-000000000034', 'no_answer', 'officer', null, now() - interval '53 minutes'),
  ('00000000-0000-4000-8000-000000000035', 'cleared', 'officer', null, now() - interval '445 minutes'),
  ('00000000-0000-4000-8000-000000000036', 'cleared', 'officer', null, now() - interval '155 minutes'),
  ('00000000-0000-4000-8000-000000000037', 'cleared', 'officer', null, now() - interval '93 minutes'),
  ('00000000-0000-4000-8000-000000000038', 'cleared', 'officer', null, now() - interval '32 minutes'),
  ('00000000-0000-4000-8000-000000000039', 'cleared', 'officer', null, now() - interval '70 minutes'),
  ('00000000-0000-4000-8000-000000000040', 'cleared', 'officer', null, now() - interval '17 minutes'),
  ('00000000-0000-4000-8000-000000000041', 'self_out', 'resident_reply', null, now() - interval '26 minutes'),
  ('00000000-0000-4000-8000-000000000042', 'self_out', 'resident_reply', null, now() - interval '9 minutes'),
  ('00000000-0000-4000-8000-000000000043', 'refused', 'officer', 'two adults staying, will not leave the dogs', now() - interval '12 minutes'),
  ('00000000-0000-4000-8000-000000000044', 'no_answer', 'officer', null, now() - interval '35 minutes'),
  ('00000000-0000-4000-8000-000000000045', 'no_answer', 'officer', null, now() - interval '61 minutes'),
  ('00000000-0000-4000-8000-000000000047', 'cleared', 'officer', null, now() - interval '84 minutes'),
  ('00000000-0000-4000-8000-000000000048', 'cleared', 'officer', null, now() - interval '54 minutes'),
  ('00000000-0000-4000-8000-000000000049', 'cleared', 'officer', null, now() - interval '102 minutes'),
  ('00000000-0000-4000-8000-000000000050', 'cleared', 'officer', null, now() - interval '41 minutes'),
  ('00000000-0000-4000-8000-000000000051', 'cleared', 'officer', null, now() - interval '112 minutes'),
  ('00000000-0000-4000-8000-000000000052', 'self_out', 'resident_reply', null, now() - interval '88 minutes'),
  ('00000000-0000-4000-8000-000000000053', 'self_out', 'resident_reply', null, now() - interval '25 minutes'),
  ('00000000-0000-4000-8000-000000000054', 'in_transit', 'resident_reply', null, now() - interval '21 minutes'),
  ('00000000-0000-4000-8000-000000000055', 'no_answer', 'officer', null, now() - interval '57 minutes'),
  ('00000000-0000-4000-8000-000000000056', 'cleared', 'officer', null, now() - interval '37 minutes'),
  ('00000000-0000-4000-8000-000000000057', 'cleared', 'officer', null, now() - interval '70 minutes'),
  ('00000000-0000-4000-8000-000000000058', 'cleared', 'officer', null, now() - interval '73 minutes'),
  ('00000000-0000-4000-8000-000000000059', 'cleared', 'officer', null, now() - interval '43 minutes'),
  ('00000000-0000-4000-8000-000000000060', 'self_out', 'resident_reply', null, now() - interval '77 minutes'),
  ('00000000-0000-4000-8000-000000000061', 'no_answer', 'officer', null, now() - interval '93 minutes'),
  ('00000000-0000-4000-8000-000000000062', 'no_answer', 'officer', null, now() - interval '96 minutes'),
  ('00000000-0000-4000-8000-000000000068', 'no_answer', 'officer', null, now() - interval '86 minutes'),
  ('00000000-0000-4000-8000-000000000069', 'no_answer', 'officer', null, now() - interval '19 minutes'),
  ('00000000-0000-4000-8000-000000000070', 'cleared', 'officer', null, now() - interval '27 minutes'),
  ('00000000-0000-4000-8000-000000000071', 'cleared', 'officer', null, now() - interval '40 minutes'),
  ('00000000-0000-4000-8000-000000000072', 'cleared', 'officer', null, now() - interval '196 minutes'),
  ('00000000-0000-4000-8000-000000000073', 'cleared', 'officer', null, now() - interval '59 minutes'),
  ('00000000-0000-4000-8000-000000000074', 'cleared', 'officer', null, now() - interval '85 minutes'),
  ('00000000-0000-4000-8000-000000000075', 'cleared', 'officer', null, now() - interval '25 minutes'),
  ('00000000-0000-4000-8000-000000000076', 'cleared', 'officer', null, now() - interval '66 minutes'),
  ('00000000-0000-4000-8000-000000000077', 'self_out', 'resident_reply', null, now() - interval '402 minutes'),
  ('00000000-0000-4000-8000-000000000078', 'self_out', 'resident_reply', null, now() - interval '37 minutes'),
  ('00000000-0000-4000-8000-000000000079', 'in_transit', 'resident_reply', null, now() - interval '19 minutes');

-- 62 of the 77 board households have a recorded status; the rest read "unknown". The two
-- out-of-area rows carry no status at all, which is what the agent reports for them.

-- ===== calls table (docs/sql/calls.sql) =====
-- The voice agent's call log (P1). Run once in Supabase → SQL Editor, after
-- docs/SUPABASE_SETUP.md §1–2 (it references public.addresses).
--
-- One row per phone call, keyed by Retell's call_id. The telephony server upserts it with the
-- service-role key as the call progresses; routing only ever moves up within a call.
-- Columns follow docs/DATA_CONTRACT.md §2 plus what the board's queue shows.

create table if not exists public.calls (
  id                 uuid primary key default gen_random_uuid(),
  call_id            text not null unique,
  mode               text check (mode in ('wildfire', 'routine')),
  address            text,                -- as the caller said it
  address_id         uuid references public.addresses(id) on delete set null,
  subject_name       text,
  from_number        text,                -- callback number
  with_them_now      boolean not null default false,
  emergency          boolean not null default false,
  caller_update      text,                -- newer info from the caller than the record
  last_contact_hours numeric,
  vulnerability      jsonb not null default '{}'::jsonb,
  red_flags          jsonb not null default '{}'::jsonb,
  caller_state       text check (caller_state in ('calm', 'worried', 'distressed', 'panicked')),
  prior_callers      int not null default 0,  -- other numbers that already called about this address
  routing            text not null check (routing in (
                       'human_now', 'priority_queue', 'answered_by_agent', 'scheduled_followup',
                       'abandoned_callback',   -- hung up before routing: call back
                       'callback_queue')),     -- transfer didn't connect: call back first
  severity           int check (severity between 1 and 5),
  reason             text,                -- one line for the board
  simulated          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);

create index if not exists calls_newest on public.calls (created_at desc);

-- Same rule as the other tables: anon reads nothing; the board reads with its minted token;
-- only the telephony server writes (service role bypasses RLS).
alter table public.calls enable row level security;

drop policy if exists "signed-in portals can read calls" on public.calls;
create policy "signed-in portals can read calls"
  on public.calls for select to authenticated using (true);

-- Live queue on the board.
alter publication supabase_realtime add table public.calls;

-- Reset between demo runs:
--   delete from public.calls;

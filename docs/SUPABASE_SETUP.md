# Supabase + Vercel setup

From P4. Run this and the board becomes database-backed: an officer's tap goes into Postgres
and the dispatcher's map updates from Postgres, with nothing live passing through our own
server. That last part is what makes it work on Vercel.

**For P2:** sections 1–3 are yours. **For P4:** section 4 is the Vercel config.

---

## Why it has to be this way on Vercel

The board used to share state through an in-process store and our own SSE feed. That works
on one long-running server and **cannot** work on Vercel: every request may land on a
different serverless instance, so the officer's write and the dispatcher's open stream end up
in different processes, and the function timeout cuts the stream anyway.

So in Supabase mode:

```
officer phone ──POST /api/status──► route handler (service-role key) ──► Postgres
                                                                          │
dispatcher browser ◄──── Supabase Realtime (WebSocket, direct) ───────────┘
```

Writes are short requests, which serverless is fine at. The live subscription goes browser →
Supabase, never touching Vercel. The app keeps the old in-memory path as a fallback and says
which mode it is in, so a demo still runs if the database is not ready.

## 1. Schema

The enums and the two tables are from `docs/DATA_CONTRACT.md`. The only additions are
`structure` and `structure_recorded_at`, which are the request in
`docs/FRONTEND_CONTRACT.md` §1 — a separate field, deliberately **not** a seventh status,
because the voice agent must never read it to a caller.

```sql
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
```

## 2. Row-level security

**This part matters more than it looks.** The board shows resident names and whether each
household evacuated — the exact list this project promises not to hand out. The anon key
ships inside the browser bundle, so if `anon` could read these tables, deploying the site
would publish that list.

So `anon` gets nothing. The app mints a short-lived `authenticated` JWT only after the
passcode gate (`web/src/lib/supabase-token.ts`), and these policies key off that.

```sql
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
```

Then turn on Realtime for both tables, or the dispatcher's map will never update:

```sql
alter publication supabase_realtime add table public.status_log;
alter publication supabase_realtime add table public.addresses;
```

> Realtime also respects RLS, so the dispatcher's subscription needs the same token. The app
> handles that; there is nothing extra to configure.

## 3. Seed data

Generated from `web/src/lib/addresses.ts`, so the board, the demo script's pre-flight numbers
and the voice agent's fake data all describe the same households. The first seven ids match
`server/src/backend.js` (`a1` → `…0001`, `a2` → `…0002`, and so on), which is what lets a
real phone call and the board agree on screen.

Re-run the two deletes plus the inserts to reset between demo runs — the timestamps are
relative to `now()`, so the ages re-base each time.

```sql
delete from public.status_log;
delete from public.addresses;

-- 79 households across 10 zones, generated from web/src/lib/addresses.ts.
--   PAL-01  Castellammare & Sunset Mesa (10)
--   PAL-05  Palisades Village (10)
--   PAL-02  Marquez Knolls (9)
--   PAL-03  Palisades Highlands (10)
--   PAL-06  Huntington Palisades (10)
--   LAC-9  Crenshaw (outside) (1)
--   LAE-2  East Hollywood (outside) (1)
--   PAL-04  Alphabet Streets (12)
--   PAL-07  Rustic Canyon (7)
--   PAL-08  Santa Monica Canyon & Riviera (9)

insert into public.addresses
  (id, address, lat, lng, zone_id, resident_name, structure, structure_recorded_at)
values
  ('00000000-0000-4000-8000-000000000001', '1420 Sunset Mesa Dr', 34.0376, -118.5793, 'PAL-01', 'Maria Lopez', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000002', '1515 Via de la Paz', 34.0447, -118.5266, 'PAL-05', 'Harold Kim', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000003', '16800 Bollinger Dr', 34.0398, -118.5557, 'PAL-02', 'Ruth Adams', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000004', '1100 Palisades Dr', 34.0607, -118.5437, 'PAL-03', 'Tom Becker', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000005', '820 Chautauqua Blvd', 34.0332, -118.5213, 'PAL-06', 'Linda Park', 'unassessed', null),
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

-- 62 of 79 households have a recorded status; the rest read "unknown".
```

After seeding, the dispatch board should read **40 unresolved of 77**, **4 refused**,
**15 never contacted**, **7 stale clears**, with Marquez Knolls (`PAL-02`) at `9/9` — the
zone no crew has reached. If it doesn't, the seed didn't take.

`inside_perimeter` is **not** a column. The contract keeps the perimeter as one polygon
covering Pacific Palisades from the coast up into Santa Ynez Canyon, so the app computes it
from `lat`/`lng` (`web/src/lib/geo.ts`). 77 of the 79 households fall inside; Crenshaw and
Vermont are the two outside, and a unit test asserts the computed value matches the zone for
every row.

## 4. Vercel configuration

**Root Directory must be `web`.** There is no `package.json` at the repo root, so a default
build finds no app. Set it in Project → Settings → Build and Deployment → Root Directory.

Environment variables (Project → Settings → Environment Variables):

| Variable | Where it comes from | Exposed to the browser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, **secret** | **no** |
| `SUPABASE_JWT_SECRET` | Project Settings → API → JWT Settings | **no** |
| `OFFICER_PASSCODE` | pick one | no |
| `DISPATCH_PASSCODE` | pick a different one | no |
| `AUTH_SECRET` | `openssl rand -hex 32` | no |
| `NEXT_PUBLIC_TELEPHONY_URL` | `https://usc-dual-hacks-production.up.railway.app` | yes |

Only the four `NEXT_PUBLIC_` values reach the browser. Do not prefix the service-role key or
the JWT secret — that would publish them.

**If `SUPABASE_JWT_SECRET` is missing** the app still runs, but it falls back to the anon key
and the board shows an amber warning saying reads are not behind the shift code. Do not
deploy publicly in that state.

**If the Supabase variables are missing entirely** the app runs in memory mode: fully working
for a local demo, but status is not shared between serverless instances, so the officer →
dispatcher update will not arrive on Vercel. The header says which mode is live.

## What I could not test

I do not have the project's credentials, so the Supabase path is verified by construction and
by unit tests, not against a live database:

- `joinRows` (newest status per address, perimeter test, missing-column degradation) and the
  point-in-polygon test are covered in `web/test/supabase-data.test.ts` — 23 tests pass.
- The minted JWT was verified as valid HS256 with the expected claims by signing the same
  payload independently.
- Memory mode is verified end to end.

**Still to confirm once the project exists:** that the enum labels match what the app sends,
that Realtime actually fires for both tables, and that the service-role write succeeds. The
first officer tap will tell you — a failure comes back in the `rejected` array with the
Postgres message, and the board shows a red banner rather than failing silently.

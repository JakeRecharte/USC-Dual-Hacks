-- ONE-TIME SETUP. Paste all of this into Supabase → SQL Editor → Run.
-- Generated from docs/SUPABASE_SETUP.md §1–3 (P4's board schema, RLS, seed) + docs/sql/calls.sql (P1).
-- Safe to re-run the seed part later to reset the demo; the CREATE parts error if run twice.

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
delete from public.status_log;
delete from public.addresses;

-- 30 households across 6 zones.
-- Zones: PAC-1 Sunset Mesa, PAC-2 Palisades Village, PAC-3 Marquez Knolls, PAC-4 Palisades Highlands, LAC-9 Crenshaw (outside), LAE-2 East Hollywood (outside)

insert into public.addresses
  (id, address, lat, lng, zone_id, resident_name, structure, structure_recorded_at)
values
  ('00000000-0000-4000-8000-000000000001', '1420 Sunset Mesa Dr', 34.0376, -118.5793, 'PAC-1', 'Maria Lopez', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000002', '1515 Via de la Paz', 34.0447, -118.5266, 'PAC-2', 'Harold Kim', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000003', '16800 Bollinger Dr', 34.0398, -118.5557, 'PAC-3', 'Ruth Adams', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000004', '1100 Palisades Dr', 34.0607, -118.5437, 'PAC-4', 'Tom Becker', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000005', '820 Chautauqua Blvd', 34.0332, -118.5213, 'PAC-2', 'Linda Park', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000006', '4512 Crenshaw Blvd', 34.0031, -118.3349, 'LAC-9', 'Dorothy Hayes', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000007', '910 N Vermont Ave', 34.0902, -118.2921, 'LAE-2', 'Kevin Nguyen', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000008', '17320 Castellammare Dr', 34.0391, -118.5761, 'PAC-1', 'Avery Donnelly', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000009', '17450 Posetano Rd', 34.0402, -118.5748, 'PAC-1', 'Sam Okafor', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000010', '17615 Tramonto Dr', 34.0413, -118.5729, 'PAC-1', 'Priya Raman', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000011', '17680 Breve Way', 34.0369, -118.5812, 'PAC-1', 'Daniel Mwangi', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000012', '17210 Revello Dr', 34.0385, -118.5776, 'PAC-1', 'Elena Fischer', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000013', '881 Antioch St', 34.0459, -118.5281, 'PAC-2', 'Grace Okonkwo', 'damaged', now() - interval '48 minutes'),
  ('00000000-0000-4000-8000-000000000014', '1032 Swarthmore Ave', 34.0441, -118.5297, 'PAC-2', 'Victor Alvarez', 'destroyed', now() - interval '110 minutes'),
  ('00000000-0000-4000-8000-000000000015', '1145 Monument St', 34.0428, -118.5245, 'PAC-2', 'Nora Whitfield', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000016', '1290 Alma Real Dr', 34.0466, -118.5229, 'PAC-2', 'Omar Haddad', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000017', '640 Toyopa Dr', 34.0415, -118.5302, 'PAC-2', 'Beatrice Lam', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000018', '718 Fiske St', 34.0403, -118.5331, 'PAC-2', 'Jonah Pressler', 'damaged', now() - interval '95 minutes'),
  ('00000000-0000-4000-8000-000000000019', '955 Radcliffe Ave', 34.0437, -118.5338, 'PAC-2', 'Theresa Boyle', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000020', '16725 Marquez Ave', 34.0412, -118.5541, 'PAC-3', 'Hector Salas', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000021', '16540 Livorno Dr', 34.0381, -118.5578, 'PAC-3', 'Ingrid Sorensen', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000022', '16902 Oracle Pl', 34.0424, -118.5523, 'PAC-3', 'Marcus Webb', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000023', '17045 Lachman Ln', 34.0437, -118.5509, 'PAC-3', 'Yusuf Demir', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000024', '16388 Akron St', 34.0366, -118.5595, 'PAC-3', 'Camila Duarte', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000025', '16610 Charmel Ln', 34.0393, -118.5531, 'PAC-3', 'Russell Boateng', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000026', '1456 Vereda de la Montura', 34.0631, -118.5451, 'PAC-4', 'Alice Thornton', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000027', '1620 Chastain Pkwy', 34.0654, -118.5468, 'PAC-4', 'Felix Nakamura', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000028', '1288 Michael Ln', 34.0596, -118.5412, 'PAC-4', 'Sofia Marchetti', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000029', '1702 Capri Dr', 34.0668, -118.5494, 'PAC-4', 'Gerald Pike', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000030', '1340 Lorenzo Pl', 34.0618, -118.5423, 'PAC-4', 'Hannah Reyes', 'unassessed', null);

insert into public.status_log (address_id, status, source, note, recorded_at)
values
  ('00000000-0000-4000-8000-000000000001', 'cleared', 'officer', null, now() - interval '40 minutes'),
  ('00000000-0000-4000-8000-000000000002', 'refused', 'officer', '2 adults staying, 1 on oxygen', now() - interval '25 minutes'),
  ('00000000-0000-4000-8000-000000000004', 'cleared', 'officer', null, now() - interval '360 minutes'),
  ('00000000-0000-4000-8000-000000000005', 'self_out', 'resident_reply', null, now() - interval '55 minutes'),
  ('00000000-0000-4000-8000-000000000008', 'cleared', 'officer', null, now() - interval '62 minutes'),
  ('00000000-0000-4000-8000-000000000009', 'self_out', 'resident_reply', null, now() - interval '88 minutes'),
  ('00000000-0000-4000-8000-000000000010', 'refused', 'officer', 'staying to run sprinklers, has a car in the driveway', now() - interval '15 minutes'),
  ('00000000-0000-4000-8000-000000000011', 'cleared', 'officer', null, now() - interval '71 minutes'),
  ('00000000-0000-4000-8000-000000000012', 'no_answer', 'officer', null, now() - interval '34 minutes'),
  ('00000000-0000-4000-8000-000000000013', 'cleared', 'officer', null, now() - interval '48 minutes'),
  ('00000000-0000-4000-8000-000000000014', 'self_out', 'resident_reply', null, now() - interval '110 minutes'),
  ('00000000-0000-4000-8000-000000000015', 'cleared', 'officer', null, now() - interval '300 minutes'),
  ('00000000-0000-4000-8000-000000000016', 'in_transit', 'resident_reply', null, now() - interval '9 minutes'),
  ('00000000-0000-4000-8000-000000000018', 'cleared', 'officer', null, now() - interval '95 minutes'),
  ('00000000-0000-4000-8000-000000000019', 'no_answer', 'officer', null, now() - interval '52 minutes'),
  ('00000000-0000-4000-8000-000000000021', 'no_answer', 'officer', null, now() - interval '78 minutes'),
  ('00000000-0000-4000-8000-000000000023', 'refused', 'officer', 'elderly father refuses to leave the house, no vehicle', now() - interval '41 minutes'),
  ('00000000-0000-4000-8000-000000000024', 'cleared', 'officer', null, now() - interval '420 minutes'),
  ('00000000-0000-4000-8000-000000000026', 'cleared', 'officer', null, now() - interval '275 minutes'),
  ('00000000-0000-4000-8000-000000000027', 'in_transit', 'resident_reply', null, now() - interval '6 minutes'),
  ('00000000-0000-4000-8000-000000000029', 'no_answer', 'officer', null, now() - interval '23 minutes'),
  ('00000000-0000-4000-8000-000000000030', 'self_out', 'resident_reply', null, now() - interval '102 minutes');

-- 22 of 30 households have a recorded status; the rest read "unknown".

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

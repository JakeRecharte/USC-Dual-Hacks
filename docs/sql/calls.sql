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

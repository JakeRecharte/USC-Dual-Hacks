-- public.houses: the current state of every household, one row each (P1),
-- plus the dispatch dashboard: two columns on public.calls (reasoning, suggestions) and the
-- suggestion_decisions audit table.
-- Run once in Supabase → SQL Editor, after SUPABASE_SETUP.md §1–2 and the three calls*.sql files.
-- Safe to run twice.
--
-- Nobody writes the evacuation or call columns directly: triggers on status_log, calls and
-- addresses keep them true, so this table can't disagree with the log it summarises.
-- fire_threat_* come from research (docs/research/street-threat.json via
-- `npm run apply-threat`) and survive every refresh.

-- The dashboard's view of each call: the steps behind the routing (from decision_trace) and
-- suggested resources a dispatcher confirms. Shapes in docs/DATA_CONTRACT.md §8.
alter table public.calls
  add column if not exists reasoning   jsonb,
  add column if not exists suggestions jsonb;

-- A dispatcher's confirm/dismiss on a suggestion. Append-only: the audit trail of every human
-- decision on an automated suggestion. Kept out of calls.suggestions because the server
-- rewrites that column when a call is re-routed. The newest row per (call_id, suggestion_id) wins.
create table if not exists public.suggestion_decisions (
  id            uuid primary key default gen_random_uuid(),
  call_id       text not null references public.calls(call_id) on delete cascade,
  suggestion_id text not null,
  resource      text,                 -- the suggestion's wording at the time it was decided
  decision      text not null check (decision in ('confirmed', 'dismissed')),
  decided_by    text not null,        -- the signed-in role
  decided_at    timestamptz not null default now()
);
create index if not exists suggestion_decisions_by_call on public.suggestion_decisions (call_id, decided_at desc);
alter table public.suggestion_decisions enable row level security;
drop policy if exists "signed-in portals can read decisions" on public.suggestion_decisions;
create policy "signed-in portals can read decisions"
  on public.suggestion_decisions for select to authenticated using (true);
do $$ begin
  alter publication supabase_realtime add table public.suggestion_decisions;
exception when duplicate_object then null; end $$;

create table if not exists public.houses (
  id                        uuid primary key references public.addresses(id) on delete cascade,
  address                   text not null,
  zone_id                   text,
  -- Evacuation: the newest status_log row for this household.
  evacuation_status         public.status_kind not null default 'unknown',
  evacuation_status_source  public.status_source,
  evacuation_note           text,
  last_checked_at           timestamptz,          -- when that status was recorded (null = never checked)
  -- Fire threat for this house's street, from research. Null = not assessed.
  fire_threat_level         text check (fire_threat_level in ('extreme', 'high', 'moderate', 'low')),
  fire_threat_reason        text,
  fire_threat_source        text,
  -- Calls to the line about this household.
  called_about              boolean not null default false,
  call_count                int not null default 0,
  last_called_at            timestamptz,
  updated_at                timestamptz not null default now()
);

create index if not exists houses_by_zone on public.houses (zone_id);
create index if not exists houses_by_threat on public.houses (fire_threat_level, evacuation_status);

-- Recompute one household from the source tables. Leaves fire_threat_* alone.
create or replace function public.refresh_house(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_id is null then return; end if;
  insert into public.houses as h
    (id, address, zone_id, evacuation_status, evacuation_status_source, evacuation_note,
     last_checked_at, called_about, call_count, last_called_at, updated_at)
  select a.id, a.address, a.zone_id,
         coalesce(s.status, 'unknown'), s.source, s.note, s.recorded_at,
         coalesce(c.n, 0) > 0, coalesce(c.n, 0), c.last_at, now()
  from public.addresses a
  left join lateral (
    select status, source, note, recorded_at from public.status_log
    where address_id = a.id order by recorded_at desc limit 1
  ) s on true
  left join lateral (
    select count(*)::int as n, max(created_at) as last_at from public.calls where address_id = a.id
  ) c on true
  where a.id = p_id
  on conflict (id) do update set
    address = excluded.address,
    zone_id = excluded.zone_id,
    evacuation_status = excluded.evacuation_status,
    evacuation_status_source = excluded.evacuation_status_source,
    evacuation_note = excluded.evacuation_note,
    last_checked_at = excluded.last_checked_at,
    called_about = excluded.called_about,
    call_count = excluded.call_count,
    last_called_at = excluded.last_called_at,
    updated_at = now();
end $$;

create or replace function public.houses_from_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- NEW doesn't exist on DELETE and OLD doesn't on INSERT, so branch on the operation.
  if tg_op in ('INSERT', 'UPDATE') then perform public.refresh_house(new.address_id); end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.address_id is distinct from new.address_id) then
    perform public.refresh_house(old.address_id);
  end if;
  return null;
end $$;

create or replace function public.houses_from_calls() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform public.refresh_house(new.address_id); end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.address_id is distinct from new.address_id) then
    perform public.refresh_house(old.address_id);
  end if;
  return null;
end $$;

create or replace function public.houses_from_addresses() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_house(new.id);
  return null;
end $$;

drop trigger if exists houses_status on public.status_log;
create trigger houses_status after insert or update or delete on public.status_log
  for each row execute function public.houses_from_status();

-- Only when a call is linked to (or moved off) a household, not on every transcript update.
drop trigger if exists houses_calls on public.calls;
create trigger houses_calls after insert or update of address_id or delete on public.calls
  for each row execute function public.houses_from_calls();

drop trigger if exists houses_addresses on public.addresses;
create trigger houses_addresses after insert or update on public.addresses
  for each row execute function public.houses_from_addresses();

-- Backfill every household.
select public.refresh_house(id) from public.addresses;

-- Same rules as the other tables: anon reads nothing; the board reads with its minted token;
-- only the server and the triggers write.
alter table public.houses enable row level security;
drop policy if exists "signed-in portals can read houses" on public.houses;
create policy "signed-in portals can read houses"
  on public.houses for select to authenticated using (true);

do $$ begin
  alter publication supabase_realtime add table public.houses;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';

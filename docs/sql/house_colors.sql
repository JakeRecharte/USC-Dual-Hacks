-- House colours decided by Supabase, from the record AND the Retell calls about each house,
-- plus a house_events feed: "Retell registered 1515 Via de la Paz as RED". Run once in
-- Supabase -> SQL Editor, after houses.sql. Safe to run twice.
--
--   red    marked staying (refused), or a call about it needed a person now
--          (routing human_now / callback_queue, or emergency/distress heard live)
--   green  cleared or self-evacuated within the last 120 minutes
--   yellow everything else: never checked, no answer, evacuating, stale clear
--
-- A house_events row is written when a RETELL call (a calls row, or a status_log row with
-- source 'call') either links a house for the first time or changes its colour. Officer taps
-- recolour houses too, but don't raise a Retell event.

alter table public.houses
  add column if not exists color            text not null default 'yellow' check (color in ('green', 'yellow', 'red')),
  add column if not exists color_reason     text,
  add column if not exists color_changed_at timestamptz;

create table if not exists public.house_events (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references public.houses(id) on delete cascade,
  address        text not null,
  color          text not null check (color in ('green', 'yellow', 'red')),
  previous_color text check (previous_color in ('green', 'yellow', 'red')),
  first_call     boolean not null default false,   -- the house's first call to the line
  reason         text,
  call_id        text,
  created_at     timestamptz not null default now()
);
create index if not exists house_events_newest on public.house_events (created_at desc);

-- The colour rule, in one place.
create or replace function public.house_color(p_status public.status_kind, p_checked timestamptz, p_house uuid)
returns table (color text, reason text)
language sql stable set search_path = public as $$
  with urgent as (
    select c.routing, c.bypass, c.bypass_reason, c.reason
    from public.calls c
    where c.address_id = p_house
      and (c.routing in ('human_now', 'callback_queue') or c.bypass)
    order by c.created_at desc limit 1
  )
  select
    case
      when p_status = 'refused' then 'red'
      when exists (select 1 from urgent) then 'red'
      when p_status in ('cleared', 'self_out') and p_checked >= now() - interval '120 minutes' then 'green'
      else 'yellow'
    end,
    case
      when p_status = 'refused' then 'people at this house are staying'
      when exists (select 1 from urgent) then coalesce(
        (select case when routing = 'callback_queue' then 'a caller about this house needs a call back'
                     else 'a caller about this house needed a person now' end from urgent), 'urgent call')
      when p_status in ('cleared', 'self_out') and p_checked >= now() - interval '120 minutes'
        then case when p_status = 'self_out' then 'resident reported out' else 'checked and cleared' end
      when p_status in ('cleared', 'self_out') then 'last check is more than 2 hours old'
      when p_status = 'no_answer' then 'last knock got no answer'
      when p_status = 'in_transit' then 'reported leaving, no follow-up'
      else 'never checked'
    end;
$$;

-- refresh_house now also recolours, and logs a Retell event when a call registers or changes
-- the house. p_source / p_call_id say what caused the refresh.
drop function if exists public.refresh_house(uuid);
create or replace function public.refresh_house(p_id uuid, p_source text default null, p_call_id text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  before record;
  after  record;
  col    record;
begin
  if p_id is null then return; end if;
  select color, called_about into before from public.houses where id = p_id;

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
    address = excluded.address, zone_id = excluded.zone_id,
    evacuation_status = excluded.evacuation_status, evacuation_status_source = excluded.evacuation_status_source,
    evacuation_note = excluded.evacuation_note, last_checked_at = excluded.last_checked_at,
    called_about = excluded.called_about, call_count = excluded.call_count, last_called_at = excluded.last_called_at,
    updated_at = now();

  select h.id, h.address, h.evacuation_status, h.last_checked_at, h.called_about into after from public.houses h where h.id = p_id;
  if after.id is null then return; end if;
  select * into col from public.house_color(after.evacuation_status, after.last_checked_at, p_id);

  update public.houses set color = col.color, color_reason = col.reason,
    color_changed_at = case when color is distinct from col.color then now() else color_changed_at end
  where id = p_id;

  if p_source = 'call' and (before.color is distinct from col.color or (coalesce(before.called_about, false) = false and after.called_about)) then
    insert into public.house_events (house_id, address, color, previous_color, first_call, reason, call_id)
    values (p_id, after.address, col.color, before.color,
            coalesce(before.called_about, false) = false and after.called_about, col.reason, p_call_id);
  end if;
end $$;

-- status_log: a row written by a call (source 'call') is a Retell event; officer taps aren't.
create or replace function public.houses_from_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_house(new.address_id, case when new.source = 'call' then 'call' end, null);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.address_id is distinct from new.address_id) then
    perform public.refresh_house(old.address_id);
  end if;
  return null;
end $$;

-- calls: linking a house, or a routing/bypass change, can recolour it.
create or replace function public.houses_from_calls() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform public.refresh_house(new.address_id, 'call', new.call_id); end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.address_id is distinct from new.address_id) then
    perform public.refresh_house(old.address_id);
  end if;
  return null;
end $$;

drop trigger if exists houses_calls on public.calls;
create trigger houses_calls after insert or update of address_id, routing, bypass or delete on public.calls
  for each row execute function public.houses_from_calls();

-- Colour every house now (no events: p_source is null).
select public.refresh_house(id) from public.addresses;

alter table public.house_events enable row level security;
drop policy if exists "signed-in portals can read house events" on public.house_events;
create policy "signed-in portals can read house events"
  on public.house_events for select to authenticated using (true);
do $$ begin
  alter publication supabase_realtime add table public.house_events;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';

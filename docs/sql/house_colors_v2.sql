-- House colours v2. Paste into Supabase -> SQL Editor and run once (safe to run twice).
--
-- Keeps the palette the board uses today (it was edited in the dashboard, not in
-- house_colors.sql): green, yellow, orange, red, grey. One rule changes:
--
--   An urgent call (a caller needed a person: human_now, callback_queue, or distress heard
--   live) turns a house red only until a NEWER status arrives for that house. Before, the
--   red stuck for good, so a later "she got out" or an officer's "cleared" could never
--   recolour a house anyone had once called about urgently. That is the whole point of the
--   line, so newer information now wins.
--
--   red     refused (staying), or an urgent call newer than the latest status
--   green   cleared / self_out within the last 120 minutes
--   grey    cleared / self_out older than that, or never checked
--   orange  last knock got no answer
--   yellow  evacuating (in_transit), including a relative's unverified "they got out"

create or replace function public.house_color(p_status public.status_kind, p_checked timestamptz, p_house uuid)
returns table (color text, reason text)
language sql stable set search_path = public as $$
  with urgent as (
    select c.routing
    from public.calls c
    where c.address_id = p_house
      and (c.routing in ('human_now', 'callback_queue') or c.bypass)
      and c.created_at > coalesce(p_checked, '-infinity'::timestamptz)
    order by c.created_at desc limit 1
  )
  select
    case
      when p_status = 'refused' then 'red'
      when exists (select 1 from urgent) then 'red'
      when p_status in ('cleared', 'self_out') and p_checked >= now() - interval '120 minutes' then 'green'
      when p_status in ('cleared', 'self_out') then 'grey'
      when p_status = 'no_answer' then 'orange'
      when p_status = 'in_transit' then 'yellow'
      else 'grey'
    end,
    case
      when p_status = 'refused' then 'people at this house are staying'
      when exists (select 1 from urgent) then
        (select case when routing = 'callback_queue' then 'a caller about this house needs a call back'
                     else 'a caller about this house needed a person now' end from urgent)
      when p_status in ('cleared', 'self_out') and p_checked >= now() - interval '120 minutes'
        then case when p_status = 'self_out' then 'resident reported out' else 'checked and cleared' end
      when p_status in ('cleared', 'self_out') then 'last check is more than 2 hours old'
      when p_status = 'no_answer' then 'last knock got no answer'
      when p_status = 'in_transit' then 'reported leaving, no follow-up'
      else 'no verified record'
    end;
$$;

-- Recolour every house under the new rule (no Retell alerts: p_source is null).
select public.refresh_house(id) from public.addresses;

notify pgrst, 'reload schema';

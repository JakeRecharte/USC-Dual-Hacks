-- Does the colour chain work on THIS project? Paste into Supabase -> SQL Editor and Run.
-- Returns one row per check, PASS or FAIL, with what it saw.
--
-- It changes nothing. The scenario (a fake Retell call, an officer tap) runs inside a block that
-- is always rolled back, so no house, call, event or log row is left behind and nothing reaches
-- Realtime. Safe to run during a demo. It does need two houses that have never been checked or
-- called about (`npm run reset-demo` in server/ puts them back).
--
-- What it proves, in the order Retell -> Supabase -> dashboards:
--   1. the layers are installed: houses.color, house_events, the calls columns the server writes,
--      a single refresh_house (a second one makes the write that links a call to a house fail),
--      and the trigger that recolours on routing
--   2. Realtime publishes every table the dashboards subscribe to
--   3. a Retell call that links a house raises a "registered" event, and one that needs a person
--      turns the house red with an event that says grey -> red
--   4. an officer tap recolours a house but raises no Retell event
--   5. the signed-in dashboards can read the result, and anon (the public key) reads nothing
--   6. a newer officer check closes an urgent call out (red -> green), and a stored green whose
--      clear has gone stale is recoloured by expire_house_colors(), which pg_cron runs each minute

-- seen: what the check observed (always shown). fix: what to do about it (shown on FAIL only).
create or replace function pg_temp.chk(r jsonb, name text, ok boolean, seen text default null, fix text default null)
returns jsonb language sql as $$
  select r || jsonb_build_array(jsonb_build_object('name', name, 'ok', coalesce(ok, false), 'seen', seen, 'fix', fix))
$$;

create or replace function pg_temp.check_house_colors()
returns table (n int, check_name text, result text, detail text)
language plpgsql as $$
declare
  res        jsonb := '[]'::jsonb;
  cid        text  := 'check_' || replace(gen_random_uuid()::text, '-', '');
  h          uuid;                  -- a quiet house: never called about, status unknown (grey)
  h2         uuid;                  -- a second one, for the officer tap
  h3         uuid;                  -- a third, for the stale-green test
  h4         uuid;                  -- a fourth, for orange (no answer) and yellow (evacuating)
  col        text;
  why        text;
  ev         record;
  cnt        int;
  cnt2       int;
  layers_ok  boolean;
  expired    int;
  published  text[];
  want       text[] := array['status_log', 'addresses', 'calls', 'houses', 'house_events'];
begin
  -- 1. The layers are installed. -----------------------------------------------------------
  res := pg_temp.chk(res, 'houses.color exists (house_colors.sql ran)',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'houses' and column_name = 'color'),
    null, 'run docs/sql/house_colors.sql after houses.sql');
  res := pg_temp.chk(res, 'house_events table exists', to_regclass('public.house_events') is not null,
    null, 'run docs/sql/house_colors.sql');
  res := pg_temp.chk(res, 'all five colours are allowed (houses and house_events)',
    coalesce((select count(*) = 3 from pg_constraint
              where conname in ('houses_color_check', 'house_events_color_check', 'house_events_previous_color_check')
                and pg_get_constraintdef(oid) like '%grey%' and pg_get_constraintdef(oid) like '%orange%'), false),
    null, 'this project has an older colour set; run docs/sql/house_colors.sql');
  select count(*) into cnt from information_schema.columns
    where table_schema = 'public' and table_name = 'calls'
      and column_name in ('status', 'transcript', 'bypass', 'bypass_reason', 'lat', 'lng', 'geo_precision', 'decision_trace');
  res := pg_temp.chk(res, 'calls has the Retell and map columns the server writes', cnt = 8,
    cnt || ' of 8 present', 'run docs/sql/calls_retell.sql and docs/sql/calls_map.sql');
  select count(*) into cnt from pg_proc where proname = 'refresh_house' and pronamespace = 'public'::regnamespace;
  res := pg_temp.chk(res, 'exactly one refresh_house (two overloads stop Retell calls saving)', cnt = 1,
    cnt || ' found', 're-run docs/sql/house_colors.sql alone, and never houses.sql after it');
  res := pg_temp.chk(res, 'calls trigger recolours on routing and bypass, not just address',
    coalesce((select pg_get_triggerdef(t.oid) like '%routing%' from pg_trigger t
              where t.tgname = 'houses_calls' and t.tgrelid = to_regclass('public.calls')), false),
    null, 'houses_calls is the old version; re-run docs/sql/house_colors.sql');
  res := pg_temp.chk(res, 'expire_house_colors() exists', to_regproc('public.expire_house_colors') is not null,
    null, 'run docs/sql/house_colors.sql');
  select count(*) into cnt from public.addresses;
  if to_regclass('public.houses') is not null then
    execute 'select count(*) from public.houses' into cnt2;
  end if;
  res := pg_temp.chk(res, 'every address has a houses row', cnt2 = cnt,
    coalesce(cnt2::text, 'no') || ' houses for ' || cnt || ' addresses', 'run docs/sql/houses.sql');

  layers_ok := not exists (select 1 from jsonb_array_elements(res) e where not (e ->> 'ok')::boolean);

  -- Time passing: nothing writes a row when a clear turns 120 minutes old, so a job must.
  cnt := 0;
  if to_regclass('cron.job') is not null then
    execute $q$ select count(*) from cron.job where jobname = 'expire-house-colors' $q$ into cnt;
  end if;
  res := pg_temp.chk(res, 'pg_cron runs expire_house_colors() every minute', cnt = 1,
    case when to_regclass('cron.job') is null then 'pg_cron is not enabled' else cnt || ' jobs' end,
    'enable pg_cron (Dashboard -> Database -> Extensions), then re-run docs/sql/house_colors.sql; until then a green house stays green after its clear goes stale');

  -- 2. Realtime publishes what the dashboards subscribe to. ---------------------------------
  select coalesce(array_agg(p.tablename::text), '{}') into published from pg_publication_tables p where p.pubname = 'supabase_realtime';
  res := pg_temp.chk(res, 'Realtime publishes status_log, addresses, calls, houses, house_events', want <@ published,
    null, 'not published: ' || coalesce((select string_agg(w, ', ') from unnest(want) w where w <> all (published)), 'none'));

  if not layers_ok then
    res := pg_temp.chk(res, 'scenario (skipped)', false, null, 'fix the failed checks above first');
  else
    -- 3-5. The scenario. Always rolled back: the block ends by raising RB001, which is caught
    -- below and undoes every write in it. The `res` variable survives the rollback.
    begin
      select hs.id into h from public.houses hs
        where not hs.called_about and hs.evacuation_status = 'unknown'
          and not exists (select 1 from public.calls c where c.address_id = hs.id)
        order by hs.id limit 1;
      select hs.id into h2 from public.houses hs
        where not hs.called_about and hs.evacuation_status = 'unknown' and hs.id is distinct from h
          and not exists (select 1 from public.calls c where c.address_id = hs.id)
        order by hs.id limit 1;

      select hs.id into h3 from public.houses hs
        where not hs.called_about and hs.evacuation_status = 'unknown'
          and hs.id is distinct from h and hs.id is distinct from h2
          and not exists (select 1 from public.calls c where c.address_id = hs.id)
        order by hs.id limit 1;

      select hs.id into h4 from public.houses hs
        where not hs.called_about and hs.evacuation_status = 'unknown'
          and hs.id is distinct from h and hs.id is distinct from h2 and hs.id is distinct from h3
          and not exists (select 1 from public.calls c where c.address_id = hs.id)
        order by hs.id limit 1;

      if h is null or h2 is null or h3 is null or h4 is null then
        res := pg_temp.chk(res, 'four quiet houses to test with', false,
          null, 'every house already has a status or a call; run npm run reset-demo in server/');
      else
        select hs.color into col from public.houses hs where hs.id = h;
        res := pg_temp.chk(res, 'a never-checked house is GREY', col = 'grey', 'color is ' || coalesce(col, 'null'));

        -- Retell: the call starts with no address, then lookup_address links the house.
        insert into public.calls (call_id, status, simulated) values (cid, 'in_progress', true);
        select count(*) into cnt from public.house_events where call_id = cid;
        res := pg_temp.chk(res, 'a call with no address yet raises no event', cnt = 0, cnt || ' events');

        update public.calls set address_id = h, lookup_found = true where call_id = cid;
        select * into ev from public.house_events where call_id = cid and first_call limit 1;
        res := pg_temp.chk(res, 'lookup linking a house raises a first-call event (registered as GREY)',
          ev.id is not null and ev.house_id = h and ev.color = 'grey',
          case when ev.id is null then 'no first-call event written' else 'event: registered as ' || ev.color end);

        -- Retell: an emergency is heard, the call is routed to a person now.
        update public.calls set bypass = true, bypass_reason = 'check: emergency heard live',
          routing = 'human_now', severity = 5, reason = 'check' where call_id = cid;
        select hs.color, hs.color_reason into col, why from public.houses hs where hs.id = h;
        res := pg_temp.chk(res, 'a call that needs a person now turns the house RED', col = 'red',
          'color is ' || coalesce(col, 'null') || ' (' || coalesce(why, 'no reason') || ')');
        select * into ev from public.house_events where call_id = cid and not first_call limit 1;
        res := pg_temp.chk(res, 'and says so: an event GREY -> RED',
          ev.id is not null and ev.color = 'red' and ev.previous_color = 'grey',
          case when ev.id is null then 'no colour-change event written' else 'event: ' || coalesce(ev.previous_color, 'null') || ' -> ' || ev.color end);

        -- Officer: a tap recolours the house but is not a Retell event.
        insert into public.status_log (address_id, status, source, recorded_at) values (h2, 'refused', 'officer', now());
        select hs.color into col from public.houses hs where hs.id = h2;
        select count(*) into cnt from public.house_events where house_id = h2;
        res := pg_temp.chk(res, 'an officer marking a house refused turns it RED', col = 'red', 'color is ' || coalesce(col, 'null'));
        res := pg_temp.chk(res, 'and raises no Retell event', cnt = 0, cnt || ' events');

        -- The dashboards: signed in they see it, with the public key they see nothing.
        set local role authenticated;
        select hs.color into col from public.houses hs where hs.id = h;
        select count(*) into cnt from public.house_events where call_id = cid;
        reset role;
        res := pg_temp.chk(res, 'signed-in dashboards read the red house and both events', col = 'red' and cnt = 2,
          'color ' || coalesce(col, 'null') || ', ' || cnt || ' events');

        set local role anon;
        begin
          select (select count(*) from public.houses) + (select count(*) from public.house_events) into cnt;
        exception when insufficient_privilege then cnt := 0;
        end;
        reset role;
        res := pg_temp.chk(res, 'anon (the public key) reads no houses and no events', cnt = 0, cnt || ' rows visible');

        -- An officer reaches the house after the call and finds it cleared: the call is closed out.
        -- (+1 second, because inside one transaction now() is the same instant as the call's.)
        insert into public.status_log (address_id, status, source, recorded_at)
          values (h, 'cleared', 'officer', now() + interval '1 second');
        select hs.color, hs.color_reason into col, why from public.houses hs where hs.id = h;
        res := pg_temp.chk(res, 'an officer check NEWER than the urgent call turns the house GREEN', col = 'green',
          'color is ' || coalesce(col, 'null') || ' (' || coalesce(why, 'no reason') || ')');

        -- The two in-between colours: an unanswered knock, then a report that they are leaving.
        insert into public.status_log (address_id, status, source, recorded_at) values (h4, 'no_answer', 'officer', now());
        select hs.color into col from public.houses hs where hs.id = h4;
        res := pg_temp.chk(res, 'an officer knock with no answer turns the house ORANGE', col = 'orange', 'color is ' || coalesce(col, 'null'));
        insert into public.status_log (address_id, status, source, recorded_at) values (h4, 'in_transit', 'officer', now() + interval '1 second');
        select hs.color into col from public.houses hs where hs.id = h4;
        res := pg_temp.chk(res, 'a house reported as evacuating turns YELLOW', col = 'yellow', 'color is ' || coalesce(col, 'null'));

        -- Time: a green whose clear is 3 hours old is wrong. Fake the staleness, then let the job fix it.
        update public.houses set color = 'green', color_reason = 'checked and cleared', evacuation_status = 'cleared',
          evacuation_status_source = 'officer', last_checked_at = now() - interval '3 hours' where id = h3;
        expired := public.expire_house_colors();
        select hs.color into col from public.houses hs where hs.id = h3;
        res := pg_temp.chk(res, 'expire_house_colors() recolours a green whose clear went stale', col <> 'green' and expired >= 1,
          'color is ' || coalesce(col, 'null') || ', ' || expired || ' recoloured');
      end if;

      raise exception 'rolled back' using errcode = 'RB001';
    exception
      when sqlstate 'RB001' then null;
      when others then
        reset role;
        res := pg_temp.chk(res, 'scenario ran without an error', false, sqlerrm);
    end;
  end if;

  return query
    select e.i::int, e.v ->> 'name', case when (e.v ->> 'ok')::boolean then 'PASS' else 'FAIL' end,
           case when (e.v ->> 'ok')::boolean then e.v ->> 'seen' else concat_ws(' -- ', e.v ->> 'seen', e.v ->> 'fix') end
    from jsonb_array_elements(res) with ordinality as e(v, i)
    order by e.i;
end $$;

select * from pg_temp.check_house_colors();

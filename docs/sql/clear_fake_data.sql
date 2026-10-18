-- REMOVES THE INVENTED DATA from a project that was seeded with it. Paste into Supabase ->
-- SQL Editor and Run, once. Afterwards every house is grey: no verified record.
--
-- DESTRUCTIVE AND NOT UNDOABLE. It deletes:
--   every row in status_log   (the seeded evacuation statuses and notes, and any taps made since)
--   every row in calls        (phone calls and simulator runs, plus the dispatcher decisions on them)
--   every row in house_events (the Retell alerts)
-- and resets every damage assessment to "unassessed". It keeps the households (addresses) and
-- everything about the schema. If real officer taps or real calls exist that you want to keep,
-- do not run this.
--
-- Run docs/sql/house_colors.sql first: this script needs the grey colour (and the rest of the
-- five-colour version), and stops with a clear message if the project does not have it yet.
--
-- Two things it cannot reach:
--   * the telephony server keeps recent calls in memory, and the dispatch board's call queue
--     reads them from there. Restart the Railway service (or `npm run reset-demo` in server/,
--     which also tells it to forget) or the old calls keep showing on the board.
--   * the households' street addresses and resident names are themselves invented placeholders
--     on real building footprints. This leaves them, because the map and lookup_address need
--     a household to point at.

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'houses_color_check' and conrelid = 'public.houses'::regclass
                   and pg_get_constraintdef(oid) like '%grey%' and pg_get_constraintdef(oid) like '%orange%') then
    raise exception 'run docs/sql/house_colors.sql first: this project does not know the grey and orange colours yet';
  end if;
end $$;

-- TRUNCATE skips the per-row triggers (there are thousands), and CASCADE takes the tables that
-- reference calls with it (the dispatcher decisions). Houses are re-derived below.
truncate table public.house_events, public.status_log, public.calls cascade;

update public.addresses set structure = 'unassessed', structure_recorded_at = null
  where structure is distinct from 'unassessed' or structure_recorded_at is not null;

-- Recompute every house from what is left: nothing, so grey.
select public.refresh_house(id) from public.addresses;

-- What the boards will now show. Expect one row: grey, all of them.
select color, count(*)::int as houses from public.houses group by color order by color;

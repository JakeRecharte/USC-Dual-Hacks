-- Map placement and decision record on public.calls (P1). Run once in Supabase → SQL Editor,
-- after calls.sql and calls_retell.sql. Safe to run twice.
--
--   lat, lng, geo_precision  where the call goes on the map. 'house' = the household's own point
--                            (address_id is set); 'street' = the centre of the known houses on the
--                            street the caller named, for a house not in our records; null = we
--                            can't place it.
--   decision_trace           the routing decision as data: the facts the router saw and every rule
--                            that decided, in order. Shape in docs/DATA_CONTRACT.md §7.

alter table public.calls
  add column if not exists lat            double precision,
  add column if not exists lng            double precision,
  add column if not exists geo_precision  text check (geo_precision in ('house', 'street')),
  add column if not exists decision_trace jsonb;

-- The map asks "which calls are about this house" on every selection.
create index if not exists calls_by_address on public.calls (address_id, created_at desc);

notify pgrst, 'reload schema';

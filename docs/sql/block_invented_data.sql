-- Keeps the invented demo data out of this project. Paste into Supabase -> SQL Editor and Run,
-- once. Safe to run twice. Nothing it does touches data that is already there.
--
-- The old demo seed got in two ways: one pasted INSERT of ~6,400 evacuation statuses, and the old
-- reset-demo script loading them 1,000 at a time. It also created 270 households already marked
-- damaged or destroyed. Real use looks nothing like that, so the database now refuses it, whatever
-- tool, script, paste or stale checkout it comes from:
--
--   1. More than 100 status_log rows in one statement.   Real statuses arrive one check at a time
--      (an officer's tap, a phone report), or a short offline-queue flush. A refused statement is
--      rolled back. In the Supabase SQL editor a paste is a single transaction, so a refused seed
--      also undoes any DELETE earlier in the same paste; with psql, use -1 to get the same.
--   2. A household created already marked damaged or destroyed.   Damage is recorded afterwards,
--      one house at a time, by an officer. This also stops the old script's upsert of households.
--   3. More than 25 households changed to a different damage state in one statement.
--
-- Wiping is deliberately NOT blocked: deleting or truncating rows still works.
--
-- What this is not: a lock. Anyone who owns the database can drop these triggers, and someone
-- determined can still insert statuses in batches of 100. It stops the old seed, the old reset
-- script and accidents. To load real records in bulk on purpose, disable the trigger for that
-- load (alter table public.status_log disable trigger status_log_no_bulk_load), then enable it again.
-- docs/sql/check_house_colors.sql confirms the guards are installed and refuse what they should.

create or replace function public.refuse_bulk_status_load() returns trigger
language plpgsql as $$
declare
  n int;
begin
  select count(*) into n from inserted;
  if n > 100 then
    raise exception 'refused: % evacuation statuses in one statement.', n
      using detail = 'Statuses are recorded one check at a time, by officers and the phone line. Loading them in bulk is how the invented demo data got into this project.',
            hint = 'See docs/sql/block_invented_data.sql.';
  end if;
  return null;
end $$;

drop trigger if exists status_log_no_bulk_load on public.status_log;
create trigger status_log_no_bulk_load after insert on public.status_log
  referencing new table as inserted
  for each statement execute function public.refuse_bulk_status_load();

create or replace function public.refuse_seeded_damage() returns trigger
language plpgsql as $$
begin
  if new.structure is distinct from 'unassessed' or new.structure_recorded_at is not null then
    raise exception 'refused: a household cannot be created already marked %.', new.structure
      using detail = 'Damage is recorded afterwards, one house at a time, by an officer. Seeding it is how the invented damage assessments got into this project.',
            hint = 'See docs/sql/block_invented_data.sql.';
  end if;
  return new;
end $$;

drop trigger if exists addresses_no_seeded_damage on public.addresses;
create trigger addresses_no_seeded_damage before insert on public.addresses
  for each row execute function public.refuse_seeded_damage();

create or replace function public.refuse_bulk_damage_marking() returns trigger
language plpgsql as $$
declare
  n int;
begin
  select count(*) into n
  from new_rows join old_rows using (id)
  where new_rows.structure is distinct from old_rows.structure;
  if n > 25 then
    raise exception 'refused: % households changed to a different damage state in one statement.', n
      using detail = 'Damage is recorded one house at a time, by an officer.',
            hint = 'See docs/sql/block_invented_data.sql.';
  end if;
  return null;
end $$;

drop trigger if exists addresses_no_bulk_damage on public.addresses;
create trigger addresses_no_bulk_damage after update on public.addresses
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.refuse_bulk_damage_marking();

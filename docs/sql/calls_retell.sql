-- Retell call data on public.calls (P1). Run once in Supabase → SQL Editor, after calls.sql.
-- Safe to run twice. Makes `calls` the complete live record of every phone call, so the board
-- can read everything from Supabase (Realtime is already on for this table) instead of the
-- telephony server's /events feed.
--
-- Row lifecycle (docs/DATA_CONTRACT.md §6):
--   call starts      → status 'in_progress', routing null
--   lookup_address   → address, subject_name, lookup_*, inside_perimeter
--   during the call  → caller_state, distress_score, bypass, transcript (every few seconds)
--   log_call         → routing, severity, reason   (routing only ever moves up)
--   transfer         → transfer_status
--   call ends        → status 'ended', ended_at, duration_s, disconnection_reason, transcript
--   Retell analysis  → summary, user_sentiment, recording_url, latency_ms (~seconds later)

-- A call in progress hasn't been routed yet.
alter table public.calls alter column routing drop not null;

alter table public.calls
  add column if not exists status               text not null default 'in_progress'
                                                 check (status in ('in_progress', 'ended')),
  add column if not exists direction            text,
  add column if not exists started_at           timestamptz,
  add column if not exists ended_at             timestamptz,
  add column if not exists duration_s           int,
  add column if not exists disconnection_reason text,            -- Retell's: user_hangup, call_transfer, …
  add column if not exists transfer_status      text check (transfer_status in ('ringing', 'connected', 'failed')),
  add column if not exists bypass               boolean not null default false,  -- emergency/distress detected live
  add column if not exists bypass_reason        text,
  add column if not exists distress_score       int not null default 0,          -- live word score; 3 = handoff threshold
  add column if not exists lookup_found         boolean,
  add column if not exists lookup_status        text,            -- null unless the caller named the resident
  add column if not exists name_match           boolean,
  add column if not exists inside_perimeter     boolean,
  add column if not exists report_written       text,            -- status written back to status_log, if any
  add column if not exists transcript           text,
  add column if not exists summary              text,            -- Retell post-call analysis
  add column if not exists user_sentiment       text,            -- Retell: Positive / Negative / Neutral / Unknown
  add column if not exists recording_url        text,
  add column if not exists latency_ms           int;             -- Retell end-to-end p50 for the call

-- Make PostgREST see the new columns immediately.
notify pgrst, 'reload schema';

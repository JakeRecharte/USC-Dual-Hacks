# Supabase + Vercel setup

From P4. Run this and the board becomes database-backed: an officer's tap goes into Postgres
and the dispatcher's map updates from Postgres, with nothing live passing through our own
server. That last part is what makes it work on Vercel.

**For P2:** sections 1–3 are yours. **For P4:** section 4 is the Vercel config.

---

## Why it has to be this way on Vercel

The board used to share state through an in-process store and our own SSE feed. That works
on one long-running server and **cannot** work on Vercel: every request may land on a
different serverless instance, so the officer's write and the dispatcher's open stream end up
in different processes, and the function timeout cuts the stream anyway.

So in Supabase mode:

```
officer phone ──POST /api/status──► route handler (service-role key) ──► Postgres
                                                                          │
dispatcher browser ◄──── Supabase Realtime (WebSocket, direct) ───────────┘
```

Writes are short requests, which serverless is fine at. The live subscription goes browser →
Supabase, never touching Vercel. The app keeps the old in-memory path as a fallback and says
which mode it is in, so a demo still runs if the database is not ready.

## 1. Schema

The enums and the two tables are from `docs/DATA_CONTRACT.md`. The only additions are
`structure` and `structure_recorded_at`, which are the request in
`docs/FRONTEND_CONTRACT.md` §1 — a separate field, deliberately **not** a seventh status,
because the voice agent must never read it to a caller.

```sql
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
```

## 2. Row-level security

**This part matters more than it looks.** The board shows resident names and whether each
household evacuated — the exact list this project promises not to hand out. The anon key
ships inside the browser bundle, so if `anon` could read these tables, deploying the site
would publish that list.

So `anon` gets nothing. The app mints a short-lived `authenticated` JWT only after the
passcode gate (`web/src/lib/supabase-token.ts`), and these policies key off that.

```sql
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
```

Then turn on Realtime for both tables, or the dispatcher's map will never update:

```sql
alter publication supabase_realtime add table public.status_log;
alter publication supabase_realtime add table public.addresses;
```

> Realtime also respects RLS, so the dispatcher's subscription needs the same token. The app
> handles that; there is nothing extra to configure.

## 3. Seed data

Generated from `web/src/lib/addresses.ts`, so the board, the demo script's pre-flight numbers
and the voice agent's fake data all describe the same households. The first seven ids match
`server/src/backend.js` (`a1` → `…0001`, `a2` → `…0002`, and so on), which is what lets a
real phone call and the board agree on screen.

Re-run the two deletes plus the inserts to reset between demo runs — the timestamps are
relative to `now()`, so the ages re-base each time.

`docs/seed.sql` is the only seed. Households only: no evacuation statuses, no notes, no damage
assessments. Every house reads *unknown* and is **grey** until a real check is recorded.

The households themselves are placeholders: the buildings are real (OpenStreetMap
footprints), but the street addresses and resident names are invented until a real source
replaces them. Clearing them would empty the map and leave `lookup_address` nothing to match.

```bash
psql "$SUPABASE_DB_URL" -f docs/seed.sql
```

Or paste it into the Supabase SQL editor. It begins with the two deletes, so re-running it
resets the households. From `server/`, `npm run reset-demo` does the same plus clears the call log.

After the seed, the board should read **8,088 houses, all grey, 0 refused**. If it doesn't, the
seed didn't take.

**A project that already holds the invented data:** run `docs/sql/house_colors.sql`, then
`docs/sql/clear_fake_data.sql`. It deletes every status, call and Retell alert, resets the damage
assessments, keeps the households, and leaves every house grey. It is destructive and says so.
It cannot clear the telephony server's in-memory call list; restart the Railway service for that.

**Every household sits on a real building.** The coordinates are centroids of OpenStreetMap
dwelling footprints inside the perimeter, and `web/public/buildings.json` carries all 8,103
outlines so the map can draw the actual shape of each house. Addresses and residents are
invented — OSM has street addresses for only 25 buildings here — but the geography is not.

`inside_perimeter` is **not** a column. The contract keeps the perimeter as one polygon
covering Pacific Palisades from the coast up into Santa Ynez Canyon, so the app computes it
from `lat`/`lng` (`web/src/lib/geo.ts`).

**The board is scoped to this one incident, and enforces it.** A household outside the
perimeter is not hidden in the UI, it never enters: reads drop it, and a write against it is
refused on both the Supabase and in-memory paths. So the table may hold the agent's
out-of-area households — the agent still needs them — and the map stays Palisades-only. If
you seed extra rows elsewhere in LA, expect the board to ignore them; that is deliberate.

## 4. Vercel configuration

**Root Directory must be `web`.** There is no `package.json` at the repo root, so a default
build finds no app. Set it in Project → Settings → Build and Deployment → Root Directory.

Environment variables (Project → Settings → Environment Variables):

| Variable | Where it comes from | Exposed to the browser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → **API Keys**, or the **Connect** dialog | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page, **Legacy keys** tab → `anon` `public` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | same tab → `service_role`, **secret** | **no** |
| `SUPABASE_JWT_SECRET` | Settings → **JWT** → legacy JWT secret | **no** |
| `OFFICER_PASSCODE` | pick one | no |
| `DISPATCH_PASSCODE` | pick a different one | no |
| `AUTH_SECRET` | `openssl rand -hex 32` | no |
| `NEXT_PUBLIC_TELEPHONY_URL` | `https://usc-dual-hacks-production.up.railway.app` | yes |

Only the three `NEXT_PUBLIC_` values reach the browser. Do not prefix the service-role key or
the JWT secret — that would publish them.

Supabase has moved these pages: the keys are no longer under Project Settings → API, and the
JWT secret has its own page. It is also issuing new `sb_publishable_…` / `sb_secret_…` keys
and deprecating `anon` / `service_role` at the end of 2026. **Take the legacy pair.** The
client is pinned to the key format it was written against, and swapping in the new keys is
not a drop-in change.

**`SUPABASE_JWT_SECRET` must be the legacy, symmetric secret.** `supabase-token.ts` signs its
own token with HS256, which only verifies while the project still accepts the legacy secret.
If the project has been migrated to asymmetric JWT signing keys and the legacy key revoked,
the symptom is specific and easy to misread: **officer taps still save** (the service-role
key bypasses RLS) **but the board reads empty**, because RLS sees an unverifiable token and
returns nothing. Not a seeding failure. Check Settings → JWT before blaming the data.

**If `SUPABASE_JWT_SECRET` is missing** the app still runs, but it falls back to the anon key
and the board shows an amber warning saying reads are not behind the shift code. Do not
deploy publicly in that state.

**If the Supabase variables are missing entirely** the app runs in memory mode: fully working
for a local demo, but status is not shared between serverless instances, so the officer →
dispatcher update will not arrive on Vercel. The header says which mode is live.

## 5. One colour per house, shared by Retell and both dashboards

Every house has a `color` in `public.houses` (one of five, in the table below), and **Supabase
decides it**. Nothing in the web app or the telephony server computes it; they only write facts and read the
result, so the phone line and the screens cannot disagree.

```
officer taps  ─► POST /api/status ─► status_log ─┐
                                                 ├─► trigger ─► houses.color ─► Realtime ─► both maps
Retell call ─► telephony server ─► calls ────────┘                │
                                  └► status_log (source 'call')   └► house_events (Retell only) ─► the alert toast
                                                                          ▲
agent's lookup_address ◄── status_log (what an officer recorded) ─────────┘
```

| Colour | Means | Comes from |
|---|---|---|
| **Red** | Refused, or a caller needed a person now | status `refused`, or an urgent call (see below) |
| **Orange** | No answer at the door | status `no_answer` |
| **Yellow** | Evacuating | status `in_transit` |
| **Green** | Cleared in the last 120 minutes | status `cleared` or `self_out`, recent |
| **Grey** | No current verified record | status `unknown`, or a clear older than 120 minutes |

Every house is grey until a real check is recorded. A `house_events` row ("Retell registered 1515 Via
de la Paz as RED") is written only when a **Retell** call links a house for the first time or
changes its colour; officer taps recolour the house but raise no alert.

**Setup.** `docs/sql/setup_all.sql` builds all of it in order. Piecewise, the order is `calls.sql`,
`calls_retell.sql`, `calls_map.sql`, `houses.sql`, `house_colors.sql`. Never re-run `houses.sql`
after `house_colors.sql`: they both define `refresh_house`, and with two of them every Retell call
that links a house fails to save. To redo the colour layer, re-run `house_colors.sql` alone.

**Both sides must point at the same project.** The telephony server (Railway: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) and the web app (Vercel: the four Supabase variables above) each
fall back to memory mode on their own if their variables are missing, and nothing shows an
error. Check both:

- `GET https://usc-dual-hacks-production.up.railway.app/health` should say `"mode": "supabase"`.
- `GET /api/health?probe=1` on the web deployment should say `mode: supabase` and report
  `houses_color`, `house_events` and `calls` as `ok`. After a real call, `calls.rows` above zero
  proves the phone line is writing to the project the web app reads.

**Check the whole chain.** Paste `docs/sql/check_house_colors.sql` into the SQL editor and run it.
It returns a PASS/FAIL row per step (layers installed, Realtime publishing, a fake Retell call
linking a house and turning it red, an officer tap, signed-in dashboards able to read it, anon
able to read nothing) and names the file to run for anything that fails. It rolls everything back,
so it is safe to run mid-demo.

**When an urgent call goes away.** A house with an urgent call about it (`human_now`,
`callback_queue`, or an emergency heard live) is red until an **officer's** check that is *newer
than the call* finds it cleared or self-evacuated; then the normal rules apply (green, if the clear
is under 120 minutes old). Deliberately not enough to close it: a phone report ("I've left"), a
resident reply, an officer knock with no answer, or any check older than the call. A later urgent
call turns it red again. The comparison is the check's `recorded_at` (when the officer stood at the
door) against the call's `created_at`, so a tap queued offline and delivered late is judged by when
it happened.

**Greens expire.** Nothing writes a row when a clear turns 120 minutes old, so
`expire_house_colors()` recolours those houses (to grey), and `house_colors.sql` schedules it every minute
with `pg_cron`. If the extension is off on your project you get a notice, not an error: enable it
(Dashboard, Database, Extensions) and run `house_colors.sql` again. Without the job, a green house
stays green after its clear goes stale until something else touches the house.

## What I could not test

I do not have the project's credentials, so the Supabase path is verified by construction and
by unit tests, not against a live database:

- `joinRows` (newest status per address, perimeter test, missing-column degradation) and the
  point-in-polygon test are covered in `web/test/supabase-data.test.ts` — 23 tests pass.
- The minted JWT was verified as valid HS256 with the expected claims by signing the same
  payload independently.
- Memory mode is verified end to end.

**Still to confirm once the project exists:** that the enum labels match what the app sends,
that Realtime actually fires for both tables, and that the service-role write succeeds. The
first officer tap will tell you — a failure comes back in the `rejected` array with the
Postgres message, and the board shows a red banner rather than failing silently.

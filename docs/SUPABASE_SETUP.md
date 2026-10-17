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

```sql
delete from public.status_log;
delete from public.addresses;

-- 30 households across 6 zones.
-- Zones: PAC-1 Sunset Mesa, PAC-2 Palisades Village, PAC-3 Marquez Knolls, PAC-4 Palisades Highlands, LAC-9 Crenshaw (outside), LAE-2 East Hollywood (outside)

insert into public.addresses
  (id, address, lat, lng, zone_id, resident_name, structure, structure_recorded_at)
values
  ('00000000-0000-4000-8000-000000000001', '1420 Sunset Mesa Dr', 34.0376, -118.5793, 'PAC-1', 'Maria Lopez', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000002', '1515 Via de la Paz', 34.0447, -118.5266, 'PAC-2', 'Harold Kim', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000003', '16800 Bollinger Dr', 34.0398, -118.5557, 'PAC-3', 'Ruth Adams', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000004', '1100 Palisades Dr', 34.0607, -118.5437, 'PAC-4', 'Tom Becker', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000005', '820 Chautauqua Blvd', 34.0332, -118.5213, 'PAC-2', 'Linda Park', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000006', '4512 Crenshaw Blvd', 34.0031, -118.3349, 'LAC-9', 'Dorothy Hayes', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000007', '910 N Vermont Ave', 34.0902, -118.2921, 'LAE-2', 'Kevin Nguyen', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000008', '17320 Castellammare Dr', 34.0391, -118.5761, 'PAC-1', 'Avery Donnelly', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000009', '17450 Posetano Rd', 34.0402, -118.5748, 'PAC-1', 'Sam Okafor', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000010', '17615 Tramonto Dr', 34.0413, -118.5729, 'PAC-1', 'Priya Raman', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000011', '17680 Breve Way', 34.0369, -118.5812, 'PAC-1', 'Daniel Mwangi', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000012', '17210 Revello Dr', 34.0385, -118.5776, 'PAC-1', 'Elena Fischer', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000013', '881 Antioch St', 34.0459, -118.5281, 'PAC-2', 'Grace Okonkwo', 'damaged', now() - interval '48 minutes'),
  ('00000000-0000-4000-8000-000000000014', '1032 Swarthmore Ave', 34.0441, -118.5297, 'PAC-2', 'Victor Alvarez', 'destroyed', now() - interval '110 minutes'),
  ('00000000-0000-4000-8000-000000000015', '1145 Monument St', 34.0428, -118.5245, 'PAC-2', 'Nora Whitfield', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000016', '1290 Alma Real Dr', 34.0466, -118.5229, 'PAC-2', 'Omar Haddad', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000017', '640 Toyopa Dr', 34.0415, -118.5302, 'PAC-2', 'Beatrice Lam', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000018', '718 Fiske St', 34.0403, -118.5331, 'PAC-2', 'Jonah Pressler', 'damaged', now() - interval '95 minutes'),
  ('00000000-0000-4000-8000-000000000019', '955 Radcliffe Ave', 34.0437, -118.5338, 'PAC-2', 'Theresa Boyle', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000020', '16725 Marquez Ave', 34.0412, -118.5541, 'PAC-3', 'Hector Salas', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000021', '16540 Livorno Dr', 34.0381, -118.5578, 'PAC-3', 'Ingrid Sorensen', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000022', '16902 Oracle Pl', 34.0424, -118.5523, 'PAC-3', 'Marcus Webb', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000023', '17045 Lachman Ln', 34.0437, -118.5509, 'PAC-3', 'Yusuf Demir', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000024', '16388 Akron St', 34.0366, -118.5595, 'PAC-3', 'Camila Duarte', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000025', '16610 Charmel Ln', 34.0393, -118.5531, 'PAC-3', 'Russell Boateng', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000026', '1456 Vereda de la Montura', 34.0631, -118.5451, 'PAC-4', 'Alice Thornton', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000027', '1620 Chastain Pkwy', 34.0654, -118.5468, 'PAC-4', 'Felix Nakamura', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000028', '1288 Michael Ln', 34.0596, -118.5412, 'PAC-4', 'Sofia Marchetti', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000029', '1702 Capri Dr', 34.0668, -118.5494, 'PAC-4', 'Gerald Pike', 'unassessed', null),
  ('00000000-0000-4000-8000-000000000030', '1340 Lorenzo Pl', 34.0618, -118.5423, 'PAC-4', 'Hannah Reyes', 'unassessed', null);

insert into public.status_log (address_id, status, source, note, recorded_at)
values
  ('00000000-0000-4000-8000-000000000001', 'cleared', 'officer', null, now() - interval '40 minutes'),
  ('00000000-0000-4000-8000-000000000002', 'refused', 'officer', '2 adults staying, 1 on oxygen', now() - interval '25 minutes'),
  ('00000000-0000-4000-8000-000000000004', 'cleared', 'officer', null, now() - interval '360 minutes'),
  ('00000000-0000-4000-8000-000000000005', 'self_out', 'resident_reply', null, now() - interval '55 minutes'),
  ('00000000-0000-4000-8000-000000000008', 'cleared', 'officer', null, now() - interval '62 minutes'),
  ('00000000-0000-4000-8000-000000000009', 'self_out', 'resident_reply', null, now() - interval '88 minutes'),
  ('00000000-0000-4000-8000-000000000010', 'refused', 'officer', 'staying to run sprinklers, has a car in the driveway', now() - interval '15 minutes'),
  ('00000000-0000-4000-8000-000000000011', 'cleared', 'officer', null, now() - interval '71 minutes'),
  ('00000000-0000-4000-8000-000000000012', 'no_answer', 'officer', null, now() - interval '34 minutes'),
  ('00000000-0000-4000-8000-000000000013', 'cleared', 'officer', null, now() - interval '48 minutes'),
  ('00000000-0000-4000-8000-000000000014', 'self_out', 'resident_reply', null, now() - interval '110 minutes'),
  ('00000000-0000-4000-8000-000000000015', 'cleared', 'officer', null, now() - interval '300 minutes'),
  ('00000000-0000-4000-8000-000000000016', 'in_transit', 'resident_reply', null, now() - interval '9 minutes'),
  ('00000000-0000-4000-8000-000000000018', 'cleared', 'officer', null, now() - interval '95 minutes'),
  ('00000000-0000-4000-8000-000000000019', 'no_answer', 'officer', null, now() - interval '52 minutes'),
  ('00000000-0000-4000-8000-000000000021', 'no_answer', 'officer', null, now() - interval '78 minutes'),
  ('00000000-0000-4000-8000-000000000023', 'refused', 'officer', 'elderly father refuses to leave the house, no vehicle', now() - interval '41 minutes'),
  ('00000000-0000-4000-8000-000000000024', 'cleared', 'officer', null, now() - interval '420 minutes'),
  ('00000000-0000-4000-8000-000000000026', 'cleared', 'officer', null, now() - interval '275 minutes'),
  ('00000000-0000-4000-8000-000000000027', 'in_transit', 'resident_reply', null, now() - interval '6 minutes'),
  ('00000000-0000-4000-8000-000000000029', 'no_answer', 'officer', null, now() - interval '23 minutes'),
  ('00000000-0000-4000-8000-000000000030', 'self_out', 'resident_reply', null, now() - interval '102 minutes');

-- 22 of 30 households have a recorded status; the rest read "unknown".
```

After seeding, the dispatch board should read **19 unresolved of 28**, **3 refused**,
**6 never contacted**, **4 stale clears**, with zones PAC-3 `7/7`, PAC-2 `5/9`, PAC-4 `5/6`,
PAC-1 `2/6`. If it doesn't, the seed didn't take.

`inside_perimeter` is **not** a column. The contract keeps the perimeter as one polygon, so
the app computes it from `lat`/`lng` (`web/src/lib/geo.ts`). 28 of the 30 households fall
inside; Crenshaw and Vermont are the two outside.

## 4. Vercel configuration

**Root Directory must be `web`.** There is no `package.json` at the repo root, so a default
build finds no app. Set it in Project → Settings → Build and Deployment → Root Directory.

Environment variables (Project → Settings → Environment Variables):

| Variable | Where it comes from | Exposed to the browser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, **secret** | **no** |
| `SUPABASE_JWT_SECRET` | Project Settings → API → JWT Settings | **no** |
| `OFFICER_PASSCODE` | pick one | no |
| `DISPATCH_PASSCODE` | pick a different one | no |
| `AUTH_SECRET` | `openssl rand -hex 32` | no |
| `NEXT_PUBLIC_TELEPHONY_URL` | `https://usc-dual-hacks-production.up.railway.app` | yes |

Only the four `NEXT_PUBLIC_` values reach the browser. Do not prefix the service-role key or
the JWT secret — that would publish them.

**If `SUPABASE_JWT_SECRET` is missing** the app still runs, but it falls back to the anon key
and the board shows an amber warning saying reads are not behind the shift code. Do not
deploy publicly in that state.

**If the Supabase variables are missing entirely** the app runs in memory mode: fully working
for a local demo, but status is not shared between serverless instances, so the officer →
dispatcher update will not arrive on Vercel. The header says which mode is live.

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

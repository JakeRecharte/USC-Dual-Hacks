# web — officer and dispatcher portals

Next.js app with the two portals from `team_plan.md`, P4's half of the system.

```
cd web
npm install
cp .env.local.example .env.local   # optional: every value has a default
npm run dev                        # http://localhost:3000
```

Sign in at `/` and pick a portal. Dev codes are **1420** (officer) and **5150** (dispatch),
printed on the sign-in screen outside production.

| Route | Who | What |
|---|---|---|
| `/` | — | Passcode sign-in, one code per role |
| `/officer` | officers | Assigned addresses by zone, three status buttons per door |
| `/dispatch` | dispatchers | Priority heatmap, live call queue, door-knock list |

## Two modes, and why

The officer is on a phone and the dispatcher is on a laptop, so a tap has to travel through
something shared to reach the board. What that something is depends on configuration, and the
dispatch header always says which mode is live.

**Database mode** — the Supabase variables are set. Required on Vercel.

```
officer phone ──POST /api/status──► route handler (service-role key) ──► Postgres
                                                                          │
dispatch board ◄──── Supabase Realtime (WebSocket, direct) ───────────────┘
```

Nothing live passes through our own server, which is the point: on Vercel each request may
hit a different serverless instance, so no in-process state can be shared and a long-lived
SSE stream gets cut.

**Memory mode** — nothing configured. The in-process store plus our own SSE feed.

```
officer phone ──POST /api/status──► src/lib/server-store.ts ──SSE /api/events──► dispatch board
```

One long-running server only, so this is for local demos — but it needs no database and is
the safe fallback. `npx next start -H 0.0.0.0 -p 3100` and the officer's phone can reach the
laptop over the LAN.

Either way the dispatcher opens a second `EventSource` at the telephony server's `/events`
for the live call queue (`docs/DATA_CONTRACT.md` §5), which is unrelated to both.

Setting it all up: **`docs/SUPABASE_SETUP.md`** has the schema, the RLS policies, the seed
SQL and the Vercel configuration.

## Reads are behind the shift code

The board shows resident names and whether each household evacuated. The Supabase anon key
ships in the browser bundle, so RLS grants `anon` nothing: `/api/db-token` mints a
short-lived `authenticated` JWT only after the passcode check, and the policies key off that.
No shift code, no token, no data. If `SUPABASE_JWT_SECRET` is unset the app still runs on the
anon key but shows an amber warning, because that state should not ship.

## Commands

| Command | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build; also typechecks |
| `npm test` | the priority-logic tests (Node's runner, same as `server/`) |
| `npx eslint src` | lint |

## Things worth knowing

- **Offline taps.** `src/lib/offline-queue.ts` writes every tap to `localStorage` with the
  time it happened, then flushes when signal returns. `recorded_at` travels with the tap, so
  a status recorded at 10:02 and sent at 10:40 still reads 10:02 on the board. Test it with
  devtools → Network → Offline: the status still changes, and a "3 to send" pill appears.
- **`structure` is board-only.** Whether a house is still standing is a separate field from
  `status`, it never reaches the voice agent, and `/api/status` rejects it as a status value.
  See `docs/FRONTEND_CONTRACT.md`.
- **Reset between demo runs.** The button in the dispatch header, or `POST /api/reset`.
- **Map colours are validated, not chosen by eye.** The urgency steps were run through a
  contrast and colour-vision check against the paper ground; the note on `URGENCY_COLOR` in
  `src/lib/priority.ts` has the numbers. Re-run that check before changing them.
- **The map is MapLibre, not Leaflet.** The basemap is a vector style drawn in the paper
  palette (`src/components/dispatch/zone-map.tsx`), which is why it can be recoloured at all —
  raster tiles cannot. Tiles and glyphs come from OpenFreeMap, keyless. If the network is
  down the basemap is blank but the perimeter, zones and households still draw, because they
  come from local data.
- **Geography is real.** The perimeter traces Pacific Palisades from the coast into Santa Ynez
  Canyon, and the eight zones are its actual districts. `inside_perimeter` is computed from
  the polygon, never stored, and a test asserts it agrees with every household's zone.

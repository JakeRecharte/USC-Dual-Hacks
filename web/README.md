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

## How the two portals stay in step

During the demo the officer is on a phone and the dispatcher is on a laptop — two different
browsers. A tap has to travel through the server to reach the board:

```
officer phone ──POST /api/status──► src/lib/server-store.ts ──SSE /api/events──► dispatch board
                                            │
                                            └──► POST {BACKEND_URL}/update_status  (when set)
```

`server-store.ts` holds the newest status per address in memory and is the only thing that
writes. The dispatcher board also opens a second `EventSource` straight at the telephony
server's `/events` for the live call queue (`docs/DATA_CONTRACT.md` §5).

## Swapping the fake data for Supabase

Two places, nothing else:

- `src/lib/addresses.ts` — `seedAddresses()` returns the 30 fake rows. Replace with a read of
  `addresses` joined to the newest `status_log` row per address.
- `src/lib/server-store.ts` — `applyUpdate()` already forwards to `update_status` when
  `BACKEND_URL` is set. Point reads at Supabase Realtime and `/api/events` can go away.

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
- **Map colours are validated, not chosen by eye.** See the note on the urgency tokens in
  `src/app/globals.css` before changing them.

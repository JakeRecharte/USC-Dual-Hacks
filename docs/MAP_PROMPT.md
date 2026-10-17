# Prompt: put every phone call on its house (dispatch board)

**For:** P4, or the coding agent P4 hands this to. Paste this whole file in as the task.
**From:** P1 (voice agent + Retell → Supabase pipeline), Sat Oct 17, 13:20.
**Read first:** `docs/DATA_CONTRACT.md` §6 and §7 (the `calls` table you'll read).

---

## The task

Turn the dispatch board from "a map of Palisades with a call list beside it" into a
**call-centred incident view**, like DispatchAI's operator cockpit: every phone call the AI
line takes appears on the exact house it's about, and selecting a call flies the map to that
house and opens a detail panel with what was said, how the caller sounded and what happened.

Input: the Supabase `calls` table, which the telephony server now fills live from Retell.
Output: the dispatch board at `/dispatch`.

## Prerequisites (P1 has done or is doing these)

- `docs/sql/calls_retell.sql` ✅ run: Retell fields on `calls` (status, transcript, summary, …).
- `docs/sql/calls_map.sql`: run it if `calls.lat` doesn't exist yet. It adds `lat`, `lng`,
  `geo_precision`, `decision_trace`. Until it runs, calls still arrive, just without placement.
- Realtime is already on for `calls`, and the board's minted `authenticated` token can read it
  (`docs/sql/calls.sql` RLS policy). The anon key alone reads nothing, by design.
- Fill data: `cd server && npm run reset-demo`, then
  `npm run simulate -- --url https://usc-dual-hacks-production.up.railway.app` writes seven
  calls (flagged `simulated: true`); or phone (213) 752-2494 for a real one.

## What exists today (verified at commit d8e8784)

| Piece | Where | Today |
|---|---|---|
| Map | `web/src/components/dispatch/zone-map.tsx`, `ZoneMap({ addresses, mode, now, focusId, onSelect })` | MapLibre; sources `households` (footprints, `household-fill`/`household-line`) and `household-points` (`heat`, `household-points` layers); `focusId` → `flyTo` zoom ≥ 15 |
| Board | `web/src/components/dispatch/dispatch-board.tsx` | `lg:grid-cols-[minmax(0,1fr)_380px]`: map + `ZoneStrip` left; `CallQueue` + `DoorKnockPanel` right |
| Calls data | `web/src/lib/use-live.ts`, `useTelephony` | **EventSource on the Railway `/events` feed**, not Supabase. `useLive` subscribes to `status_log` and `addresses` only |
| Merge rules | `web/src/lib/calls.ts`, `mergeCall` | routing/severity only move up, except over the lookup placeholder (tested in `web/test/calls.test.ts`) |
| Row type | `web/src/lib/types.ts`, `CallRow` | none of the Retell or map fields yet |

## The input: columns to read from `calls`

One row per Retell `call_id`, **updated in place** as the call happens (subscribe to
`INSERT` and `UPDATE`).

| Group | Columns | Notes |
|---|---|---|
| Identity | `call_id`, `created_at`, `from_number`, `simulated` | `simulated` rows came from test tools: show a small "SIM" tag, and a toggle to hide them |
| Lifecycle | `status` (`in_progress` / `ended`), `started_at`, `ended_at`, `duration_s`, `disconnection_reason` | |
| Who/where | `address`, `subject_name`, `address_id`, `lat`, `lng`, `geo_precision` | `address_id` matches `addresses.id`, i.e. the household footprint already on the map |
| Outcome | `routing`, `severity`, `reason`, `mode`, `transfer_status` | **`routing` is null while the call is in progress.** Show "In progress", not an error |
| Record | `lookup_found`, `lookup_status`, `inside_perimeter`, `report_written` | `lookup_status` is null unless the caller named the resident |
| Caller | `caller_state`, `distress_score`, `bypass`, `bypass_reason` | state only worsens; distress handoff threshold is 3 |
| Retell | `transcript`, `summary`, `user_sentiment`, `recording_url`, `latency_ms` | transcript updates about every 4 s mid-call; `summary`/`recording_url` arrive ~5–30 s after the call ends |

`decision_trace` is also on the row. Leave it alone; it isn't part of this task.

## What to build

### 1. Read calls from Supabase (replace the Railway feed)
- New hook (e.g. `useCalls` in `use-live.ts`): initial `select` of the newest 200 rows
  ordered by `created_at desc`, then a Realtime subscription on `calls` for `INSERT` and
  `UPDATE`, using the same minted-token client `useLive` already uses.
- Fold updates in with `mergeCall` so the only-moves-up rule holds. Extend `CallRow` in
  `types.ts` with the columns above. Treat a null `routing` as in progress.
- Keep `useTelephony` (Railway `/events`) **only** as the fallback when Supabase isn't
  configured. Once this works, P1 will close the public `/events` feed.

### 2. Calls on the map, on their houses
- Add a `calls` GeoJSON source and layers in `zone-map.tsx`, fed from calls with `lat`/`lng`.
- `geo_precision = 'house'`: highlight that household's **footprint** (`household-fill`, matched by
  `address_id`, e.g. with feature-state) in the call's routing colour, plus a pin on top.
- `geo_precision = 'street'` (a house we don't have): a dashed circle of about 60 m at the
  given point, labelled "house not in records".
- Colours: reuse `ROUTING_TONE` from `dispatch-board.tsx`. In-progress calls, `human_now` and
  `callback_queue` **pulse**.
- Several calls about one house: one marker with a count badge; selecting it opens the newest.
- Keep the existing heat/zone modes and the door-knock list working; calls draw above them.

### 3. Selection
- `selectedCallId` in `DispatchBoard`. Selecting a queue row, a call pin, or a household that
  has calls sets it.
- On select: `flyTo` the call (zoom about 17 for `house`, 16 for `street`), outline the footprint,
  open the detail panel. Escape or the close button deselects.
- A new call that arrives as `human_now` or `callback_queue` doesn't steal the selection; it
  goes to the top of the list with a highlight.

### 4. Layout like the reference (DispatchAI operator cockpit)
Three columns on wide screens: **call list | map | call detail**, stats strip on top.

- **Stats strip:** Calls (total), Need a person (`human_now` + `callback_queue`), Answered by the
  line (`answered_by_agent` + `scheduled_followup`, the "calls prevented" number), In progress.
- **Left, call list:** newest first within routing rank (`callback_queue` > `human_now` >
  `priority_queue` > `abandoned_callback` > `scheduled_followup`/`answered_by_agent`, in-progress
  pinned to the top). Each row: routing badge, address, "asking about {subject_name}", age,
  ⚡ if `bypass`, live dot if in progress.
- **Centre, map:** as above.
- **Right, call detail:** build it as a **vertical stack of independent section components**,
  each taking the selected `CallRow` (and the household, when `address_id` is set). Adding a
  section later must not mean touching the others. Sections, in order:
  1. **Header:** address, routing badge, severity, live/ended, `transfer_status`.
  2. **Facts:** a grid with resident asked about; record status and its time (from the
     household's newest `status_log`, already in `useLive`); inside/outside the perimeter; call
     time and duration; callback number.
  3. **Summary:** Retell's `summary`; while in progress, the `reason` and a "summary after the
     call" placeholder.
  4. **Caller emotion:** reuse `EmotionGauge` (`caller_state` + `distress_score`), plus
     `user_sentiment` once it arrives.
  5. **Transcript:** parse `Agent:` / `User:` lines into a chat view (AI line vs caller, as in the
     reference). Auto-scroll while live; stop auto-scrolling if the dispatcher scrolls up.
  6. **Recording:** an `<audio controls>` player when `recording_url` is present.

## Acceptance criteria

1. With `npm run reset-demo` then the simulator, 7 calls appear in the list within 2 s, each on
   its house: 1420 Sunset Mesa, 1515 Via de la Paz, 16800 Bollinger and so on, with footprints
   tinted by routing.
2. A real phone call shows as **In progress** within 2 s of answering, gets its address and pin when
   the agent looks it up, its routing when routed, and **summary + recording** within 30 s of
   hanging up, all without a page reload.
3. Selecting any call flies to its house at zoom about 17 and opens the detail panel; the
   transcript updates while the call is live.
4. A call about a house not in our records (e.g. "861 Alma Real Drive") shows a dashed street
   circle, not a house footprint and not nothing.
5. Two calls about the same house show one marker with "2".
6. `simulated` calls carry a SIM tag and hide with the toggle.
7. Signed out, or with the anon key alone, no call data loads (RLS). Check it in a private window.
8. The door-knock list, heat/zone modes and the officer portal behave as before.
9. `npm test`, `npx tsc --noEmit`, `npx eslint src` and `next build` all pass; add tests for
   the transcript parser and the "calls per household" grouping.

## Out of scope

Editing calls from the board, playing the transcript as audio, historical analytics, and
anything that changes what the phone agent says. Ask P1 for any new column instead of deriving
it in the browser.

# Frontend addendum to the data contract

From P4. Read alongside `docs/DATA_CONTRACT.md`, which this does not change. Two asks and
one answer.

Team rule 2 says nobody changes a table or a function without telling P1 and P4. This is me
telling you: the board introduces **one new field**, and it is deliberately kept out of
everything P1's agent can reach.

---

## 1. New field: `structure` (P2 — a column, not an enum value)

Officers need to record whether a house is still standing. It is a different kind of fact
from an evacuation status, so it is a different field.

| Field | Type | Values |
|---|---|---|
| `structure` | enum | `intact`, `damaged`, `destroyed`, `unassessed` (default) |

**Please put it on `addresses` (or its own `damage_log`), not in the `status_log.status`
enum.** Three reasons:

1. **The agent must never say it.** "Your mother's house burned down" is not a sentence an
   automated line should produce to a stranger on the phone. The same instinct behind
   *never say "empty"* applies harder here. Keeping it out of `status` means there is no path
   by which `lookup_address` could return it and no speech case for P1 to write.
2. **It is orthogonal.** A house can be destroyed *and* cleared. Folding `destroyed` into
   `status` would overwrite the evacuation answer with a damage answer and lose one of them.
3. **It does not belong in the queue.** A destroyed structure is no longer an evacuation
   question, so on the board it stops driving door-knock priority and moves to its own count.

The board already enforces this: `POST /api/status` **rejects `destroyed` as a `status`**
and only accepts it as `structure`. Verified:

```
$ curl -X POST /api/status -d '{"address_id":"a1","status":"destroyed"}'
{"applied":[],"rejected":[{"index":0,"reason":"status not in the contract: destroyed"}]}
```

**P1:** no change needed, and that is the point — please keep `structure` out of the
`lookup_address` response so it stays that way.

## 2. `update_status` — what the officer page needs (P2)

`team_plan.md` lists `update_status(address_id, status, source, note)`. Two additions:

| Field | Why |
|---|---|
| `recorded_at` | **Please accept it from the client.** Officers lose signal inside the perimeter, so taps are queued on the phone and sent later. The time that matters is when the officer stood at the door, not when the request arrived. A status recorded at 10:02 and delivered at 10:40 must still read 10:02 — the board's whole promise is that the time it shows is the time the record was made. |
| array body | The queue flushes a batch when signal returns. Accepting `[{…}, {…}]` as well as a single object saves a request per door. |

Until it exists, set nothing: the board's in-memory store is the source of truth and the
demo runs end to end without P2. When it is live, set `BACKEND_URL` in `web/.env.local` and
every tap is mirrored to `POST {BACKEND_URL}/update_status` — fire-and-forget, so the board
stays responsive if the backend is down.

Also needed on `addresses`, already in `team_plan.md` but flagging it because the map is dead
without them: **`lat`, `lng` and `zone_id` populated for every row.**

## 3. Answer to open question 3: yes, SSE is enough

> P4: is the SSE feed enough until Realtime is on, or do you want to read Supabase directly
> from the start?

**SSE is enough.** The board opens one `EventSource` at the telephony server's `/events` for
the call queue and one at its own `/api/events` for statuses. Both reconnect on their own and
both re-send a full snapshot on connect, so a dropped stream heals without a reload.

Reading Supabase directly is strictly better once Realtime is on, and the swap is two
functions (`web/README.md` has the detail) — but it is not on the critical path for the 4 PM
demo, so it is not blocking anyone.

## 4. Small ask for P1 (optional, but it makes the demo better)

Right now the board and the agent keep **separate copies of the fake data**: the board reads
`web/src/lib/addresses.ts`, the agent reads `server/src/backend.js`. So an officer's tap
shows on the board instantly but does **not** change what the agent says on the phone.

That forces the demo to use two different addresses — the officer marks one house, the caller
asks about another — which works but is weaker than the obvious story.

**If you have ten minutes before feature freeze:** a tiny write endpoint on the telephony
server that mutates its in-memory `ADDRESSES`:

```
POST /admin/status   { address_id, status, note, recorded_at }
```

The board would call it the same way it calls `update_status`, and then:

> officer marks 640 Toyopa Dr refused → relative calls about **640 Toyopa Dr** →
> agent answers with the refusal the officer just recorded → it jumps the queue

One continuous chain in front of the judges. It becomes unnecessary the moment P2's Supabase
is the shared source of truth, so only do it if that isn't going to land in time.

**Not blocking.** `docs/DEMO_SCRIPT.md` works without it.

## What the board reads today

| Source | Used for | Status |
|---|---|---|
| `web/src/lib/addresses.ts` | 77 fake households across 8 Palisades zones | in place, swap for Supabase |
| `GET /api/events` (ours) | status changes, officer → dispatcher | working |
| `GET {telephony}/events` | live call queue: `lookup`, `call_logged`, `bypass`, `emotion` | working, needs the server up |
| `POST {BACKEND_URL}/update_status` | mirroring taps into Supabase | waiting on P2 |

Households `a1`–`a5` are copied from `server/src/backend.js` — same addresses, resident
names, statuses and ages — so a real phone call and the board agree on screen. The rest are
generated from per-zone street lists with a fixed seed, so the board is identical on every
run and the demo's numbers cannot drift.

**P1, worth knowing:** the agent's `a6` (Crenshaw) and `a7` (Vermont) are deliberately not on
this board. It covers one incident, so anything outside the perimeter never enters — reads
drop it and writes against it are refused. Nothing changes for the agent: it still answers
those calls, and the routine-mode call in the demo is still about Dorothy Hayes on Crenshaw.
It simply is not a pin on this map, which is the dual-use point rather than a gap.

## 5. Consuming P1's emotion work (done)

`caller_state` and the `emotion` event from §3a are both on the board now: a labelled state
on each queue row and a distress meter scaled against the handoff threshold of 3.

Two notes for P1, neither blocking:

- **`bypass` ships two shapes.** `/fn/request_human` emits `{ reason }`; the transcript path
  emits `{ kind, reasons }`. The board handles both, but they are worth collapsing into one
  shape before anyone else consumes the feed.
- **`emotion` can arrive with `caller_state: null`** when the words-based score moves before
  the agent has reported a state. The board treats that as "score only, state unchanged" and
  never downgrades a state, matching "only ever moves up".

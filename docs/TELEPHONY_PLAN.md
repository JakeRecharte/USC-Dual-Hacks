# Telephony plan (Person A)

Sat Oct 17, 08:15. Feature freeze 12:00. Submit by 22:00.
Source of truth for the product: `HANDOFF_FINAL.md`. This file is only the telephony path.

**Prototype = Phases 1–3 green.** That is when we start calling the number for real.

---

## Where we are (verified 08:15)

| Piece | State | Evidence |
|---|---|---|
| Server (`server/`) | Live on Railway | `GET /health` → 200 |
| Public URL | `https://usc-dual-hacks-production.up.railway.app` | Venue wifi blocks ngrok/cloudflared, so no tunnel |
| Signature check | On | Signed test → 200 in 224 ms, unsigned → 401 |
| Number | +1 (213) 752-2494 | Bound to both agents |
| Line Intake agent | Claude 5.5 Haiku, 5 min cap, tools → Railway | `report_incident`, `request_human`, `end_call` |
| Line Outbound agent | Created, no custom tools | `transfer_to_human` missing (no dispatcher number) |
| Engine | **Stub** (`server/src/engine-stub.js`) | Canned lanes on the frozen contract |
| State | **In memory** | Wiped on every Railway redeploy (every push) |
| Outbound | Allowlist + kill switch + cap 25 | `ALERTS_ENABLED=false`, `CONSENTED_NUMBERS` empty |
| Real inbound call | **Not yet** | Nothing in Railway logs from Retell |

---

## Dependency graph

```
P1 Real inbound call ──┬──> P2 Swap in real engine ──> P4 Fan-out ──> P6 Demo hardening
                       │                                  ▲
                       └──> P3 One outbound call ─────────┘
P5 Persistence + console feed (needs Person B's Supabase) ──> P4, P6
```

P1 first because every later phase assumes the real request shape. P3 runs in parallel
with P2 because it only touches `dial.js`. P4 needs P2 (a real threshold) and P3 (a proven
dial). P5 is gated on Person B; P4 can ship on in-memory state and move to Supabase after.

---

## P1 — One real inbound call end-to-end (target 09:00) · CRITICAL

The handoff's checkpoint. Nothing else matters until this is green.

1. Get the dispatcher's phone. Set `DISPATCHER_NUMBER` in Railway and `server/.env`,
   re-run `npm run setup-retell -- --url https://usc-dual-hacks-production.up.railway.app`.
2. Call the number. Script: *"There's flooding on Normandie Avenue, I'm looking at it."*
3. Pull the first real body from Railway logs (`railway logs` from `server/`). Diff it
   against what `server/src/index.js` reads: `call.call_id`, `call.from_number`, `args.*`.
   Fix the code if they differ. Do not trust the handoff's field shapes.
4. Call again and say *"my husband is bleeding."* Dispatcher phone must ring.

**Done when:**
1. A real call produces a `triaged` log line with a non-empty `call_id` and `from_number`.
2. The agent speaks the `say` text within ~2 s of the caller naming the street.
3. A life-safety phrase transfers to the dispatcher phone; `BYPASS` appears in logs for
   both the transcript check and `request_human`.
4. `call_ended` arrives and the session shows `ended_at`.

**If not green by 11:00:** stop, fall back to `npm run simulate`, and say so on stage.

## P2 — Swap the stub for Person B's engine (target 10:00) · HIGH

1. Pull B's engine. Replace the one import in `server/src/index.js`
   (`./engine-stub.js` → B's module). Contract is frozen:
   `{ incident_type, street, cross_street, firsthand, people_affected, lang, call_id, from_number } → { lane, say, transferTo?, briefForHuman? }`
2. Pass `now` from the server (engine never reads the clock).
3. Re-run `npm run simulate` for each lane: BYPASS, ANSWERABLE, NOVEL, CORROBORATING.

**Done when:** all four lanes come back from the real engine through the same endpoint,
and a real call lands in the lane B's engine picks.

## P3 — One outbound call to our own phone (target 10:00) · HIGH

1. Add our own cells to `CONSENTED_NUMBERS` (Railway + local `.env`).
2. Get the dispatcher number in so `Line Outbound` gets `transfer_to_human` too.
3. `ALERTS_ENABLED=true` locally only, then `npm run test-outbound -- +1OURPHONE`.
4. Repeat with `lang: es-ES` to prove the multilingual sweep.

**Done when:**
1. Our phone rings from (213) 752-2494 and the agent reads `{{incident}}` and `{{street}}`.
2. A number not in the list returns `{ simulated: true, reason: 'not_consented' }`.
3. With `ALERTS_ENABLED=false`, nothing rings, even for a consented number.

## P4 — Threshold → fan-out (target 11:30) · HIGH

The demo's climax: four phones ring at once.

1. Server listens on the bus for B's "cluster confirmed" event (or calls B's
   `maybeTriggerAlert` after persisting, per handoff §6).
2. Atomic latch: fire only if `update clusters set alerted = true where id = $1 and alerted = false returning id`
   returns a row. Until Supabase is live, use an in-memory `Set` with the same semantics
   and swap later.
3. `targetOutbound()` (B) → `dialBatch()` (ours): capped at 25, consented numbers go out
   as one Retell batch call, everyone else returns `simulated`.
4. Record every dial (real and simulated) for the console's real-vs-simulated panel.

**Done when:**
1. Five firsthand signals from five distinct numbers on one street trigger exactly one
   fan-out, even when signals 5–7 arrive within 50 ms of each other.
2. Four consented phones ring; the console shows 4 real and N simulated.
3. A sixth signal on the same cluster does not dial anyone.

## P5 — Persistence + console feed · MEDIUM, gated on Person B

1. Person B gives us `SUPABASE_URL` + service-role key. Set both in Railway only.
2. After `reply.send()`, write `calls` (idempotent on `call_id`) and `signals`.
3. Write `dials` from P4.
4. Until Realtime is wired, expose `GET /events` (SSE) from the bus so the console never polls.

**Done when:** a Railway redeploy mid-demo loses no incidents or calls.

## P6 — Demo hardening (12:00–16:00, after freeze) · MEDIUM

- Fallback number on the Retell number = dispatcher's phone (covers hitting 20 concurrent).
- Confirm Retell concurrency (verified: limit 20, burst 60) covers 7 inbound + 4 outbound.
- Rehearse the seven-call scenario on real phones; everyone else on Do Not Disturb.
- Record the backup video of the full flow by 16:00.
- No pushes to `telephony` during the pitch: every push redeploys Railway and drops live calls.

## Cut unless everything above is green

- SMS fallback tier (handoff §9 hole #1). ~30 min. Answer it verbally otherwise.
- Supabase Realtime on the console if SSE works.

---

## Open items blocking us

| Need | From | Blocks |
|---|---|---|
| Dispatcher phone number | Team | P1 step 4, P3 transfer |
| Our cell numbers for the allowlist | Team | P3 |
| Engine module + "cluster confirmed" event name | Person B | P2, P4 |
| Supabase URL + service-role key | Person B | P5 |

## Rollback

- Code: Railway → Deployments → redeploy the previous build (one click), or `git revert`.
- Agents: `npm run setup-retell` rewrites both agents from `server/retell/`.
- Outbound: set `ALERTS_ENABLED=false` in Railway. Nothing rings within one redeploy.

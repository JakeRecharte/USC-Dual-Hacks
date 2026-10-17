# Telephony plan (Person A)

Sat Oct 17, updated 08:40. Feature freeze 12:00. Submit by 22:00.
Source of truth for the product: `HANDOFF_FINAL.md`. This file is only the telephony path.

**Scope: inbound calls only.** Outbound alerts were cut at 08:40 to focus on inbound. The
implementation is preserved at commit `eff47c9` if there's time after freeze.

**Prototype = P1 and P2 green.** That is when we start calling the number for real.

---

## Where we are (verified 08:40)

| Piece | State | Evidence |
|---|---|---|
| Server (`server/`) | Live on Railway | `GET /health` → 200 |
| Public URL | `https://usc-dual-hacks-production.up.railway.app` | Venue wifi blocks tunnels |
| Deploy | `npm run deploy` | Pushing alone does **not** deploy |
| Signature check | On | Signed → 200, unsigned → 401 |
| Number | +1 (213) 752-2494 | Inbound → Line Intake, outbound disabled |
| Line Intake agent | Claude 5.5 Haiku, 5 min cap, tools → Railway | `report_incident`, `request_human`, `end_call` |
| Lanes | BYPASS / NOVEL / CORROBORATING from the stub | First report is NOVEL, repeats are CORROBORATING |
| ANSWERABLE | **Not yet** | Needs Person B's knowledge base |
| State | **In memory** | Wiped on every deploy |
| Real inbound call | **Not yet** | Nothing in Railway logs from Retell |

---

## P1 — One real inbound call end-to-end · CRITICAL

1. Get the dispatcher's phone. Set `DISPATCHER_NUMBER` in Railway and `server/.env`,
   re-run `npm run setup-retell -- --url https://usc-dual-hacks-production.up.railway.app`.
2. Call the number: *"There's flooding on Normandie Avenue, I'm looking at it."*
   Expect NOVEL → transfer to dispatcher.
3. Second phone, same street. Expect CORROBORATING: "We've had 1 report…".
4. Pull the first real body from Railway logs (`railway logs` from `server/`). Diff against
   what `server/src/index.js` reads: `call.call_id`, `call.from_number`, `args.*`.
5. Call and say *"my husband is bleeding."* Dispatcher phone must ring.

**Done when:**
1. A real call produces a `triaged` log line with non-empty `call_id` and `from_number`.
2. The agent speaks the `say` text within ~2 s of the caller naming the street.
3. First caller on a street hears NOVEL and is transferred; second hears CORROBORATING.
4. A life-safety phrase transfers to the dispatcher phone.

**If not green by 11:00:** fall back to `npm run simulate`, and say so on stage.

## P2 — Swap the stubs for Person B's engine · HIGH

1. Replace `./engine-stub.js` and `./cluster-stub.js` imports in `server/src/index.js`.
   Contract: `triage(signal, { cluster }, now) → { lane, say, transferTo?, briefForHuman? }`.
2. ANSWERABLE comes with B's knowledge base (facts with source and expiry).
3. `npm run simulate` for each lane, then one real call per lane.

## P3 — Persistence + console feed · MEDIUM, gated on Person B

1. Person B gives us `SUPABASE_URL` + service-role key. Set both in Railway only.
2. After `reply.send()`, write `calls` (idempotent on `call_id`) and `signals`.
3. `GET /events` (SSE) already streams every call event for the console.

**Done when:** a deploy mid-demo loses no incidents or calls.

## P4 — Demo hardening (after freeze)

- Fallback number on the Retell number = dispatcher's phone (covers hitting 20 concurrent).
- Rehearse the seven-call scenario on real phones; everyone else on Do Not Disturb.
- Record the backup video by 16:00.
- No deploys during the pitch.

---

## Open items blocking us

| Need | From | Blocks |
|---|---|---|
| Dispatcher phone number | Team | P1 transfers |
| Engine module (lanes + clustering + knowledge base) | Person B | P2 |
| Supabase URL + service-role key | Person B | P3 |

## Rollback

- Code: Railway → Deployments → redeploy the previous build, or `git revert`.
- Agent: `npm run setup-retell` rewrites Line Intake from `server/retell/`.

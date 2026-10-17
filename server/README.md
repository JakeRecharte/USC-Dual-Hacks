# Voice agent server (P1)

Retell's Line Intake agent calls this server mid-call. It answers "was my mom's house
checked?" from the sweep log, and routes everything else to a human. **Inbound only.**
Contract: `docs/DATA_CONTRACT.md`.

    src/index.js     Fastify: /fn/lookup_address, /fn/log_call, /fn/request_human, /webhook/retell, /events
    src/backend.js   lookup_address + log_call. FAKE data until P2's Supabase functions are live.
    src/routing.js   Routing rules (contract §3). Pure, time injected.
    src/speech.js    What the agent reads out: always the time, never "empty".
    src/bypass.js    Emergency words in the live transcript, every chunk.
    src/sessions.js  Live call state by call_id, plus the event bus.
    retell/          Line Intake prompt (wildfire + routine modes) and tool definitions.
    scripts/         simulate.js (the six scripted calls), setup-retell.js (agent as code).

## The six scripted calls (team_plan.md)

| Case | Fake address / name | Routing |
|---|---|---|
| Cleared 40 min ago | 1420 Sunset Mesa Dr / Maria Lopez | `answered_by_agent`, with the time |
| Refused | 1515 Via de la Paz / Harold Kim | `priority_queue`, officer note to the human |
| Unknown inside perimeter | 16800 Bollinger Dr / Ruth Adams | `priority_queue` |
| First-hand emergency | any, "I'm with her now" | `human_now` |
| Routine high | 4512 Crenshaw Blvd / Dorothy Hayes, 2 weeks, 84, oxygen | `priority_queue` |
| Routine low | 910 N Vermont Ave / Kevin Nguyen, 6 hours, 40 | `scheduled_followup` |

Also in the fake data: 1100 Palisades Dr / Tom Becker (cleared 6 hours ago, stale) and
820 Chautauqua Blvd / Linda Park (self-reported out 55 min ago).
A wrong name gets no status at all: the looting safeguard.

## Run it locally

    cd server && npm install && npm run dev
    npm run simulate                 # all six cases
    npm run simulate -- refused      # one case
    npm test

Fill in `server/.env` (copied from `.env.example`). `RETELL_API_KEY` signs simulated
requests and verifies `x-retell-signature` on real ones.

## Supabase

With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set (Railway variables), the agent reads the
**same** `addresses` + `status_log` the board writes, so an officer's tap is what the next
caller hears. Every call is upserted into `calls` (create it once with `docs/sql/calls.sql`).
Without them, or if the database errors mid-call, it answers from the in-memory fake data.
`GET /health` says which: `{ data: { mode: 'supabase' | 'memory', lastError } }`.

## Deploy

Live at `https://usc-dual-hacks-production.up.railway.app` (Railway project
`dazzling-laughter`). **Pushing does not deploy**: Railway's GitHub app isn't installed on
this repo, so deploy explicitly after pushing:

    npm run deploy     # needs `railway login` once

Every deploy restarts the server and clears in-memory state. Never deploy mid-demo.

    npm run simulate -- --url https://usc-dual-hacks-production.up.railway.app

## Retell setup

The agent config lives in `retell/`, not the dashboard:

    npm run setup-retell -- --url https://usc-dual-hacks-production.up.railway.app

Updates **Line Intake** (Claude 5.5 Haiku, multilingual, 5 min max, 20s silence cutoff),
points its webhook and tools at the URL, and binds it to the number with outbound
disabled. **Re-run it whenever the prompt changes.** Set `DISPATCHER_NUMBER` first or
`human_now` / `priority_queue` calls have nowhere to transfer.

## Checkpoint

Phone rings → `lookup_address` and `log_call` hit the server → the agent reads the status and routing.
**Compare the first real body in the Railway logs to what `src/index.js` reads**
(`call.call_id`, `call.from_number`, `args.*`) and fix the code if it differs.

## Transfers

A custom function's response only goes back to the agent's LLM; returning
`{ transfer: true }` does not move the call. The real transfer is Retell's built-in
`transfer_to_human` tool, which the prompt tells the agent to call after `request_human`
or when `log_call` returns `transfer: true`.

## Console feed

    GET /events    server-sent events: snapshot, lookup, call_logged, bypass, call_started,
                   call_ended. One EventSource, no polling.
    GET /state     everything at once: sessions, calls
    GET /sessions  GET /calls

```js
const es = new EventSource('https://usc-dual-hacks-production.up.railway.app/events');
es.addEventListener('snapshot', (e) => render(JSON.parse(e.data)));
es.addEventListener('call_logged', (e) => addToQueue(JSON.parse(e.data)));
```

## Outbound

Removed Sat 08:40: the team cut outbound alerts to focus on inbound. The full
implementation (allowlisted `dial()`, fire-once latch, batch fan-out, tests) is in git at
commit `eff47c9` if there's time to bring it back.

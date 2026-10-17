# Telephony server (Person A)

Everything between a phone ringing and `engine.triage()` returning. **Inbound calls only.**

    src/index.js         Fastify: /fn/report_incident, /fn/request_human, /webhook/retell, /events
    src/engine-stub.js   Lanes on the frozen contract. Replace with Person B's engine.
    src/cluster-stub.js  What we already know per incident type + street. Replace with B's clustering.
    src/bypass.js        Keyword check on the live transcript, every chunk.
    src/sessions.js      Live call state by call_id, plus the event bus.
    retell/              Line Intake prompt and tool definitions.
    scripts/             simulate.js (fake signed Retell calls), setup-retell.js (agent as code).

## How a call is answered

1. Agent greets: *"LA Community Line. I'm automated, and I can get you a person. Is anyone hurt or in danger?"*
2. Every transcript chunk runs `checkBypass()`. A life-safety phrase flags the session mid-sentence.
3. Once the agent has incident type + street it calls `report_incident`. The server looks up
   what we already know, runs `triage()`, and replies before doing anything else:

| What we know | Lane | Caller hears | Transfer |
|---|---|---|---|
| `medical` | BYPASS | "I'm connecting you to a person right now." | yes |
| No street, or first report of this incident | NOVEL | "This is the first report we have of this. I'm connecting you to a dispatcher." | yes |
| Incident already on record | CORROBORATING | "We've had N reports … the first about M minutes ago, and yours has been added." | no |

4. After replying, the report is recorded: sources, plus independent callers (unique, firsthand only).

## Run it locally

    cd server && npm install && npm run dev
    npm run simulate                 # NOVEL the first time, CORROBORATING after
    npm run simulate -- medical      # BYPASS, flagged mid-utterance
    npm run simulate -- surge        # 1 first report, then 6 concurrent on the same street
    npm test

Fill in `server/.env` (copied from `.env.example`). `RETELL_API_KEY` signs simulated
requests and verifies `x-retell-signature` on real ones.

## Deploy

Live at `https://usc-dual-hacks-production.up.railway.app` (Railway project
`dazzling-laughter`). **Pushing does not deploy**: Railway's GitHub app isn't installed on
this repo, so deploy explicitly after pushing:

    npm run deploy     # needs `railway login` once

Every deploy restarts the server and clears in-memory state. Never deploy mid-demo.

    npm run simulate -- surge --url https://usc-dual-hacks-production.up.railway.app

## Retell setup

The agent config lives in `retell/`, not the dashboard:

    npm run setup-retell -- --url https://usc-dual-hacks-production.up.railway.app

Updates **Line Intake** (Claude 5.5 Haiku, multilingual, 5 min max, 20s silence cutoff),
points its webhook and tools at the URL, and binds it to the number with outbound
disabled. **Re-run it whenever the prompt changes.** Set `DISPATCHER_NUMBER` first or
BYPASS/NOVEL calls have nowhere to transfer.

## Checkpoint

Phone rings → `report_incident` hits the server → lane comes back and the agent says it.
**Compare the first real body in the Railway logs to what `src/index.js` reads**
(`call.call_id`, `call.from_number`, `args.*`) and fix the code if it differs.

## Transfers

A custom function's response only goes back to the agent's LLM; returning
`{ transfer: true }` does not move the call. The real transfer is Retell's built-in
`transfer_to_human` tool, which the prompt tells the agent to call after `request_human`
or on a `BYPASS`/`NOVEL` lane.

## Console feed

    GET /events    server-sent events: snapshot, signal, bypass, cluster, call_started,
                   call_ended. One EventSource, no polling.
    GET /state     everything at once: sessions, clusters
    GET /sessions  GET /clusters

```js
const es = new EventSource('https://usc-dual-hacks-production.up.railway.app/events');
es.addEventListener('snapshot', (e) => render(JSON.parse(e.data)));
es.addEventListener('signal', (e) => addCall(JSON.parse(e.data)));
```

## Outbound

Removed Sat 08:40: the team cut outbound alerts to focus on inbound. The full
implementation (allowlisted `dial()`, fire-once latch, batch fan-out, tests) is in git at
commit `eff47c9` if there's time to bring it back.

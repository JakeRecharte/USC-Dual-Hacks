# Telephony server (Person A)

Everything between a phone ringing and `engine.triage()` returning.

    src/index.js        Fastify: /fn/report_incident, /fn/request_human, /webhook/retell, /sessions
    src/engine-stub.js  Canned lanes on the frozen contract. Replace with Person B's engine.
    src/dial.js         The only way to place a call. Allowlist + ALERTS_ENABLED + per-cluster cap.
    src/sessions.js     Live call state by call_id, plus the event bus.
    retell/             Agent prompt and tool definitions to paste into Retell.
    scripts/            simulate.js (fake signed Retell call), test-outbound.js (call your phone).

## Run it

Three terminals, all left open:

    # 1. server
    cd server && npm install && npm run dev

    # 2. tunnel (start ONCE; the free URL changes on restart)
    ngrok config add-authtoken <token from dashboard.ngrok.com>   # first time only
    ngrok http 3000

    # 3. tests
    cd server && npm run simulate            # expect 200 + CORROBORATING
    cd server && npm run simulate -- medical # expect BYPASS

Fill in `server/.env` (copied from `.env.example`). `RETELL_API_KEY` is needed for both
outbound calls and verifying `x-retell-signature`.

## Retell setup

The agent config lives in `retell/`, not the dashboard. With the server and ngrok running:

    npm run setup-retell                # creates/updates both agents against the live tunnel
    npm run setup-retell -- --buy 213   # first time only: also buys a number ($2/mo)

It creates **Line Intake** (inbound, `agent-prompt.md`) and **Line Outbound**
(`outbound-prompt.md`), on Claude 5.5 Haiku, multilingual, 5 min max, 20s silence
cutoff, with the webhook and tool URLs pointed at the tunnel. It binds them to the
number and writes `RETELL_FROM_NUMBER` / `RETELL_OUTBOUND_AGENT_ID` into `.env`.

**Re-run it whenever ngrok restarts or a prompt changes.** Set `DISPATCHER_NUMBER` first
or bypass calls have nowhere to transfer.

Then call the number. Watch terminal 1 and `server/logs/requests.jsonl`.

## Checkpoint

Phone rings → `report_incident` hits the server → lane comes back and the agent says it.
**Compare the first real body in `logs/requests.jsonl` to what `src/index.js` reads**
(`call.call_id`, `call.from_number`, `args.*`) and fix the code if it differs.

If this isn't working within a few hours, fall back to the simulator and say so on stage.

## Transfers

A custom function's response only goes back to the agent's LLM; returning
`{ transfer: true }` does not move the call. The real transfer is Retell's built-in
`transfer_to_human` tool, which the prompt tells the agent to call after `request_human`
or on a `BYPASS`/`NOVEL` lane.

## Outbound

Nothing rings unless the number is in `CONSENTED_NUMBERS` **and** `ALERTS_ENABLED=true`.
Everything else comes back `{ simulated: true, reason }`.

    npm run test-outbound -- +1YOURPHONE

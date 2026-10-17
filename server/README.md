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

1. Buy a number in Retell directly ($2/mo). Skip Twilio.
2. Create a Retell LLM agent. Model: Claude Haiku. Paste `retell/agent-prompt.md` as the prompt.
3. Add the three tools from `retell/tools.json`, replacing `YOUR-TUNNEL` with the ngrok
   host and `+1TEAMMATE_PHONE` with whoever plays dispatcher.
4. Agent settings: webhook URL `https://<ngrok-host>/webhook/retell`; max call duration
   ~5 min; end call after ~20s silence. Silence is billed.
5. Attach the agent to the number as its inbound agent.
6. Call the number. Watch terminal 1 and `server/logs/requests.jsonl`.

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

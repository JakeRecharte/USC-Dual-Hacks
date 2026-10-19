# Line

**Was the house checked?** Line connects what officers find at the door to the person who answers the phone.

During a wildfire, worried families call 911 to ask about a home inside the evacuation zone. Nobody can tell the caller whether that home was already swept, so each call takes a call-taker, and some become patrol cars sent to houses that were already empty. Line closes that gap with three pieces:

- **A one-tap officer page.** At each door the officer taps *Cleared*, *Refused* or *No answer*. The tap is timestamped, and it is held on the phone and sent later if there is no signal.
- **A voice agent on the phone line.** It takes the call, checks the address against the sweep log, and either answers with what was recorded and when, or moves the call up the queue to a person.
- **A dispatch board.** One map shows every house's status, the live call queue with the reason for each routing decision, and the door-knock list of houses nobody has checked.

Built for the [InnovateLA × Dual-Use Hackathon](https://www.innovatelosangeles.com/dual-use/sign-in) (USC Viterbi, Oct 16 to 18, 2026), lens **Resilience Comms**. The incident is the Palisades Fire, January 7, 2025.

**Live:** [usc-dual-hacks.vercel.app](https://usc-dual-hacks.vercel.app) (sign in as *Field officer* or *Dispatch*; the sign-in screen shows the demo shift code).

---

## Why this exists

- On January 7, 2025, LAFD responded to **3,624 911 calls in 24 hours** against a normal day of just under 1,500. LAPD logged **160+ evacuation-assistance calls** in one incident file, many about people who had already left.
- Sweep results never reached the phones. Smoke ended door-to-door evacuations on day one, refusals travelled by word of mouth, and a key radio repeater went down.
- **75% of 911 centers cannot afford to hire** (NENA, 2024), so the only lever left is spending each call-taker's time better.
- Existing tools do not cover this. Genasys sends zone alerts but does not check incoming calls, and call-triage products group calls by *incident* ("we know about the fire"). None answers "was my mom's house checked?"

The difference is that Line matches calls by **address and person**, against what officers found at the door. Sources and the full argument are in [pitch_v2.md](pitch_v2.md).

## How a call is handled

The agent asks three things: who you are calling about, their address, and whether you are with them now. Then it looks the address up and routes the call.

| What the record says | What the agent does | Routing |
|---|---|---|
| Cleared or resident-reported out, within 2 hours | Reads the status **and the time**, and offers a person | `answered_by_agent` |
| Refused (people are staying) | Hands the officer's note to a human | `priority_queue` |
| Unknown, inside the perimeter | Moves the call up and adds the address to the door-knock list | `priority_queue` |
| First-hand emergency, or a panicked caller | Stops and transfers immediately | `human_now` |
| Routine welfare check (no fire) | Scores time since last contact, vulnerability and red flags | `priority_queue` or `scheduled_followup` |

The same agent handles everyday "my mom isn't picking up" welfare checks, which is what makes the product useful on an ordinary Tuesday as well as in a fire. The full rule table is in [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md) §3.

### Safety rules (enforced in code, not only in the prompt)

- **It never says "empty."** It reports the last known status and when it was recorded.
- **It only moves calls up.** Severity can rise but never fall, and the agent never closes a call.
- **Status is gated on the resident's name.** A caller who cannot name the resident gets the perimeter and nothing else. This is the looting safeguard.
- **Old records count for less.** A clear older than 120 minutes stops being trusted and the house turns grey.
- **New information beats the record.** "He texted me 20 minutes ago, he's still there" overrides *Cleared*. A relative's "she got out" never takes a house off the door-knock list.
- **Silence is not information.** No reply stays *Unknown*.
- **Distress is a handoff.** The agent scores the caller's own words live. Panic or repeated misunderstanding interrupts it and transfers to a person.
- **A person confirms every dispatch suggestion.** The board suggests resources (re-contact, medical standby, door-knock) with reasons. Nothing is sent automatically.

## Tech stack

| Layer | Technology |
|---|---|
| **Web app** (officer and dispatch portals) | Next.js 15 (App Router, Turbopack), React 19, TypeScript 5, Tailwind CSS 4 |
| **Map** | MapLibre GL 5 with an OpenFreeMap vector basemap, and about 8,100 OpenStreetMap building footprints inside the Palisades perimeter drawn from local data |
| **Database and live updates** | Supabase: Postgres with Realtime, row-level security, and triggers that keep a `houses` table current |
| **Voice agent** | Retell AI, multilingual, with built-in call transfer. The model is set in `server/scripts/setup-retell.js` and defaults to `gpt-5.6-terra`, chosen with an eval harness of scripted callers |
| **Telephony server** | Node 22+, Fastify 5, `retell-sdk`. It verifies Retell's signature, runs the routing rules, and streams events over Server-Sent Events |
| **Sign-in** | One shift code per role, an HMAC-signed role cookie (Web Crypto, so it runs in middleware), and a short-lived Supabase JWT minted only after the code check |
| **Offline tolerance** | A `localStorage` queue that keeps the original `recorded_at` time on each tap |
| **Hosting** | Vercel for the web app, Railway for the telephony server |
| **Tests** | Node's built-in test runner in both packages |

### Architecture

```
caller ──► Retell agent ──► Telephony server ──────┐
           "Line Intake"    (Fastify, Railway)     │ writes calls, reads sweep log
                            lookup_address,        ▼
                            log_call, routing,  Supabase (Postgres)
                            distress            │        ▲
                                                │        │ writes status
                                      Realtime  │        │
                                                ▼        │
                                       Dispatch board    └── Officer phone
                                       (Next.js, MapLibre)   POST /api/status
```

- The agent never talks to the database. The server holds the keys, checks Retell's signature, and turns results into the sentence the agent reads aloud.
- An officer's tap is a short request that writes to Postgres. The dispatch board listens to Postgres over a direct WebSocket, so nothing live passes through our own server. That is why it works on Vercel's serverless functions.
- With no Supabase variables set, both the web app and the server fall back to in-memory mode, so the demo runs with no database.
- The board also holds a **Live | Scenario** switch. Scenario replays the Palisades Fire timeline on the board's own households with simulated statuses, calls and fire spread. It writes nothing, and a real call into the line can still change a house in it. See [docs/SCENARIO.md](docs/SCENARIO.md) for what is real and what is simulated.

## Repository layout

| Path | What is in it |
|---|---|
| [web/](web) | The Next.js app: sign-in, `/officer`, `/dispatch`, API routes, the scenario engine. See [web/README.md](web/README.md) |
| [server/](server) | The Retell webhook server, routing rules, agent prompt and tool definitions, and the scripted-call simulator. See [server/README.md](server/README.md) |
| [docs/](docs) | The data contract, frontend contract, Supabase setup, SQL, Palisades research, scenario notes, demo script and Vercel handoff |
| [pitch_v2.md](pitch_v2.md) | The problem, solution, competitors, funding path, global fit and sources |
| [team_plan.md](team_plan.md) | The work split and the original data contract |

## Run it locally

You need Node 22 or newer.

```bash
# Dispatch and officer portals: http://localhost:3000
cd web
npm install
cp .env.local.example .env.local   # optional: every value has a default
npm run dev

# Telephony server (separate terminal)
cd server
npm install
cp .env.example .env               # fill in RETELL_API_KEY and, optionally, the Supabase keys
npm run dev
npm run simulate                   # the six scripted calls, no phone needed
```

Run the tests with `npm test` in `web/` and in `server/`.

To turn on the shared database, create the schema from [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) and set the Supabase variables. `GET /api/health` on the web app and `GET /health` on the server each report which mode is live. Deployment steps and the environment variables the live site needs are in [docs/VERCEL_HANDOFF.md](docs/VERCEL_HANDOFF.md).

## Responsible use

A list of evacuated homes could be misused to find empty ones. Line never says "empty," shares a status only with a caller who can name the resident, and always states when the status was recorded. The addresses and resident names on the board are placeholders. The geography (streets, building footprints, fire timeline) is real, and every source is cited in [docs/research/](docs/research).

The demo shift codes are shown on the sign-in screen so judges can get in. Set `HIDE_DEMO_CODES=1` to hide them.

## Where it goes

The pitch is to be the field-to-phone layer that plugs into the call-handling platforms agencies already run, not to replace them. The funding path is DHS S&T's Silicon Valley Innovation Program, and customers can buy it as an NG911 system upgrade rather than as staffing. The same model carries to other emergency numbers (000 in Australia, 112 in Europe, 119 in China). See [pitch_v2.md](pitch_v2.md) §4 and §5.

## License

MIT. See [LICENSE](LICENSE).

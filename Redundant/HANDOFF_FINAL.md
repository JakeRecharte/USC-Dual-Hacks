# LINE — Engineering Handoff

**InnovateLA 2026 · Last updated Sat Oct 17, 07:00**

> This supersedes every earlier handoff. The project pivoted: we are no longer
> building a per-call triage copilot. We are building a system that **compares calls
> to each other**, resolves the ones that don't need a human, and fires a targeted
> outbound alert once enough independent people report the same thing.

---

## 1. What we're building, in one paragraph

During a crisis, 911 is the only number that still works, so every kind of call lands
on the emergency line — real emergencies, the fortieth report of a known fire, and
people asking whether their family is safe. A human has to spend the same minutes on
each one to find out which it was. Line answers every call instantly, decides what
each call needs, and — once enough independent people report the same incident in the
same place — stops waiting for calls and starts making them.

**The one-line thesis:** *The fortieth call about a known fire and the first call
about an unknown one cost the same today. They shouldn't.*

---

## 2. The problem — the only four numbers we use

Everything else is cut. Do not add numbers to the deck.

| Number | Meaning | Source |
|---|---|---|
| **57.43% vs 90%** | LAPD answered 57.43% of 911 calls within 15 seconds in 2024, against the state standard required for 911 funding | LAPD Communications Division report |
| **160+ → empty houses** | LAPD took 160+ evacuation-assistance calls Jan 7; many were not true emergencies (cell networks down, people checking on relatives); officers were dispatched to homes already evacuated | LAPD Palisades AAR |
| **26 units unknown** | Up to 26 fire units deployed without the knowledge of incident command; the DOC "could not keep accurate resource information" | UL FSRI review / LAFD AAR |x
| **4m03s** | When multiple people reported the same crash, the earliest report arrived 4m03s before official channels (vs 2m41s for a single report) | Young et al., JAMA Surgery 2019 |

### Precision rules — violating these loses the room

- The 57.43% is measured against **all calls received**, not against answered calls.
  Do **not** chain it with the 1-in-5 figure. State them as two separate facts.
- Say **"the state standard required for 911 funding,"** not "required by state law."
  It is a CalOES directive and a funding condition, not a statute.
- **Oakland is a city**, and it was the Oakland **Police Department**, warned by CalOES
  at 46.22% that it could lose funding and its authority to answer 911 calls.
- **Palisades and Eaton are different fires.** The 17 deaths and the Lake Avenue
  timeline are **Eaton**. We use **Palisades only**. Do not mix them.
- The LAPD "unanswered" gap (547,287) is our arithmetic. Say "received 2.95M,
  answered 2.40M" and let people subtract.
- "Misallocating," not "dislocating."

### The staffing framing (resolves the "that's a hiring problem" objection)

LAPD is 92 call-takers short; hiring fell from 144 (2024) to 56 (2025) while ~75 left.
But the point is **not** that they're understaffed — it's what the staffing data reveals:
24 operators on duty → 45.30% answered in 15s. 34 operators → 64.52%. Performance is a
straight line through headcount, which means the system has **zero leverage**. Nothing
in it lets one person handle more.

> **Hiring raises the ceiling. We raise the leverage.** You can hire over months.
> A surge happens in an hour. Solve hiring completely and this problem remains.

Never claim we fix understaffing. Claim we reduce the calls that require a human.

---

## 3. The four lanes — how we differentiate calls

**We never classify how serious a call is.** We classify whether we already know what
the caller is telling us, and whether answering them requires a person.

| Lane | Trigger | Action |
|---|---|---|
| **BYPASS** | Life-safety language (trapped, bleeding, can't get out, someone's inside) | Transfer to human **instantly**, fires on partial transcript, mid-sentence |
| **ANSWERABLE** | The question has an answer the system already holds | Agent answers from state. No human, no unit dispatched. |
| **NOVEL** | Reports something not in the incident map | **Straight to a dispatcher.** Only a human can send resources somewhere new. |
| **CORROBORATING** | Matches an existing cluster | Agent confirms what's known; the report raises cluster confidence |

**No lane is called "not an emergency."** The system never makes that claim about anyone.

### Non-negotiable safety properties

- **Default is escalate.** A call goes to a human unless it *earns* another lane.
  Silence, confusion, failed extraction, ambiguity → human.
- **Asymmetric error handling.** A false positive costs a human one minute — which is
  the status quo, so we've lost nothing. A false negative is unacceptable. Tune wrong
  in the expensive direction, always.
- **Nothing is discarded.** Every call appears on the console regardless of lane.
  A supervisor can pull any of them back.
- **Never assert safety.** The agent never says "you're safe." It says what we know and
  when we last knew it: *"As of 20 minutes ago there's no evacuation order for Normandie.
  If you see fire or smoke, don't wait for one."* State absence of information, with a
  timestamp — never absence of danger. (See §9, hole #2.)

---

## 4. Architecture

```
caller ──► Retell agent (Claude 5.5 Haiku, intake script, turn-taking)
              │
              │  every transcript chunk
              ├──► checkBypass(partial)        ← keyword only, deterministic, ~0ms
              │
              │  on utterance complete, as a Retell custom function
              ├──► POST /fn/report_incident
              │         │
              │         ├─ findOrCreateCluster(type, loc)   ← 400m / 20min window
              │         ├─ respond FAST with `say`           ← caller is waiting
              │         └─ then persist + maybeTriggerAlert
              │
              └──► engine.triage() ──► { lane, transferTo, briefForHuman }

threshold fires ──► targetOutbound() ──► dial() ──► Retell batch call
                                            │
                                            └─ allowlist guard (§7)
```

**Retell never touches Supabase.** The agent only knows how to POST to our URL.
Our server is the only thing holding credentials. The agent's entire awareness of the
world is whatever we put in the `say` string.

### Parallel queue (important — this is the answer to the AI objection)

The caller enters the queue for a human **from second one**. The agent talks to them
while they wait. If a dispatcher frees up, transfer immediately mid-sentence with
context attached. Calls the agent **fully resolves are removed from the queue**.

The agent is not a gate. It uses dead time that already exists.

---

## 5. Stack — decided, don't relitigate

| Layer | Choice | Why |
|---|---|---|
| Voice | **Retell** | Warm transfer is first-class (maps to BYPASS); 20 free concurrent calls; ~600ms; $10 starter credit |
| Conversation LLM | **Claude 5.5 Haiku** | $0.0032/min vs $0.064 for Sonnet. The engine makes the decisions; the LLM only runs turn-taking. |
| Extraction | Anthropic API, Haiku, **tool-use for structured output** | Forces a schema. Never parse free text. |
| Decision core | **Plain JS, zero dependencies** | Already written, twist-ready, runs anywhere |
| Server | **Node + Fastify** | Engine is JS. Do not rewrite it in Python. |
| DB | **Supabase (Postgres)** | Durable clusters + the atomic latch (§7) |
| Console | **Vite + React**, Supabase Realtime | Realtime beats polling now that we have a DB |
| Map | **Leaflet + OpenStreetMap** | No API key, no billing setup |
| Geocoding | **Static `streets.json`** | See §8 |

**Cost:** ~$0.088/min all-in. Whole weekend runs on ~$25 including the $2 number.
Cap call duration — **silence is billed**. Transfers stop the AI fee, so escalation is cheap.

**Skip Twilio.** Buy the number directly in Retell ($2/mo, $0.015/min telephony).

### Tunnel

Retell needs a public HTTPS URL. `ngrok http 3000`, paste into the Retell dashboard.
**The free ngrok URL changes on every restart** — start it once, leave it running all
weekend in its own terminal. One person owns the Retell account and the tunnel;
everyone else runs the engine against the simulator.

---

## 6. Interfaces

### Retell custom function

```json
{
  "name": "report_incident",
  "description": "Call this as soon as you know the incident type and the street. Call again if the caller corrects or adds detail.",
  "url": "https://YOUR-TUNNEL.ngrok-free.app/fn/report_incident",
  "speak_during_execution": true,
  "parameters": {
    "type": "object",
    "properties": {
      "incident_type": { "type": "string", "enum": ["flood","fire","outage","medical","structural","other"] },
      "street":        { "type": "string", "description": "Street name only, e.g. 'Normandie Ave'. Omit the number." },
      "cross_street":  { "type": "string" },
      "firsthand":     { "type": "boolean", "description": "True if the caller personally saw or is experiencing it. False if relaying what someone else told them." },
      "people_affected": { "type": "integer" },
      "lang":          { "type": "string", "description": "BCP-47 code of the language the caller is speaking" }
    },
    "required": ["incident_type", "street", "firsthand"]
  }
}
```

Add a second function `request_human` — *"Call immediately if anyone is injured,
trapped, or in immediate danger"* — returning `{ "transfer": true }`. Keep it separate
from `report_incident` so the bypass path can't tangle with clustering.

**`firsthand` is the most important field in the system.** It drives independence
weighting and it's the thing no prior project has. Spend a line on it in the agent prompt:
*"Determine whether the caller witnessed this themselves or heard it from someone else.
Ask if unclear."*

### Schema

```sql
create table calls (
  call_id text primary key,          -- Retell's id = idempotency key
  direction text not null, from_number text, to_number text,
  started_at timestamptz default now(), ended_at timestamptz,
  transcript text, lang text, simulated boolean default false
);

create table clusters (
  id uuid primary key default gen_random_uuid(),
  type text not null, lat double precision, lng double precision,
  source_count int default 0, independent_count int default 0,
  confidence real default 0,
  alerted boolean default false,     -- THE LATCH
  alerted_at timestamptz, radius_m int,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table signals (
  id uuid primary key default gen_random_uuid(),
  call_id text references calls(call_id),
  cluster_id uuid references clusters(id),
  type text, street text, lat double precision, lng double precision,
  firsthand boolean, raw_args jsonb,
  created_at timestamptz default now()
);

create table dials (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid references clusters(id),
  to_number text, lang text,
  simulated boolean not null,        -- powers the "would have called" console panel
  retell_call_id text,
  created_at timestamptz default now()
);
```

Enable RLS. Server uses the service-role key; the console gets read-only.
Verify the `x-retell-signature` header on every webhook.

### Endpoint shape

```js
app.post('/fn/report_incident', async (req, reply) => {
  const { call, args } = req.body;
  const loc = locate(args.street);
  const cluster = await findOrCreateCluster(args.incident_type, loc);
  const { count: prior } = await db.from('signals')
    .select('*', { count:'exact', head:true })
    .eq('cluster_id', cluster.id).eq('firsthand', true);

  reply.send({ ok:true, say: responseFor(cluster, prior, args.lang) });  // FAST

  setImmediate(() => persistAndEvaluate(call, args, loc, cluster));      // then work
});
```

Respond **before** persisting or evaluating the threshold. If the fan-out runs before
`reply.send()`, the caller hears dead air while we dial 200 people.

---

## 7. Conventions — do not break these

### Consent allowlist — write this BEFORE any outbound code

```js
const CONSENTED = new Set([ /* our phones + volunteers who said yes */ ]);

function dial(number, vars) {
  if (!CONSENTED.has(number)) return { simulated:true, number, vars };
  return retell.call.createPhoneCall({ to_number:number, ...vars });
}
```

Everything outside the set returns `simulated` and renders on the console as a call
that *would* have been placed. Targeting still ranks all eligible residents; we ring
the four phones on our table. Unsolicited automated calls are regulated under the TCPA
with per-call damages; a bug that dials a stranger at 2 AM ends our weekend and our
Retell account. **It's also a pitch line:** *outbound is allowlisted to consented
numbers — an untargeted autodialer is exactly what we're arguing against.*

Also: an `ALERTS_ENABLED` kill switch on the console, and `MAX_DIALS_PER_CLUSTER = 25`.

### The latch must be atomic

Calls #6, #7, #8 all pass the threshold. Two landing milliseconds apart will both read
`alerted = false` and both fan out. Do it in Postgres:

```sql
update clusters set alerted = true, alerted_at = now()
where id = $1 and alerted = false
returning id;
```

Zero rows back means someone else already fired. **This is the bug that will happen
to you at 3 AM if you skip it.**

### Count independent sources, not calls

```js
const independent = cluster.signals.filter(s => s.firsthand);
const uniqueCallers = new Set(independent.map(s => s.from_number));
if (uniqueCallers.size >= 5) fire(cluster);
```

Five calls from one person, or five people repeating one rumor, is not five sources.

### Other invariants

- **One event bus, two sources.** Real Retell webhooks and the synthetic generator flow
  through *identical* engine code. That's what lets us say "these four are real, these
  two hundred are simulated, same code path" — and judges accept it instantly when
  we're upfront.
- **No I/O in the engine.** `triage(signal, world, now)` — pure in, pure out.
- **Time is injected, never read.** Don't call `Date.now()` inside the engine. This is
  the highest-leverage line in this document: it lets us replay a whole incident in
  200ms for the demo and re-run deterministically after a twist.
- **All tunables in one `config.js`.** 400m radius, 20min window, threshold of 5,
  capacity. When a twist drops, we open one file.
- **Fail open.** If our layer is unreachable, calls pass through to the existing queue.
- **Merge every couple of hours**, even when it's ugly.

---

## 8. Geocoding — the trap to avoid

Signals carry street names, not coordinates. Live geocoding means a Google key, a card,
a rate limit and a network dependency.

**Pre-geocode instead.** Pick a bounded demo area, build a static `streets.json` of
60–100 segments, look up against it:

```js
const STREETS = { "normandie ave": [33.93, -118.30], ... };
function locate(street) { return STREETS[normalize(street)] ?? null; }
```

Twenty minutes, zero API keys, can't fail mid-demo. It also constrains the synthetic
generator to streets that resolve, which we want anyway. **And it's an argument:**
a lookup table works with no network — when the twist says "assume no internet," our
map still renders.

Budget **90 minutes** for the map including the street table. Past two hours, ship a
static background image with absolutely-positioned pins — identical from ten feet away.

---

## 9. Known holes — have these answers ready

### 🔴 1. "If cell networks were down, how does your outbound call reach anyone?"

Our own problem statement says people called 911 *because* networks were down. The answer:

> Voice is the channel that survives. Voice needs a fraction of the bandwidth data does,
> and 911 calls roam to **any** carrier — that's why people could still dial when they
> couldn't load an app. We built on the channel that survives.

Outbound falls back in tiers: **voice → SMS → landline**. SMS is store-and-forward over
the control channel and often gets through congestion that blocks calls. Adding an SMS
tier is ~30 minutes and gives us a real answer.

### 🔴 2. "Your ANSWERABLE lane could tell someone their burning street is safe"

True, and during the January fires zone data was exactly what failed. **Mitigation is
in §3:** never assert safety, only state what's known and when, with a timestamp, plus
*"if you see fire or smoke, don't wait for an order."*

### 🟠 3. "Five people can be wrong together"

Panic propagates. In Las Vegas 2017, 16 "distraction calls" reported shooters at nine
locations — none real. Our answer is the independence weighting: independent means
different callers, different locations, firsthand. Plus a confidence ceiling — above it
alerts fire automatically, below it they queue for human approval.

### 🟠 4. "Does the parallel queue actually save anyone time?"

If every call still queues for a human, we've reduced nothing. **Answer:** calls the
agent fully resolves are removed from the queue. The queue position is a guarantee,
not a commitment.

### 🟠 5. "Who's liable when it's wrong?"

PSAPs have governmental immunity; a private vendor in the call path does not. This is
the real reason this product doesn't exist yet. Don't look surprised — "the human stays
the decision-maker, we're an assist layer" is the start of an answer.

### 🟡 Others

- **ASR fails worst on panicked, accented, elderly and child speech.** We don't know our
  word error rate. Say so, and say uncertainty routes to a human.
- **Callers who don't know the street name** — tourists, people in the dark. No street,
  no cluster.
- **Were those officers actually wasted?** A department might defend welfare checks as
  prudent. Don't claim waste — claim the system had no way to know, and the question
  was answerable.
- **911 call-takers are unionized.** Never say we reduce operators. Say we change what
  they're spent on.

---

## 10. Prior art — know this cold

**DispatchAI** won the UC Berkeley AI Hackathon 2024 grand prize, 1st of 293: Twilio →
Retell → FastAPI → Next.js operator cockpit, severity-coded map pins, human always in
the loop. Our **inbound layer is 60–70% the same product.** Several other teams have
built this archetype at other hackathons.

**What's actually ours:**

1. **The unit of work is the incident, not the call.** They scored each call
   independently — nothing compared call N to call N−1. Our unit is a cluster whose
   confidence rises as independent reports arrive. That's a different data model.
2. **The ANSWERABLE lane.** They routed *every* call to a dispatcher with a brief
   attached. Theirs would have produced a beautiful brief about an empty house and
   still sent the officer.
3. **Outbound doesn't exist in theirs at all.**

**Name it before a judge does:**

> The AI-answers-911 piece has been built before — it won Berkeley's AI hackathon in
> 2024. But every version of it triages one call at a time and hands every call to a
> dispatcher. Ours is the opposite: we compare calls to each other.

**Steal from their postmortem:** the hardest part was stitching many realtime services
into one live loop, and their grand-prize console ran on simple polling. Don't overbuild.

---

## 11. Demo order — this decides whether we look novel

**Wrong (reads as DispatchAI):**
call comes in → classified → appears on map → dispatcher sees brief

**Right (reads as ours):**

1. Seven calls arrive at once — console shows seven live rows
2. They **collapse into one pin** with a confidence number ticking up
3. One caller asks about a relative → agent answers in 15 seconds, **no unit moves**
4. One caller says life-safety words → **transferred mid-sentence**
5. Threshold fires → **four phones on the judges' table ring, in four languages**
6. Console shows 4 real dials and 196 marked `simulated`

The collapse (step 2) and the outbound fire (step 5) are the two moments that cannot be
mistaken for prior art. If they aren't the climax, we built something new and showed
something familiar.

---

## 12. Who owns what

- **Telephony (highest risk).** One inbound call reaching `/fn/report_incident`.
  Nothing else matters until this works. If it isn't working, fall back to the
  transcript simulator and say so on stage.
- **Console.** Start on fake JSON so you're never blocked. Must show: live calls with
  lanes, the human queue, the incident map with confidence and source counts, the
  calls-prevented counter, the language mix, and real-vs-simulated dials.
- **Data + engine.** `streets.json`, the needs↔offers matcher, threshold tuning,
  twist edits overnight.
- **Narrative (full-time from noon Saturday — do not skip).** Script, slides, the four
  numbers, rehearsal, and the **backup recording**.

### Build order

1. One inbound call reaching the function endpoint
2. **Allowlist + `dial()` wrapper** — before any outbound code exists
3. One outbound call to your own phone with dynamic variables
4. Threshold → fan-out, latched (atomic), capped
5. Console

Steps 1 and 3 are the only genuinely risky ones. Everything else is our code.

### Conventions for the room

- **Feature freeze: noon Saturday.** Nothing new after that.
- **Record the backup demo before you need it.**
- Take screenshots of tooling in use as you go — bonus prizes want evidence and nobody
  remembers to capture it at 10 PM.

---

## 13. Lines worth memorizing

- *The fortieth call about a known fire and the first call about an unknown one cost the
  same today. They shouldn't.*
- *Hiring raises the ceiling. We raise the leverage. You can hire over months — a surge
  happens in an hour.*
- *We don't classify how serious a call is. We classify whether we already know what
  you're telling us.*
- *We're not replacing the dispatcher. We're replacing the silence.*
- *The reason you don't want to talk to an AI in an emergency is that you want a person
  who can help you. So do we — that's the point.*
- *Outbound is allowlisted to consented numbers. An untargeted autodialer is exactly
  what we're arguing against.*
- *We'll get this wrong sometimes. The question isn't whether it's perfect — it's which
  direction it fails in. Ours fails toward sending you to a human.*

# HANDOFF — read this first

**If you are an AI assistant:** this file is the full project context. Read it before
writing any code. The architectural rule in §4 is not negotiable — it is what lets us
absorb the live twists the organizers drop overnight.

**If you are a teammate:** paste this whole file into Claude at the start of your
session, then `git pull` and start on your section in §7.

Repo: `USC-Dual-Use` · Event: InnovateLA @ USC Viterbi · Vertical 03, Communication,
partnered with Retell AI · **Deadline: Saturday 10:00 PM.**

---

## 1. The prompt we're answering

> The seat: the overnight supervisor of a call line. A surge of calls and alerts no one
> can fully verify, and too few people to answer them. Residents are your earliest sensor
> and your biggest flood. The blunt move is to alert everyone, or send everything to a
> human who isn't there. How do you tell who needs a person right now? What must never be
> automated? What happens when someone doesn't pick up?

Sponsor framing on the slide: **"In a crisis, call lines flood faster than people can
answer. How do we get the right callers to a human first?"**

Dual-use, as the organizers define it: a tool worth owning on an ordinary day, so it is
already in place when the emergency comes. Not weapons.

---

## 2. The thesis — say this in the first ten seconds

> **An AI call agent's superpower is not answering faster. It is that it can hold two
> hundred conversations at once, which no human organization can do.**

Every other team in this track will build a faster receptionist: answer, classify, route.
That is the obvious use of parallelism and it's worth maybe 20% of what's available.
We are building the things that are *only possible* when you can be in hundreds of
conversations simultaneously:

1. **Collapse the flood into incidents.** Forty calls about one intersection is one
   incident reported forty times, not forty tickets.
2. **Verify by calling the neighbours.** An unconfirmed report triggers 30-second calls
   to people nearby who did *not* report. A human supervisor has one phone; we have two hundred.
3. **Call people before they call us.** The best way to survive a flood of calls is to
   make the calls first. Our headline metric is **calls prevented**, not handle time.
4. **Every language at once.** LA. An overnight bench has maybe two Spanish speakers and
   nobody for Korean, Tagalog or Armenian. The agent has all of them from the first second.

**The product is not "AI answers the phone." The product is: what reaches a human is the
small number of calls that actually need one.**

---

## 3. The design, and why

### Five lanes

| Lane | Meaning |
|---|---|
| `HUMAN_NOW` | A hard-wired bypass fired. Straight to a person. |
| `HUMAN_SOON` | Real need, no immediate danger. Ranked queue. |
| `AGENT_RESOLVED` | Answered from the knowledge base, with source and age. |
| `SENSOR` | A report, not a request. Feeds the incident map. |
| `OFFER` | The caller is a resource, not a need. |

`SENSOR` is what keeps the flood off the human queue. `OFFER` is the one nobody else
will build — in a real crisis a meaningful share of callers are fine and offering
("I'm okay, I have a generator"). Treat them as supply, match them to need.

### The opening of every call

Three sentences, and the third is the whole design:

> "This is the Harbor Area Community Line. I'm an automated assistant and I can put you
> through to a person. **First — is anyone hurt or in immediate danger?**"

The bypass test is asked first so that the fastest path through the system is the one a
person in danger takes. The agent **always** identifies itself as automated.

### What must never be automated

State it as a principle, not a list:

> **The agent never makes a commitment a human has to keep, and never gives advice that
> could get someone killed if it's wrong.**

In practice: it never promises someone is coming. It never says "you're safe." It gives
no medical or evacuation instruction beyond an approved script. It never closes out a
life-safety call.

The bypass signals are a **lookup that runs before any scoring** — not a model decision.
We can point at that code. Current set: `injury, trapped, cant_evacuate,
medical_device_at_risk, violence, child_alone, fire_indoors, crisis`.

### Corroboration weighs independence, not count

Three reports from one number is not corroboration. Fourteen reports from consecutive
numbers, identical phrasing, inside ninety seconds is **one source wearing fourteen hats**.
Our confidence score multiplies caller count by an independence factor. Verified in the
sim: a 14-call hoax scores independence 0.03 → 0.5 effective witnesses → NOT CONFIRMED,
while five genuine flood callers reach 97%.

### Knowledge expires

Every fact the agent may state carries a source and an expiry. When it goes stale the
agent says *"I had information on that but it's no longer current"* and routes to a human,
rather than confidently sending a family to a shelter that closed. This is a complete
answer to the most likely twist in this track — have it ready before they ask.

### When nobody picks up

Every human-approval path has a timeout and a declared fallback. If the queue is empty of
humans, the agent says so honestly rather than stalling. If a callback fails twice, that
person goes on the incident map flagged **unreached**, so a human can find them later.
A system that quietly drops people is worse than one that admits it's overwhelmed.

### Outbound targeting — who do we call

Given a confirmed incident:

1. Everyone within `radiusMetres` of it
2. filtered by registration, cooldown, and "did they already call us"
3. scored by **exposure × vulnerability** — a power outage scores someone with a medical
   device at 150 before anything else, because that's who an outage endangers; a flood
   scores mobility and no-vehicle instead
4. take the top `maxConcurrentCalls`

Everything in that list is config. See §5.

---

## 4. THE ARCHITECTURAL RULE

**Nothing about the world lives in the code.**

If you are about to write a phone number, a street name, a threshold, a radius, or a
number of minutes into `engine.js` or the console — stop. It belongs in `data/world.js`.

This is why: the organizers drop live twists overnight. If our rules are data, a twist is
a one-line edit and we are back on our feet in five minutes. If our rules are `if`
statements, a twist is a rewrite at 2 AM and we lose the night.

**When a twist drops:** 5 minutes to edit `data/world.js` and re-run. Then ~45 minutes to
add the *one* new insight the twist exposed. Then 10 minutes on a slide and a line of
script. Absorbing a twist structurally is table stakes; showing judgment about what it
revealed is what wins the adaptation prize.

---

## 5. Repo layout

    data/world.js    THE WORLD. Residents, knowledge base, policies, call stream, twists.
    engine.js        Pure logic. Extraction, triage, corroboration, targeting.
                     No DOM, no network, no knowledge that twists exist.
    sim.js           Runs a night and prints the full trace. `node sim.js`
    HANDOFF.md       This file.

Config objects you will actually touch:

    OUTBOUND_POLICY   radiusMetres, priorityFlags, maxConcurrentCalls,
                      quietHours, quietHoursMinSeverity, verificationSweepSize
    POLICY            bypassSignals, weights, corroboration, posture
    KNOWLEDGE         each fact: topic, text, source, asOfMin, expiresAfterMin
    RESIDENTS         420 synthetic people: location, language, vulnerability flags,
                      registered. This is the peacetime asset that makes targeting
                      possible — you cannot assemble it during a crisis. That's our
                      dual-use argument.

---

## 6. Current state

**Working, verified by `node sim.js`:**

- Call opening, signal extraction, all five lanes
- Hard-wired bypasses (Spanish caller with a beeping oxygen machine → `HUMAN_NOW`
  before the second question)
- Incident clustering: 18 calls → 5 incidents; flood confirmed at 97% from 5 callers
- Independence weighting: 14-call hoax rejected
- Verification sweeps: picks neighbours who did *not* report, spread across addresses
- Outbound targeting: 88 eligible → 40 called, ranked medical-device-first
- Quiet hours: outage (severity 3) calls out at 1 AM; flooding (severity 2) does not
- Seven twists, all config-only. Capacity cut 40→8 reorders the list correctly.
  Evacuation twist expands 41 → 253 eligible.

**Not built yet:**

- Retell integration (inbound and outbound) — **highest risk, see §7**
- Supervisor console
- Needs ↔ offers matching
- Consent allowlist guard — **must exist before any outbound code, see §8**

Signal extraction is currently a keyword pass. That is deliberate: it makes the
extraction *visible* in the demo. In production an LLM does it from the live transcript.
Say this out loud; don't hide it.

---

## 7. Who owns what

**Telephony (highest risk — start now, before anything else).**
Get a Retell number. Get one inbound call end-to-end: phone rings → agent answers →
transcript reaches `engine.triage()` → lane returned. **This is the 2 AM checkpoint.**
If it isn't working by 2 AM, stop and fall back to the transcript simulator, which
already works. Then outbound (same API, other direction, ~90 min), then the sweep.
**Stakes: our sponsor fit depends on real calls happening** — see §10. The simulator saves
the demo but not the Retell track prize.

**Console.**
Start on fake JSON now so you are never blocked. Full spec in §12 — six panels, one screen,
timeboxed. Working and ugly by midnight.

**Data + engine.**
Shape `RESIDENTS` and `KNOWLEDGE` toward whatever Retell actually gives us. Build the
needs↔offers matcher. Tune the corroboration thresholds. Own the twist edits overnight.

**Narrative (full-time from noon Saturday — do not skip this).**
Script, slides, the three numbers, rehearsal, and the **backup recording**. Before noon,
float as a second pair of hands.

---

## 8. Conventions — do not break these

**Consent allowlist.** Outbound dials only numbers in an explicit consented set. Write
this guard *before* any outbound code:

```js
const CONSENTED = new Set([ /* our phones + volunteers who said yes */ ]);
function dial(number, payload) {
  if (!CONSENTED.has(number)) return { simulated: true, number };
  return retell.createPhoneCall({ to: number, ...payload });
}
```

Everything outside the set returns `simulated` and shows on the console as a call that
*would* have been placed. Targeting still ranks all 88 eligible people; we only ring the
handful who agreed. A bug that dials a stranger at 2 AM ends our weekend. It's also one
good line in the pitch: *"outbound is allowlisted to consented numbers — an untargeted
autodialer is exactly what we're arguing against."*

**One event bus, two sources.** Real Retell webhooks and the synthetic call generator must
flow through *identical* engine code. That's what lets us say "these four calls are real,
these two hundred are simulated, same code path" — and judges accept that instantly when
we're upfront about it.

**Branch and merge often.** Four people building separately and merging at hour 20 is how
teams die. Merge every couple of hours even when it's ugly.

**Feature freeze: noon Saturday.** Nothing new after that. Bug fixes and twist absorption
only.

---

## 9. The demo

1. **Open with the thesis.** Not "we built an AI phone agent."
2. **Three of us call the number simultaneously.** All answered instantly, no hold music,
   different lanes on the console.
3. **The Spanish oxygen caller.** She never says "emergency" — she says her mother uses
   oxygen and the machine is beeping. Straight to a human before the second question.
   Point at the bypass list: *"this is not a model decision, it's a lookup."*
4. **The flood becomes one incident.** Five callers, 97% confidence, one pin on the map.
5. **The sweep.** Five phones ring in the room at once. One of them answers in Spanish.
   Parallel, targeted, multilingual — proven in four seconds with no narration.
6. **Twist live:** outbound capacity 40 → 8. The list reorders; the person on oxygen is
   still called, someone three blocks out is not. *"The same ranking that decides who
   reaches a human decides which eight get warned."*
7. **The hoax.** 14 calls, 14 numbers, NOT CONFIRMED. Counting says real; independence says no.
8. **Barge-in.** Interrupt the agent mid-sentence on a live call. Only a real voice stack
   handles that, and it's fifteen seconds of proof that this isn't a recording.
9. **Name the stack.** *"Inbound and outbound through Retell, N concurrent sessions, four
   languages, live handoff to a human."* Say it. Sponsors notice when you don't.
10. **Tuesday.** Same system, no crisis: an overnight line that answers in every language
   and never leaves anyone on hold. The registry that makes targeting possible is built
   during peacetime — you cannot assemble it in an emergency. That's the dual-use argument.

**Recruit outbound volunteers around 7 PM Saturday**, before everyone is deep in their own
demo. Ask eight people; expect five to have their phone out when it matters. Don't ask
judges for their numbers mid-pitch — let them opt in if they want.

**Everyone in the room on Do Not Disturb except the test numbers**, or the sweep rings
someone mid-pitch.

**Record a full screen-and-audio capture of the working flow by Saturday afternoon** and
keep it open in a tab. Live telephony demos fail — venue wifi, carrier, rate limits, a
phone on silent. If it breaks: "let me show you the recording while this reconnects," and
keep moving. Also check Saturday morning whether Retell throttles concurrent outbound on
our tier; if it caps at three, we need to know then, not at the podium.

---

## 10. Sponsor fit — Retell AI

Retell sells a developer platform for building AI voice agents that make and take phone
calls. We fit them well, but there is one risk to manage actively.

**Why we fit.** We use both directions — most teams in this track will build inbound only,
and outbound sweeps are the half of their product that gets demoed less and sells for more.
Our thesis (*two hundred conversations at once*) is the exact capability their platform
exists to provide. And we are the orchestration layer *above* the voice agent, not a rival
voice stack — a comfortable place to sit.

**The risk: most of our novelty is not voice-specific.** The corroboration engine, the
independence weighting and the targeting would all work identically over SMS or a web form.
A Retell judge could reasonably think *"nice backend, but you barely used our product."*

Three cheap fixes, and all three are non-optional:

1. **Make the voice layer visibly load-bearing.** Live calls, concurrent, multilingual —
   and let someone **interrupt the agent mid-sentence** to show barge-in. Those are things
   only a real voice stack does.
2. **Say what we used, explicitly.** One line in the pitch: *"inbound and outbound through
   Retell, N concurrent sessions, four languages, live handoff to a human."* Sponsors want
   to know their thing was actually in the loop and most teams forget to tell them.
3. **Get telephony working for real.** If we fall back to the transcript simulator, the
   engine still stands but our sponsor fit collapses — it becomes a backend demo at a voice
   AI track. This is the strongest reason to treat the 2 AM checkpoint in §7 as hard.

**Framing.** We spend real time on what must never be automated. Do not let that land as
"AI shouldn't do this." Frame it as what makes voice agents **deployable in high-stakes
settings at all**: a city will only put this on a public line because the boundaries are
explicit, auditable and hard-coded rather than left to a model. That is a selling point for
them, not a caveat.

**Tonight:** find the Retell mentor, describe the build in two sentences, and ask what they
want to see. They will usually say exactly what impresses them — and sometimes hand over
API credits or a provisioned number, which is the thing standing between us and §7.

---

## 11. Integration shape — the seams to build against

Roughly 80% of what exists is unchanged by going live: lanes, bypass list, corroboration,
independence weighting, targeting ranks, knowledge expiry. Those are channel-agnostic and
that is a feature. What changes is the **edges** — how text gets in, how actions get out,
and how we hold state across a live call. Build against these seams rather than improvising.

**The conversation lives in Retell, not in our engine.** Configure a Retell agent whose
prompt is our intake script, and expose our triage as a function it calls mid-conversation.
Lower latency than running our own LLM over raw audio, and it keeps the engine a pure
decision service.

    caller ──► Retell agent (voice, LLM, turn-taking)
                  │  calls our webhook mid-conversation
                  ▼
              engine.triage()  ──► lane + action
                  │
                  ├─ HUMAN_NOW → tell Retell to transfer
                  └─ else      → text for the agent to say

**Bypass must fire on partial transcript.** `triage()` currently takes a complete utterance.
Real calls stream, and a bypass that waits for the turn to end is not a bypass. Split it:

```js
checkBypass(partialText)   // every transcript chunk, cheap, keyword-only
classify(fullUtterance)    // once the turn completes
```

"my husband is bleeding" should transfer while she is still speaking.

**`HUMAN_NOW` is an action, not a label.** It means a warm transfer: Retell bridges the
supervisor and we pass context so the human does not start from zero. Engine output grows:

```js
{ lane, transferTo, briefForHuman }
```

**Targeting emits call payloads, not phone numbers.** `targetOutbound` should return
something that goes straight to the outbound API, with per-recipient variables — this is
what makes the multilingual sweep work, because language flows from the resident record
into the call:

```js
{ to: "+1310...", agent: "outbound_notify",
  vars: { lang:"es", incident:"power outage", street:"Normandie Ave",
          message:"...", severity:3 } }
```

**Two things we do not have at all:** a webhook server (there is none — scaffold it first),
and session state keyed by call id (transcript so far, lane, transferred, outcome). Session
state is also what feeds the console's concurrent-sessions counter, which is the number that
proves the parallelism claim.

---

## 12. The console

**It is not a feature, it is the proof.** A phone call is audio — judges cannot see
parallelism, cannot see forty calls collapsing into one incident, cannot see why a
particular person was called first. The console is the only surface that makes the
invisible half of this system visible. Without it the demo is people talking into phones
while someone narrates.

**Six panels. One screen. No scrolling during the demo.**

| Panel | What it proves |
|---|---|
| **Live calls** — one row per active session, with its lane | Parallelism. Four rows at once is the whole thesis. |
| **Human queue** — short, ranked, with the bypass reason | That almost nothing reaches a human. |
| **Incident map** — pins with confidence % and caller count | The flood became a sensor. |
| **Calls prevented** — one big number | Our headline metric. Nobody else will have it. |
| **Language mix** — agent languages vs human bench | The "Build for LA" slide. |
| **Outbound sweep** — ranked list, reason per person, rationed-out count | Targeting, and the capacity twist. |

**Build rules.** Start on fake JSON tonight so you are never blocked on telephony. Dark,
high contrast, large numerals — it is going on a projector in a bright room, and anything
below ~18px is invisible from row three. It must update live; a page you refresh manually
breaks the illusion that this is a running system. Everything it renders comes from engine
output, never from its own copy of the rules (see §4).

**Cut, explicitly:** historical analytics, filters, search, settings, auth, per-call
drill-down beyond a tooltip, any chart over time. The console is a demo surface, not a
product.

**Timebox it.** This is where teams quietly lose four hours to CSS. Working and ugly by
midnight, pretty by 10 AM, frozen at noon.

---

## 13. Say these out loud — don't hide them

- Retell handles telephony, speech and turn-taking. We are the brain above it.
- Signal extraction is a keyword pass here so you can see it happen; production uses an LLM.
- Residents, knowledge base and call stream are synthetic. Outbound is allowlisted.
- Consequence and severity figures are a transparent model, not observed data.
- To run this for real you would need a resident registry with consented vulnerability
  flags — which is a peacetime product, not a crisis one.

Clean edges read as maturity. Teams that overclaim get taken apart in Q&A.

---

## 14. Checkpoints

| When | What |
|---|---|
| Tonight | Retell number secured. Repo cloned, `node sim.js` runs for everyone. |
| **2:00 AM** | **One real inbound call end-to-end. If not: fall back to the simulator.** |
| 5–9 AM | Two people sleep. Stagger it. |
| **12:00 PM Sat** | **Feature freeze.** |
| 12–4 PM | Demo script, slides, rehearse aloud 3×, record the backup video. |
| 4–8 PM | Bug fixes and twist absorption only. |
| 8–10 PM | Final rehearsal. **Submit early** — never at the deadline. |

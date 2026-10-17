#!/usr/bin/env bash
# ------------------------------------------------------------------
# USC-Dual-Use — project skeleton for InnovateLA, Communication track.
# Run this from inside your clone of the repo:
#     bash setup-line.sh
# It writes the files, commits them to a branch, and pushes.
# ------------------------------------------------------------------
set -euo pipefail

if [ ! -d .git ]; then
  echo "Not a git repo. cd into your USC-Dual-Use clone first." >&2
  exit 1
fi

BRANCH="skeleton/the-line"
git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"
mkdir -p data

echo "  writing HANDOFF.md"
cat > "HANDOFF.md" <<'EOF_HANDOFF_MD'
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
EOF_HANDOFF_MD

echo "  writing engine.js"
cat > "engine.js" <<'EOF_ENGINE_JS'
/* ============================================================
   THE LINE — triage + corroboration + outbound targeting.
   Pure logic. Knows nothing about any twist.
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------- signal extraction -------------------------------
     In production Retell streams the transcript and an LLM pulls
     these out. Here a keyword pass does it, so the extraction is
     visible rather than hidden inside a model.                   */
  var LEX = {
    injury:               ["bleeding","fell","hurt","injured","unconscious","broke his","broke her"],
    trapped:              ["trapped","stuck","can't get out","cant get out","pinned"],
    cant_evacuate:        ["can't get down","cant get down","stairs","wheelchair","can't walk","bedbound","elevator"],
    medical_device_at_risk:["oxygen","oxígeno","oxigeno","dialysis","ventilator","cpap","máquina","maquina"],
    fire_indoors:         ["smell gas","i smell gas","smoke in my","smoke inside","fire in my",
                           "fire inside","building is on fire","my house is on fire"],
    fire_report:          ["there's a fire","theres a fire","fire at","smoke coming from","burning"],
    violence:             ["gun","shooting","attacking","assault","threatening me"],
    child_alone:          ["child alone","kids are alone","my kid is alone","children alone"],
    crisis:               ["kill myself","hurt myself","end it"],
    power:                ["power","lights are out","lights out","outage","luz","전기","no hay luz"],
    flood:                ["water coming","flooding","storm drain","water's over","water is over",
                           "물이","tubig","agua en la calle","water's up","foot now","deeper"],
    shelter:              ["shelter","albergue"],
    roads:                ["110","road","freeway","closed"],
    water_supply:         ["get water","where can i get water","bottled water","store's closed"],
    offer:                ["i have a","i've got a","ive got a","if anyone needs","generator","pickup truck",
                           "needs a hand","happy to help"],
    self_ok:              ["i'm fine","im fine","i'm ok","we're fine","just want to report","just wondering"]
  };

  var STREETS = ["Eubank Ave","Lomita Blvd","Normandie Ave","Figueroa St","Anaheim St",
                 "Pacific Ave","Gaffey St","Western Ave","Denni St","Walnut St"];

  function extract(text) {
    var t = (text || "").toLowerCase();
    var sig = {};
    Object.keys(LEX).forEach(function (k) {
      if (LEX[k].some(function (w) { return t.indexOf(w) >= 0; })) sig[k] = true;
    });
    var places = STREETS.filter(function (s) {
      return t.indexOf(s.toLowerCase()) >= 0 || t.indexOf(s.split(" ")[0].toLowerCase()) >= 0;
    });
    return { signals: Object.keys(sig), places: places };
  }

  /* ---------- category --------------------------------------- */
  function categorise(sig) {
    if (sig.indexOf("fire_indoors") >= 0) return "hazmat";
    if (sig.indexOf("fire_report") >= 0) return "fire";
    if (sig.indexOf("flood") >= 0) return "flood";
    if (sig.indexOf("power") >= 0 || sig.indexOf("medical_device_at_risk") >= 0) return "power";
    if (sig.indexOf("shelter") >= 0) return "shelter";
    if (sig.indexOf("water_supply") >= 0) return "water";
    if (sig.indexOf("roads") >= 0) return "roads";
    return "other";
  }

  /* ---------- THE OPENING ------------------------------------
     Fixed, short, interruptible. The first question is the
     bypass test, so the fastest path through the system is the
     one a person in danger takes.                               */
  function opener(line) {
    return [
      "This is the " + line.name + ".",
      "I'm an automated assistant and I can put you through to a person.",
      "First — is anyone hurt or in immediate danger?"
    ].join(" ");
  }

  function followUp(sig, places) {
    if (!places.length) return "Thanks. What cross street are you near?";
    if (sig.indexOf("offer") >= 0) return "That's useful — can I take down what you have and where?";
    if (sig.indexOf("self_ok") >= 0) return "Got it, logging that. Anything you need yourself?";
    return "Thanks. Is this something you need help with, or are you reporting what you're seeing?";
  }

  /* ---------- knowledge, with expiry -------------------------- */
  function lookup(knowledge, topic, nowMin) {
    var hits = knowledge.filter(function (k) {
      if (k.topic !== topic || k.retracted) return false;
      return (nowMin - k.asOfMin) <= k.expiresAfterMin;
    });
    if (hits.length) {
      var k = hits[0];
      return { text: k.text, source: k.source, ageMin: Math.round(nowMin - k.asOfMin) };
    }
    var stale = knowledge.filter(function (k) { return k.topic === topic; });
    return stale.length
      ? { stale: true, text: "I had information on that but it's no longer current, so I'm not going to repeat it. I'm flagging this for a person." }
      : null;
  }

  /* ---------- triage ------------------------------------------ */
  function triage(call, world, nowMin) {
    var ex = extract(call.say);
    var sig = ex.signals;
    var bypass = world.policy.bypassSignals.filter(function (b) { return sig.indexOf(b) >= 0; });

    if (bypass.length) {
      return { lane: "HUMAN_NOW", why: bypass, category: categorise(sig),
               signals: sig, places: ex.places,
               agentSays: "I'm putting you through to a person right now. Stay on the line with me." };
    }

    if (sig.indexOf("offer") >= 0) {
      return { lane: "OFFER", why: ["offer"], category: "resource", signals: sig, places: ex.places,
               agentSays: "Noted — I'll match that to someone nearby who needs it and call you back." };
    }

    var cat = categorise(sig);
    var k = lookup(world.knowledge, cat, nowMin);
    if (k && !k.stale && sig.indexOf("self_ok") < 0 &&
        ["shelter","water","roads","power"].indexOf(cat) >= 0) {
      return { lane: "AGENT_RESOLVED", why: ["answerable"], category: cat, signals: sig, places: ex.places,
               agentSays: k.text + " (" + k.source + ", " + k.ageMin + " min ago.)" };
    }
    if (k && k.stale) {
      return { lane: "HUMAN_SOON", why: ["stale_information"], category: cat, signals: sig, places: ex.places,
               agentSays: k.text, score: 30 };
    }

    // a report of a hazard with no personal need is a sensor reading,
    // not a ticket. This is what keeps the flood off the human queue.
    if (sig.indexOf("self_ok") >= 0 || sig.indexOf("flood") >= 0 ||
        sig.indexOf("fire_report") >= 0) {
      return { lane: "SENSOR", why: ["report_only"], category: cat, signals: sig, places: ex.places,
               agentSays: "Thank you — that's logged and it helps. I'll tell you if anything changes near you." };
    }

    var w = world.policy.weights, score = 10;
    if (sig.indexOf("cant_evacuate") >= 0) score += w.vulnerable;
    if (sig.indexOf("medical_device_at_risk") >= 0) score += w.no_power_medical;
    return { lane: "HUMAN_SOON", why: ["needs_person"], category: cat, signals: sig, places: ex.places,
             score: score,
             agentSays: "I can't resolve that myself. You're in the queue for a person — I'll stay with you." };
  }

  /* ---------- corroboration ----------------------------------
     Forty calls about one thing is one incident, not forty
     tickets. Confidence comes from INDEPENDENCE, not count.     */
  function recentre(inc) {
    inc.centre = {
      x: inc.events.reduce(function (a, e) { return a + e.x; }, 0) / inc.events.length,
      y: inc.events.reduce(function (a, e) { return a + e.y; }, 0) / inc.events.length
    };
  }

  function cluster(events, cfg) {
    var incidents = [];
    events.forEach(function (e) {
      if (["flood","power","hazmat","fire"].indexOf(e.category) < 0) return;
      var hit = incidents.find(function (i) {
        return i.category === e.category &&
               Math.abs(i.lastAt - e.at) <= cfg.windowSec &&
               distance(i.centre, e) <= cfg.cellMetres;
      });
      if (hit) { hit.events.push(e); hit.lastAt = e.at; recentre(hit); }
      else {
        var inc = { id: "INC-" + (incidents.length + 1), category: e.category,
                    place: e.place, firstAt: e.at, lastAt: e.at, events: [e] };
        recentre(inc); incidents.push(inc);
      }
    });

    incidents.forEach(function (inc) {
      var phones = {}; inc.events.forEach(function (e) { phones[e.from] = 1; });
      var distinct = Object.keys(phones);
      inc.reports = inc.events.length;
      inc.distinctCallers = distinct.length;

      // independence: consecutive numbers, identical phrasing and a tiny
      // time spread are the signature of one source, not many witnesses.
      var nums = distinct.map(function (p) { return parseInt(p.slice(-4), 10); }).sort(function (a,b){return a-b;});
      var consecutive = 0;
      for (var i = 1; i < nums.length; i++) if (nums[i] - nums[i-1] <= 2) consecutive++;
      var spread = inc.lastAt - inc.firstAt;
      var texts = {}; inc.events.forEach(function (e) { texts[(e.say||"").toLowerCase().trim()] = 1; });
      var distinctTexts = Object.keys(texts).length;

      var independence = 1;
      if (distinct.length > 2 && consecutive / distinct.length > 0.5) independence *= 0.25;
      if (distinct.length > 3 && spread < 3) independence *= 0.4;
      if (distinct.length > 3 && distinctTexts <= 2) independence *= 0.35;
      inc.independence = independence;

      var effective = inc.distinctCallers * independence;
      inc.effectiveWitnesses = Math.round(effective * 10) / 10;
      inc.confidence = Math.min(0.97, effective / (cfg.minIndependentCallers + 1));
      inc.confirmed = effective >= cfg.minIndependentCallers;
      inc.needsVerification = !inc.confirmed && inc.reports >= 2;
      // severity decides whether we are willing to wake people at 1am
      inc.severity = (inc.category === "hazmat") ? 3
                   : (inc.category === "power")  ? 3     // outages strand medical devices
                   : (inc.category === "fire")   ? 3
                   : 2;
    });
    return incidents;
  }

  /* ---------- WHO DO WE CALL ---------------------------------
     The targeting function. Everything it uses is config.       */
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function exposureBonus(category, r) {
    if (category === "power" && r.flags.indexOf("medical_device") >= 0) return 150;
    if (category === "flood" && (r.flags.indexOf("mobility") >= 0 || r.flags.indexOf("no_vehicle") >= 0)) return 70;
    if (category === "hazmat") return 60;
    return 0;
  }

  function targetOutbound(incident, world, state, nowMin, hourOfDay) {
    var p = world.outbound, centre = incident.centre;
    var quiet = hourOfDay >= p.quietHours[0] || hourOfDay < p.quietHours[1];
    if (quiet && incident.severity < p.quietHoursMinSeverity) {
      return { skipped: "quiet hours — severity " + incident.severity +
               " is below the threshold of " + p.quietHoursMinSeverity, selected: [], rationedOut: 0 };
    }

    var pool = world.residents.filter(function (r) {
      if (distance(r, centre) > p.radiusMetres) return false;
      if (p.requireRegistered && !r.registered) return false;
      if (p.skipIfAlreadyCalledUs && state.calledUs[r.phone]) return false;
      if (state.lastContacted[r.phone] != null &&
          nowMin - state.lastContacted[r.phone] < p.perPersonCooldownMin) return false;
      return true;
    });

    pool.forEach(function (r) {
      var s = exposureBonus(incident.category, r);
      r.flags.forEach(function (f) { s += (p.priorityFlags[f] || 0); });
      s += Math.max(0, 40 - distance(r, centre) / 20);   // nearer matters, mildly
      r._score = Math.round(s);
    });
    pool.sort(function (a, b) { return b._score - a._score; });

    var selected = pool.slice(0, p.maxConcurrentCalls);
    return { selected: selected, rationedOut: pool.length - selected.length, pool: pool.length, quiet: quiet };
  }

  function verificationSweep(incident, world, state) {
    var p = world.outbound;
    var reporters = {}; incident.events.forEach(function (e) { reporters[e.from] = 1; });
    var near = world.residents.filter(function (r) {
      return distance(r, incident.centre) <= p.verificationRadiusMetres && !reporters[r.phone];
    });
    // spread across different addresses so we are not asking one household
    var seen = {}, picked = [];
    near.forEach(function (r) {
      if (picked.length >= p.verificationSweepSize) return;
      if (seen[r.street] && picked.length < p.verificationSweepSize - 1) return;
      seen[r.street] = 1; picked.push(r);
    });
    return picked;
  }

  /* ---------- twists ------------------------------------------ */
  function applyTwist(base, twist) {
    var w = JSON.parse(JSON.stringify(base));
    (twist.edits || []).forEach(function (e) {
      if (e.type === "outbound") Object.assign(w.outbound, e.set);
      else if (e.type === "line") Object.assign(w.line, e.set);
      else if (e.type === "policy") Object.assign(w.policy, e.set);
      else if (e.type === "knowledge") {
        var k = w.knowledge.find(function (x) { return x.id === e.id; });
        if (k) Object.assign(k, e.set);
      } else if (e.type === "injectHoax") {
        for (var i = 0; i < e.count; i++) {
          w.calls.push({ t: e.at + i * 0.1, from: "+1310555" + (9100 + i), lang: "en",
                         say: "There's a fire at Gaffey and Anaheim." });
        }
        w.calls.sort(function (a, b) { return a.t - b.t; });
      } else if (e.type === "multiplyCalls") {
        var orig = w.calls.slice(), extra = [];
        for (var f = 1; f < e.factor; f++) {
          orig.forEach(function (c, j) {
            extra.push({ t: c.t + f * 0.7 + j * 0.05, from: "+1310556" + String(1000 + f * 100 + j).slice(-4),
                         lang: c.lang, say: c.say });
          });
        }
        w.calls = w.calls.concat(extra).sort(function (a, b) { return a.t - b.t; });
      }
    });
    return w;
  }

  root.Line = { extract, categorise, opener, followUp, lookup, triage, cluster,
                targetOutbound, verificationSweep, applyTwist, distance, STREETS };
})(typeof window !== "undefined" ? window : globalThis);
EOF_ENGINE_JS

echo "  writing sim.js"
cat > "sim.js" <<'EOF_SIM_JS'
global.window = {};
require('/home/claude/line/data/world.js');
require('/home/claude/line/engine.js');
const W = global.window, L = W.Line;

function baseWorld() {
  return {
    line: JSON.parse(JSON.stringify(W.LINE)),
    knowledge: JSON.parse(JSON.stringify(W.KNOWLEDGE)),
    residents: JSON.parse(JSON.stringify(W.RESIDENTS)),
    outbound: JSON.parse(JSON.stringify(W.OUTBOUND_POLICY)),
    policy: JSON.parse(JSON.stringify(W.POLICY)),
    calls: JSON.parse(JSON.stringify(W.CALLS))
  };
}

function resolveCaller(world, call, places) {
  let r = world.residents.find(x => x.phone === call.from);
  if (r) return r;
  const street = places[0] || "Lomita Blvd";
  const pool = world.residents.filter(x => x.street === street);
  return pool.length ? pool[0] : world.residents[0];
}

function run(world, opts = {}) {
  const state = { calledUs: {}, lastContacted: {} };
  const log = [], events = [], queue = [], offers = [], resolved = [];

  world.calls.forEach(call => {
    const now = call.t;
    state.calledUs[call.from] = true;
    const t = L.triage(call, world, now / 60);   // call clock is seconds; knowledge ages in minutes
    const caller = resolveCaller(world, call, t.places);
    const place = t.places[0] || caller.street;
    const geo = W.STREET_CENTRES[place] || { x: caller.x, y: caller.y };
    const rec = { ...t, call, caller, at: now, from: call.from, say: call.say,
                  place, category: t.category, x: geo.x, y: geo.y };
    log.push(rec);
    if (["flood","power","hazmat","fire"].includes(t.category)) events.push(rec);
    if (t.lane === "HUMAN_NOW" || t.lane === "HUMAN_SOON") queue.push(rec);
    if (t.lane === "OFFER") offers.push(rec);
    if (t.lane === "AGENT_RESOLVED" || t.lane === "SENSOR") resolved.push(rec);
  });

  const incidents = L.cluster(events, world.policy.corroboration);
  return { log, queue, offers, resolved, incidents, state };
}

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const hr = c => console.log(c.repeat(78));

/* ============ 1. HOW A CALL OPENS ============ */
const world = baseWorld();
const res = run(world);

console.log("\n");
hr("=");
console.log("  HOW A CALL OPENS — four callers, same first eleven seconds");
hr("=");

const showcase = ["+13105551044", "+13105551207", "+13105551081", "+13105551377"];
showcase.forEach(p => {
  const r = res.log.find(x => x.from === p);
  if (!r) return;
  console.log("\n" + "-".repeat(78));
  console.log("  t+" + r.at + "s   " + r.from + "   lang=" + r.call.lang +
              "   " + (r.caller ? r.caller.street : "?"));
  console.log("-".repeat(78));
  console.log("  AGENT   " + L.opener(world.line));
  console.log("  CALLER  " + r.say);
  console.log("  [extract] signals: " + (r.signals.join(", ") || "none") +
              "  |  place: " + (r.places[0] || "unstated") +
              "  |  category: " + r.category);
  if (r.lane !== "HUMAN_NOW") console.log("  AGENT   " + L.followUp(r.signals, r.places));
  console.log("  >> LANE: " + r.lane + "   (" + r.why.join(", ") + ")" +
              (r.score ? "  score " + r.score : ""));
  console.log("  AGENT   " + r.agentSays);
});

/* ============ 2. WHAT THE NIGHT PRODUCED ============ */
console.log("\n");
hr("=");
console.log("  18 CALLS IN  →  WHAT CAME OUT");
hr("=");
const lanes = {};
res.log.forEach(r => lanes[r.lane] = (lanes[r.lane] || 0) + 1);
Object.entries(lanes).forEach(([k, v]) => console.log("  " + pad(k, 18) + v));
console.log("\n  reached a human: " + res.queue.length + " of " + res.log.length +
            "   (" + Math.round(100 * res.queue.length / res.log.length) + "%)");
console.log("  human minutes needed: " + res.queue.length * world.line.humanMinutesPerCall +
            "   available: " + world.line.humansOnShift * 60);

console.log("\n  THE QUEUE (what the supervisor actually sees):");
res.queue.sort((a, b) => (b.lane === "HUMAN_NOW") - (a.lane === "HUMAN_NOW") || (b.score || 0) - (a.score || 0))
  .forEach((r, i) => console.log("   " + (i + 1) + ". " + pad(r.lane, 11) +
    pad(r.from, 14) + pad(r.why.join("/"), 24) + r.say.slice(0, 30)));

/* ============ 3. THE FLOOD BECOMES A SENSOR ============ */
console.log("\n");
hr("=");
console.log("  CALLS COLLAPSED INTO INCIDENTS");
hr("=");
res.incidents.forEach(inc => {
  console.log("\n  " + inc.id + "  " + inc.category.toUpperCase() + " near " + inc.place);
  console.log("    " + inc.reports + " reports from " + inc.distinctCallers + " distinct callers" +
              "   independence " + inc.independence.toFixed(2) +
              "   effective witnesses " + inc.effectiveWitnesses);
  console.log("    confidence " + (inc.confidence * 100).toFixed(0) + "%   " +
              (inc.confirmed ? "CONFIRMED" : inc.needsVerification ? "NEEDS VERIFICATION" : "single report"));
  if (inc.needsVerification) {
    const sweep = L.verificationSweep(inc, world, res.state);
    console.log("    → verification sweep: calling " + sweep.length + " neighbours who did NOT report:");
    sweep.forEach(r => console.log("        " + r.phone + "  " + pad(r.street, 16) + "lang=" + r.lang));
  }
});

/* ============ 4. WHO DO WE CALL ============ */
console.log("\n");
hr("=");
console.log("  OUTBOUND TARGETING — who gets called, and why");
hr("=");
const power = res.incidents.find(i => i.category === "power") || res.incidents[0];
const tgt = L.targetOutbound(power, world, res.state, 140, 1);
console.log("\n  Incident: " + power.id + " (" + power.category + ") near " + power.place);
console.log("  Policy: " + world.outbound.radiusMetres + "m radius, registered only, " +
            world.outbound.maxConcurrentCalls + " lines, skip people who already called us");
if (tgt.skipped) console.log("  >> NOT CALLING: " + tgt.skipped);
else console.log("  In radius and eligible: " + tgt.pool + "   selected: " + tgt.selected.length +
            "   rationed out: " + tgt.rationedOut);
console.log("\n  Top of the call list:");
tgt.selected.slice(0, 10).forEach((r, i) =>
  console.log("   " + pad(i + 1, 3) + pad(r.phone, 14) + pad(r.street, 15) +
              pad("lang=" + r.lang, 9) + pad("score " + r._score, 11) +
              (r.flags.join(",") || "no flags")));
console.log("\n  Calls prevented (people informed before they dialled): ~" + tgt.selected.length);

const flood = res.incidents.filter(i => i.category === "flood").sort((a,b)=>b.reports-a.reports)[0];
if (flood) {
  const ft = L.targetOutbound(flood, world, res.state, 140, 1);
  console.log("\n  Same policy, different incident — " + flood.id + " (flood, severity " + flood.severity + "):");
  console.log("  >> " + (ft.skipped ? "NOT CALLING: " + ft.skipped
                                    : "calling " + ft.selected.length + " of " + ft.pool + " eligible"));
}

/* ============ 5. TWISTS ============ */
console.log("\n");
hr("=");
console.log("  TWISTS — each one edits the world file, never the engine");
hr("=");
W.TWISTS.slice(1).forEach(tw => {
  const w2 = L.applyTwist(baseWorld(), tw);
  const r2 = run(w2);
  const inc2 = r2.incidents.find(i => i.category === "power") || r2.incidents[0];
  if (inc2) inc2.centre = inc2.centre || { x: 0, y: 0 };
  const t2 = inc2 ? L.targetOutbound(inc2, w2, r2.state, 140, 1) : { selected: [], rationedOut: 0, pool: 0 };
  const q2 = r2.queue.length;
  console.log("\n  " + tw.label);
  console.log("    queue to humans: " + q2 + "   incidents: " + r2.incidents.length +
              "   outbound eligible: " + t2.pool + "  called: " + t2.selected.length +
              "  rationed out: " + t2.rationedOut + (t2.skipped ? "  [" + t2.skipped + "]" : ""));
  if (tw.id === "hoax") {
    const fire = r2.incidents.find(i => i.category === "hazmat" || i.category === "fire");
    r2.incidents.forEach(i => {
      if (i.reports >= 8) console.log("    " + i.id + ": " + i.reports + " reports, " +
        i.distinctCallers + " callers, independence " + i.independence.toFixed(2) +
        " → effective " + i.effectiveWitnesses + " → " + (i.confirmed ? "CONFIRMED" : "NOT CONFIRMED"));
    });
  }
  if (tw.id === "shelter-closed") {
    const s = r2.log.find(x => x.category === "shelter");
    if (s) console.log("    shelter caller now: " + s.lane + " — \"" + s.agentSays.slice(0, 90) + "\"");
  }
});
console.log("\n");
EOF_SIM_JS

echo "  writing data/world.js"
cat > "data/world.js" <<'EOF_DATA_WORLD_JS'
/* ============================================================
   THE WORLD — overnight information line, Harbor Area, LA.
   Edit this file to absorb a twist. Never the engine.
   ============================================================ */

window.LINE = {
  name: "Harbor Area Community Line",
  humansOnShift: 2,            // overnight supervisors
  humanMinutesPerCall: 6,
  agentConcurrency: 200,       // the agent's real superpower
  clockStart: "01:12"
};

/* ---- What the agent is ALLOWED to say. Every fact has a source
   and an expiry. An expired fact is not repeated confidently. ---- */
window.KNOWLEDGE = [
  { id:"shelter-banning", topic:"shelter", text:"Banning Park Recreation Center at 1331 Eubank Ave is open as a shelter.",
    source:"City EOC", asOfMin:-40, expiresAfterMin:120 },
  { id:"water-dist", topic:"water", text:"Bottled water is being distributed at Wilmington Rec Center until 6am.",
    source:"City EOC", asOfMin:-25, expiresAfterMin:120 },
  { id:"outage-eta", topic:"power", text:"Crews are working the Harbor City outage. No restoration time has been confirmed.",
    source:"LADWP feed", asOfMin:-12, expiresAfterMin:45 },
  { id:"road-110", topic:"roads", text:"The 110 southbound is closed at Pacific Coast Highway.",
    source:"Caltrans", asOfMin:-55, expiresAfterMin:90 }
];

/* ---- Who we can call, and what we know about them.
   This is the registry that makes outbound targeting possible.
   Built during peacetime — you cannot assemble it in a crisis. ---- */
window.RESIDENTS = (function () {
  // deterministic pseudo-random so the demo is identical every run
  let s = 20261016;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = a => a[Math.floor(rnd() * a.length)];

  // each street is a real place with a centre, so geography means something
  const streets = [
    { name:"Eubank Ave",    cx: 400, cy: 400 },
    { name:"Lomita Blvd",   cx:1200, cy: 500 },
    { name:"Normandie Ave", cx:1350, cy: 700 },
    { name:"Figueroa St",   cx: 700, cy:1200 },
    { name:"Anaheim St",    cx:1900, cy: 900 },
    { name:"Pacific Ave",   cx: 300, cy:1500 },
    { name:"Gaffey St",     cx:2100, cy:1500 },
    { name:"Western Ave",   cx:1600, cy:1600 },
    { name:"Denni St",      cx: 900, cy: 800 },
    { name:"Walnut St",     cx:1800, cy: 300 }
  ];
  window.STREET_CENTRES = {};
  streets.forEach(function (st) { window.STREET_CENTRES[st.name] = { x: st.cx, y: st.cy }; });
  const langs = ["en","en","en","en","es","es","es","ko","tl","zh"];
  const out = [];
  for (let i = 0; i < 420; i++) {
    // metres east / north of an arbitrary origin near Harbor City
    const st = pick(streets);
    const x = Math.round(st.cx + (rnd() - 0.5) * 320);
    const y = Math.round(st.cy + (rnd() - 0.5) * 320);
    const flags = [];
    if (rnd() < 0.04) flags.push("medical_device");   // oxygen concentrator, dialysis, CPAP
    if (rnd() < 0.07) flags.push("mobility");
    if (rnd() < 0.18) flags.push("lives_alone");
    if (rnd() < 0.21) flags.push("no_vehicle");
    if (rnd() < 0.11) flags.push("over_75");
    out.push({
      id: "R" + (1000 + i),
      phone: "+1310555" + String(1000 + i).padStart(4, "0"),
      street: st.name,
      x, y,
      lang: pick(langs),
      flags,
      registered: rnd() < 0.72          // opted in to outbound notification
    });
  }
  return out;
})();

/* ---- Outbound targeting policy. A twist edits THIS. ---- */
window.OUTBOUND_POLICY = {
  radiusMetres: 600,
  // who gets called first inside the radius
  priorityFlags: { medical_device: 100, mobility: 45, over_75: 30, lives_alone: 25, no_vehicle: 20 },
  skipIfAlreadyCalledUs: true,     // if they called, they already know
  requireRegistered: true,         // only people who opted in
  maxConcurrentCalls: 40,          // lines available for outbound
  perPersonCooldownMin: 60,
  quietHours: [22, 7],
  quietHoursMinSeverity: 3,        // wake people only for severity 3+
  verificationSweepSize: 5,        // how many neighbours to ask to confirm a report
  verificationRadiusMetres: 250
};

/* ---- Triage policy: the lanes and the hard-wired bypasses. ---- */
window.POLICY = {
  // These fire BEFORE any scoring. Not a model decision — a lookup.
  bypassSignals: ["injury","trapped","cant_evacuate","medical_device_at_risk",
                  "violence","child_alone","fire_indoors","crisis"],
  // ranking weights for everyone who did not bypass
  weights: { vulnerable: 40, isolated: 25, no_power_medical: 60, elderly: 20, repeat_caller: 15 },
  corroboration: { windowSec: 120, cellMetres: 700, minIndependentCallers: 3 },
  posture: "elevated"             // routine | elevated | surge
};

/* ---- The night. Each call carries what the caller actually says.
   In production Retell + an LLM extract the signals; here a keyword
   pass does it, so you can see the extraction happen.          ---- */
window.CALLS = [
  { t:0,  from:"+13105551207", lang:"en", say:"Hi, um, the power's been out on Eubank for like two hours, is there an estimate?" },
  { t:12, from:"+13105551044", lang:"es", say:"No hay luz en mi calle, y mi madre usa oxígeno. La máquina ya está sonando." },
  { t:25, from:"+13105551311", lang:"en", say:"Power's out over here on Eubank Ave. Just wondering what's going on." },
  { t:41, from:"+13105551188", lang:"en", say:"There's water coming up out of the storm drain at Lomita and Normandie, it's across both lanes now." },
  { t:48, from:"+13105551402", lang:"en", say:"I'm fine, I just want to report the lights are out around Eubank." },
  { t:55, from:"+13105551019", lang:"ko", say:"Lomita 길에 물이 차오르고 있어요. 차가 못 지나가요." },
  { t:63, from:"+13105551250", lang:"en", say:"My neighbor is 80 and she can't get down her stairs, the elevator's dead with the power out." },
  { t:70, from:"+13105551377", lang:"en", say:"Hey, I've got a pickup truck and I'm over near Lomita if anyone needs a hand moving." },
  { t:78, from:"+13105551122", lang:"en", say:"Flooding at Lomita and Normandie. It's getting deeper, maybe a foot now." },
  { t:84, from:"+13105551290", lang:"es", say:"¿El albergue en Banning Park está abierto? Necesito un lugar para mi familia." },
  { t:91, from:"+13105551066", lang:"en", say:"I smell gas. Strong. Inside the house, I'm on Denni Street." },
  { t:98, from:"+13105551333", lang:"en", say:"Is the 110 open? I need to get to work." },
  { t:104,from:"+13105551207", lang:"en", say:"Me again, still no power, any update?" },
  { t:112,from:"+13105551455", lang:"tl", say:"May tubig sa kalsada sa Lomita, hindi makadaan." },
  { t:119,from:"+13105551081", lang:"en", say:"My husband fell and he's bleeding and I can't lift him." },
  { t:126,from:"+13105551299", lang:"en", say:"I have a generator at my place on Eubank if a neighbor needs to plug something in." },
  { t:133,from:"+13105551170", lang:"en", say:"Water's over the curb at Normandie near Lomita." },
  { t:140,from:"+13105551318", lang:"en", say:"Where can I get water? The store's closed." }
];

/* ---- Twists. Each is edits to the world above. ---- */
window.TWISTS = [
  { id:"baseline", label:"Baseline", blurb:"Two supervisors overnight. 40 outbound lines.", edits:[] },

  { id:"lines-cut", label:"Outbound capacity cut to 8",
    blurb:"Carrier congestion. You can hold eight outbound calls at once instead of forty — so outbound stops being a broadcast and becomes a rationing problem. The same ranking that orders the inbound queue now chooses who gets warned.",
    edits:[ {type:"outbound", set:{ maxConcurrentCalls:8 }} ] },

  { id:"evacuate", label:"Evacuation ordered, 1.2km",
    blurb:"The order changes from inform to evacuate, and the radius doubles. Everyone in the zone is called, registered or not — an evacuation is not an opt-in service.",
    edits:[ {type:"outbound", set:{ radiusMetres:1200, requireRegistered:false,
             quietHoursMinSeverity:1, skipIfAlreadyCalledUs:false }} ] },

  { id:"shelter-closed", label:"Shelter closes",
    blurb:"Banning Park is full and closes. The fact the agent has been repeating all night is now wrong — and because every fact carries an expiry and a source, the agent stops repeating it instead of confidently misdirecting families.",
    edits:[ {type:"knowledge", id:"shelter-banning", set:{ retracted:true }} ] },

  { id:"supervisor-down", label:"One supervisor drops",
    blurb:"You are down to a single human overnight. The posture shifts to surge: the bar for reaching a person rises, the agent handles more alone, and it says so to callers rather than pretending.",
    edits:[ {type:"line", set:{ humansOnShift:1 }}, {type:"policy", set:{ posture:"surge" }} ] },

  { id:"hoax", label:"Coordinated false reports",
    blurb:"Fourteen calls in ninety seconds, same phrasing, consecutive numbers, all reporting a fire that isn't there. Counting callers would confirm it. Weighing their independence does not.",
    edits:[ {type:"injectHoax", count:14, category:"fire", at:150} ] },

  { id:"surge10x", label:"Volume 10x",
    blurb:"Ten times the calls, same two humans. Deduplication is the only thing between you and a queue nobody can clear.",
    edits:[ {type:"multiplyCalls", factor:10} ] }
];
EOF_DATA_WORLD_JS

git add HANDOFF.md engine.js sim.js data/world.js
git commit -m "The Line — triage engine, world data, simulator, team handoff

Overnight community call line for InnovateLA Vertical 03 (Retell AI).
Five-lane triage with hard-wired bypasses, incident clustering weighted
by caller independence, verification sweeps, and outbound targeting by
exposure and vulnerability. All world state lives in data/world.js so a
live twist is a config edit, not a rewrite.

Read HANDOFF.md first. Section 4 is the rule nobody breaks; 10 covers
sponsor fit; 11 has the Retell integration seams; 12 specs the console."

echo
echo "Committed to $BRANCH."
echo "Pushing..."
git push -u origin "$BRANCH"
echo
echo "Done. Open a PR, or merge straight to main if the repo is empty:"
echo "    git checkout main && git merge $BRANCH && git push"
echo
echo "Check it works:   node sim.js"

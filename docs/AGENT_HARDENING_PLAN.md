# Voice agent: stress test results and hardening plan (P1)

Sat Oct 17, 10:00. Every finding below was **run**, not guessed: a stress script against the
pure functions and a local server, signed like Retell. `npm test` (26 tests) was green while
all of these failed. That's the point of this doc.

---

## 1. Does the agent solve the problem in `pitch_v2.md`?

The problem: *welfare calls during evacuations eat call-taker minutes and send patrol cars to
homes already cleared, while refusals and unchecked homes get lost in the pile.*

| Pitch promise | Agent today | Gap |
|---|---|---|
| Cleared → answer with the time, no car sent | ✅ `answered_by_agent` with time | — |
| Refused → up the queue, officer's note to the human | ✅ note in `reason` | — |
| Unknown inside perimeter → up the queue **and onto the door-knock list** | ⚠️ queued only | Nothing marks the address for a knock |
| First-hand emergency → human, no questions | ✅ | But see §2 false alarms |
| "A second caller about the refused address jumps up the queue" (team_plan demo step 4) | ❌ | Severity identical for 1st and 3rd caller |
| "Gives the shelter info" (pitch table, cleared row) | ❌ | Agent has no shelter info; it may make some up |
| "New information beats the record" | ✅ `caller_update` | But the new info never updates the record |
| "People who stay become known" | ❌ | A resident calling *about themselves* ("I'm still home, nobody came") isn't a case |
| "Nothing is discarded" / what happens when nobody picks up | ❌ | Hang-ups and failed transfers vanish (§3) |

**Verdict:** the core loop (call → lookup → spoken answer with time → routed) is right and
is exactly the pitch's "field-to-phone" link, **in one direction**. The pitch's strongest line
is the match *between* field results and calls, so calls must also flow back into the record
(caller-reported stays, self-reports, repeat calls). That's the biggest product gap.

---

## 2. Bugs found (all reproduced)

### 🔴 Critical: wrong person gets transferred, or the right person gets nothing

| # | Input | Got | Should be | Why it matters |
|---|---|---|---|---|
| B1 | "No, nobody is trapped" (answer to our own opening question) | **emergency transfer** | nothing | Our greeting asks "is anyone hurt or in danger?" so the most common answer fires the bypass. Every calm caller could land on the dispatcher. |
| B2 | "No one is hurt or bleeding" | emergency | nothing | Same: no negation handling |
| B3 | "Can you **help me** find out if my mom got out" | emergency | nothing | "help me" is in the list; it's how half of callers will start |
| B4 | "She lives on **Gun**derson Ave" / "he had be**gun** packing" | emergency | nothing | Substring match, no word boundaries |
| B5 | "Oh god, I don't know what to do, she won't answer" | distress → transfer | worried | Ordinary worry scores 4 (two phrases × 2) |
| B6 | Caller says **María López** (or the record has the accent) | name mismatch → **no status** | match | `[^a-z]` strips "í". LA, Spanish names: the demo's own Lopez fails if anyone types the accent |
| B7 | "Maria Lopez-Garcia", "Sean O'Brien" vs "sean obrien" | mismatch | match | Hyphenated and apostrophe names |
| B8 | "1420 Sunset Mesa Dr, Pacific Palisades, CA 90272" | not found | found | Agent will often pass city/ZIP |
| B9 | "1420 Sunset Mesa Dr **Apt 3**" / "1,420 Sunset Mesa" | not found | found | Units and commas break the key |
| B10 | "fourteen twenty Sunset Mesa" | not found | found | Prompt asks for digits, but the LLM won't always comply |
| B11 | Retell `end_call_after_silence_ms: 20000` (we set it) | a caller silent 20s is **hung up on** | ≥ 60s | Retell's default is 10 min. A sobbing caller goes quiet. We made it worse |
| B12 | Retell `max_call_duration_ms: 300000` | routine intake (8 questions) can be cut off at 5 min | 10 min | "Never close a call where someone may be in danger" |

### 🟠 High: someone disappears

| # | Scenario | Got | Should be |
|---|---|---|---|
| G1 | Caller hangs up after the lookup, before `log_call` | **no record at all** | logged as `abandoned` → callback queue |
| G2 | Transfer to (805) rings out / busy | we don't subscribe to `transfer_*` webhooks; nothing logged; prompt doesn't say what to tell the caller | logged; caller told honestly "no one is free yet, you're first in line"; callback row |
| G3 | Two transfers at once | second hits a busy single phone | known limit: stagger in demo; say "one call-taker" honestly |
| G4 | `log_call` twice in one call | 2 rows on the board | 1 row per call (upsert by `call_id`) |

### 🟡 Medium: judge questions we can't answer yet

| # | Question | Today |
|---|---|---|
| J1 | "A looter reads the name off the mailbox and calls about 20 houses." | Name match is the only guard. One number probing 4 addresses: **no flag**. `self_out`/`cleared` is exactly "this house is empty" |
| J2 | "Your agent speaks Spanish, but reads your English sentences?" | Prompt says "read `say` **exactly**", which forces English to a Spanish caller |
| J3 | "What if they don't know the house number?" | Not found → escalate. Safe, but no street-level answer |
| J4 | "Is she alive? Did they find her?" | Prompt forbids "safe", but has no line for this |
| J5 | "What happens when the record is wrong?" | `caller_update` escalates but the record stays wrong for the next caller |
| J6 | "You log transcripts?" | Railway logs hold full request bodies (names, addresses, phone numbers) |
| J7 | Time wording | 90 min reads "about 2 hours ago"; 24 h reads "at 9:50 AM, about 24 hours ago" (which day?) |

---

## 3. Plan

Ordered by **what a judge or a real caller hits first**. Times are focused work.

### Phase A: stop false alarms and false refusals (≈ 45 min) · ✅ DONE 10:45

All in `bypass.js`, `distress.js`, `backend.js`, plus tests for every row in §2.

1. **Word-boundary matching** for emergency words (`\btrapped\b`), fixes B4.
2. **Negation window:** ignore a hit if "no / not / nobody / no one / isn't / wasn't / never"
   appears in the 4 words before it (B1, B2). Keep firing on "she's **not breathing**",
   since that phrase is itself in the list.
3. **Drop "help me"** from emergency words; keep "help me, she's…" handled by the agent (B3).
   *Built:* subject negators ("nobody", "no one", "nadie") cancel within 5 words, plain ones
   ("no", "not", "isn't") within 2, so "no my dad is trapped" still fires.
4. **Distress calibration:** "oh god" +1, not +2; "I don't know what to do" alone +1. Panic
   needs two strong cues or one cue plus a conversation breakdown (B5). Add the fixture
   *"oh god I don't know what to do, she won't answer"* → must stay `worried`.
5. **Name normalization:** strip accents (`normalize('NFD')`), split hyphens, drop
   apostrophes; match if first + last of the record are present (B6, B7).
6. **Address normalization:** drop commas inside numbers, drop city/state/ZIP after the
   suffix, drop `apt|unit|#|suite` + token, convert simple spoken numbers ("fourteen
   twenty") (B8–B10).
7. **Retell limits:** silence cutoff 60s, max duration 10 min (B11, B12). One line each in
   `setup-retell.js`.

**Done when:** every row in §2 table B is a passing test, and the six scripted cases still pass.

### Phase B: nobody disappears (≈ 60 min) · ✅ DONE 10:45 (transfer events still need one real declined call)

"What happens when someone doesn't pick up?" is one of the three questions the track asks.

1. **Abandoned calls:** on `call_ended` with no `log_call`, write a row
   `routing: abandoned_callback` with whatever we have (address, name, state) (G1).
2. **Failed transfers:** subscribe to `transfer_started | transfer_bridged | transfer_cancelled |
   transfer_ended`. On no-answer: log it, and the prompt's new rule says *"No call-taker is
   free yet. You're at the front of the line and they'll call you back at this number."*
   Row → `callback_queue` (G2). **Verify on a real call** by declining at (805).
3. **One row per call:** `log_call` upserts by `call_id`; severity can only go up (G4).
4. **Repeat callers move it up:** a 2nd distinct caller about the same address +1 severity,
   3rd → `human_now`. Matches team_plan demo step 4 and the pitch's "match by address".

**Done when:** a hang-up, a declined transfer and a 3-caller pile-up each show up on the board
with a reason.

### Phase C: close the loop into the record (≈ 45 min, needs P2's `update_status`)

This is the pitch's differentiator: calls *feed* the sweep log, not just read it.

1. **Caller-reported info becomes a status** with `source: 'call'` and its time:
   "he told me he's staying" → `refused (caller report)`; "she texted she's out" →
   `self_out (caller report)`. Shown to the next caller *as a caller report, with the time*,
   never as an officer check (J5).
2. **Resident self-report mode:** "I'm Maria, I'm still at home": that's a first-hand
   report from inside the perimeter → `human_now` + status `refused/staying (self)`. New prompt
   branch, new test.
3. **Door-knock list:** `unknown`/`refused` inside the perimeter after a call → flag
   `needs_knock` for P4's list.

### Phase D: judge-proofing (≈ 45 min)

1. **Enumeration guard (J1):** one number looking up > 2 addresses in an hour → stop
   sharing statuses, route to a human, flag `possible_probe` on the board. Also: for
   `self_out`/`cleared`, say *"the resident reported being out at 3:40"* (already), never
   volunteer the note.
2. **Language (J2):** prompt says "give the caller this information **in their language**,
   keeping the time and status exact" instead of "read exactly".
3. **Unanswerable questions (J4):** prompt line: *"I don't have information about that. I can
   connect you to a person."* No shelter info unless P2 provides it (then add `shelter` to the
   lookup response). **Tell P3: remove "gives the shelter info" from the pitch table until
   then.**
4. **Time wording (J7):** "an hour and a half ago"; anything > 12h says the day ("yesterday at
   9:50 AM").
5. **PII (J6):** stop logging full request bodies in production; log call_id + routing only.

### Phase E: prove it on real phones (≈ 30 min, after A + B)

Run the eight-call script from the test list plus the new cases: "no, nobody's trapped" (must
NOT transfer), "María López" said with an accent, decline the transfer at (805), hang up
mid-call, two phones about the same address. Record one clean run for the backup video.

---

## 4. Order and owners

```
A (false alarms, matching, Retell limits)  ──►  E (real-phone run)
B (nobody disappears)                      ──►  E
C (loop into the record)   needs P2 update_status
D (judge-proofing)         D3 needs P3 to change the pitch table
```

A and B are P1-only and fix things a judge will hit in the first minute of a live demo
(B1: a calm caller saying "no, nobody's trapped" gets transferred). Do them before anything
else. C is the strongest pitch upgrade but depends on P2. D is mostly prompt and wording.

## 5. Things to tell the team now

- **P3:** the pitch says the agent "gives the shelter info". It can't yet. Cut it or have P2 add a `shelter` field.
- **P2:** we need `update_status` callable from the server for Phase C, plus `source: 'call'`.
- **P4:** new row types coming: `abandoned_callback`, `callback_queue`, `possible_probe`, `needs_knock`.
- **Everyone:** one transfer phone means one transferred caller at a time. Stagger demo calls.

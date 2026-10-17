# Data contract: voice agent ↔ backend ↔ board

Draft from P1, Sat 09:15. **Lock by 10:00.** Tables are P2's, exactly as in `team_plan.md`;
this file pins down the two functions the agent calls and what the board can listen to.

```
caller ──► Retell agent (Line Intake)
              │  POST, signed
              ▼
          our server (Railway)  ──► P2's Supabase functions (fake responses until live)
              │
              └──► GET /events (live feed for P4's board, until Realtime is wired)
```

The agent never talks to Supabase directly. The server holds the keys, checks Retell's
signature, and turns results into the sentence the agent reads out.

---

## 1. `lookup_address`

**Agent sends:**

| Field | Type | Notes |
|---|---|---|
| `address` | string | Street number + street, digits not words: `"1420 Sunset Mesa Dr"` |
| `subject_name` | string | Full name of the person they're calling about: `"Maria Lopez"` |
| `caller_state` | `calm` \| `worried` \| `distressed` \| `panicked` | The agent's read of the caller so far (see §3a) |

**Backend returns** (P2's `lookup_address(address, subject_name)`):

| Field | Type | Notes |
|---|---|---|
| `found` | bool | Address exists in `addresses` |
| `address_id` | uuid \| null | |
| `name_match` | bool | `subject_name` matches `addresses.resident_name` (first + last, any order, case-insensitive) |
| `status` | enum \| null | `cleared`, `refused`, `no_answer`, `self_out`, `in_transit`, `unknown`. **null unless `name_match`** |
| `recorded_at` | timestamptz \| null | **null unless `name_match`** |
| `note` | text \| null | **null unless `name_match`** |
| `source` | enum \| null | `officer`, `resident_reply`, `call` |
| `inside_perimeter` | bool | Always returned: it's about the location, not the person |

**Server adds and the agent reads:** `say`, a sentence that always includes the time and
never says "empty". Example: *"An officer marked that address cleared at 9:02 AM, about
40 minutes ago."*

## 2. `log_call`

**Agent sends** (after `lookup_address` in wildfire mode, after the questions in routine mode):

| Field | Type | Notes |
|---|---|---|
| `mode` | `wildfire` \| `routine` | |
| `address` | string | Same as lookup |
| `subject_name` | string | |
| `with_them_now` | bool | Caller is physically with the person → `human_now` |
| `emergency` | bool | Any sign of a first-hand emergency |
| `caller_update` | string \| null | New information that contradicts the record: "he texted 20 min ago, he's still there" |
| `last_contact_hours` | number \| null | Routine mode |
| `vulnerability` | `{age, lives_alone, medical, mobility}` | Routine mode. `medical` is free text ("oxygen") or null |
| `red_flags` | `{mail_piling, missed_meds, fall_history}` | Routine mode, booleans |
| `caller_state` | `calm` \| `worried` \| `distressed` \| `panicked` | The agent's read of the caller. The server keeps the worst seen this call |
| `reported_status` | `staying` \| `out` \| null | Where the caller says the person is (§3b) |
| `reported_by` | `resident` \| `relative_or_friend` | `resident` = calling about themselves |
| `reported_minutes_ago` | number | How old that news is ("texted 20 min ago" = 20) |

**Server adds:** `call_id`, `from_number`, `created_at` (from Retell), `address_id` (from the lookup).

**Backend returns** (P2's `log_call(payload)`, writes `calls`):

| Field | Type | Notes |
|---|---|---|
| `routing` | enum | `human_now`, `priority_queue`, `answered_by_agent`, `scheduled_followup` |
| `severity` | int 1–5 | |
| `reason` | text | One line for the board: "refused, note: 2 adults staying, 1 on oxygen" |

**Server adds and the agent reads:** `say` and `transfer` (true for `human_now` and `priority_queue`).

## 3. Routing rules (P2 owns, P1 mirrors in the fake backend)

Evaluated top to bottom; first match wins. **Severity only moves a call up. No call is ever closed by the agent.**

| # | Condition | Routing | Severity |
|---|---|---|---|
| 1 | `with_them_now` or `emergency` | `human_now` | 5 |
| 2 | `caller_update` present (new info beats the record) | `priority_queue` | 4 |
| 3 | `status = refused` | `priority_queue` | 4 |
| 4 | `status = unknown` / `no_answer` / null, inside perimeter | `priority_queue` | 4 |
| 5 | `status ∈ {cleared, self_out}` and `recorded_at` within **120 min** | `answered_by_agent` | 1 |
| 6 | `status ∈ {cleared, self_out}` but older (stale) | `priority_queue` | 3 |
| 7 | Routine mode, score ≥ 4 | `priority_queue` | score |
| 8 | Routine mode, score < 4 | `scheduled_followup` | score |
| 9 | Anything else | `priority_queue` | 3 (default is escalate) |

### 3a. Caller state (emotion) can only move a call up

Checked around the table above:

| Caller state | Effect |
|---|---|
| `panicked` | `human_now`, severity 5, before any other rule |
| `distressed` | if the table says `answered_by_agent` or `scheduled_followup`, it becomes `priority_queue` (severity ≥ 4) |
| `worried`, `calm` | no change. Worried is the normal call on this line |

Two sources: the agent's `caller_state` on each tool call, and a keyword score of the
caller's words on every transcript chunk (panic phrases, the agent asking to repeat twice,
repetition, fragments). Either one crossing the line interrupts the agent and transfers.

### 3b. Calls write back into `status_log` (source `call`)

A phone report is weaker than an officer at the door, so it can only raise concern:

| Caller says | Written to `status_log` | Routing |
|---|---|---|
| Relative/friend: "he's staying" | `refused`, note "phone report (relative or friend): …", `recorded_at` = when the news is from | `priority_queue` |
| Resident: "I'm still here" | `refused`, note "phone report (resident): …" | `human_now` (inside perimeter) |
| Resident: "I've left" | `self_out`, unless the house is marked `refused` | `answered_by_agent`; if marked staying, `priority_queue`, nothing written |
| Relative/friend: "she's out" | **nothing**: a third-hand "out" never takes a house off the door-knock list | as the record says |

The next caller hears it attributed: *"A phone report at 10:34 AM, about 15 minutes ago, says
the people at that address were staying."* Never as an officer's check. A `refused` from a call
puts the house on the board's door-knock list like any other.

**Routine score:** base from `last_contact_hours` (<12h → 1, <48h → 2, <168h → 3, ≥168h → 4),
+1 per vulnerability (age ≥ 75, lives alone, medical, mobility) up to +2, +1 per red flag,
capped at 5.

## 4. What the caller hears, per routing

| Routing | Agent says | Transfer |
|---|---|---|
| `human_now` | "I'm connecting you to a person right now. Stay on the line." | yes |
| `priority_queue` | "I've moved your call to the front of the queue and I'm connecting you to a call-taker." | yes |
| `answered_by_agent` | The status with its time, then: "If you have new information, I can connect you to a person." | no |
| `scheduled_followup` | "I've logged this and flagged a follow-up check." | no |

## 5. Live feed for the board (P4)

`GET https://usc-dual-hacks-production.up.railway.app/events`, server-sent events.
Until Supabase Realtime is on:

| Event | Data |
|---|---|
| `snapshot` | `{ sessions, calls }` on connect |
| `lookup` | `{ call_id, address, subject_name, found, name_match, status, recorded_at, inside_perimeter }` |
| `call_logged` | the full `calls` row incl. `routing`, `severity`, `reason` |
| `bypass` | `{ call_id, kind, reasons }` when emergency words or distress are detected mid-sentence |
| `emotion` | `{ call_id, caller_state, source: 'agent' \| 'words', distress_score, reasons? }` for the board's emotion gauge |
| `call_started`, `call_ended` | Retell call lifecycle |

## Open questions for P2 / P4

1. P2: are the functions Postgres RPCs (`supabase.rpc('lookup_address', …)`) or Edge Functions? The server can call either.
2. P2: is 120 min the right "recent" window for a cleared status?
3. P4: is the SSE feed enough until Realtime is on, or do you want to read Supabase directly from the start?

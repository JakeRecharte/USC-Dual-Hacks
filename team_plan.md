# Team Plan: Work Split for 4 People

**Deadline: Devpost submission, Saturday 10:00 PM. No extensions.**
Target submitting at **9:30 PM**.

---

## Roles at a Glance

| Person | Role | Owns |
|---|---|---|
| **P1** | Voice agent | Retell agent, call flow, prompts, the tools it calls |
| **P2** | Backend / data | Supabase tables, lookup and logging functions, fake data |
| **P3** | Pitch | Slides, Devpost write-up, poster, twist responses |
| **P4** | Frontend + demo | Dispatcher status board, officer one-tap page, demo script, demo video |

**Rule:** P1, P2, and P4 agree on the **data contract** below by **10:00 AM**, then build in parallel against it. P4 can use fake responses until P2's functions go live.

---

## The Data Contract (lock by 10:00 AM)

### Supabase tables (P2 builds)

**`addresses`**
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| address | text | normalized street address |
| lat, lng | float | |
| zone_id | text | e.g. a Genasys-style zone code |
| resident_name | text | used to check the caller can name the resident |

**`status_log`**
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| address_id | uuid | links to `addresses` |
| status | enum | `cleared`, `refused`, `no_answer`, `self_out`, `in_transit`, `unknown` |
| source | enum | `officer`, `resident_reply`, `call` |
| note | text | e.g. "2 adults staying, 1 on oxygen" |
| recorded_at | timestamptz | **always shown to the caller** |

**`calls`**
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| mode | enum | `wildfire`, `routine` |
| address_id | uuid | |
| subject_name | text | who they're calling about |
| with_them_now | bool | first-hand → straight to a human |
| last_contact_at | timestamptz | used in routine (grandma) mode |
| vulnerability | jsonb | `{age, lives_alone, medical, mobility}` |
| red_flags | jsonb | `{mail_piling, missed_meds, fall_history}` |
| severity | int | 1–5 |
| routing | enum | `human_now`, `priority_queue`, `answered_by_agent`, `scheduled_followup` |
| created_at | timestamptz | |

**`perimeter`**: a single GeoJSON polygon for the active fire area (fake).

### Functions (P2 builds, P1's agent calls them)

1. **`lookup_address(address, subject_name)`**
   - Returns `{status, recorded_at, note, inside_perimeter, name_match}`.
   - **Returns no status unless `name_match` is true.** This is the looting safeguard.
2. **`log_call(payload)`**
   - Writes to `calls` and returns the routing decision.
3. **`update_status(address_id, status, source, note)`**
   - Used by the officer page and the check-in poll replies.

### Routing logic (P2 writes it, P1 checks it)

- `with_them_now = true`, or any emergency words in the call → `human_now`
- `refused`, or `unknown` inside the perimeter → `priority_queue`
- `cleared` / `self_out` with a recent timestamp → `answered_by_agent`
- Routine mode: severity score from time since last contact, adjusted for vulnerability, plus red flags.
  - High score → `priority_queue`
  - Low score → `scheduled_followup`
- **Severity can only move a call up the queue, never down. No call is ever closed by the agent.**

---

## P1: Voice Agent (Retell)

**Morning (until 1 PM)**
- Build the agent with **two modes**:
  - **Wildfire:** who you're calling about, their address, are you with them now.
  - **Routine:** when you last heard from them, their age and health, any red flags.
- Wire the agent's tools to `lookup_address` and `log_call`. Use fake responses until P2's are live.
- Write the safety lines into the prompt:
  - never say "empty"
  - always say the time
  - first-hand emergency → transfer to a human immediately
- **Attend the Retell info session at 10:30 AM** and ask about outbound calls and how tool calls work.

**Afternoon**
- Test 6 scripted calls, one for each status: cleared, refused, unknown inside the perimeter, first-hand emergency, routine high severity, routine low severity.
- If those pass, start the **stretch goal:** outbound check-in calls ("press 1 evacuated, 2 evacuating, 3 staying") that call `update_status`.

**Done means:** a real phone call returns the right answer, with the timestamp, for all 6 scripted cases.

---

## P2: Backend (Supabase)

**Morning (until 1 PM)**
- Create the tables, the enum types, and the three functions.
- Turn on Supabase Realtime for `status_log` and `calls` so P4's board updates live.
- Fake data:
  - 30 addresses, all in one fake zone
  - a mix of statuses, with realistic timestamps
  - 3 "refused" notes
  - 1 address with a stale "cleared 6 hours ago" status

**Afternoon**
- Write the routing and severity logic, with simple tests.
- Add a reset script that puts the fake data back before every demo run.
- **Stretch goal:** a `checkin_replies` handler that maps replies 1/2/3/no reply to `self_out` / `in_transit` / `refused` / `unknown`. If an "evacuating" status gets no follow-up within the window, it reverts to unknown.

**Done means:** P1 and P4 can both read and write live data, and the reset script works.

---

## P3: Pitch, Devpost, Poster, Twists

**Morning**
- **Twist responses first:** answer each twist within 6 hours of it dropping.
  - Twist 2 dropped at 4:30 AM, so its response is due **10:30 AM**.
  - Twist 3 (the poster) dropped at 7:00 AM, so its response is due **1:00 PM**.
  - Twist 1's 6-hour window closed at 7:43 AM. If it wasn't submitted, ask the help desk now.
  - Twist content is already in `pitch_v2.md` sections 4–6.
- **Poster:** finish it before the 1:00 PM Devpost poster upload so it gets printed for Demo Day.

**Afternoon**
- **Slides:** 5-minute pitch, following the event's deck rules:
  1. The problem (30 seconds)
  2. Show it working first
  3. How it holds up to the twists
  4. Where it goes next and how feasible it is
  5. Funding (DHS SVIP) and going global
- **Devpost page:** name, lens (Resilience Comms), one line, slides, demo video, repo, teammates, and the **responsible-use note**.
  - Draft: "This could be misused to find empty homes during evacuations. We never say 'empty,' share a status only with callers who can name the resident, and always include the time it was recorded."
- Book **one mentor slot** in the portal. Abhi Nemani, LA's former Chief Data Officer, is the best fit; Justin McEwen in defense innovation is the backup.

**Done means:** poster uploaded by 1 PM. Slides and Devpost text complete by 7 PM.

---

## P4: Frontend + Demo

**Morning (until 1 PM)**
- **Dispatcher board:** a single web page showing
  - a map of the fake zone with addresses colored by status
  - the live call queue, sorted by routing
  - the door-knock list (unknown and refused addresses inside the perimeter)
- **Officer page:** an address list on a phone screen with three big buttons: Cleared / Refused / No answer.
  - **Stretch:** queue taps while offline and send them once back online.

**Afternoon**
- Connect both pages to Supabase Realtime.
- Write the **demo script**:
  1. Board shows the zone.
  2. Officer taps "Refused" at one address.
  3. A worried caller phones about a cleared address, and the agent answers with the time.
  4. A second caller phones about the refused address, and it jumps up the queue on the board.
  5. A grandma check-in call (routine mode) shows dual-use.
- **Record the demo video (7:00–8:30 PM)**, with a backup take.

**Done means:** the full demo runs live on the board in under 3 minutes.

---

## Shared Timeline (Saturday)

| Time | Milestone | Owner |
|---|---|---|
| **9:00 AM** | Kickoff, roles confirmed | All |
| **10:00 AM** | **Data contract locked** | P1, P2, P4 |
| 10:30 AM | Retell info session; Twist 2 response due | P1 / P3 |
| **1:00 PM** | **Core loop works:** call → lookup → spoken answer. Poster uploaded. | P1, P2 / P3 |
| 1:00 PM | IBM talk (optional) | Anyone free |
| **4:00 PM** | **Full demo works end to end** | P1, P2, P4 |
| **6:00 PM** | **Feature freeze.** Stretch goal only if core is solid. | All |
| 7:00 PM | Slides and Devpost text final | P3 |
| 7:00–8:30 PM | Record demo video | P4, with P1 on the phone |
| **9:30 PM** | **Submit on Devpost** | P3 |
| 10:00 PM | Hard deadline | — |
| 10:30 PM | Midnight Games (Most Fun Team points) | All |

**Sunday:** if you're a finalist, the final deck is due at 9:00 AM. Otherwise, it's a live demo at Ginsburg from 12 PM.

---

## Rules for the Day

1. **Core before stretch.** The check-in alerts only start after the 4 PM end-to-end demo works.
2. **Everything goes through the data contract.** Nobody changes a table or function without telling P1 and P4.
3. **Commit often.** Every person pushes to the repo at least every 2 hours.
4. **Blocked for more than 20 minutes?** Say so in the group chat, or go to the help desk in RTH 526.
5. **List every AI tool used** (Retell, Supabase, Claude, IBM Bob if used) on Devpost. The rules require it.

# Demo script — 2 min 40 s

From P4. Five beats from `team_plan.md`, timed to land under three minutes with room to
breathe. **P4 drives the board. P1 makes the calls.**

Two screens: a **laptop** on `/dispatch` (shared/projected) and a **phone** on `/officer`
(held up to camera, or mirrored into a corner of the recording).

> **The invented data this script was written against has been removed.** Every house now starts
> grey (unknown) and there is no sample data, no **Reset demo data** button and no **Simulate
> call**. The counts quoted below (1,108 unresolved, 83 refused, `183/229`, …) came from that
> data and **no longer appear**; the beats need re-recording against records that are really
> there. The tap-and-watch-it-change flow still works the same way.

---

## Pre-flight — do this before recording, every take

1. `cd web && npm run dev`, or `npm run build && npm start`, with the four Supabase variables
   **set** in `web/.env.local`. Check `/api/health` says `"mode":"supabase"`; if it says
   `"memory"`, the app is not reading the database.
2. Laptop: sign in at `/` as **dispatch**, code `5150`. Leave it on `/dispatch`.
3. Phone: sign in as **officer**, code `1420`. It opens on whichever zone has the most doors
   left. **Tap over to PAL-06, Huntington Palisades** — that's where beat 2 is.
4. To start a take clean, `npm run reset-demo` in `server/` (households only, every house grey).
5. If the call queue shows nothing to attach to, the call feed is not configured; see the
   fallback at the bottom.
6. Have the phone already scrolled to **640 Toyopa Dr**.

A clean reset shows **8,088 houses, all grey, 0 refused**. If it doesn't, you didn't reset.

---

## Beat 1 — the board (0:00–0:30)

**Show:** the dispatch map on Buildings.

> "This is Pacific Palisades during a wildfire — two thousand households, from the coast at
> Castellammare up into the Highlands. Every one of those shapes is a real house, traced from
> the map. The colour is not population — it's **where we still don't know if anyone is
> inside**. Red and amber mean officers are needed. It turns green as doors get answered."

Zoom in once: the dots resolve into individual houses, each one coloured by its status, with
the grey ones around them the buildings nobody has a record for.

Point at the zone cards under the map, where the `183/229` counts are.

> "Rustic Canyon — a hundred and eighty-three of two hundred and twenty-nine still
> unanswered. Deep canyon, bad signal, nobody has worked it. That's where the next crew goes."

**Why it matters:** the colour change is the whole point. Say it now, because beat 2 shows it happening.

## Beat 2 — the officer taps Refused (0:30–1:00)

**Show:** the phone, zone **PAL-06**. Scroll to **640 Toyopa Dr**, Beatrice Lam — currently
*Unknown*, no contact ever recorded.

> "An officer is at the door. Three buttons, one hand, gloves on."

Open **Structure and notes**, type `two adults staying, won't leave the dogs`, then tap
**Refused**.

**Watch the laptop.** Inside a second: that house turns deep red, the heat deepens over
Huntington, **Refused** ticks `83 → 84`, **Never contacted** ticks `414 → 413`, and the
address jumps to the top of the door-knock list with the note under it.

> "No refresh, no sync button. Dispatch saw that before the officer put the phone away."

**Optional, 10 s, and worth it:** turn the phone to airplane mode first, tap, and show the
amber **"1 to send"** pill.

> "Signal dies inside a fire perimeter. The tap is saved with the time he made it and sent
> when he's back in range — so the board shows 10:02, not whenever the network came back."

## Beat 3 — a worried caller, cleared address (1:00–1:40)

**P1 calls the line.** Asks about **Maria Lopez at 1420 Sunset Mesa Dr**.

The agent answers with the status **and the time**: *"An officer marked that address cleared
at 9:02, about forty minutes ago."*

**On the board:** the call appears in the live queue, green, **Answered by agent**.

> "She gets a real answer in fifteen seconds instead of holding for a 911 line that's taking
> ten thousand calls an hour. And notice what it says — not 'she's fine.' It says what was
> recorded and **when**. That timestamp is the honest part."

If asked about the safeguard, this is the moment:

> "It only answered because she could name the resident. Someone who can't gets the perimeter
> and nothing else. We never say a house is empty."

## Beat 4 — a second caller, and the queue reorders (1:40–2:15)

**P1 calls again,** this time about **Harold Kim at 1515 Via de la Paz** — a different house
on the same street, marked **refused** by an officer twenty-five minutes ago.

The agent does **not** read out a refusal. It routes.

**On the board:** the call lands **above** the first one, orange, **Priority queue**, reason
*"refused, note: 2 adults staying, 1 on oxygen"*.

> "A refusal is a person still inside, and now a relative is calling about them. The agent
> doesn't try to resolve that — it moves them to the front and hands them to a human. The
> agent can move a call **up** the queue. It can never close one."

## Optional beat — the caller who can't be helped by a machine (+20 s)

Added after P1's distress work landed. Worth including if you have the time, because it is
the answer to "why not just a chatbot."

**P1 calls and panics** — "oh my god, please hurry."

**On the board:** the row jumps to **Human now** with ⚡, the caller reads **▲ Panicked**, and
the distress meter fills past the handoff mark. The agent stops talking mid-sentence.

> "The agent scores the caller's own words, live. Panic, pleading, or the agent having to ask
> twice to be understood — any of those and it stops talking and hands over. It never tells
> the caller it thinks they're panicking. A worried caller is the normal call on this line, so
> worry alone changes nothing."

The gauge is on every row: grey for calm and worried, orange at distressed, red at panicked.

## Beat 5 — the same system on a normal day (2:15–2:40)

**P1 makes the routine call:** hasn't heard from grandma in five days, she's 81, lives alone,
mail piling up.

**On the board:** **Priority queue**, severity 4, *"routine welfare check, score 4."*

> "No fire. This is the same line on a Tuesday. Welfare checks are the second-biggest call
> type most agencies take, and they're triaged by whoever picks up. Same intake, same queue,
> same board — which is why this doesn't get mothballed between disasters."

**Close on the full board.**

> "One line, one board. The fire is the hard case. The Tuesday is the business."

---

## Fallbacks

| If this breaks | Do this |
|---|---|
| **The call queue is empty / call feed not configured** | There is no canned fallback any more. The map and officer flow are unaffected; narrate the call beats over the officer flow, or place a real call. |
| **The phone won't connect** | Open `/officer` in a second browser window on the laptop, narrow, beside the board. The split screen actually reads better on video. |
| **A call drops mid-demo** | Keep going and narrate the board. The queue row is already there from the `lookup` event — it shows *"call in progress"* before routing lands. |
| **The map won't load** | Basemap tiles come from OpenFreeMap and need the network. The perimeter, zones and households are drawn from local data and still render over a blank ground, so the demo survives it. Failing that, the door-knock list carries the same information as text. |
| **Everything is wrong** | `npm run reset-demo` in `server/`: households only, every house grey. |

### One seam to know about before you narrate it

Until `BACKEND_URL` is set and P2's `update_status` is live, **the board and the voice agent
keep separate copies of the fake data.** The officer's tap in beat 2 reaches the board
instantly; it does *not* reach the agent's `lookup_address`.

That is why beat 2 and beat 4 use **different addresses**: beat 4 asks about an address the
agent already knows is refused. Do not mark an address on the phone and then call about that
same address — the agent will answer with the old status and the demo will contradict itself
on camera.

If P1 adds the small write endpoint described in `docs/FRONTEND_CONTRACT.md` §4, the two
beats merge into one continuous story — officer marks refused, relative calls about *that*
house, agent routes it — which is a visibly stronger demo. Worth asking for if there's time
before feature freeze.

## Recording notes (7:00–8:30 PM slot)

- Record **two takes**. The first one is always three minutes of learning where the buttons are.
- Screen-record the laptop at 1080p and shoot the phone separately if you can — picture-in-picture
  beats pointing a camera at a screen.
- The dark theme is deliberate: it survives projector washout and a phone at night. Don't
  "fix" the brightness in post.
- **Do not show the sign-in codes on camera.** They're printed on the sign-in screen in dev;
  sign in before you start recording.

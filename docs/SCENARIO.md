# The crisis scenario

The dispatch board has a **Live | Scenario** switch in its header. Scenario replays the 2025 Palisades
Fire (Jan 7, 10:00 to 00:30 Pacific) on the board's own households, with simulated statuses, calls and
suggestions. It is a layer over the live board: it writes nothing to the database, the phone line, the officer
queue or Realtime, what it shows is simulated, and switching back to Live restores the board exactly as it was.
The one live thing it reads is the phone line's feed, so a **real call** can change a house in it (see below).

## What is real and what is simulated

| Real | Simulated |
|---|---|
| The timeline: 24 beats with times and events from `docs/research/palisades-highlands.md` (LAPD and LAFD after-action reports, press). Each shows its source. | What happens at any one house: who refuses, who does not answer, who calls. |
| Each street's fire threat (`houses.fire_threat_level`, from `docs/research/street-threat.json`). It decides who is ordered out first and how bad it gets. | The calls, their callers and their distress. |
| The households' buildings (OpenStreetMap footprints). | The addresses and resident names, which are placeholders, as everywhere on this board. |
| Where the fire is documented to be, and when (13 places, each with its source), and roughly how big it was. | The shape of the fire between those places and how it grows: the red striped area on the map. |

Beats stay at block level and name no resident. No fatality is in the scenario.

## How the risk drives it

`lib/scenario/engine.ts` builds the whole day from the households, from a seeded random stream, so it plays the
same every time.

- **When a street is ordered out** comes from its threat level: extreme streets in the first hour, high streets
  after the 12:07 order, moderate streets in the afternoon, low streets after the 18:50 expansion. A few streets
  are pinned to their documented moment (Charmel Ln 10:43, Chastain Pkwy 10:50, Palisades Dr 11:21).
- **What happens to a house** is weighted by the same level: refusals, no-answers, people stuck leaving and
  calls to the line all run higher where the threat is extreme (`FATE` in `palisades.ts`).
- **Colours** use a TypeScript port of `house_color()` (`colors.ts`), run on the scenario's clock, so a clear
  turns grey when it stops being trusted. `test/scenario.test.ts` runs the same cases as
  `docs/sql/house_colors_v2.sql`.
- **How long a clear is trusted is six hours in the scenario** (`SCENARIO_FRESH_MIN` in `palisades.ts`), not
  the two hours the rest of the product uses. The scenario's households carry it as `fresh_min`, and
  `priority.ts` honours it, so the doors list, the "clears gone stale" count and the map legend all follow.
  The live board, the database's `house_color()` and the phone line (`server/src/routing.js`, `reports.js`)
  are unchanged at 120 minutes. Moving those too means a SQL change on the live project and two server files.
- **Calls** are routed by a port of `server/src/routing.js` (`routing.ts`): about half are answered from the
  record, which is the research's point that most calls were about people already safe.
- **A call changes its house the way the line does** (`reports.ts`, a port of `server/src/reports.js`): a caller
  saying someone is staying writes `refused`; a resident saying they left writes `self_out` (or `in_transit` if
  the house was marked staying); a relative saying they got out writes `in_transit`, unverified, and never
  clears a house, never overwrites "staying" or a fresh clear. Urgent calls (a person now) turn the house red
  until a newer status, and an officer visits a little later.

## Real calls

While the scenario runs, a **real** call into the line changes its house in the simulation, and takes priority
over it. The switch **Real calls update the simulation** (on by default) is in the scenario bar.

- Only calls that begin after the scenario starts count. The calls already on the line when you press
  Scenario or Restart are a baseline and are ignored, so is a call the feed replays that began before it.
- A call is taken in once the line has routed it. It lands in the queue at the scenario's current minute,
  marked **LIVE CALL**, with the line's own routing, severity and reason, and suggestions worked out against the
  simulated record.
- Its effect is what the line recorded: an urgent routing (`human_now`, a failed transfer, or a bypass) turns
  the house red, and the status the line wrote (`report_written`) is applied to the simulated house.
  `report_written` arrives on the phone line's `call_logged` event, so this needs `NEXT_PUBLIC_TELEPHONY_URL`.
- **The house is then locked** for the rest of the run: nothing the scenario had planned for it afterwards
  (officer visits, re-checks, its own calls) happens. A call that changes nothing locks nothing. A clear still
  ages to grey, since that is the rule and not a change. A second real call about the same house still applies.
- The real line looks the house up in the **real** records, which are all grey, and answers from those, not from
  the simulation. The call also still writes to the real database, as it always does. The scenario only reads it.
- Scrubbing back before the call hides it and unfreezes the house; scrubbing forward brings it back. Restart
  forgets the run's real calls.

## The fire

On the map, the fire is a solid red outline filled with thin red stripes, and it moves with the scenario's
clock. The legend labels it **Fire, simulated spread**. It is `lib/scenario/fire.ts`, and it is a drawing only:
no house's status, no street's order and no call reads it, so a house can be inside the stripes before its
street is ordered out (the AP found homes burning before the 12:07 order).

- **Real: the places and times.** `SEEDS` lists where the research has fire and when, each with its source: the
  first report above Piedra Morada Dr at 10:23, Via Floresta 11:05, the Bienveneda flank 11:12, Chastain 11:14,
  Lachman Ln 11:22, Palisades Dr's west side and Enchanted Way 11:24, Marquez Ave 11:25, Calvary Christian School
  11:59, Palisades Dr at Sunset 13:06, the Enchanted Way homes at 15:52, and the Highlands in the evening when the
  fire's heel moves north (the Vereda de la Montura facility, evacuated at 22:00). The coordinates are the real
  streets' own, from OpenStreetMap, not the board's placeholder households.
- **Real: roughly how big.** About 100 acres at 10:48 and 200 at 11:28 (radio traffic), more than 700 by 14:10
  (CAL FIRE), and 2,921 acres that evening
  ([timeline](https://www.aol.com/news/timeline-la-fires-early-weather-032509146.html),
  [Wikipedia](https://en.wikipedia.org/wiki/Palisades_Fire),
  [LA Times via Yahoo](https://www.yahoo.com/news/fast-moving-wildfire-erupts-pacific-185953466.html)). These
  figures are not in `docs/research`. The simulated area runs about 150, 300 and 1,000 acres at the first three
  moments and about 2,200 by midnight, and `test/fire.test.ts` pins it inside a band around each.
- **Simulated: everything between.** Each place starts a patch at its reported minute. A patch spreads fast
  south-southwest with the wind, slowly across and back, then creeps. The patches merge, and spot fires jump
  ahead of the front, as the reports describe. The edge wanders a little, deterministically. The outline is
  cut from that field (marching squares) and clipped to the board's perimeter, which hugs the shore, so the fire
  stops at PCH and never runs out over the water. Nobody published a perimeter for these hours that this board
  could draw, so this illustrates movement and is not a map of the burn.
- To change it, edit `SEEDS` (place, minute, how fast, how long). `fireAt(min)` is the outline at a minute and
  `fireReaches(lat, lng, min)` asks about one spot.

## Suggestions

Two kinds, both deterministic, both needing a dispatcher to confirm (DATA_CONTRACT §8). Confirming only marks
it in the simulation; nothing is sent.

- **Per call**, under each call in the queue: the rules of the removed `server/src/resources.js` (commit
  `37e16bb`), ported to `suggest.ts`. The street's threat sets the urgency.
- **Per street and per moment**, in the Suggested tab: streets with houses not yet reached, households staying,
  no answers or evacuees stuck; and the documented moments (a closure of Palisades Dr was requested at 11:52, a
  bulldozer was ordered at 14:15, the assisted-living evacuation at 22:00).

## Reading the threat from Supabase

`fetchBoard` now reads `houses.fire_threat_level` into `AddressState.threat`. If it is missing (memory mode, or
`npm run apply-threat` has not been run on the project) the scenario falls back to `lib/scenario/street-threat.ts`,
generated from the same research file:

```
node web/scripts/build-street-threat.mjs     # after editing docs/research/street-threat.json
```

A test fails if the two disagree.

## Not built yet

- Nothing reads the fire. A house inside the stripes is not marked threatened or destroyed, and the engine's
  order times still come from each street's threat level, whose streets sit in placeholder positions. The natural
  next step is for the engine to take a house's exposure from `fireReaches`.

- Confirming a suggestion does not change the simulated board. The natural next step is for a confirmed
  door-knock or re-contact to send a simulated team whose outcomes land on the map.
- The officer portal is not part of the scenario: an officer's tap there does not show up in it.
- Real calls update the simulation only where the phone line's feed is connected. In memory mode with no
  `NEXT_PUBLIC_TELEPHONY_URL` the switch is disabled.
- The doors list still grows late in the day, once clears older than six hours go stale. The scenario re-walks
  only the streets nearest the fire.

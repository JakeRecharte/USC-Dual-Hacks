# Comms Track Requirements

Oct 16, 2026 · @Jake

We are building a Retell AI voice line for the overnight supervisor of an LA 311/utility call center during a surge, one that answers what it safely can and hands everything else to a person.

## Concept

The person who decides is an overnight supervisor of a call line (assumed: LA 311 or a utility) facing a surge of calls and alerts nobody can fully verify. Our system takes the calls, sorts them by the gentlest safe response, and puts only what needs a person in front of that supervisor.

- **Track:** Communications (Retell AI lens, "Resilience Comms / On the Line").
- **Moment (assumed):** Harbor Night from the Extended Card, or a wildfire or outage surge. Confirm after the 6 PM reveal.
- **Second customer (assumed):** a clinic, utility or 311 after-hours line on an ordinary Tuesday, where the same triage cuts hold time and missed calls.
- **Ladder rungs we live on:** ask, slow, hold, hand to a person.
- **Supervisor's three questions we must answer:** who needs a person right now, what must never be automated, what happens when someone doesn't pick up.

Open: confirm the seat and moment with the team before Twist 1 (Fri 11:30 PM).

## Hackathon constraints

Submission is hard-capped at Sat 10 PM with no extensions, and three twists each give only 6 hours to respond.

| When | What | Implication |
| --- | --- | --- |
| Fri 6 PM | Problem reveal; project work may begin | Ideas and skills prepared earlier are fair game |
| Fri 9 PM | Teams locked (2–4 people) | Final roster decided |
| Fri 11:30 PM | Twist 1 | Policy config must change without a redeploy |
| Sat 4:30 AM | Twist 2 | Someone must be awake and able to respond |
| Sat 7:00 AM | Twist 3 | Each twist has a 6-hour response window |
| Sat 10 PM | Devpost deadline | Name + lens + one line, pitch deck, demo video, code repo, all teammates, responsible-use note |
| Sat midnight | 7 finalists notified | Prep the live demo overnight |
| Sun 12–3:30 PM | Finals, Ginsburg Hall | 5-min pitch + 5-min Q&A |

## Scoring and prize targets

Judges score five criteria from 1 to 5, and ties break on dual-use fit, so the second customer matters as much as the demo.

| Criterion | What we do about it |
| --- | --- |
| Dual-use fit | Name the second customer and the day they use it; show the same flow on a normal Tuesday |
| Technical execution | Real Retell phone line, real webhook, live dashboard, no mocked screens |
| Feasibility and impact | Rung engine and never-automate list a real supervisor would trust |
| Adapting to twists | Policy-as-config; change a threshold live and re-rank the queue |
| Demo and pitch | Judges call the line from their own phones |

**Prizes to aim at:** Retell lens prize ($200, trophy, fast-track interview), Best Build with IBM Bob (build with Bob and explain it on Devpost), Best Shift Adapter, Best Live Demo, then the $1,000 / $500 / $200 podium.

## Functional requirements

Must-haves are what we demo live; nice-to-haves go only if time remains after Twist 2.

**Must have**

1. Retell voice agent answers an inbound phone number and collects intent, location, urgency and language, asking one question at a time.
2. After each new detail, the agent calls a custom function that updates a structured call packet (same pattern as Sentinel's `create_emergency_call`).
3. A rung engine assigns each call one rung: answer, ask, SMS a link, queue with summary, or immediate human.
4. A never-automate list of hard triggers (medical emergency, injury, weapons, stated danger, distress cues, "I need a person") forces immediate human handoff.
5. A no-answer ladder: if a callback or supervisor doesn't pick up, try voice, then SMS, then escalate to the next human.
6. Corroboration: calls about the same place and topic cluster into one incident with a caller count.
7. A supervisor dashboard shows the live queue ranked by rung and corroboration, with transcript, summary and per-field confidence.
8. An audit log records every automated decision and every human override.

**Nice to have**

- Spanish plus one more language through Retell's multilingual support.
- SMS fallback for callers who can't talk.
- Map view with incident clusters.
- Post-call analysis feeding a shift summary for the day supervisor.

**Non-functional:** voice response around 600 ms (Retell's stated latency); the system defaults to a human whenever confidence is low or a service fails.

## Architecture

&#91;embedded content: call flow · 6 components\]

Retell sends a packet to the rung engine on every new detail. The engine stores it with the policy config and audit log in Supabase, and the dashboard shows the live queue. When a callback goes unanswered, the engine sends the caller back through Twilio SMS.

## How the stack works

Two functions share one data store: a primary call line that triages and tracks incidents, and an area alert that fires when reports pile up in one place.

**Function 1: Primary call line**

1. A caller dials the Retell number. The agent asks one question at a time: what happened, where, anyone hurt, preferred language.
2. After each answer the agent updates the call packet, and the engine categorizes it against the incident taxonomy.
3. At every update the decision tree runs, top rule first:
   - **Hard trigger** (injury, danger, distress, "I need a person"): hand to a human now. Never automated.
   - **Caller shows trauma or distress**, even on a known incident: human, not the known-issue message.
   - **Matches an open incident, but adds a new factor not in the taxonomy**: update the incident with the new detail and flag it for the supervisor.
   - **Matches an open incident, nothing new**: corroborate. Tell the caller it is known and being worked on, give the status, add them to the caller count.
   - **No match**: create a new incident and pick a rung by priority (ask, SMS link, queue with summary).
4. The agent only reads out status text a supervisor has approved on the incident record, so callers never hear a guess.

**Function 2: Area alert**

- **Trigger:** distinct callers or incidents in one area cross a threshold in the policy config, per area and time window.
- **Delivery:** a short Amber-Alert-style SMS plus a dashboard banner, not a phone call. It says what is happening, where, what to do, and who to contact.
- **Real alerts:** as far as I know, official Wireless Emergency Alerts go out only through government authorities (FEMA's IPAWS), so the demo sends SMS to opted-in numbers and says so.
- **Gate:** a supervisor approves each alert with one tap. Auto-send stays off by default, which also fits the never-automate list.

**Additions to build in**

- **Opt-in:** the agent offers area alerts at the end of a call; alerts go only to opted-in numbers and callers on the affected incident.
- **Abuse guard:** count distinct phone numbers, not calls, so one person cannot trip the threshold.
- **Spam control:** a cool-down per area, and an all-clear message when the supervisor closes the incident.
- **Unsure category:** treat as a new factor and send to a human rather than guessing.
- **Languages:** alert and known-issue templates in English and Spanish.
- **Audit:** log every known-issue message, every alert and who approved it.
- **Demo moment:** pass the threshold live and have the judges' phones receive the SMS.

This needs a separate incident record beside the call packet:

| Field | Purpose |
| --- | --- |
| `incident_id`, `category` | Taxonomy match, includes a "needs a person" bucket |
| `area` | Neighborhood or grid cell from the geocoded location |
| `status_text` | Supervisor-approved line the agent may read out |
| `distinct_callers` | Count used for corroboration and the alert threshold |
| `new_factors` | Details callers added that the taxonomy lacks |
| `alert_state` | none, pending approval, sent, all clear |

## Data schema

The Retell custom function sends one call packet, updated as details arrive. It adapts Sentinel's tool schema and adds the rung, corroboration and no-answer fields we need.

| Field | Type | Notes |
| --- | --- | --- |
| `caller_name`, `caller_phone` | string | Optional; caller may decline |
| `incident_type` | string | Free text plus a category from policy config |
| `location_text` | string | Geocoded later for clustering |
| `language` | string | Detected by the agent |
| `priority` | enum | low, medium, high, critical |
| `rung` | enum | answer, ask, sms\_link, queue\_summary, human\_now |
| `hard_trigger` | string or null | Which never-automate rule fired |
| `medical_emergency` | boolean | Forces `human_now` |
| `number_of_victims`, `weapons_present` | int, yes/no/unknown | Same as Sentinel |
| `confidence` | object | Per-field score; low confidence raises the rung |
| `corroboration_count` | int | Calls clustered with this incident |
| `no_answer_state` | enum | none, voice\_retry, sms\_sent, escalated |
| `notes` | string | Agent's one-line summary for the supervisor |

## Policy as config

Every threshold lives in one editable config row, so a twist is answered by changing a value, not the code.

- Hard-trigger keyword and cue list (the never-automate list).
- Confidence floor below which a call goes to a human.
- Corroboration count at which a cluster jumps a rung.
- No-answer retry timing and escalation order.
- Which incident categories the agent may answer on its own.

On change, the dashboard re-ranks the live queue immediately, which gives us a visible demo of "Best Shift Adapter." Store the config in Supabase and subscribe the dashboard to it via Realtime.

## Demo plan

The finals demo is a live phone call, not a recording, because Best Live Demo and the technical score both reward a working system.

1. Show the supervisor dashboard empty, then call the line from a judge's phone and watch the packet fill in live.
2. Run a scripted surge: 5–10 pre-recorded or teammate calls about the same location, showing the cluster and corroboration count climbing.
3. Trigger a hard rule on stage (a caller mentions an injury) and show the immediate human handoff.
4. Let a callback go unanswered and show the no-answer ladder escalate.
5. Change a policy value live to simulate a twist, and show the queue re-rank.
6. Close on the second customer: the same line on an ordinary Tuesday, with the hold-time or missed-call number we can defend.

Backup: a recorded run of steps 1–5 in case the venue network or phone service fails.

## Responsible-use note

Devpost needs two lines on misuse and mitigation. Draft:

- **Misuse:** a bad actor could flood the line with false reports to bury real calls or to push a fake incident up the queue, and a voice agent could wrongly tell a person in danger that they are handled.
- **Mitigation:** any danger cue goes straight to a human and the agent never says help is on the way; corroboration needs distinct callers, and every automated decision is logged for review.

If we build with IBM Bob, also note that its reported weaknesses (CLI malware manipulation, IDE data exfiltration) mean we review generated code and keep keys out of its workspace.

## Risks and open questions

- [ ] Confirm the seat and moment (Harbor Night vs. own) once the reveal drops.
- [ ] Ask organizers or the Retell rep for extra credits; the lens gives $10 per innovator, which a live surge demo may burn through.
- [ ] Ask whether reusing the Sentinel pattern is allowed; its repo shows no license, so we reimplement the idea and copy no code.
- [ ] Check that IBM Bob works with our stack before committing to the Best Build prize; its OAuth MCP behavior is unverified.
- [ ] Get a phone number provisioned in Retell and test inbound calls before Friday night.
- [ ] Pick a real or realistic second customer and one number we can defend (hold time, missed calls).
- [ ] Decide who stays awake for Twist 2 (Sat 4:30 AM).
- [ ] Ask a mentor from the roster who has run a call line; judges weigh mentored-by less, but their advice on never-automate cases is useful.
- [ ] Fallback if Retell or the venue network fails: scripted recording of the full flow.

## Roles and build timeline

Roles are placeholders until the team confirms its skills; Jake owns the stack choice.

| Role | Owns |
| --- | --- |
| Voice and prompt | Retell agent prompt, custom function, ladder logic, never-automate list |
| Backend | Webhook, rung engine, clustering, Supabase schema, Twilio SMS |
| Dashboard | React/Vite supervisor view, Realtime updates, policy editor |
| Pitch and demo | Second-customer story, deck, Devpost, demo video, responsible-use note |

| Window | Goal |
| --- | --- |
| Fri 6–11:30 PM | Retell number live, packet reaches the database, dashboard shows one call |
| Fri 11:30 PM–Sat 4 AM | Rung engine, hard triggers, Twist 1 response via config |
| Sat 4:30–11 AM | Clustering, no-answer ladder, Twists 2 and 3 |
| Sat 11 AM–6 PM | Polish, demo script, backup recording |
| Sat 6–10 PM | Pitch deck, demo video, Devpost; submit before 10 PM |
| Sun 12 PM | Finals pitch, 5 minutes plus Q&A |

## Sources

- [Dual-Use Hackathon page](https://www.innovatelosangeles.com/dual-use), plus the Field Manual and Participant Hub PDFs in the USC Dual Hacks project: schedule, scoring, prizes, tracks.
- [Sentinel (undroo/sentinel\_hack)](https://github.com/undroo/sentinel_hack): reference architecture and tool schema, ElevenLabs voice agent + n8n + Supabase + React dashboard. No license seen; pattern only.
- [Retell AI](https://www.retellai.com): voice agent platform, custom functions, call transfer, post-call analysis, SMS.

Other winners studied for patterns: vitality, HereToHelp.ai, Last Mile, First Assist, Hearth, FirstResponder Relay, Lifeline, OperAItor, Project AsTeR. Retell latency and credit figures come from earlier research and the prize flyer; verify before relying on them.

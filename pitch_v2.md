# Pitch: Welfare-Check Triage for Wildfire Evacuations

## Problem

**During wildfires, welfare-check calls send responders to homes already evacuated.**

---

## 1. Why This Problem Needs Solving

### The scenario: Palisades Fire, January 7, 2025

- LAFD responded to **3,624 911 calls in 24 hours**, against a normal day of just under 1,500.
- LAPD logged **160+ evacuation-assistance calls** in a single incident file. The calls came from people needing help and from people calling about friends and family. (The count leaves out calls logged as information-only, so the real number is higher.)
- **Many of those calls turned out to be about people who had already evacuated.** Callers dialed 911 because cell networks were down or overloaded and they couldn't confirm their loved ones got out.
  - *Illustrative caller:* "My parents are on Sunset Mesa, they're not answering."
- Every call needed a person to answer it, take the details, and decide what to do. Some became patrol cars sent to homes that were already empty.
- Meanwhile, the people who really needed help were in the same pile. **Many of the people reported stuck were elderly or disabled.**
- **At 2:57 PM, the LAPD watch commander said they were not taking any addresses for evacuation at the time.** The system had stopped accepting requests altogether.

### The capacity problem is national, not just LA

- A 2023 survey of 774 911 centers across 47 states found that more than half face a real staffing emergency.
  - 166 centers had 30–49% of positions vacant, 92 had 50–69% vacant, and 13 had 70% or more vacant.
  - More than a third had fewer positions filled in 2022 than in 2019, even as call volume kept rising.
- **75% of 911 centers lack the budget to hire more staff** (NENA, 2024).
- **Takeaway:** hiring won't fix this. Centers need to spend each person's time better.

### Why it happens

- **Sweep results don't reach the phones.**
  - On day one, smoke forced officers to give up door-to-door evacuations and use their PA systems instead, so no house-by-house record existed.
  - The command teams that first day kept no chronological log.
- **Refusals travel by word of mouth.** In LAPD's day-one log, a refusal by elderly residents at one address was relayed by a city council district representative, not by an officer's report.
- **Communications broke.** A key radio repeater was shut down that afternoon, and at times the command post reached officers through a commander's list of their personal cell numbers.
- **Zones don't match how police work.** LAPD had never been trained on Genasys, the system Cal Fire used to draw evacuation zones, and the zones didn't line up with LAPD's patrol districts or neighborhoods.
- **The worst case:** in Colorado's 2012 Lower North Fork Fire, firefighters were going door to door while the sheriff's office didn't know, and dispatchers were telling callers there were no evacuations. Three residents died.

### People who stay are common, not edge cases

- California can't force adults to leave.
- About 80 Altadena residents stayed while nearly 88,000 people were under evacuation orders.
- In Riverside County's Mountain Fire, about 80% had left before deputies knocked and roughly 5% stayed. Deputies asked those who stayed for next-of-kin and dentist contact info, but that information never reached a 911 call-taker.

---

## 2. How Our Solution Eases It

### In the field (one tap)

The officer marks each address as **Cleared**, **Refused**, or **No answer**. The update is timestamped, and if there's no signal, the phone holds it and sends it once back in range.

- **Fixes:** the missing day-one record, refusals traveling by word of mouth, and broken radio.

### On the line (Retell voice agent)

A welfare call comes in, and the agent asks three things:

1. Who you're calling about
2. Their address
3. Whether you're with them now

Then it checks the address against the **live perimeter** and the **sweep log**, and routes the call:

| Status | What the agent does | What it saves |
|---|---|---|
| **Cleared (time)** | Tells the caller when the house was checked and gives the shelter info. A human is still available. | A patrol car trip and several minutes of call-taker time |
| **Refused / stayed** | Moves the call up the queue and hands the human the officer's note. | The officer's knowledge, which would otherwise be lost |
| **Unknown, inside the perimeter** | Moves the call up the queue and adds the address to the door-knock list. | Sweep teams go to the houses nobody has checked yet |
| **First-hand emergency** | Sends it straight to a human, no questions asked. | Nothing is ever delayed |

### Safety rules

- **The agent can only move calls up the queue, never down.** It never closes a call.
- **You can't know a home is empty.** The agent reports the last known status and when it was recorded, never "empty."
- **Old records count for less.** "Cleared 6 hours ago" in a fast-moving fire is weak evidence, so the agent always tells the caller the time.
- **New information beats the record.** If the caller says "he texted me 20 minutes ago, he's still there," that overrides "Cleared."
- **Silence isn't information.** No reply stays "Unknown."

### Result

The same staff and the same trucks, sent only where they're still needed.

### Ordinary-Tuesday customer (dual-use): routine welfare checks

**Scenario:** "I haven't heard from my grandma in 2 weeks. She's old and frail, and she might be hurt."

Welfare checks are already one of the most common police calls. At one Colorado dispatch center, they were the most frequently dispatched police call type (7.8%) and rose 23% year over year. The same agent handles them every day, using the same questions and the same status log.

**How severity is scored:**

| Signal | Example | Why it matters |
|---|---|---|
| **Time since last contact** | 6 hours vs. 2 weeks | The longer the silence, the higher the risk |
| **Vulnerability** | Age, frailty, lives alone, needs medication or oxygen, limited mobility | Moves the time threshold: 12 hours of silence from someone on oxygen is worse than 2 weeks from a healthy 40-year-old |
| **Red flags** | Mail piling up, a newly unanswered phone, a missed appointment, a fall history | Each one moves the call up the queue |
| **Last known check** | An officer or neighbor already checked today | Prevents a second visit when someone already knows she's okay |

**The rule stays the same:** severity can only move a call up the queue. Any sign of a first-hand emergency goes straight to a human.

**Why time works better than asking "is this urgent?":** callers have little reason to exaggerate a date, and "when did you last talk to her?" has a concrete answer. Everyone says their call is urgent.

**Results:**
- High score → dispatch now.
- Low score → logged, with a follow-up check scheduled and the caller told when it will happen.
- Either way, the record is there the next time someone calls about that address.

---

## 2b. Stretch Goal: Evacuation Status Check-In Alerts

**The idea:** when an area goes under evacuation order, ask residents directly: *"Have you evacuated, are you evacuating, or are you staying?"* Their replies fill in the sweep log before an officer ever knocks.

### What we can and can't send

- **We can't send the phone-wide emergency alert ourselves.** Only government alerting authorities with a FEMA agreement can send Wireless Emergency Alerts, and those alerts are **one-way**, so nobody can reply to them.
- **What we can do:** plug into the county's existing alert platform. LA County uses Genasys ALERT; the City of LA uses Everbridge. Two-way messaging works through the channels below.

| Channel | Who it reaches | Can people reply? |
|---|---|---|
| **Emergency phone alert + a link** | Every phone in the zone | Only by tapping the link, which needs cell data |
| **Opt-in text poll** ("Reply 1, 2, or 3") | People signed up for Alert LA County / NotifyLA | Yes |
| **Outbound voice call (Retell)** | Registered landlines, plus older residents on a vulnerability list | Yes, by speaking or pressing a key |

### The three answers, plus silence

| Reply | Status in the log | What happens next |
|---|---|---|
| **1: Evacuated** | **Self-reported out (time)** | Welfare callers asking about this address hear that the resident reported being out, and when |
| **2: Evacuating** | **In transit (time)** | Temporary status. If there's no follow-up within a set window, we ask again. If there's still nothing, it goes back to Unknown |
| **3: Staying** | **Refused / stayed** | Moves to high priority. Three quick follow-up questions: how many people are there, does anyone need medical or mobility help, and is there a safe place to shelter |
| **No reply** | **Unknown** | Goes on the door-knock list. Silence is never read as gone or as trapped |

### What it adds

- **Sweep teams knock smarter.** They go first to "Staying" and "Unknown" addresses, not to the people who already reported leaving.
- **Welfare calls get answered faster.** More addresses have a recent, timestamped status before the worried family member calls.
- **People who stay become known.** The resident tells us directly, not a council representative relaying it hours later.

### Risks and safeguards

- **Looting:** a list of empty homes is a target. LAPD recorded 24 burglaries in the Palisades evacuation zones. So the agent **never says "empty."** It says "the resident reported being out at 3:40 PM," and only to a caller who can name the resident.
- **Silence and bias:** the people who reply are mostly the ones who are fine. No reply stays Unknown and is never treated as good news.
- **Alert fatigue and trust:** in January 2025, a single county alert was sent by mistake to nearly 10 million residents. Check-in messages go only to the targeted zone, through the county's own platform, and are clearly labeled.
- **False or prank replies:** a reply only updates the status. It never takes an address off the door-knock list for an active "Staying" or emergency report.
- **The rule still holds:** replies can move an address up the queue, but they can only lower its priority when backed by a timestamp the caller hears.

### Demo plan

Use 10 fake residents in a mocked evacuation zone:
1. Send a mock text poll and a Retell outbound call.
2. Residents reply 1, 2, 3, or nothing.
3. The status board and door-knock list update live.
4. Then a welfare call comes in about one of those addresses, and the agent answers using the reply.

---

## 3. Why We're Different from Existing Competitors

| Competitor | What it does | What it doesn't do |
|---|---|---|
| **Aurelian** (YC, $14M Series A) | AI agent for everyday non-emergency calls (noise, parking, lost property) that sends emergencies to a human | Not built for crisis welfare calls. Has no field data. |
| **Carbyne Call Triage** (being acquired by Axon) | During call spikes, tells callers the center already knows about the incident. Live in New Orleans. | Groups calls **by incident** ("we know about the fire"). Can't answer **"was my mom's house checked?"** |
| **Genasys** (LA County) | Sends zone-based evacuation alerts and maps out to the public | Broadcast only. Doesn't check incoming calls. Doesn't record what happened at each house. |
| **Everbridge polling** | Opt-in text polls ("press 1 if safe") | Only reaches people who signed up. Replies don't reach the 911 call-taker. |

**Our one-line difference:** competitors group calls by *incident*. We match calls by *address and person*, against what officers found at the door. That match between field results and incoming calls is the part nobody owns.

**Honest risk:** Axon (with Carbyne and Prepared) could build this. Our pitch is to be the field-to-phone layer that plugs into their call-handling platforms, not to replace them.

---

## 4. Twist 1: Federal Funding Pathway

### Primary: DHS Science & Technology, Silicon Valley Innovation Program (SVIP)

- Gives startups up to **$800K of non-dilutive funding**, meaning they don't have to give up equity, across four phases.
- Each phase pays $50K–$200K and runs 3–6 months, moving from proof of concept, to a pilot-ready prototype, to a pilot in real operations, to testing across scenarios.
- **Support for first responders** is one of the program's listed technology areas.
- It's fast: program officials have said they can sign a contract within 45 days of the first meeting.
- **Fit:** our Phase 1 is this weekend's demo. Phase 3 is a pilot with one 911 center during fire season.

### Alternative: NTIA/NHTSA 911 Grant Program (how our customers pay us)

- In 2019, this federal program awarded more than **$109 million to 34 states and two tribal nations** to upgrade to Next Generation 911 (NG911).
- It funds connecting 911 centers to other emergency response organizations, which is exactly our field-to-phone link.
- **Grants go to states, not startups.** So this isn't money we apply for. It's the budget our customers use to buy us. We position the product as an **NG911 system upgrade, not staffing**, because salary money doesn't exist and system-upgrade money does.

### Also worth applying to

DHS S&T's Small Business Innovation Research (SBIR) program, for early-stage R&D grants.

---

## 5. Twist 2: Going Global

**The gap is the same everywhere:** field crews know who left, and the emergency line doesn't. What changes is who does the sweeps and which number people call.

### Australia: where staying is official policy

- Australia's long-standing official advice is **"Prepare, stay and defend, or leave early."**
- In a survey of 584 residents in at-risk areas, **24% said they planned to stay and defend their home.**
- **Black Saturday, 2009:**
  - Of more than 10,000 calls to the bushfire information line, **82% went unanswered**.
  - Triple-zero (000) operators were sending callers who wanted evacuation advice over to that same information line.
  - When the information line overloaded, calls were diverted to Centrelink, the national welfare agency.
- **Fit:** "Refused / stayed" is a core status here, not an edge case. Our agent becomes the overflow for the information line, linked to field checks.

### Greece: the alert system exists, the incoming-call gap remains

- In the 2018 Mati fire, the opposition party asked publicly why the 112 alert system had not operated. More than 100 people died.
- Emergency services were overrun with calls about missing people.
- Greece now sends **112 SMS evacuation orders that name specific routes**.
- **Fit:** Greece fixed outgoing alerts but not incoming welfare calls. We plug into the European 112 standard the same way we plug into 911.

### China: the sweep network already exists

- China has **several million community "grid managers"** who handle information collection and safety inspections in their neighborhoods.
- During a 2026 Chongqing landslide, grid managers knocked on every door to get residents out.
- **Fit:** China already has the people doing sweeps. Our product digitizes the grid manager's door-knock record and gives it to the call-takers on **119 (fire)** and **110 (police)**.
- **Rollout path:** sell to government emergency management offices, not individual agencies.

### What changes per country

| | US | Australia | Greece / EU | China |
|---|---|---|---|---|
| Emergency number | 911 | 000 / 112 | 112 | 119 / 110 |
| Who does sweeps | Police and fire | Fire and SES volunteers | Fire and civil protection | Grid managers |
| Default policy | Mandatory evacuation | Stay or go | Systematic evacuation | Mandatory evacuation |
| What we add | Field-to-phone link | Overflow for the info line | Incoming-call side of 112 | Digital grid reports |

**What stays constant:** the three questions, the status log, and the rule that the agent can only move calls up the queue. Retell voice agents support multiple languages, which matters for multilingual cities everywhere.

---

## 6. Twist 3: Poster Layout (for Demo Day)

- **Headline:** "Was Mom's House Checked?"
- **Subhead:** During wildfires, 911 sends responders to homes that are already empty. We connect the door-knock to the phone line.
- **Left panel, the problem:**
  - "160+ evacuation calls in one day. Many for people already safe." (LAPD, Palisades Fire 2025)
  - One stat: 75% of 911 centers can't afford to hire.
- **Center panel, how it works (three steps with icons):**
  1. Officer taps Cleared, Refused, or No answer.
  2. A caller asks about an address.
  3. The agent answers with the time, or moves the call up the queue to a human.
- **Right panel, why us:** a three-row mini comparison (Aurelian / Carbyne / Us), plus the line "We match by address, not by incident."
- **Bottom strip:**
  - Dual-use: the everyday "mom isn't answering" welfare check
  - Funding: DHS SVIP
  - Global: 911 / 000 / 112 / 119
- **QR code** to the Devpost page or demo video.

---

## Sources

- [LAPD 2025 Palisades Fire After-Action Report](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf)
- [CNN transcript, Jan 8 2025 (LAFD call volume)](https://prod.transcripts.cnn.com/show/cnr/date/2025-01-08/segment/24)
- [911.gov: Survey on 911 staffing crisis (IAED/NASNA)](https://www.911.gov/newsletters/issue-14/survey-more-than-half-of-911-centers-face-staffing-crisis)
- [NENA: 2024 Pulse of 9-1-1 Survey](https://www.nena.org/news/669810/Survey-Reveals-Urgent-Challenges-in-9-1-1-Centers-Amid-Staffing-Shortages--Technological-Gaps.htm)
- [Firehouse: Colorado sheriff unaware of FD evacuations](https://firehouse.com/home/news/10692184/colo-sheriffs-office-was-unaware-fd-was-making-evacs)
- [NBC News: Holdouts defy wildfire danger](https://www.nbcnews.com/id/wbna32655676)
- [Shafaq News (citing WSJ): LA residents refuse to evacuate](https://www.shafaq.com/en/World/LA-residents-refuse-to-evacuate-guard-homes-against-fire-and-looting)
- [Idyllwild Town Crier: Mountain Fire evacuation](https://idyllwildtowncrier.com/2013/08/16/post-mountain-fire-evacuation-sheriff-patrols-kept-order/)
- [TechCrunch: Aurelian](https://techcrunch.com/2025/08/27/911-centers-are-so-understaffed-theyre-turning-to-ai-to-answer-calls)
- [Carbyne: Call Triage launch](https://carbyne.com/?p=1520)
- [Cybernews: New Orleans uses Carbyne AI triage](https://cybernews.com/ai-news/new-orleans-lets-ai-agents-take-911-calls/)
- [Police1: Axon to acquire Carbyne](https://www.police1.com/police-products/police-technology/software/rms/axon-to-acquire-carbyne-uniting-cloud-infrastructure-and-ai-to-redefine-the-911-experience)
- [Genasys: 2025 LA Wildfires case study](https://genasys.com/content/uploads/2024/03/2025-Los-Angeles-Wildfires.pdf)
- [Everbridge polling notifications](https://supportcenter.everbridge.com/hc/en-us/articles/19141934376859-EBS-What-Is-a-Polling-Notification-Used-for-in-Everbridge-Suite)
- [DHS SVIP program summary](https://diie.substack.com/p/dhs-silicon-valley-innovation-program)
- [AFCEA: DHS SVIP contracting speed](https://www.afcea.org/signal-media/homeland-security/homeland-securitys-innovation-station)
- [DHS S&T: Work with S&T (SBIR)](https://dhs.gov/sites/default/files/publications/insightsoutreach_2021.02.02_workwithsandt_3654_0.pdf)
- [NTIA: $109M 911 Grant Program awards](https://www.ntia.doc.gov/press-release/2019/departments-commerce-and-transportation-announce-109-million-grants-modernize)
- [911.gov: 911 Grant Program description](https://www.gov1.com/grants/articles/911-grant-program-awards-announced-yKOWuiCxrjCj4OMZ/)
- [Black Saturday Royal Commission: info line calls](https://karenkissane.com/bushfire-help-calls-stranded-in-system/)
- [Black Saturday: calls diverted to Centrelink](https://karenkissane.com/?p=650)
- [Australia "Stay or Go" policy](https://www.firerescue1.com/wildfire-prevention/articles/stay-or-go-australian-approaches-to-wildfire-J69jfYzv6T6TFpVs/)
- [BNHCRC: Stay-and-defend survey](https://bnhcrc.com.au/node/1746)
- [To Vima: Mati 2018 and 112](https://www.tovima.gr/2018/07/27/international/new-democracy-demands-resignations-over-management-of-deadly-forest-fire/)
- [CTIF: Mati 2018 missing-person calls](https://www.ctif.org/zh-hans/node/1334)
- [To Vima: 112 SMS evacuation alert example](https://www.tovima.com/society/wildfire-breaks-out-near-rafina-eastern-coast-attica/amp/)
- [China Daily: Grid managers in Chongqing landslide evacuation](https://global.chinadaily.com.cn/a/202607/20/WS6a5d82e6a310986e2b466220.html)

# Palisades Highlands, the Palisades Drive corridor, Marquez Knolls and Ridgeview: Palisades Fire research (Jan 7, 2025)

Compiled Oct 17, 2026. Scope: the 2025 Palisades Fire only. Nothing here comes from the Eaton Fire.

**Source key** (used inline throughout):
- **LAPD AAR**: [LAPD 2025 Palisades Fire After-Action Report](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) (Police Commission item BPC 25-305). Times come from its CAD/radio chronology. Page numbers are the PDF's printed page numbers.
- **LAFD AAR**: [LAFD Palisades Fire After-Action Review, final, Oct 8, 2025](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf).
- **DINS**: CAL FIRE Damage Inspection data. I pulled all 12,137 Palisades records from CAL FIRE's public [POSTFIRE_MASTER_DATA_SHARE feature service](https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/POSTFIRE_MASTER_DATA_SHARE/FeatureServer/0) (filter `INCIDENTNAME like '%Palisades%'`) on Oct 17, 2026, and grouped them by street myself. The fire-wide totals reproduce CAL FIRE's published figures exactly: 6,845 destroyed and 975 damaged (732 "Affected", 171 "Minor", 72 "Major"). DINS counts *structures*, so a condo building counts as one. A "No Damage" row only exists where an inspector logged one, so counts of undamaged structures are incomplete.
- **ACS**: US Census American Community Survey 2020–2024 5-year estimates, retrieved through the [Census Reporter API](https://censusreporter.org/profiles/86000US90272-90272/) (tables B01001, B11001, B11007, B25001, B25003, B25024). The survey years all predate the fire.

---

## Strongest facts for a 5-minute pitch

1. **Most of the 911 "check on my family" load was for people who were already safe.** On Jan 7, LAPD Communications got "over 160 calls for assistance," and "it soon became evident that many of the calls were generated for individuals who had been successfully evacuated." Callers dialed 911 because "cell phone networks in the area were either down, or overburdened" and they "could not verify that their loved ones had made it to safety." ([LAPD AAR, p. 15](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf))
2. **Dispatch stopped taking evacuation addresses.** At 14:57 on Jan 7, "the West LA Watch Commander advised they were not taking any addresses for evacuation at the time." ([LAPD AAR, p. 53](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf))
3. **One road out, and it burned.** The Highlands HOA says "Palisades Drive is the SOLE EXIT from the Palisades Highlands" ([Highlands Recreation Association](https://highlandsrecreation.com/page/19759~305832/emergency-information)). At 11:59, LAPD logged "gridlock on Palisades near Calvary Christian School, and fire was on both sides of Palisades Drive." At 13:06, drivers at Palisades and Sunset were told to leave their cars and go on foot. ([LAPD AAR, pp. 50–51](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf))
4. **Homes were burning before the evacuation order.** Homes were burning on Lachman Lane at 11:27. The first evacuation order went out at 12:07, "about 40 minutes after some of those homes were already burning" ([AP via PBS, Jan 18, 2025](https://www.pbs.org/newshour/nation/homes-were-burning-and-roads-jammed-before-evacuation-order-for-palisades-fire-ap-finds)). The LAFD confirms the 12:07 order time ([LAFD AAR, p. 32](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)).
5. **A Highlands assisted-living facility needed 12 ambulances that night.** Around 22:00 on Jan 7, LAFD evacuated an assisted-living center on the 17300 block of Vereda de la Montura: "24 staff members and 40 patients, 14 of whom were non-ambulatory." EMS requested 12 ambulances, and "All 64 lives were saved." ([LAFD AAR, p. 36](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf))
6. **The ignition neighborhood lost about one home in five. The neighborhood below it lost more than half.** In the Highlands, DINS shows 214 of 988 inspected residential structures destroyed (22%). On the Marquez Knolls streets the figure is 375 of 688 (55%) ([DINS](https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/POSTFIRE_MASTER_DATA_SHARE/FeatureServer/0), my aggregation). LAPD's Senior Lead Officer gave a matching estimate: about 20% of Highlands residences "completely burned down" ([Palisadian-Post, Jan 19, 2025](https://palipost.com/highlands-residents-able-to-return-to-area/)). Where the fire started is a poor predictor of which homes were lost, so a triage tool has to check the actual address.
7. **Older adults live in more than 4 in 10 Palisades households.** In ZIP 90272, 3,613 of 8,357 households (43%) include someone 65 or older, and 1,410 households are a person 65+ living alone. Residents 80 and older number 1,490 (7.0% of 21,390 people). ([ACS 2020–2024 via Census Reporter](https://censusreporter.org/profiles/86000US90272-90272/))
8. **Re-entry was gated on a verified address list.** Highlands residents returned on Jan 19 under Genasys zone LOS-0767-J. Each person's address was "cross-referenced with the Genasys Protect website," and CHP escorted residents in "10 cars at a time." ([LAPD AAR, p. 27](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf))

---

## 1. Streets and household counts

### Palisades Highlands (board zone PAL-03)

These are the residential streets DINS geolocates in the Highlands (latitude ≥ 34.065, north end of Palisades Dr) ([DINS](https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/POSTFIRE_MASTER_DATA_SHARE/FeatureServer/0)):

Palisades Dr (the Highlands section is roughly the 1200–2000 blocks plus the 17000–17200 blocks), Piedra Morada Dr, Calle Victoria, Vereda de la Montura, Chastain Pkwy (E and W), Michael Ln, Avenida de Santa Ynez, Avenida de la Herradura, Avenida de Cortez, Calle Arbolada, Calle Brittany, Calle Haleigh, Calle Jermaine, Calle de Sarah, Calle de Marisa, Calle de Catalina, Calle de Palermo, Calle de Sevilla, Calle de Madrid, Calle del Jonella, Calle Patricia, Calle Bellevista, Calle Montecito, Calle de Cielo, Calle de(l) Estribo, Camino de Yatasto, Cuesta Linda, Paseo de Oro, Paseo Agua Azul, Paseo Antigua, Paseo de los Arboles, Monte Hermoso Dr, Monte Alto Pl, Monte Grande Pl, Cumbre Alta Ct, Cumbre Verde Ct, El Bosque Ct, Via La Costa, Via Pacifica, Palisades Cir.

- **Egress.** "Palisades Drive is the SOLE EXIT from the Palisades Highlands." A fire road at the bottom of Piedra Morada "can ONLY be accessed at the discretion of the LAFD or LAPD," and it leads to Lachman Ln, Via Floresta and Bienveneda ([Highlands Recreation Association](https://highlandsrecreation.com/page/19759~305832/emergency-information)). AP reports that the emergency road "was overrun with flames on Jan. 7, residents said" ([AP via PBS](https://www.pbs.org/newshour/nation/homes-were-burning-and-roads-jammed-before-evacuation-order-for-palisades-fire-ap-finds)). The LAFD AAR recommends a second evacuation route because "there was only one means of egress" ([LAFD AAR, recommendation 14](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)).
- **Household counts.** Census tract 2626.01 covers the Highlands; I checked this by geocoding points on Palisades Cir, Michael Ln, Calle Victoria and Piedra Morada with the [Census geocoder](https://geocoding.geo.census.gov/geocoder/). The tract has 3,446 residents, 1,284 households and 1,354 housing units. Of those households, 1,206 own and 78 rent. The units are 831 single-family detached and 445 single-family attached ([ACS 2020–2024](https://censusreporter.org/profiles/14000US06037262601-census-tract-262601-los-angeles-ca/)). DINS logged 988 residential structures in the Highlands. I found no HOA or news count of homes: **not found**.

### Palisades Drive corridor (Sunset Blvd up to the Highlands)

- The lower corridor, around the 500–700 blocks near Sunset, holds the 75-unit **Sea Ridge** condominiums at the 600 block ([LAFD AAR, p. 25](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)) and **Calvary Christian School** at 701 Palisades Dr ([LA Times via Yahoo, Jan 7, 2025](https://www.yahoo.com/news/further-die-fleeing-flames-palisades-004458231.html)). LAPD logs also mention Palisades Circle, which is in the Highlands at the top of the corridor ([LAPD AAR, p. 53](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf)).
- Between roughly the 800 and 1100 blocks the road runs through canyon with no DINS-inspected structures.

### Marquez Knolls, Ridgeview Country Estates, Bienveneda (board zone PAL-02)

- **Marquez Knolls / Lower Marquez:** Lachman Ln, Charmel Ln (the LAFD AAR calls it "Charmel Road (known as Charmel Lane)"), Charmel Pl/Ct/Dr, Tellem Dr, Enchanted Way, Enchanted Pl, Glenhaven Dr, Jacon Way, El Oro Ln, Merrivale Ln, Pequeno Pl, Donaire Way, Turquesa Ln, Duende Ln, Vista Grande Dr, Luna Vista Dr, Glynn Dr, Marquez Ave, Marquez Terrace, Marquez Pl, Linda Terrace, Via Santa Ynez, Dulce Ynez Ln, Donna Ynez Ln ([DINS](https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/POSTFIRE_MASTER_DATA_SHARE/FeatureServer/0); neighborhood names from [LAFD AAR, pp. 24–29](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)).
- **Ridgeview / Bienveneda:** Bienveneda Ave and Pl, Via Floresta, Floresta Pl, El Hito Cir/Ct/Pl, Bella Oceana Vista (written "Bell Oceana" in the LAPD log), Shadow Mountain Dr ([LAPD AAR, pp. 11, 49](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf)).
- **Household counts.** Census tract 2626.04 covers Marquez Knolls along with Bienveneda, Lower Marquez, Castellammare and the Sea Ridge area, so it is wider than the neighborhood alone. It has 6,106 residents, 2,266 households and 2,573 housing units, with 563 renter households ([ACS 2020–2024](https://censusreporter.org/profiles/14000US06037262604-census-tract-262604-los-angeles-ca/)). I found no count for Marquez Knolls by itself: **not found**.

### Board mismatches the team should know about
- The board puts **Enchanted Way** in PAL-03 (Highlands). LAFD places it in "the Marquez Knolls community" ([LAFD AAR, p. 28](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)), and DINS puts it at about 34.050 N, near Marquez Ave. The JSON keeps the board's `zone_id` so it joins correctly, but uses the real neighborhood name.
- The board puts **Jacon Way** in PAL-04 (Alphabet Streets). DINS places it in Marquez Knolls, next to Enchanted Way.
- DINS has no records under the names **Breve Way, Sunset Mesa Dr, Bashford St, Carey St, Dryad Rd, Corto Pl, Sage Ln, Haldeman Rd, Mabery Rd, Channel Rd or Entrada Dr**. **Ida Ave** appears only as "Ida Street," with 2 records. Sunset Mesa is a neighborhood whose streets in DINS are Coastline Dr, Wakecrest Dr, Kingsport Dr, Seahorn Dr, Surfwood Rd and Castlerock Rd; that identification is mine and lower confidence. The JSON marks all of these streets as low or lower confidence.

---

## 2. Fire impact by street and neighborhood

### Neighborhood totals (DINS, my aggregation)

| Area | Inspected structures | Destroyed | Damaged | No damage | Residential destroyed |
|---|---|---|---|---|---|
| Palisades Highlands (lat ≥ 34.065) | 1,042 | 222 | 71 | 749 | 214 / 988 (22%) |
| Marquez Knolls street set (above) | 764 | 431 | 99 | 232 | 375 / 688 (55%) |
| Ridgeview / Bienveneda set (above) | 314 | 93 | 36 | 185 | 82 / 280 (29%) |
| Sunset Mesa streets (bounding box) | 532 | 238 | 98 | 196 | 237 / 519 (46%) |
| Whole Palisades Fire | 12,137 | 6,845 | 975 | 4,261 | 5,566 / 9,933 (56%) |

Source: [DINS](https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/POSTFIRE_MASTER_DATA_SHARE/FeatureServer/0). The Highlands figure is consistent with LAPD's "about 20%" estimate ([Palisadian-Post, Jan 19, 2025](https://palipost.com/highlands-residents-able-to-return-to-area/)) and with Circling the News, which reported "About 20 percent of the residences in the Highlands" burned ([Circling the News, Jan 19, 2025](https://www.circlingthenews.com/?p=34662), paywalled).

### Focus streets (DINS counts: destroyed / inspected)

| Street | Destroyed / inspected | What happened (sourced) |
|---|---|---|
| Palisades Dr (all) | 29 / 136 | The lower corridor survived: the 600 block (Sea Ridge) had 0 destroyed of 26, and the 700 block 1 of 21. Losses were concentrated in the Highlands: the 1200 block lost 7 of 7 and the 1800 block 7 of 7, all multi-residence structures. The 1700 block lost 3 of 10. DINS has no 1400-block records. ([DINS](https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/POSTFIRE_MASTER_DATA_SHARE/FeatureServer/0)) |
| Piedra Morada Dr | 3 / 40 | Ignition-area street, mostly saved. LAFD says homes off "Chastaine Parkway and Piedra Morada Drive" were among "the only communities able to be protected in the first hour" ([LAFD AAR, p. 28](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)). NBC says other houses on the street "survived" ([NBC News, Jan 11, 2025](https://www.nbcnews.com/news/us-news/pacific-palisades-highlands-fire-first-hours-rcna187156)). |
| Calle Victoria | 0 / 5 | Second 911 location. DINS logged only 5 structures. |
| Chastain Pkwy E / W | 15 / 34 (E); 2 / 27 (W) | LAFD set up structure defense here at 10:50 ([LAFD AAR, p. 22](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)). |
| Vereda de la Montura | 0 / 1 | DINS coverage is nearly empty. LAFD reports "multiple structures around the facility had burned to the ground" by dawn on Jan 8 ([LAFD AAR, p. 36](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)). |
| Michael Ln | 29 / 91 | No street-level timing found. |
| Avenida de la Herradura | 39 / 92 | No street-level timing found. |
| Avenida de Santa Ynez | 1 / 68 | Largely spared. |
| Avenida de Cortez | 0 / 96 | Spared. |
| Calle Arbolada | 0 / 36 (4 damaged) | Largely spared. |
| Charmel Ln | 16 / 66 | Fire reached it first, at 10:43 ([LAFD AAR, p. 21](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)). |
| Lachman Ln | 87 / 155 | Homes burning at 11:27 ([AP via PBS](https://www.pbs.org/newshour/nation/homes-were-burning-and-roads-jammed-before-evacuation-order-for-palisades-fire-ap-finds)). |
| Enchanted Way (+ Pl) | 41 / 69 (+ 6 / 8) | Spot fires at 11:24 ([LAFD AAR, p. 28](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)). |
| Bienveneda Ave | 80 / 180 | The eastern flank was at the Bienveneda cul-de-sac by 11:12 ([LAFD AAR, p. 25](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)). |
| Marquez Ave | 45 / 56 | Structures igniting in Lower Marquez by about 11:25 ([LAFD AAR, p. 28](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)). |
| Via Floresta / Floresta Pl | 1 / 19; 0 / 19 | The fire reached these streets around 11:05, but they were defended and saved ([LAFD AAR, p. 28](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf); [LAPD AAR, p. 11](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf)). |
| Glenhaven Dr | 33 / 41 | A fatality on the 1000 block (see §6). |

### How the threat levels in `street-threat.json` were assigned
- **extreme**: an AAR or AP timestamp shows fire on or at the street before about 14:00 on Jan 7, or the street is the only way out (Palisades Dr). This measures *threat*, so a street can be extreme and still mostly survive. Via Floresta, Floresta Pl and Piedra Morada are examples, and that gap is a good demo point.
- **high**: documented threat or defense on Jan 7, or no timing evidence but at least 40% of DINS-inspected structures destroyed.
- **moderate**: 10–40% destroyed, or other partial-impact evidence.
- **low**: under 10% destroyed and under 15% destroyed-or-damaged, or no DINS records at all (outside the damage area). The JSON flags the no-record cases as lower confidence.
- **Caveat:** DINS has no timestamps. For streets without an AAR or news timestamp, the level comes from the outcome, and the `reason` field says so. LAFD notes that most destruction happened after dark on Jan 7 ("nightfall marked the onset of the most destructive WUI fire in Los Angeles history"), so heavy-loss streets were most likely damaged Jan 7–8 ([LAFD AAR, p. 36](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)).

LA Times and LAist street-level damage reporting for the Highlands: **not found**. Searches turned up no street-specific Highlands damage stories. The UCLA Lewis Center report ([Phillips, Feb 2025](https://lewis.ucla.edu/research/the-palisades-and-eaton-fires-neighborhood-data-and-potential-housing-market-effects/)) could not be read: the eScholarship PDF returned HTTP 403 on the venue network, so no figures from it are used here.

---

## 3. Timeline, Jan 7–8 (this area)

Sources disagree on the first minutes. LAPD logs the first radio call at **10:23** ([LAPD AAR, p. 48](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf)). LAFD has the first 911 call at about **10:29** and its dispatch to the 1100 block of Piedra Morada at **10:31** ([LAFD AAR, pp. 17–18](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)). AP has a resident spotting the fire at **10:27** ([AP via PBS](https://www.pbs.org/newshour/nation/homes-were-burning-and-roads-jammed-before-evacuation-order-for-palisades-fire-ap-finds)).

| Time (Jan 7 unless noted) | Event | Source |
|---|---|---|
| 10:23 | First fire radio call, Piedra Morada Dr; a second call minutes later from Calle Victoria | [LAPD AAR p. 48](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| ~10:30 | Fire seen on AI cameras "west of Temescal Ridge Trail in the vicinity above Skull Rock," below the Lachman (Jan 1) burn scar | [LAFD AAR p. 17](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 10:43 | LF69: fire "rapidly progressing and advancing towards Charmel Road (known as Charmel Lane)"; door-to-door evacuations ordered | [LAFD AAR p. 21](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 10:44 | Staging set at Sunset Blvd and Palisades Dr. The AAR later says this put it "in the direct path of the evacuation route" | [LAFD AAR pp. 21–22](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 10:50 | Structure Defense Group 1 on Chastain Pkwy E | [LAFD AAR p. 22](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 10:53 | Command post at Fire Station 23, Sunset Blvd, "down the hill from the Palisades Highlands" | [LAPD AAR p. 11](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| ~11:00 | Firefighters defending Highlands homes | [AP via PBS](https://www.pbs.org/newshour/nation/homes-were-burning-and-roads-jammed-before-evacuation-order-for-palisades-fire-ap-finds) |
| 11:03 | Fire moving south toward Marquez Knolls; LF63 checks Bienveneda, then defends Floresta Pl and Via Floresta | [LAFD AAR p. 24](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 11:05 | LAPD sergeant at Via Floresta and Floresta Pl starts door-to-door evacuations; smoke soon forces officers (without PPE) to stop | [LAPD AAR p. 11](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 11:12 | "Be Aware" WEA/NotifyLA/Nixle message ("get set for possible evacuation"). The eastern flank has "reached the cul-de-sac just to the east of Bienveneda Avenue" | [LAFD AAR p. 25](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| ~11:12–11:32 | A task force goes to the 600 block of Palisades Dr after "approximately 20 minutes with no assignment," because fire is threatening the 75-unit Sea Ridge complex | [LAFD AAR p. 25](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 11:14 | Fire "flanking within 120 feet of the homes on Chastaine" | [LAFD AAR p. 25](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 11:20 | A chief asks for a WEA "shake and shout" but says crews "were not evacuating at the moment" | [LAFD AAR p. 26](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 11:21 | Highlands residents evacuating on their own down Palisades Dr, Marquez Knolls residents via Sunset, and they choke the staging area | [LAFD AAR p. 26](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 11:22 | Spotting between homes on Lachman Ln and Charmel Ln | [LAFD AAR p. 27](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 11:24 | Spot fires on Enchanted Way "with occupants evacuating"; fire spotting on the west side of Palisades Dr | [LAFD AAR p. 28](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 11:25 | The IC asks for evacuation of "the entire Palisades area." Dispatch asks whether it is an order or a warning; the IC says to "standby." Structures igniting in Marquez Knolls, Bienveneda, Lower Marquez and Paseo de Miramar | [LAFD AAR p. 28](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 11:27 | Homes burning on Lachman Ln (AP). LAPD lists Bienveneda, Via Floresta, Bell Oceana, Shadow Mountain Dr and El Hito as needing evacuation | [AP via PBS](https://www.pbs.org/newshour/nation/homes-were-burning-and-roads-jammed-before-evacuation-order-for-palisades-fire-ap-finds); [LAPD AAR p. 49](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 11:30–11:45 | Bienveneda line "almost a mile long" (11:30); "major traffic block" (11:40); traffic on Sunset stopped "until Bienveneda was emptied; vehicles were in the fire area" (11:45) | [LAPD AAR pp. 13, 49](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 11:32 | A chief wants "an evacuation order all the way down to PCH" | [LAFD AAR p. 29](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 11:35–11:37 | A task force defends Lachman, Charmel, Tellem and Enchanted. Vehicles fill both lanes of Palisades Dr, and Engine 59 cannot get north | [LAFD AAR p. 29](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 11:48 | Marquez Charter Elementary students bused to Brentwood Elementary | [LAPD AAR p. 49](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 11:52 / 11:54 | LAFD makes it LAPD's priority to "shut down Palisades Drive to the 'Highlands'" and requests a hard closure from PCH to the Highlands | [LAFD AAR p. 30](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf); [LAPD AAR p. 49](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 11:59 | Gridlock on Palisades Dr near Calvary Christian School, with fire on both sides | [LAPD AAR p. 50](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| **12:07** | **First evacuation order** (EMD): from Merrimac Rd west to Canyon Blvd and south to PCH. "All other residents were instructed to shelter in place." Orders were expanded eight more times | [LAFD AAR p. 32](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| 12:30 | LAPD's zone records start the Q767 evacuation zone at "1/7/25 1230" | [LAPD AAR p. 32](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 13:05–13:15 | Fire has "overtaken both sides of Palisades Drive." At 13:06 drivers are told to "exit their vehicles and evacuate on foot" toward PCH; by 13:12–13:15 abandoned vehicles are burning | [LAPD AAR pp. 15, 51](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 13:15 | Communications creates a master incident for evacuation calls | [LAPD AAR p. 15](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 13:30–13:34 | Fire Station 23, the original command post, is on fire | [LAPD AAR pp. 14, 52](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 13:59 | Trapped drivers on the 1200 block of Piedra Morada (written "Pedro Morada" in the log), "road was blocked by abandoned vehicles"; water drops attempted | [LAPD AAR p. 52](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 14:05 | People abandoning vehicles on Palisades Dr between Palisades Cir and Sunset | [LAPD AAR p. 53](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 14:15 / 15:00 | LAFD decides to use an LA County bulldozer (14:15); LAPD logs it arriving at Palisades Dr and Sunset (15:00) | [LAFD AAR p. 34](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf); [LAPD AAR p. 53](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| 14:57 | "not taking any addresses for evacuation" | [LAPD AAR p. 53](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| ~17:30 | A fire truck escorts a line of Highlands cars down Palisades Dr to Sunset; one evacuee says it "felt like a furnace" | [NBC News](https://www.nbcnews.com/news/us-news/pacific-palisades-highlands-fire-first-hours-rcna187156) |
| 18:50 | Evacuation orders expanded to "all of Palisades to the Santa Monica border" | [LAPD AAR p. 55](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| Evening | The fire's heel moves north, "eventually affecting homes in the Palisades Highlands area in the evening" | [LAFD AAR pp. 45, 50](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| ~22:00 | Assisted-living facility on Vereda de la Montura evacuated (64 people) | [LAFD AAR p. 36](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| ~00:00 Jan 8 | A Calle Victoria resident, 75, and her elderly mother leave after firefighters order them out; embers "like tennis balls" | [NBC News](https://www.nbcnews.com/news/us-news/pacific-palisades-highlands-fire-first-hours-rcna187156) |
| Jan 19, 13:30–14:00 | Highlands repopulation under zone LOS-0767-J, reachable only through LOS-0767-F, which was still under mandatory order; escorted entry from Santa Monica Lot 3 | [LAPD AAR pp. 27, 73](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf); [Palisadian-Post](https://palipost.com/highlands-residents-able-to-return-to-area/) |

**Zone codes.** The Highlands is Genasys zone **LOS-0767-J** (also written Q0767-J or 767-J). The parent zone is **Q767** (mandatory from Jan 7 12:30 to Jan 19 13:30, then sub-zones until Feb 4 20:05) ([LAPD AAR, pp. 27, 32](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf)). Codes for the Marquez Knolls and Ridgeview sub-zones: **not found**. Watch Duty zone IDs: **not found**.

---

## 4. Documented welfare-check, evacuation-assistance, refusal and rescue incidents

Block level only. Facilities are named; private residents are not.

| When | Where | What happened | Source |
|---|---|---|---|
| Jan 7, from 10:24 | Highlands entrance | An LAPD officer turned back residents "attempting to enter the area to save their family members, pets, and valued possessions" | [LAPD AAR p. 11](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| Jan 7, 10:43 | Charmel Ln | LAFD Light Force 69 told to do door-to-door evacuations | [LAFD AAR p. 21](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| Jan 7, 11:05 | Via Floresta / Floresta Pl | LAPD door-to-door evacuations, abandoned because of smoke (no PPE) | [LAPD AAR p. 11](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| Jan 7, ~11:12+ | 600 block Palisades Dr (Sea Ridge, 75 units) | LAFD task force defended the complex and evacuated residents. DINS shows no destroyed structures on the 600 block | [LAFD AAR p. 25](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf); [DINS](https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/POSTFIRE_MASTER_DATA_SHARE/FeatureServer/0) |
| Jan 7, ~midday | 700 block Palisades Dr (Calvary Christian School) | Most children had already been picked up. The rest walked "hand in hand" down Palisades Dr to Fire Station 23, then on to Gladstones and the Bel-Air Bay Club | [LA Times via Yahoo, Jan 7, 2025](https://www.yahoo.com/news/further-die-fleeing-flames-palisades-004458231.html) |
| Jan 7, 11:24 | Enchanted Way | Spot fires, "occupants evacuating" | [LAFD AAR p. 28](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf) |
| Jan 7, 12:40 | 1600 block "Calle Arbola" (probably Calle Arbolada, Highlands; unverified) | LA County Fire: "a 95 years-old male was unable to evacuate." Outcome not recorded | [LAPD AAR p. 50](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| Jan 7, 13:06 | Palisades Dr at Sunset | Motorists ordered out of their cars to flee on foot toward PCH | [LAPD AAR pp. 15, 51](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| Jan 7, 13:52 | 1400 block Palisades Dr | "94 year-old female with limited mobility who requested assistance with evacuation." Outcome not recorded | [LAPD AAR p. 52](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| Jan 7, 13:59 | 1200 block Piedra Morada Dr | LAFD asks LAPD to help "trapped drivers"; road blocked by abandoned vehicles | [LAPD AAR p. 52](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| Jan 7, 14:25 | Palisades-wide | "The first calls were for the elderly. The calls quickly increased to include family, friends, and neighbors who could not reach their loved ones" | [LAPD AAR p. 53](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| Jan 7, 15:52 | 1000 block Enchanted Way | Two large residence fires, "with live rounds going off in the fire" | [LAPD AAR p. 54](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| Jan 7, 17:30 | 1700 block Palisades Dr | Via a Council District 11 representative: "elderly citizens ... were refusing to evacuate." DINS shows 3 of 10 structures destroyed on this block | [LAPD AAR p. 54](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| Jan 7, morning–evening | Highlands (unnamed condo) | A couple left around 11:00, turned back in gridlock, sheltered at a parents' home and hosed flare-ups, then left in a fire-truck-escorted line around 17:30 | [NBC News](https://www.nbcnews.com/news/us-news/pacific-palisades-highlands-fire-first-hours-rcna187156) |
| Jan 7, ~22:00 | 17300 block Vereda de la Montura (assisted living; Palisades News lists Ciela Senior Living at this address in an unrelated story) | 40 patients (14 non-ambulatory) and 24 staff evacuated with 12 ambulances plus vans; "All 64 lives were saved" | [LAFD AAR p. 36](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf); [Palisades News](https://palisadesnews.com/ciela-senior-living-evacuated-by-parking-garage-fire) |
| Jan 8, ~00:00 | Calle Victoria | A resident (75) and her elderly mother left after firefighters ordered them out | [NBC News](https://www.nbcnews.com/news/us-news/pacific-palisades-highlands-fire-first-hours-rcna187156) |
| Jan 8, 02:30–03:19 | Palisades-wide | Evacuation requests had been going by text to a phone no longer on the incident; LAFD handed LAPD "a list of requests" | [LAPD AAR p. 57](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |
| Jan 8, 23:52 | 16600 block Charmel Ln | A resident sheltering in place while a neighbor's home burned "refused to evacuate." At 00:20 Jan 9, Cal Fire was asked to a structure fire at the same address | [LAPD AAR p. 59](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf) |

LA Times, LAist, NBC LA, ABC7 or KTLA reports of rescues or welfare checks in the Highlands or Marquez Knolls beyond those listed above: **not found**.

---

## 5. Vulnerable population and facilities

### Age (ACS 2020–2024, retrieved Oct 17, 2026)

| Geography | Population | 65+ | 80+ | Households with someone 65+ | 65+ living alone |
|---|---|---|---|---|---|
| ZIP 90272 (all Pacific Palisades) | 21,390 | 5,331 (24.9%) | 1,490 (7.0%) | 3,613 of 8,357 (43.2%) | 1,410 |
| Tract 2626.01 (Palisades Highlands) | 3,446 | 853 (24.8%) | 158 (4.6%) | 533 of 1,284 (41.5%) | 72 |
| Tract 2626.04 (Marquez Knolls, Bienveneda, Castellammare, Sea Ridge) | 6,106 | 1,630 (26.7%) | 536 (8.8%) | 1,062 of 2,266 (46.9%) | 387 |

Sources: [90272](https://censusreporter.org/profiles/86000US90272-90272/), [tract 2626.01](https://censusreporter.org/profiles/14000US06037262601-census-tract-262601-los-angeles-ca/), [tract 2626.04](https://censusreporter.org/profiles/14000US06037262604-census-tract-262604-los-angeles-ca/). The 65+ and 80+ figures are summed from B01001 age bins, and household figures are from B11007. These are survey estimates with margins of error; the tract-level 80+ counts in particular carry wide error bands.

### Facilities on or near the corridor
- **Sea Ridge condominiums**, 600 block of Palisades Dr, 75 units. LAFD defended the complex and evacuated residents on Jan 7 ([LAFD AAR, pp. 25, 28](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)). DINS shows the 600 block with 0 destroyed of 26 multi-residence structures.
- **Calvary Christian School**, 701 Palisades Dr ([LA Times via Yahoo](https://www.yahoo.com/news/further-die-fleeing-flames-palisades-004458231.html)). Gridlock "near Calvary Christian School" was logged at 11:59 ([LAPD AAR](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf)). The campus was remediated and reopened Sept 2, 2025 ([Circling the News, Aug 21, 2025](https://www.circlingthenews.com/?p=39165)). Enrollment from a primary source: **not found**. A search snippet attributed "roughly 460 students" to Circling the News, but I could not verify it.
- **Assisted-living facility, 17300 block of Vereda de la Montura (Highlands):** 40 patients, 14 non-ambulatory, 24 staff ([LAFD AAR, p. 36](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)). Palisades News identifies the facility at that address as Ciela Senior Living, in a story about an unrelated garage fire ([Palisades News](https://palisadesnews.com/ciela-senior-living-evacuated-by-parking-garage-fire)). The name is not in the AAR.
- **Marquez Charter Elementary**: students bused to Brentwood Elementary at 11:48 ([LAPD AAR, p. 49](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf)).
- **Start-Up Recovery** (addiction treatment), Paseo Miramar: staff had evacuated all clients ([LA Times via Yahoo](https://www.yahoo.com/news/further-die-fleeing-flames-palisades-004458231.html)).

---

## 6. Civilian fatalities

- **Totals:** "12 fatalities (five in the City of Los Angeles)" ([LAFD AAR, p. 5](https://lafd.org/sites/default/files/pdf_files/Palisades_AARR_10_08_2025_final.pdf)).
- **Medical Examiner locations, block level, Palisades Fire** ([LA County ME, Jan 24, 2025](https://me.lacounty.gov/2025/press-releases/wildfire-update-18-victims-identified-by-medical-examiner/)): hospital death (1/8); 20900 block PCH, Malibu (1/9 and 1/15); 20400 block Roca Chica Dr, Malibu (1/9); 15300 block Friends St, Pacific Palisades (1/9); 22100 block Swenson Dr, Topanga (1/9); **1000 block Glenhaven Dr, Palisades (1/11)**; 23300 block W. Paloma Blanca Dr, Malibu (1/12); 1700 block Rambla Pacifico St, Malibu (1/12); **600 block Las Lomas Ave, Pacific Palisades (1/14)**; 20 block Aloha Dr, Pacific Palisades (1/20).
- **Inside the focus area:**
  - **Glenhaven Dr (Marquez Knolls), 1000 block:** Mark Shterenberg, 80, died at a residence; cause "inhalation of products of combustion and thermal injuries" ([Patch, Jan 28, 2025](https://patch.com/california/pacificpalisades/12th-palisades-fire-death-reported), citing the coroner). Whether he stayed by choice or was trapped: **not established** in any source I could open. A search snippet describes his family's belief that he was protecting his home, but I could not reach the underlying article.
  - **Las Lomas Ave, 600 block:** listed as "Unidentified Doe #54" as of Jan 24, 2025 ([LA County ME](https://me.lacounty.gov/2025/press-releases/wildfire-update-18-victims-identified-by-medical-examiner/)). The only name I found is in an unverified reader comment, so it is omitted. Circumstances: **not found**.
  - **Palisades Highlands proper:** no reported fatality: **not found**.
- **Other Palisades Fire victims where staying is documented (outside the focus area; context only):**
  - Annette Rossilli, 85, 15300 block of Friends St ([Patch](https://patch.com/california/pacificpalisades/12th-palisades-fire-death-reported)). She "declined" evacuation offers from neighbors, church friends and her home-health agency ([Palisades News, Jan 27, 2025](https://palisadesnews.com/?p=39642)).
  - Betty O'Meara, 94, 20400 block of Roca Chica Dr, Big Rock, Malibu ([Patch](https://patch.com/california/pacificpalisades/12th-palisades-fire-death-reported)). Deputies ordered her to evacuate and she "slammed the door in their faces." Her caretaker had gone out for medication and could not get back past a roadblock ([LA Times via AOL, Feb 3, 2025](https://www.aol.com/news/malibu-movie-theater-owner-servants-110024624.html)). The LAPD AAR separately logs a welfare-check radio call at 12:36 on Jan 9 for "a 94 year-old female" on the same block of Roca Chica Dr, where "the daughter called and advised she refused to evacuate" ([LAPD AAR, p. 61](https://www.lapdpolicecom.lacity.org/110425/BPC_25-305x.pdf)). The age and block match, but the AAR does not name the woman. **Do not state publicly that this is the same person.**
  - Rory Sykes, 32, Malibu, refused to leave, and his mother could not carry him. Randall Miod, 55, Malibu, stayed with a hose. Arthur Simoneau, 69, Topanga, "wouldn't leave." ([ABC News, Jan 16, 2025](https://abcnews.com/US/victims-dead-los-angeles-wildfires/story?id=117587600))

---

## Gaps and uncertainties
- **UCLA Lewis Center data not used.** The eScholarship PDF was blocked (HTTP 403) on this network.
- **Vereda de la Montura losses are undercounted.** DINS logged 1 structure for this condo-lined street even though LAFD says structures around the assisted-living facility burned.
- **Evacuation sub-zone codes** other than Q767, LOS-0767-J and LOS-0767-F (Marquez Knolls, Ridgeview, lower Palisades Dr): not found.
- **Outcomes are missing** for the 12:40 Calle Arbola(da) call, the 13:52 call on the 1400 block of Palisades Dr, and the 17:30 refusals on the 1700 block.
- **"Calle Arbola"** in the LAPD log is probably Calle Arbolada, but that is not confirmed.
- **No street-level timing for several Highlands streets.** Michael Ln, Avenida de la Herradura and Monte Hermoso were classified on DINS outcome alone.
- **Street names not found in DINS:** Breve Way, Sunset Mesa Dr, Bashford St, Carey St, Dryad Rd, Corto Pl and Sage Ln may not exist under these exact names. Their JSON levels are LOW CONFIDENCE placeholders.

// The scenario: the 2025 Palisades Fire, Jan 7, replayed on this board's placeholder households.
//
// What is real here is the timeline: every beat below is a time and an event from the research
// in docs/research/palisades-highlands.md, which cites the LAPD and LAFD after-action reports
// and the press. What is simulated is everything that happens to a particular house: which
// resident refuses, who does not answer the door, who calls. The households are placeholders
// (real building footprints, invented addresses and names), so none of it describes a person.
//
// Beats stay at block level and name no resident. No fatality is in here: those are real people.

import type { CallerState, Routing, SuggestionPriority, ThreatLevel } from '../types';

export const SCENARIO_ID = 'palisades-2025-01-07';
export const SCENARIO_TITLE = 'Palisades Fire, Jan 7 2025';

/** The scenario's clock starts at 10:00 Pacific, a little before the first fire call. */
export const SIM_START_MS = Date.parse('2025-01-07T10:00:00-08:00');
/** 00:30 on Jan 8: past the assisted-living evacuation, before the second day. */
export const SIM_END_MIN = 14 * 60 + 30;

/**
 * How long a clear is trusted in the scenario: six hours. The live board, the database's
 * house_color() and the phone line all use two hours (priority.ts FRESH_MIN), and keep doing so;
 * the scenario's own households carry this as `fresh_min`, so only they are judged by it.
 */
export const SCENARIO_FRESH_MIN = 6 * 60;

/** "10:23" → minutes after 10:00. "24:00" is midnight, the start of Jan 8. */
export const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m - 600;
};

/** A call that the research documents at block level, played into the queue at its time. */
export interface BeatCall {
  street: string;
  /** Block-level address, as the research states it. */
  address: string;
  who: string;
  reason: string;
  routing: Routing;
  severity: number;
  caller: CallerState;
  vulnerability?: { age?: number; medical?: string; mobility?: string };
}

/** A suggestion tied to a moment, live for a while after it. */
export interface BeatSuggestion {
  id: string;
  resource: string;
  priority: SuggestionPriority;
  why: string[];
  lastsMin: number;
}

export interface Beat {
  /** Minutes after 10:00. */
  t: number;
  title: string;
  detail: string;
  /** Short citation, as in the research doc's source key. */
  source: string;
  /** Households on this street who refuse at this moment, instead of at their street's usual time. */
  holdouts?: { street: string; count: number; note: string };
  calls?: BeatCall[];
  suggestions?: BeatSuggestion[];
}

export const BEATS: Beat[] = [
  {
    t: at('10:23'),
    title: 'First fire radio call',
    detail: 'From Piedra Morada Dr, with a second call from Calle Victoria minutes later.',
    source: 'LAPD AAR p. 48',
  },
  {
    t: at('10:43'),
    title: 'Fire advancing on Charmel Ln',
    detail: 'LAFD Light Force 69 is told to do door-to-door evacuations as the fire advances toward the street.',
    source: 'LAFD AAR p. 21',
  },
  {
    t: at('10:50'),
    title: 'Structure defense on Chastain Pkwy',
    detail: 'The first structure defense group sets up on Chastain Pkwy East, in the Highlands.',
    source: 'LAFD AAR p. 22',
  },
  {
    t: at('11:03'),
    title: 'Fire moving toward Marquez Knolls',
    detail: 'Fire is moving south. Crews check Bienveneda, then defend Floresta Pl and Via Floresta.',
    source: 'LAFD AAR p. 24',
  },
  {
    t: at('11:05'),
    title: 'Door-to-door stopped by smoke',
    detail: 'LAPD begins door-to-door evacuations at Via Floresta and Floresta Pl; smoke soon forces the officers, who have no protective equipment, to stop.',
    source: 'LAPD AAR p. 11',
  },
  {
    t: at('11:14'),
    title: 'Fire within 120 ft of Chastain homes',
    detail: 'The fire is flanking within 120 feet of the homes on Chastain.',
    source: 'LAFD AAR p. 25',
  },
  {
    t: at('11:21'),
    title: 'Residents leaving on their own',
    detail: 'Highlands residents are evacuating down Palisades Dr unprompted; Marquez Knolls residents come out through Sunset. They choke the fire staging area.',
    source: 'LAFD AAR p. 26',
  },
  {
    t: at('11:24'),
    title: 'Spot fires on Enchanted Way',
    detail: 'Spot fires on Enchanted Way with occupants evacuating, and spotting on the west side of Palisades Dr.',
    source: 'LAFD AAR p. 28',
  },
  {
    t: at('11:25'),
    title: 'Incident commander asks for a full-area evacuation',
    detail: 'The IC asks for evacuation of the entire Palisades area. Dispatch asks whether it is an order or a warning; the IC says to stand by. Structures are igniting in Marquez Knolls.',
    source: 'LAFD AAR p. 28',
    suggestions: [
      {
        id: 'wea_marquez',
        resource: 'Door-to-door and an alert push for Marquez Knolls (Charmel, Enchanted, Marquez Ave)',
        priority: 'now',
        why: [
          'incident commander asked for the entire Palisades area at 11:25',
          'spot fires on Enchanted Way with occupants still inside',
          'no order yet: the question of order or warning is open',
        ],
        lastsMin: 45,
      },
    ],
  },
  {
    t: at('11:27'),
    title: 'Homes burning on Lachman Ln',
    detail: 'The first homes are burning. The first evacuation order is still 40 minutes away.',
    source: 'AP via PBS',
  },
  {
    t: at('11:52'),
    title: 'Closure of Palisades Dr requested',
    detail: 'LAFD makes it LAPD\'s priority to shut down Palisades Dr to the Highlands, and requests a hard closure from PCH to the Highlands.',
    source: 'LAFD AAR p. 30; LAPD AAR p. 49',
    suggestions: [
      {
        id: 'close_palisades',
        resource: 'Traffic units: hold inbound traffic on Palisades Dr from PCH',
        priority: 'now',
        why: [
          'Palisades Dr is the only road out of the Highlands',
          'LAFD requested a hard closure at 11:52',
          'vehicles are already filling both lanes',
        ],
        lastsMin: 60,
      },
    ],
  },
  {
    t: at('11:59'),
    title: 'Gridlock on Palisades Dr, fire on both sides',
    detail: 'Gridlock near Calvary Christian School with fire on both sides of the road.',
    source: 'LAPD AAR p. 50',
  },
  {
    t: at('12:07'),
    title: 'First evacuation order',
    detail: 'From Merrimac Rd west to Canyon Blvd and south to PCH. Everyone else is told to shelter in place. The order is expanded eight more times.',
    source: 'LAFD AAR p. 32',
  },
  {
    t: at('12:40'),
    title: 'A 95-year-old man unable to evacuate',
    detail: 'County Fire reports it for the 1600 block of Calle Arbola(da). The outcome is not recorded in the report.',
    source: 'LAPD AAR p. 50',
    calls: [
      {
        street: 'Calle Arbolada',
        address: '1600 block Calle Arbolada',
        who: 'Man, 95 (reported by County Fire)',
        reason: 'unable to evacuate, relayed by County Fire',
        routing: 'human_now',
        severity: 5,
        caller: 'distressed',
        vulnerability: { age: 95, mobility: 'cannot walk without help' },
      },
    ],
  },
  {
    t: at('13:06'),
    title: 'Drivers ordered out of their cars',
    detail: 'Fire has overtaken both sides of Palisades Dr. Motorists at Palisades and Sunset are told to leave their vehicles and go on foot toward PCH; by 13:12 abandoned cars are burning.',
    source: 'LAPD AAR pp. 15, 51',
    suggestions: [
      {
        id: 'clear_road',
        resource: 'Heavy equipment and tow to Palisades Dr at Sunset to clear abandoned vehicles',
        priority: 'now',
        why: [
          'drivers ordered out of their cars at 13:06',
          'abandoned vehicles burning by 13:12',
          'the road out of the Highlands is blocked',
        ],
        lastsMin: 60,
      },
    ],
  },
  {
    t: at('13:15'),
    title: 'Evacuation calls get their own incident',
    detail: 'LAPD Communications opens a master incident for evacuation calls.',
    source: 'LAPD AAR p. 15',
  },
  {
    t: at('13:52'),
    title: 'A 94-year-old woman asks for help leaving',
    detail: 'From the 1400 block of Palisades Dr, with limited mobility. The outcome is not recorded in the report.',
    source: 'LAPD AAR p. 52',
    calls: [
      {
        street: 'Palisades Dr',
        address: '1400 block Palisades Dr',
        who: 'Woman, 94, limited mobility',
        reason: 'requested help to evacuate, limited mobility',
        routing: 'human_now',
        severity: 5,
        caller: 'worried',
        vulnerability: { age: 94, mobility: 'limited mobility' },
      },
    ],
  },
  {
    t: at('13:59'),
    title: 'Drivers trapped on Piedra Morada',
    detail: 'LAFD asks LAPD to help trapped drivers on the 1200 block; the road is blocked by abandoned vehicles and water drops are attempted.',
    source: 'LAPD AAR p. 52',
    suggestions: [
      {
        id: 'trapped_drivers',
        resource: 'Rescue engine and patrol to Piedra Morada Dr, 1200 block',
        priority: 'now',
        why: ['trapped drivers reported at 13:59', 'road blocked by abandoned vehicles', 'fire threat on Piedra Morada Dr: extreme'],
        lastsMin: 45,
      },
    ],
  },
  {
    t: at('14:15'),
    title: 'Bulldozer ordered for Palisades Dr',
    detail: 'LAFD decides to use a County bulldozer. LAPD logs it arriving at Palisades Dr and Sunset at 15:00.',
    source: 'LAFD AAR p. 34; LAPD AAR p. 53',
  },
  {
    t: at('14:25'),
    title: 'The calls begin to climb',
    detail: '"The first calls were for the elderly. The calls quickly increased to include family, friends, and neighbors who could not reach their loved ones."',
    source: 'LAPD AAR p. 53',
    suggestions: [
      {
        id: 'more_calltakers',
        resource: 'Add call-takers: calls from family and neighbors are rising',
        priority: 'soon',
        why: [
          'calls began with the elderly and now include family, friends and neighbors',
          'most are about people who already got out; answering them from the record frees units',
        ],
        lastsMin: 120,
      },
    ],
  },
  {
    t: at('14:57'),
    title: 'Dispatch stops taking addresses',
    detail: 'The West LA Watch Commander says they are not taking any addresses for evacuation at the time.',
    source: 'LAPD AAR p. 53',
  },
  {
    t: at('17:30'),
    title: 'Elderly residents refusing to evacuate',
    detail: 'Relayed through a Council District 11 representative for the 1700 block of Palisades Dr.',
    source: 'LAPD AAR p. 54',
    holdouts: { street: 'Palisades Dr', count: 3, note: 'elderly residents declining to leave (relayed by council office)' },
    suggestions: [
      {
        id: 'elderly_refusals',
        resource: 'Patrol with an accessible vehicle to re-contact elderly residents on Palisades Dr, 1700 block',
        priority: 'now',
        why: [
          'elderly residents refusing to evacuate (relayed at 17:30)',
          'fire threat on Palisades Dr: extreme',
          'Palisades Dr is the only road out of the Highlands',
        ],
        lastsMin: 90,
      },
    ],
  },
  {
    t: at('18:50'),
    title: 'Orders expand to all of Palisades',
    detail: 'Evacuation orders now cover all of Palisades to the Santa Monica border. Streets that were calm are now under an order.',
    source: 'LAPD AAR p. 55',
    suggestions: [
      {
        id: 'stage_lower',
        resource: 'Stage door-knock teams for the newly ordered neighborhoods (Palisades Village, Huntington Palisades, Rustic Canyon, Santa Monica Canyon)',
        priority: 'soon',
        why: ['order expanded to the Santa Monica border at 18:50', 'these streets have the lowest researched fire threat, so they were last in line'],
        lastsMin: 120,
      },
    ],
  },
  {
    t: at('22:00'),
    title: 'Assisted-living facility evacuated',
    detail: '17300 block of Vereda de la Montura: 40 patients, 14 of them non-ambulatory, and 24 staff. EMS requests 12 ambulances. All 64 people were saved.',
    source: 'LAFD AAR p. 36',
    calls: [
      {
        street: 'Vereda de la Montura',
        address: 'Assisted-living facility, 17300 block Vereda de la Montura',
        who: 'Facility staff',
        reason: 'assisted-living evacuation: 40 patients, 14 non-ambulatory, 24 staff',
        routing: 'human_now',
        severity: 5,
        caller: 'worried',
        vulnerability: { age: 85, medical: 'non-ambulatory patients (14 of 40)', mobility: 'non-ambulatory' },
      },
    ],
    suggestions: [
      {
        id: 'assisted_living',
        resource: 'Ambulances and accessible transport to Vereda de la Montura, 17300 block',
        priority: 'now',
        why: [
          'assisted-living facility: 40 patients, 14 non-ambulatory, 24 staff',
          'EMS requested 12 ambulances',
          'fire reaching the Highlands in the evening',
        ],
        lastsMin: 120,
      },
    ],
  },
];

/**
 * When a street's order reaches it, in minutes after 10:00, by researched threat level. The
 * levels were assigned from how early fire reached the street (docs/research/palisades-
 * highlands.md), so the front arrives in that order: extreme first, low last.
 */
export const ALERT_WINDOW: Record<ThreatLevel, [number, number]> = {
  extreme: [at('10:40'), at('11:25')],
  high: [at('12:07'), at('13:25')],
  moderate: [at('13:35'), at('15:30')],
  low: [at('18:50'), at('20:20')],
};

/** Streets the timeline pins to a moment, by normalised name. Everything else draws from its level's window. */
export const STREET_ALERT_AT: Record<string, number> = {
  'charmel ln': at('10:43'),
  'chastain pkwy': at('10:50'),
  'palisades dr': at('11:21'),
  'enchanted way': at('11:24'),
  'marquez ave': at('11:25'),
  // LAPD's zone records start the Q767 evacuation zone, which holds the Highlands, at 12:30.
  'vereda de la montura': at('12:30'),
};

/** Streets where the road out is the problem: leaving takes longer between these two times. */
export const GRIDLOCK = {
  streets: ['palisades dr', 'chastain pkwy', 'enchanted way'],
  from: at('11:30'),
  until: at('13:15'),
};

/** What happens to a household once its street is ordered out, by the street's threat. */
export const FATE: Record<ThreatLevel, { refuse: number; noAnswer: number; transit: number; call: number }> = {
  extreme: { refuse: 0.07, noAnswer: 0.16, transit: 0.22, call: 0.06 },
  high: { refuse: 0.045, noAnswer: 0.12, transit: 0.18, call: 0.03 },
  moderate: { refuse: 0.03, noAnswer: 0.09, transit: 0.12, call: 0.015 },
  low: { refuse: 0.015, noAnswer: 0.06, transit: 0.08, call: 0.008 },
};

export const REFUSE_NOTES = [
  '2 adults staying to defend the house',
  'resident says the fire is still far away, will leave later',
  'elderly resident declines to leave',
  'waiting for a family member to arrive first',
  'will shelter in place',
];

export const TRANSIT_NOTES = ['loading the car, leaving now', 'leaving with neighbors', 'packing, 10 minutes'];

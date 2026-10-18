// What the caller said about where the person is, read from the caller's own words.
//
// The agent fills reported_status, and it gets it wrong: on a real call "the evacuation has
// been cleared for Priscilla" arrived as reported_status "staying" and turned the house red.
// So the server reads the words too (the agent's caller_update and the caller's last lines
// of the live transcript) and the words win when they say something clear. Pure.

// Checked first: "hasn't left" and "not evacuated" contain the words for out.
const STAYING = [
  /\bstay(ing|s|ed)?\b/, /\brefus\w*/, /\bwon'?t (leave|go|evacuate)\b/, /\bwill not (leave|go|evacuate)\b/,
  /\b(not|isn'?t|aren'?t) (leaving|going|evacuating)\b/, /\b(hasn'?t|haven'?t|didn'?t|did not|has not|have not) (left|leave|evacuated?|gotten out|got out)\b/,
  /\bnot (been )?(evacuated|cleared|out)\b/, /\bstill (there|home|inside|at (the |her |his |their |my )?(house|home|place))\b/,
  /\bstill in (the |her |his |their |my )?(house|home)\b/, /\bshelter(ing)? in place\b/,
];
const OUT = [
  /\b(got|gotten|made it|is|are|i'?m|am|was|were) out\b/, /\bout of (the )?(house|home|area|there|town|perimeter|evacuation)\b/,
  /\bleft\b/, /\bevacuat(ed|ing)\b/, /\b(has|have|had|was|were|been|got|is|are) (been )?cleared\b/, /\bcleared\b/,
  /\b(is|are|i'?m|am) safe\b/, /\bat (a |the )?shelter\b/, /\bat (my|her|his|their|our|a) \w+'s\b/, /\bat (a |the )?(hotel|motel|friend'?s?|evacuation (center|centre))\b/,
  /\bwith (me|us)\b/, /\bpicked (her|him|them) up\b/, /\bdrove (off|away|out)\b/, /\bgone\b/,
];

const clean = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'");

/** 'staying' | 'out' | null for one piece of caller text. */
export function reportIntent(text) {
  const t = clean(text);
  if (!t.trim()) return null;
  if (STAYING.some((r) => r.test(t))) return 'staying';
  if (OUT.some((r) => r.test(t))) return 'out';
  return null;
}

// "I'm out", "I left", "I evacuated": the caller is the resident.
const FIRST_PERSON_OUT = /\b(i'?m|i am|i was|i have|i've|i) (out|left|evacuated|safe|got out|made it out)\b/;

/** The caller's last few lines from Retell's transcript text ("User: ..." lines). */
export function callerLines(transcript, n = 3) {
  if (!transcript) return [];
  return String(transcript).split('\n').filter((l) => /^user:/i.test(l.trim()))
    .map((l) => l.replace(/^\s*user:\s*/i, '')).slice(-n);
}

/**
 * The report to act on: the agent's fields, corrected by what the caller actually said.
 * Returns { reported_status, reported_by, corrected } where corrected names what changed.
 */
export function reconcileReport({ reported_status, reported_by, caller_update }, lines = []) {
  const said = reportIntent(caller_update) ?? reportIntent(lines.join(' '));
  let status = reported_status ?? null;
  let by = reported_by ?? null;
  const corrected = [];
  if (said && said !== status) {
    corrected.push(`reported_status ${status ?? 'none'} -> ${said}`);
    status = said;
  }
  const text = clean([caller_update, ...lines].join(' '));
  if (status === 'out' && by !== 'resident' && FIRST_PERSON_OUT.test(text) && !/\b(she|he|they|her|him|them)\b/.test(clean(caller_update))) {
    corrected.push('reported_by -> resident');
    by = 'resident';
  }
  if (status && !by) by = 'relative_or_friend';
  return { reported_status: status, reported_by: by, corrected };
}

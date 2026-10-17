// checkBypass(partialText): cheap, deterministic, keyword only. Runs on every transcript
// chunk so a life-safety phrase is flagged while the caller is still talking.
//
// Two rules keep it from firing on calm callers:
// - whole words only ("Gunderson Ave" is not "gun");
// - a negation in the same clause cancels it. Our greeting asks "is anyone hurt or in
//   danger?", so "no, nobody's trapped" is the most common answer we get.
// Clauses split on punctuation and on and/but/so, so "no, my dad is trapped" and
// "she's not answering and she's trapped" still fire.
import { config } from './config.js';

// Subject negators ("nobody is hurt or bleeding") reach 5 words; plain ones ("isn't
// trapped", "not really trapped") only 2, so a stray leading "no" ("no my dad is trapped")
// can't cancel a real emergency. When in doubt this errs toward firing.
const SUBJECT_NEGATORS = new Set(['nobody', "nobody's", 'noone', "noone's", 'none', 'nothing', 'neither', 'nadie', 'ninguno', 'ninguna']);
const NEGATORS = new Set(['no', 'not', 'never', 'nor', "isn't", "wasn't", "aren't", "weren't", "don't", "doesn't", "didn't", 'nunca', 'ningún']);

export const normalize = (s) => (s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/\bno one\b/g, 'noone');

export const clausesOf = (text) =>
  normalize(text).split(/[.,;:!?\n]+|\b(?:and|but|so|because|then|y|pero)\b/u).map((c) => c.trim()).filter(Boolean);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (phrase) => new RegExp(`(?<![\\p{L}\\p{N}'])${escape(phrase)}(?![\\p{L}\\p{N}'])`, 'u');

// First phrase that appears un-negated in any clause, or null.
export function findPhrase(text, phrases) {
  for (const clause of clausesOf(text)) {
    for (const p of phrases) {
      const m = wordRe(p).exec(clause);
      if (!m) continue;
      const before = clause.slice(0, m.index).split(/\s+/).filter(Boolean);
      if (before.slice(-5).some((w) => SUBJECT_NEGATORS.has(w))) continue;
      if (before.slice(-2).some((w) => NEGATORS.has(w))) continue;
      return p;
    }
  }
  return null;
}

export const checkBypass = (text, phrases = config.bypassPhrases) => findPhrase(text, phrases);

// Only what the caller said. Retell transcripts look like "Agent: ...\nUser: ...".
export function callerText(call) {
  if (Array.isArray(call.transcript_object)) {
    return call.transcript_object.filter((u) => u.role === 'user').map((u) => u.content).join('. ');
  }
  return (call.transcript || '').split('\n').filter((l) => /^user:/i.test(l)).map((l) => l.replace(/^user:\s*/i, '')).join('. ');
}

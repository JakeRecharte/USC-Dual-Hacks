// checkBypass(partialText): cheap, deterministic, keyword only. Runs on every transcript
// chunk so a life-safety phrase is flagged while the caller is still talking.
import { config } from './config.js';

export function checkBypass(text, phrases = config.bypassPhrases) {
  const t = (text || '').toLowerCase();
  return phrases.find((p) => t.includes(p)) || null;
}

// Only what the caller said. Retell transcripts look like "Agent: ...\nUser: ...".
export function callerText(call) {
  if (Array.isArray(call.transcript_object)) {
    return call.transcript_object.filter((u) => u.role === 'user').map((u) => u.content).join(' ');
  }
  return (call.transcript || '').split('\n').filter((l) => /^user:/i.test(l)).join(' ');
}

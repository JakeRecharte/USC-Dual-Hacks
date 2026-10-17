// Stand-in for Person B's engine. Same contract, canned answers. Swap the import in
// index.js for the real engine.triage() when it lands; nothing else should change.
//
// THE CONTRACT (frozen):
//   in:  { incident_type, street, cross_street, firsthand, people_affected, lang, call_id, from_number }
//   out: { lane, say, transferTo?, briefForHuman? }
//   lane ∈ BYPASS | ANSWERABLE | NOVEL | CORROBORATING

export function triage(signal, now) {
  if (signal.incident_type === 'medical') {
    return {
      lane: 'BYPASS',
      say: "I'm connecting you to a person right now. Please stay on the line.",
      transferTo: 'dispatcher',
      briefForHuman: brief(signal, now),
    };
  }
  if (!signal.street) {
    return {
      lane: 'NOVEL',
      say: "I'm going to get you to a person who can help. Stay on the line.",
      transferTo: 'dispatcher',
      briefForHuman: brief(signal, now),
    };
  }
  return {
    lane: 'CORROBORATING',
    say: `Thank you. We already have reports of a ${signal.incident_type} near ${signal.street}, and your report has been added. If anyone is hurt or in danger, tell me now.`,
  };
}

function brief(s, now) {
  return `${s.incident_type} on ${s.street || 'unknown street'}${s.cross_street ? ' at ' + s.cross_street : ''}, ` +
    `${s.firsthand ? 'firsthand' : 'secondhand'}, ${s.people_affected ?? '?'} affected, lang ${s.lang || '?'}, ` +
    `from ${s.from_number || 'unknown'} at ${new Date(now).toISOString()}`;
}

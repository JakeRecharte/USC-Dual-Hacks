// Stand-in for Person B's engine. Same contract; swap the import in index.js when it lands.
//
// THE CONTRACT (frozen):
//   in:  signal { incident_type, street, cross_street, firsthand, people_affected, lang, call_id, from_number }
//        world  { cluster }   what we already know about this incident, or null
//        now    injected; the engine never reads the clock
//   out: { lane, say, transferTo?, briefForHuman? }
//   lane ∈ BYPASS | ANSWERABLE | NOVEL | CORROBORATING
//
// Default is escalate: a call goes to a human unless it earns another lane.

export function triage(signal, world, now) {
  if (signal.incident_type === 'medical') {
    return {
      lane: 'BYPASS',
      say: "I'm connecting you to a person right now. Please stay on the line.",
      transferTo: 'dispatcher',
      briefForHuman: brief(signal, now),
    };
  }

  // No street, or nothing on record for this incident: only a human can send resources
  // somewhere new.
  if (!signal.street || !world?.cluster) {
    return {
      lane: 'NOVEL',
      say: "Thank you, this is the first report we have of this. I'm connecting you to a dispatcher now. Please stay on the line.",
      transferTo: 'dispatcher',
      briefForHuman: brief(signal, now),
    };
  }

  const { sources, created_at } = world.cluster;
  const minutes = Math.round((now - created_at) / 60000);
  const when = minutes < 1 ? 'less than a minute ago' : `about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  return {
    lane: 'CORROBORATING',
    say: `Thank you. We've had ${sources} ${sources === 1 ? 'report' : 'reports'} of a ${signal.incident_type} near ${signal.street}, the first ${when}, and yours has been added. If anyone is hurt or in danger, tell me now.`,
  };
}

function brief(s, now) {
  return `${s.incident_type} on ${s.street || 'unknown street'}${s.cross_street ? ' at ' + s.cross_street : ''}, ` +
    `${s.firsthand ? 'firsthand' : 'secondhand'}, ${s.people_affected ?? '?'} affected, lang ${s.lang || '?'}, ` +
    `from ${s.from_number || 'unknown'} at ${new Date(now).toISOString()}`;
}

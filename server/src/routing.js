// Routing rules from docs/DATA_CONTRACT.md §3. Pure: no I/O, time injected.
// P2 owns the real version in Supabase; this mirrors it so the agent works before that lands.
// Severity only moves a call up. No call is ever closed by the agent.

export const FRESH_MIN = 120; // a cleared/self_out status older than this is stale

export function routineScore({ last_contact_hours, vulnerability = {}, red_flags = {} }) {
  const h = Number(last_contact_hours);
  let score = !Number.isFinite(h) ? 3 : h < 12 ? 1 : h < 48 ? 2 : h < 168 ? 3 : 4;
  const v = vulnerability || {};
  const vuln = [Number(v.age) >= 75, v.lives_alone === true, Boolean(v.medical), Boolean(v.mobility)].filter(Boolean).length;
  score += Math.min(vuln, 2);
  score += Object.values(red_flags || {}).filter((x) => x === true).length;
  return Math.min(score, 5);
}

// The caller's emotional state (the agent's read, see caller_state in tools.json) can only
// move a call up: panicked → a human now; distressed → never left with the agent alone.
export function route(call, lookup, now) {
  if (call.caller_state === 'panicked' && !call.with_them_now && !call.emergency) {
    return { routing: 'human_now', severity: 5, reason: 'caller panicked' };
  }
  let d = routeOnFacts(call, lookup, now);
  if (call.caller_state === 'distressed' && ['answered_by_agent', 'scheduled_followup'].includes(d.routing)) {
    d = { routing: 'priority_queue', severity: Math.max(d.severity, 4), reason: `${d.reason}; caller distressed` };
  }
  d = repeatCallers(d, call.prior_callers || 0);
  // Anything else the caller said still reaches the call-taker, it just doesn't route.
  if (call.caller_update && !d.reason.includes(call.caller_update)) d = { ...d, reason: `${d.reason}; caller says: ${call.caller_update}` };
  return d;
}

// Other people already called about this address. A fresh "cleared" still answers them;
// anything queued moves up, and a third separate caller about an unresolved house gets a
// person now.
function repeatCallers(d, prior) {
  if (!prior || d.routing === 'answered_by_agent' || d.routing === 'human_now') return d;
  const note = `; ${prior + 1} separate callers about this address`;
  if (prior >= 2 && d.routing === 'priority_queue') return { routing: 'human_now', severity: 5, reason: d.reason + note };
  return { routing: 'priority_queue', severity: Math.min(5, Math.max(d.severity, 3) + 1), reason: d.reason + note };
}

function routeOnFacts(call, lookup, now) {
  const status = lookup?.name_match ? lookup.status : null;
  const ageMin = lookup?.recorded_at ? (now - Date.parse(lookup.recorded_at)) / 60000 : Infinity;

  if (call.with_them_now || call.emergency) {
    return { routing: 'human_now', severity: 5,
      reason: call.with_them_now ? 'caller is with them now' : (call.emergency_reason || 'emergency') };
  }
  // The resident calling about themselves is a first-hand report.
  if (call.reported_by === 'resident' && call.reported_status === 'staying') {
    return lookup?.inside_perimeter === false
      ? { routing: 'priority_queue', severity: 4, reason: 'resident called: staying (outside the perimeter)' }
      : { routing: 'human_now', severity: 5, reason: 'resident called: still at the address inside the perimeter' };
  }
  if (call.reported_by === 'resident' && call.reported_status === 'out') {
    return status === 'refused'
      ? { routing: 'priority_queue', severity: 4, reason: 'resident called to say out, but the house is marked staying' }
      : { routing: 'answered_by_agent', severity: 1, reason: 'resident called: out of the area' };
  }
  // New information beats the record, but only a concrete report of where the person is.
  // Free text alone doesn't escalate: on a real call the agent wrote "caller has not heard
  // from her since the officer check" into caller_update and a fresh "cleared" got queued.
  if (call.reported_status) {
    return { routing: 'priority_queue', severity: 4,
      reason: `caller report: ${call.reported_status}${call.caller_update ? ` (${call.caller_update})` : ''}` };
  }
  // Order is docs/DATA_CONTRACT.md §3, top to bottom.
  if (status === 'refused') {
    return { routing: 'priority_queue', severity: 4, reason: `refused${lookup.note ? `, note: ${lookup.note}` : ''}` };
  }
  if (['cleared', 'self_out'].includes(status)) {
    return ageMin <= FRESH_MIN
      ? { routing: 'answered_by_agent', severity: 1, reason: `${status} ${Math.round(ageMin)} min ago` }
      : { routing: 'priority_queue', severity: 3, reason: `${status} but stale (${Math.round(ageMin)} min old)` };
  }
  if (lookup?.inside_perimeter) {
    return { routing: 'priority_queue', severity: 4, reason: `${status || 'no status'} inside the perimeter` };
  }
  if (call.mode === 'routine') {
    const score = routineScore(call);
    return score >= 4
      ? { routing: 'priority_queue', severity: score, reason: `routine welfare check, score ${score}` }
      : { routing: 'scheduled_followup', severity: score, reason: `routine welfare check, score ${score}` };
  }
  // Default is escalate.
  return { routing: 'priority_queue', severity: 3, reason: lookup?.found ? `${status || 'no status'}` : 'address not on record' };
}

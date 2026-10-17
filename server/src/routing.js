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

export function route(call, lookup, now) {
  const status = lookup?.name_match ? lookup.status : null;
  const ageMin = lookup?.recorded_at ? (now - Date.parse(lookup.recorded_at)) / 60000 : Infinity;

  if (call.with_them_now || call.emergency) {
    return { routing: 'human_now', severity: 5,
      reason: call.with_them_now ? 'caller is with them now' : (call.emergency_reason || 'emergency') };
  }
  if (call.caller_update) {
    return { routing: 'priority_queue', severity: 4, reason: `caller update: ${call.caller_update}` };
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

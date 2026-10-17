// Routing rules from docs/DATA_CONTRACT.md §3. Pure: no I/O, time injected.
// P2 owns the real version in Supabase; this mirrors it so the agent works before that lands.
// Severity only moves a call up. No call is ever closed by the agent.

export const FRESH_MIN = 120; // a cleared/self_out status older than this is stale

export function routineParts({ last_contact_hours, vulnerability = {}, red_flags = {} }) {
  const h = Number(last_contact_hours);
  const silence = !Number.isFinite(h) ? 3 : h < 12 ? 1 : h < 48 ? 2 : h < 168 ? 3 : 4;
  const v = vulnerability || {};
  const vulnerable = Math.min([Number(v.age) >= 75, v.lives_alone === true, Boolean(v.medical), Boolean(v.mobility)].filter(Boolean).length, 2);
  const flags = Object.values(red_flags || {}).filter((x) => x === true).length;
  return { silence, vulnerable, flags, score: Math.min(silence + vulnerable + flags, 5) };
}
export const routineScore = (call) => routineParts(call).score;

// The caller's emotional state (the agent's read, see caller_state in tools.json) can only
// move a call up: panicked → a human now; distressed → never left with the agent alone.
export function route(call, lookup, now) {
  const steps = [];
  const step = (d) => { steps.push({ rule: d.rule, routing: d.routing, severity: d.severity, reason: d.reason }); return d; };
  let d;
  if (call.caller_state === 'panicked' && !call.with_them_now && !call.emergency) {
    d = step({ routing: 'human_now', severity: 5, reason: 'caller panicked', rule: 'caller_panicked' });
  } else {
    d = step(routeOnFacts(call, lookup, now));
    if (call.caller_state === 'distressed' && ['answered_by_agent', 'scheduled_followup'].includes(d.routing)) {
      d = step({ routing: 'priority_queue', severity: Math.max(d.severity, 4), reason: `${d.reason}; caller distressed`, rule: 'caller_distressed' });
    }
    const r = repeatCallers(d, call.prior_callers || 0);
    if (r !== d) d = step(r);
  }
  // Anything else the caller said still reaches the call-taker, it just doesn't route.
  if (call.caller_update && !d.reason.includes(call.caller_update)) d = { ...d, reason: `${d.reason}; caller says: ${call.caller_update}` };
  return { routing: d.routing, severity: d.severity, reason: d.reason, trace: traceOf(call, lookup, now, steps) };
}

// The routing decision as data: what the router saw and which rules decided, in order. Stored
// on the call row (calls.decision_trace) so every automated decision is auditable.
function traceOf(call, lookup, now, steps) {
  const ageMin = lookup?.recorded_at ? Math.round((now - Date.parse(lookup.recorded_at)) / 60000) : null;
  return {
    version: 1,
    at: new Date(now).toISOString(),
    facts: {
      mode: call.mode ?? null,
      found: lookup?.found ?? null,
      name_match: lookup?.name_match ?? null,
      status: lookup?.name_match ? lookup.status ?? null : null,
      source: lookup?.name_match ? lookup.source ?? null : null,
      record_age_min: ageMin,
      fresh_limit_min: FRESH_MIN,
      inside_perimeter: lookup?.inside_perimeter ?? null,
      with_them_now: Boolean(call.with_them_now),
      emergency: Boolean(call.emergency),
      caller_state: call.caller_state ?? null,
      reported_status: call.reported_status ?? null,
      reported_by: call.reported_by ?? null,
      prior_callers: call.prior_callers ?? 0,
      ...(call.mode === 'routine' ? { routine: routineParts(call) } : {}),
    },
    steps,
  };
}

// Other people already called about this address. A fresh "cleared" still answers them;
// anything queued moves up, and a third separate caller about an unresolved house gets a
// person now.
function repeatCallers(d, prior) {
  if (!prior || d.routing === 'answered_by_agent' || d.routing === 'human_now') return d;
  const note = `; ${prior + 1} separate callers about this address`;
  if (prior >= 2 && d.routing === 'priority_queue') return { routing: 'human_now', severity: 5, reason: d.reason + note, rule: 'repeat_callers' };
  return { routing: 'priority_queue', severity: Math.min(5, Math.max(d.severity, 3) + 1), reason: d.reason + note, rule: 'repeat_callers' };
}

function routeOnFacts(call, lookup, now) {
  const status = lookup?.name_match ? lookup.status : null;
  const ageMin = lookup?.recorded_at ? (now - Date.parse(lookup.recorded_at)) / 60000 : Infinity;

  // A resident calling about themselves is "with them"; their own rules below say what that means.
  const withThem = call.with_them_now && call.reported_by !== 'resident';
  if (withThem || call.emergency) {
    return { routing: 'human_now', severity: 5,
      reason: withThem ? 'caller is with them now' : (call.emergency_reason || 'emergency'), rule: withThem ? 'with_them_now' : 'emergency' };
  }
  // The resident calling about themselves is a first-hand report.
  if (call.reported_by === 'resident' && call.reported_status === 'staying') {
    return lookup?.inside_perimeter === false
      ? { routing: 'priority_queue', severity: 4, reason: 'resident called: staying (outside the perimeter)', rule: 'resident_staying_outside' }
      : { routing: 'human_now', severity: 5, reason: 'resident called: still at the address inside the perimeter', rule: 'resident_staying' };
  }
  if (call.reported_by === 'resident' && call.reported_status === 'out') {
    return status === 'refused'
      ? { routing: 'priority_queue', severity: 4, reason: 'resident called to say out, but the house is marked staying', rule: 'resident_out_conflict' }
      : { routing: 'answered_by_agent', severity: 1, reason: 'resident called: out of the area', rule: 'resident_out' };
  }
  // New information beats the record, but only a concrete report of where the person is.
  // Free text alone doesn't escalate: on a real call the agent wrote "caller has not heard
  // from her since the officer check" into caller_update and a fresh "cleared" got queued.
  if (call.reported_status) {
    return { routing: 'priority_queue', severity: 4,
      reason: `caller report: ${call.reported_status}${call.caller_update ? ` (${call.caller_update})` : ''}`, rule: 'caller_report' };
  }
  // Order is docs/DATA_CONTRACT.md §3, top to bottom.
  if (status === 'refused') {
    return { routing: 'priority_queue', severity: 4, reason: `refused${lookup.note ? `, note: ${lookup.note}` : ''}`, rule: 'refused' };
  }
  if (['cleared', 'self_out'].includes(status)) {
    return ageMin <= FRESH_MIN
      ? { routing: 'answered_by_agent', severity: 1, reason: `${status} ${Math.round(ageMin)} min ago`, rule: 'fresh_record' }
      : { routing: 'priority_queue', severity: 3, reason: `${status} but stale (${Math.round(ageMin)} min old)`, rule: 'stale_record' };
  }
  if (lookup?.inside_perimeter) {
    return { routing: 'priority_queue', severity: 4, reason: `${status || 'no status'} inside the perimeter`, rule: 'inside_unresolved' };
  }
  // Nothing on record for this address: a person decides. Never "follow-up" or "answered".
  if (lookup && lookup.found === false) {
    return { routing: 'priority_queue', severity: 3, reason: 'address not in our records', rule: 'not_in_records' };
  }
  if (call.mode === 'routine') {
    const score = routineScore(call);
    return score >= 4
      ? { routing: 'priority_queue', severity: score, reason: `routine welfare check, score ${score}`, rule: 'routine_high' }
      : { routing: 'scheduled_followup', severity: score, reason: `routine welfare check, score ${score}`, rule: 'routine_low' };
  }
  // Default is escalate.
  return { routing: 'priority_queue', severity: 3, reason: lookup?.found ? `${status || 'no status'}` : 'address not on record', rule: 'default_escalate' };
}

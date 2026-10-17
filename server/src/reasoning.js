// The routing decision as the steps a person would read: what was heard, what the record says,
// which rule decided. Built only from the decision trace (routing.js), so it can't claim a
// reason the router didn't use. Deterministic: same trace, same words.

const RULE_TEXT = {
  caller_panicked: 'The caller is panicking → a person takes the call now',
  with_them_now: 'The caller is with the person right now → first-hand, a person takes it now',
  emergency: 'Life-safety words were heard → a person takes it now',
  resident_staying: 'The resident called: still at home inside the evacuation area → a person now',
  resident_staying_outside: 'The resident called: staying, outside the evacuation area → queued for a person',
  resident_out: 'The resident called: out of the area → recorded, no unit needed',
  resident_out_conflict: 'The resident says out, but the house is marked staying → a person checks',
  caller_report: 'The caller has newer news of where the person is → queued for a person',
  refused: 'People at this house chose to stay → queued for a person',
  fresh_record: 'A recent check answers the question → answered by the line, no unit sent',
  stale_record: 'The last check is too old to rely on → queued for a person',
  inside_unresolved: 'No confirmed status, inside the evacuation area → queued for a person',
  not_in_records: 'This house is not in our records → a person decides',
  routine_high: 'Routine welfare check, high score → queued for a person',
  routine_low: 'Routine welfare check, low score → follow-up flagged',
  default_escalate: 'Nothing else applies → default is a person',
  caller_distressed: 'The caller is distressed → never left with the line alone',
  repeat_callers: 'Other people already called about this house → moved up',
};

const ROUTING_TEXT = {
  human_now: 'Human now', priority_queue: 'Priority queue', answered_by_agent: 'Answered by the line',
  scheduled_followup: 'Follow-up scheduled', callback_queue: 'Call back: transfer failed', abandoned_callback: 'Call back: hung up',
};

const ago = (m) => (m == null ? '' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`);

export function explainDecision(trace, { address, subject_name } = {}) {
  if (!trace?.steps?.length) return [];
  const f = trace.facts || {};
  const steps = [];

  steps.push({ kind: 'heard', text: `Asked about ${subject_name || 'an unnamed resident'} at ${address || 'an address not given'}` });

  if (f.found === false) steps.push({ kind: 'record', text: 'No record for this house' });
  else if (f.found && !f.name_match) steps.push({ kind: 'record', text: "The caller didn't name the resident, so the record wasn't shared or used" });
  else if (f.found) {
    const fresh = f.record_age_min != null && f.record_age_min <= f.fresh_limit_min;
    steps.push({ kind: 'record', text: f.status && f.status !== 'unknown'
      ? `Record: ${f.status}${f.source ? ` (${f.source})` : ''}, ${ago(f.record_age_min)}${['cleared', 'self_out'].includes(f.status) ? (fresh ? ', fresh' : `, older than ${f.fresh_limit_min} min`) : ''}`
      : 'Record: never checked' });
  }

  if (f.inside_perimeter === true) steps.push({ kind: 'area', text: 'Inside the evacuation area' });
  else if (f.inside_perimeter === false) steps.push({ kind: 'area', text: 'Outside the evacuation area' });

  const caller = [f.caller_state && `caller ${f.caller_state}`, f.with_them_now && 'with the person now',
    f.reported_status && `reports them ${f.reported_status} (${f.reported_by === 'resident' ? 'the resident' : 'relative or friend'})`,
    f.prior_callers > 0 && `${f.prior_callers} earlier caller${f.prior_callers > 1 ? 's' : ''} about this house`].filter(Boolean);
  if (caller.length) steps.push({ kind: 'caller', text: caller.join('; ') });

  if (f.routine) {
    steps.push({ kind: 'score', text: `Routine score ${f.routine.score}/5: silence ${f.routine.silence}, vulnerability +${f.routine.vulnerable}, warning signs +${f.routine.flags}` });
  }

  trace.steps.forEach((s, i) => steps.push({ kind: i === 0 ? 'rule' : 'adjust', rule: s.rule, text: RULE_TEXT[s.rule] || s.reason }));

  const last = trace.steps.at(-1);
  steps.push({ kind: 'outcome', text: `${ROUTING_TEXT[last.routing] || last.routing}, severity ${last.severity}` });
  return steps;
}

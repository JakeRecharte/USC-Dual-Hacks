// What to send, as suggestions a dispatcher confirms. Deterministic rules, each with the facts
// that triggered it. Never dispatches anything: every suggestion has requires_confirmation.
//
// Inputs are the dispatcher's view (the true record and note, not the caller-facing gated
// one), the call row, and the house's fire threat level from research.

const PRIORITY = { now: 0, soon: 1, when_free: 2, none: 3 };

const LIFE = {
  medical: /\b(hurt|bleeding|injur\w*|not breathing|can'?t breathe|unconscious|unresponsive|fell|fall|can'?t get up|collapsed|chest|stroke|seizure|sangrando|inconsciente|no puede respirar)\b/i,
  rescue: /\b(trapped|stuck inside|can'?t get out|still inside|someone inside|on fire|fire in the house|atrapad[oa])\b/i,
  violence: /\b(gun|shot|knife|stabbed)\b/i,
};
const MEDICAL_NOTE = /\b(oxygen|o2|dialysis|insulin|ventilator|medical|medication|bedridden|hospice|cpap)\b/i;
const MOBILITY_NOTE = /\b(wheelchair|walker|mobility|can'?t walk|bedridden|elderly|frail|no vehicle|no car)\b/i;

// A call a person is taking right now makes its resources "now" too; otherwise the street's threat decides.
const urgency = (row, threat) => (row.routing === 'human_now' || threat === 'extreme' || threat === 'high' ? 'now' : 'soon');

export function suggestResources({ row, record = {}, threat = null }) {
  const out = [];
  const add = (id, resource, priority, why) => {
    if (!out.some((s) => s.id === id)) out.push({ id, resource, priority, why: why.filter(Boolean), requires_confirmation: true });
  };
  const where = row.address || 'the address';
  const threatWhy = threat && `fire threat on this street: ${threat}`;
  const status = record.status ?? row.lookup_status ?? null;
  const note = record.note || '';
  const life = `${row.bypass_reason || ''} ${row.emergency_reason || ''} ${row.reason || ''} ${row.caller_update || ''}`;
  const v = row.vulnerability || {};
  const flags = row.red_flags || {};
  const inside = row.inside_perimeter;

  // 1. Life safety first.
  if (LIFE.medical.test(life)) add('als', 'ALS ambulance', 'now', ['injury or medical words heard on the call', `at ${where}`]);
  if (LIFE.rescue.test(life)) add('rescue', 'Engine company (rescue)', 'now', ['someone may be trapped or the house is burning', `at ${where}`, threatWhy]);
  if (LIFE.violence.test(life)) add('police', 'Patrol unit (code 3)', 'now', ['a weapon was mentioned']);

  // 2. People staying in the fire area.
  const staying = status === 'refused' || row.reported_status === 'staying';
  if (staying && inside !== false) {
    add('recontact', 'Patrol or engine to re-contact the occupants', urgency(row, threat),
      ['people at this house are staying', note && `officer note: "${note}"`, row.reported_by === 'resident' && 'the resident called in themselves', threatWhy]);
  }
  if ((staying || row.routing === 'human_now') && (MEDICAL_NOTE.test(note) || v.medical)) {
    add('medical_standby', 'Medical transport on standby', urgency(row, threat),
      [note && MEDICAL_NOTE.test(note) && `officer note mentions a medical need: "${note}"`, v.medical && `caller reports medical need: ${v.medical}`]);
  }
  if ((staying || row.routing === 'human_now') && (MOBILITY_NOTE.test(note) || v.mobility || Number(v.age) >= 80)) {
    add('accessible_vehicle', 'Wheelchair-accessible evacuation vehicle', urgency(row, threat),
      [MOBILITY_NOTE.test(note) && `officer note: "${note}"`, v.mobility && 'caller reports trouble getting around', Number(v.age) >= 80 && `age ${v.age}`]);
  }

  // 3. Houses nobody has confirmed, inside the fire area.
  const unresolved = !staying && (status == null || ['unknown', 'no_answer', 'in_transit'].includes(status));
  if (inside === true && unresolved && row.routing !== 'human_now') {
    add('door_knock', row.lookup_found === false ? 'Door-knock (house not in our records)' : 'Door-knock by the nearest patrol',
      (row.prior_callers ?? 0) >= 1 ? 'now' : urgency(row, threat),
      [status === 'no_answer' ? 'last knock got no answer' : status === 'in_transit' ? 'reported leaving, no follow-up' : 'never checked',
        (row.prior_callers ?? 0) >= 1 && `${row.prior_callers + 1} separate callers about this house`, threatWhy]);
  }

  // 4. Old "cleared".
  if (['cleared', 'self_out'].includes(status) && row.routing === 'priority_queue' && !staying) {
    add('recheck', 'Re-check on the next pass', 'when_free', ['last check is too old to rely on', threatWhy]);
  }

  // 5. Routine welfare checks outside the fire area.
  if (row.mode === 'routine' && inside === false) {
    if (row.routing === 'priority_queue') {
      add('welfare_check', 'Welfare check by patrol', 'soon',
        [row.last_contact_hours != null && `no contact for ${Math.round(row.last_contact_hours)} h`, Number(v.age) >= 75 && `age ${v.age}`,
          v.lives_alone && 'lives alone', v.medical && `medical: ${v.medical}`, flags.mail_piling && 'mail piling up', flags.fall_history && 'history of falls']);
    } else if (row.routing === 'scheduled_followup') {
      add('followup_call', 'Follow-up call', 'when_free', ['low routine score']);
    }
  }

  // 6. Someone we owe a call back.
  if (['callback_queue', 'abandoned_callback'].includes(row.routing) && row.from_number) {
    add('callback', `Call-taker callback to ${row.from_number}`, row.routing === 'callback_queue' ? 'now' : 'soon',
      [row.routing === 'callback_queue' ? 'transfer to a person did not connect' : 'caller hung up before routing']);
  }

  // 7. Nothing to send: the line answered it from the record. This is the "trip avoided".
  if (!out.length && row.routing === 'answered_by_agent') {
    out.push({ id: 'none', resource: 'No unit needed', priority: 'none', requires_confirmation: false,
      why: [status === 'self_out' || row.reported_status === 'out' ? 'resident reported out of the area' : `officer record: ${status}, recent`, 'answered by the line'] });
  }

  return out.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority]);
}

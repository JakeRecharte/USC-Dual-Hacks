// Calls write back into the sweep log: what a caller tells us becomes a status_log row with
// source 'call', so the next caller and the board see it. Pure: decides, doesn't write.
//
// A phone report is weaker than an officer at the door, so it can only raise concern:
// - "he told me he's staying" (anyone)        → refused, onto the door-knock list
// - "I'm still here" (the resident)           → refused (and log_call sends them to a person)
// - "I'm out" (the resident)                  → self_out, unless the house is marked staying
// - "she texted she's out" (relative/friend)  → NOT written: a third-hand "out" must never take
//   a house off the door-knock list (pitch_v2.md: false or prank replies)

export function callReport(call, current, now) {
  if (!call.reported_status) return null;
  if (!current?.address_id) return { skip: 'address not on record' };

  const minutes = Math.max(0, Number(call.reported_minutes_ago) || 0);
  const recorded_at = new Date(now - minutes * 60000).toISOString();
  const resident = call.reported_by === 'resident';
  const who = resident ? 'resident' : 'relative or friend';
  const base = { address_id: current.address_id, source: 'call', recorded_at };

  if (call.reported_status === 'staying') {
    return { ...base, status: 'refused', note: `phone report (${who}): ${call.caller_update || 'staying at the address'}` };
  }
  if (call.reported_status === 'out') {
    if (!resident) return { skip: 'a relative or friend saying they are out does not clear a house' };
    if (current.status === 'refused') return { skip: 'resident says out but the house is marked staying; a person checks' };
    return { ...base, status: 'self_out', note: 'phone report (resident): out of the area' };
  }
  return { skip: `unknown reported_status: ${call.reported_status}` };
}

// The sentences the agent reads out. Two rules hold for every one of them:
// always say when the record is from, and never say "empty" or that anyone is safe.

const TZ = 'America/Los_Angeles';

export function when(iso, now) {
  const t = Date.parse(iso);
  const clock = new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  const min = Math.round((now - t) / 60000);
  const ago = min < 1 ? 'just now'
    : min < 60 ? `about ${min} ${min === 1 ? 'minute' : 'minutes'} ago`
    : `about ${Math.round(min / 60)} ${Math.round(min / 60) === 1 ? 'hour' : 'hours'} ago`;
  return `at ${clock}, ${ago}`;
}

export function sayForLookup(lookup, subjectName, now, freshMin) {
  if (!lookup.found) {
    return "I don't have that address in our records for the evacuation area.";
  }
  if (!lookup.name_match) {
    return "I can only share the status of an address with someone who can give the resident's full name. Can you tell me their first and last name?";
  }
  const first = (subjectName || '').trim().split(/\s+/)[0] || 'They';
  const t = lookup.recorded_at ? when(lookup.recorded_at, now) : '';
  const stale = lookup.recorded_at && (now - Date.parse(lookup.recorded_at)) / 60000 > freshMin
    ? ' That record is a few hours old, so it may not reflect what is happening now.' : '';

  // A phone report is never presented as an officer's check.
  if (lookup.source === 'call') {
    if (lookup.status === 'refused') return `A phone report ${t}, says the people at that address were staying.${stale}`;
    if (lookup.status === 'self_out') return `${first} called in ${t}, to say they were out of the area.${stale}`;
  }

  switch (lookup.status) {
    case 'cleared':
      return `An officer marked that address as checked and cleared ${t}.${stale}`;
    case 'self_out':
      return `${first} reported being out of the area ${t}.${stale}`;
    case 'in_transit':
      return `${first} reported being on the way out ${t}. We haven't had a follow-up since.`;
    case 'refused':
      return `Our last record, from ${t.replace(/^at /, '')}, says the people at that address chose to stay.`;
    case 'no_answer':
      return `An officer knocked ${t}, and got no answer. That doesn't tell us whether anyone is inside.`;
    default:
      return "We don't have a recorded check for that address yet.";
  }
}

// The resident told us they're out: confirm it back with the time, nothing more.
export const sayResidentOut = (now) => `Thank you. I've recorded that you're out of the area, as of ${when(new Date(now).toISOString(), now).replace(/^at /, '').replace(/, just now$/, '')}.`;

// Transfers say nothing here: the transfer tool itself says "Transferring you now."
export const sayForRouting = {
  human_now: '',
  priority_queue: '',
  answered_by_agent: 'If you have any newer information, or you think they may be hurt, I can connect you to a person.',
  scheduled_followup: "I've logged this and flagged a follow-up check. If anything changes, or you think they may be hurt, tell me now or call back.",
};

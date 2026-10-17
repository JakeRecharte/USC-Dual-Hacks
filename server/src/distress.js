// Distress and "we can't understand you" detection on the live transcript. Text only:
// Retell gives us words, not tone, so crying or screaming is invisible here unless it
// shows up in the words or in speech recognition failing. That failure is itself a
// signal: when we can't understand the caller, a human takes over.
//
// Welfare callers are worried by definition. "I can't reach my mom" is the normal call,
// not distress, so ordinary worry scores nothing. Only panic, pleading, or a breakdown in
// the conversation adds up.

export const DISTRESS = {
  threshold: 3,
  // +2 each: panic or pleading in the caller's own words
  panic: [
    'oh my god', 'oh god', 'please hurry', 'hurry please', 'please help', 'somebody help',
    "i'm scared", 'i am scared', "i'm terrified", "i'm panicking", "i can't do this",
    "i don't know what to do", 'what do i do', 'please please', "i can't breathe",
    'ay dios', 'por favor ayuda', 'ayúdame', 'ayudame',
  ],
  // +2 when the agent has had to ask the caller to repeat this many times: ASR is failing
  repeatAsks: 2,
  agentRepeatPhrases: ["sorry, i didn't catch", "could you repeat", "can you repeat", "didn't catch that",
    "say that again", "i'm having trouble hearing", "i'm sorry, could you"],
  // +1 when the caller says the same thing twice in a row (panic loops)
  // +1 when most of the caller's recent turns are fragments of 1-2 words
};

const norm = (s) => (s || '').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();

export function turnsOf(call) {
  if (Array.isArray(call.transcript_object)) {
    return call.transcript_object.map((u) => ({ role: u.role === 'agent' ? 'agent' : 'user', text: u.content || '' }));
  }
  return (call.transcript || '').split('\n').map((l) => {
    const m = /^(agent|user):\s*(.*)$/i.exec(l.trim());
    return m ? { role: m[1].toLowerCase(), text: m[2] } : null;
  }).filter(Boolean);
}

export function scoreDistress(call, cfg = DISTRESS) {
  const turns = turnsOf(call);
  const user = turns.filter((t) => t.role === 'user').map((t) => norm(t.text)).filter(Boolean);
  const agent = turns.filter((t) => t.role === 'agent').map((t) => norm(t.text));
  const reasons = [];
  let score = 0;

  const said = user.join(' ');
  for (const p of cfg.panic) {
    if (said.includes(p)) { score += 2; reasons.push(`said "${p}"`); }
  }

  const asks = agent.filter((a) => cfg.agentRepeatPhrases.some((p) => a.includes(p))).length;
  if (asks >= cfg.repeatAsks) { score += 2; reasons.push(`agent asked to repeat ${asks}x`); }

  for (let i = 1; i < user.length; i++) {
    if (user[i].length > 6 && user[i] === user[i - 1]) { score += 1; reasons.push('caller repeating'); break; }
  }

  const recent = user.slice(-4);
  if (recent.length >= 3 && recent.filter((u) => u.split(' ').length <= 2).length >= 3) {
    score += 1; reasons.push('fragmented answers');
  }

  return { score, distressed: score >= cfg.threshold, reasons };
}

// What the server injects into the live call when distress fires.
// The reasons are for the agent only; it must not say them aloud.
export const handoffInstruction = (reasons) =>
  `SYSTEM NOTICE, do not read aloud: caller distress detected (${reasons.join('; ')}). ` +
  'Say nothing. Immediately call request_human with reason "distress", then call transfer_to_human.';

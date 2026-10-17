// Runs scripted callers through the agent's real LLM + prompt (Retell playground completion)
// and scores each conversation. Tool calls are real: they hit our server and Supabase, so
// run `npm run reset-demo` afterwards.
//   npm run eval-agent                  all scenarios
//   npm run eval-agent -- ruth maria    some
//   npm run eval-agent -- --runs 3      repeat each (LLMs vary run to run)
import Retell, { sign } from 'retell-sdk';
import { config } from '../src/config.js';

const AGENT_ID = process.env.RETELL_AGENT_ID || 'agent_6745be3a13274867ff824bb5b3';
const GREETING = "LA Community Line. I'm automated, and I can get you a person. Is anyone hurt or in danger?";
const retell = new Retell({ apiKey: config.retellApiKey });

// Each caller turn is said in order, one per agent turn; `expect` is what a good call does.
const SCENARIOS = {
  maria: { says: ["No. I'm calling about my mom, Maria Lopez. Fourteen twenty Sunset Mesa Drive.", "No, I'm not with her.", "No, nothing newer.", "No, that's all. Thank you."],
    expect: { lookup: true, routing: 'answered_by_agent', transfer: false } },
  ruth: { says: ["No. My aunt Ruth Adams, one six eight zero zero Bollinger Drive. Nobody's heard from her.", "No, I'm not with her.", "No.", "No."],
    expect: { lookup: true, routing: 'priority_queue', transfer: true } },
  harold: { says: ["No. My dad, Harold Kim, fifteen fifteen Villa de la Paz. I can't reach him.", "No, I'm not with him.", "No, nothing since.", "No."],
    expect: { lookup: true, routing: 'priority_queue', transfer: true } },
  panic: { says: ["Oh my god, please hurry, somebody help, my dad isn't answering!"],
    expect: { lookup: false, transfer: true, maxAgentWordsBeforeTransfer: 0 } },
  resident: { says: ["No. I'm Hector Salas, I live at 16725 Marquez Avenue. I'm still at my house and nobody came.", "Yes, I'm still here.", "Yes."],
    expect: { routing: 'human_now', transfer: true } },
  grandma: { says: ["No. I haven't heard from my grandma, Dorothy Hayes, in two weeks. She lives at 4512 Crenshaw Boulevard.", "No, I'm not with her.", "She's 84, lives alone, and she's on oxygen.", "Her mail is piling up.", "No."],
    expect: { lookup: true, routing: 'priority_queue', transfer: true } },
  relative_out: { says: ["No. My friend Ingrid Sorensen, 16540 Livorno Drive.", "No, I'm not with her.", "Yes, she texted me 30 minutes ago that she left.", "No."],
    expect: { lookup: true, routing: 'priority_queue', transfer: true } },
  wrong_name: { says: ["No. Is 1515 Via de la Paz okay? The person's name is John Smith.", "I don't know their full name.", "No."],
    expect: { lookup: true, leaks: false } },
};

// Narration seen on real calls, plus its obvious relatives. Everything the LLM writes is spoken.
const NARRATION = [
  /\bthe caller\b/i, /\bper (the )?(rules|protocol)\b/i, /\bsystem (notice|message)\b/i, /\b(date|calendar) (list|block|text)\b/i,
  /\bi'?m (now )?(checking|looking up|logging|going to log)\b/i, /\blet me (check|log|look)\b/i, /\bi'?ll (look up|log|check)\b/i,
  /\bpasted\b/i, /\bset (that|it) aside\b/i, /\bignore (it|that)\b/i, /\bseems? (worried|upset|panick)/i, /\broutine check,? then\b/i,
  /\b(lookup_address|log_call|request_human|transfer_to_human)\b/,
];
const LEAK = /\b(cleared|chose to stay|staying|refused|no answer|checked)\b/i;

const SERVER = process.env.EVAL_SERVER || 'https://usc-dual-hacks-production.up.railway.app';
async function resetPlayground() {
  const raw = '{}';
  await fetch(`${SERVER}/dev/reset-playground`, { method: 'POST', body: raw,
    headers: { 'content-type': 'application/json', 'x-retell-signature': await sign(raw, config.retellApiKey) } });
}

async function run(name, scenario) {
  await resetPlayground();
  const messages = [{ role: 'agent', content: GREETING }];
  const spoken = [];
  const tools = [];
  let ended = false;
  for (const said of scenario.says) {
    if (ended) break;
    messages.push({ role: 'user', content: said });
    const res = await retell.playground.completion(AGENT_ID, { messages });
    for (const m of res.messages) {
      messages.push(m);
      // After the transfer starts, agent text is the private brief to the call-taker: not the caller's.
      if (m.role === 'agent' && m.content && !tools.some((t) => t.name === 'transfer_to_human')) spoken.push(m.content);
      if (m.role === 'tool_call_invocation') tools.push({ name: m.name, args: safeJson(m.arguments) });
      if (m.role === 'tool_call_result') tools.at(-1).result = safeJson(m.content);
    }
    ended = res.end_call || tools.some((t) => t.name === 'transfer_to_human');
  }

  const e = scenario.expect;
  const lookups = tools.filter((t) => t.name === 'lookup_address');
  const log = tools.findLast((t) => t.name === 'log_call');
  const transferred = tools.some((t) => t.name === 'transfer_to_human');
  const narration = spoken.flatMap((s) => NARRATION.filter((re) => re.test(s)).map(() => s));
  const firstLookupTurn = lookups.length ? messages.slice(0, messages.findIndex((m) => m.role === 'tool_call_invocation' && m.name === 'lookup_address')).filter((m) => m.role === 'user').length : null;
  const problems = [];
  if (e.lookup && !lookups.length) problems.push('never looked up the record');
  if (e.lookup && firstLookupTurn > 2) problems.push(`looked up only after caller turn ${firstLookupTurn}`);
  if (e.routing && log?.result?.routing !== e.routing && !(e.routing === 'human_now' && transferred && !log)) problems.push(`routing ${log?.result?.routing ?? 'none'} (want ${e.routing})`);
  if (e.transfer !== undefined && transferred !== e.transfer) problems.push(transferred ? 'transferred (should not)' : 'did not transfer');
  if (e.leaks === false && spoken.some((s) => LEAK.test(s))) problems.push('leaked a status to a wrong name');
  if (narration.length) problems.push(`narrated ${narration.length}x: "${narration[0].slice(0, 90)}"`);
  return { name, ok: problems.length === 0, problems, spoken, tools, firstLookupTurn };
}

const safeJson = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return s; } };

const args = process.argv.slice(2);
const runsAt = args.indexOf('--runs');
const runs = runsAt >= 0 ? Number(args[runsAt + 1]) : 1;
const verbose = args.includes('--verbose');
const picked = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--runs');
const names = picked.length ? picked : Object.keys(SCENARIOS);

let pass = 0, total = 0;
for (const name of names) {
  for (let i = 0; i < runs; i++) {
    const r = await run(name, SCENARIOS[name]);
    total++; if (r.ok) pass++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${name}${runs > 1 ? ` #${i + 1}` : ''}${r.problems.length ? ' — ' + r.problems.join(' | ') : ''}`);
    if (verbose || !r.ok) {
      for (const s of r.spoken) console.log(`       agent: ${s.slice(0, 160)}`);
      for (const t of r.tools) console.log(`       tool:  ${t.name} → ${JSON.stringify(t.result ?? '').slice(0, 110)}`);
    }
  }
}
console.log(`\n${pass}/${total} passed`);

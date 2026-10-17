// Runs the six scripted calls from team_plan.md (plus a panic call) against a server, signed like Retell.
//   npm run simulate                       all six, local server
//   npm run simulate -- refused            one case by name
//   npm run simulate -- --url https://usc-dual-hacks-production.up.railway.app
import { sign } from 'retell-sdk';
import { config } from '../src/config.js';

const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const base = urlAt >= 0 ? argv[urlAt + 1].replace(/\/$/, '') : `http://localhost:${config.port}`;
const only = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--url');

if (!config.retellApiKey) {
  console.error('Set RETELL_API_KEY in server/.env first (needed to sign requests).');
  process.exit(1);
}

async function post(path, body) {
  const raw = JSON.stringify(body);
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-retell-signature': await sign(raw, config.retellApiKey) },
    body: raw,
  });
  return res.status === 204 ? null : res.json();
}

const CASES = {
  cleared: { said: "I'm calling about my mom Maria Lopez, 1420 Sunset Mesa Drive.", log: { mode: 'wildfire', address: '1420 Sunset Mesa Dr', subject_name: 'Maria Lopez', with_them_now: false } },
  refused: { said: 'My father Harold Kim at 1515 Via de la Paz, I can\'t reach him.', log: { mode: 'wildfire', address: '1515 Via de la Paz', subject_name: 'Harold Kim', with_them_now: false } },
  unknown: { said: 'My aunt Ruth Adams, 16800 Bollinger Drive, nobody has heard from her.', log: { mode: 'wildfire', address: '16800 Bollinger Dr', subject_name: 'Ruth Adams', with_them_now: false } },
  emergency: { said: "I'm with my mom Maria Lopez right now and she can't breathe", log: { mode: 'wildfire', address: '1420 Sunset Mesa Dr', subject_name: 'Maria Lopez', with_them_now: true, emergency: true } },
  routine_high: { said: "I haven't heard from my grandma Dorothy Hayes in two weeks. She's 84, lives alone, on oxygen. Her mail is piling up.", log: { mode: 'routine', address: '4512 Crenshaw Blvd', subject_name: 'Dorothy Hayes', with_them_now: false, last_contact_hours: 336, vulnerability: { age: 84, lives_alone: true, medical: 'oxygen' }, red_flags: { mail_piling: true } } },
  panic: { said: "oh my god I don't know what to do, my dad Harold Kim isn't answering, 1515 Via de la Paz", log: { mode: 'wildfire', address: '1515 Via de la Paz', subject_name: 'Harold Kim', with_them_now: false } },
  routine_low: { said: "My brother Kevin Nguyen hasn't texted back since this morning. He's 40 and healthy.", log: { mode: 'routine', address: '910 N Vermont Ave', subject_name: 'Kevin Nguyen', with_them_now: false, last_contact_hours: 6, vulnerability: { age: 40 }, red_flags: {} } },
};

let n = 0;
for (const [name, c] of Object.entries(CASES)) {
  if (only && only !== name) continue;
  const call = { call_id: `sim_${Date.now()}_${++n}`, direction: 'inbound', from_number: `+1310555${String(300 + n).padStart(4, '0')}`, simulated: true };
  console.log(`\n── ${name}`);
  console.log(`   Caller: "${c.said}"`);
  await post('/webhook/retell', { event: 'call_started', call });
  await post('/webhook/retell', { event: 'transcript_updated', call: { ...call, transcript: `Agent: Is anyone hurt or in danger?\nUser: ${c.said}` } });
  if (!c.log.with_them_now) {
    const l = await post('/fn/lookup_address', { name: 'lookup_address', call, args: { address: c.log.address, subject_name: c.log.subject_name } });
    console.log(`   lookup_address → ${l.status ?? 'no status'}${l.inside_perimeter ? ', inside perimeter' : ''}`);
    console.log(`   Agent:  "${l.say}"`);
  }
  const r = await post('/fn/log_call', { name: 'log_call', call, args: c.log });
  console.log(`   log_call → ${r.routing} (severity ${r.severity}) — ${r.reason}`);
  console.log(`   Agent:  "${r.say}"${r.transfer ? '  [TRANSFER]' : ''}`);
  await post('/webhook/retell', { event: 'call_ended', call });
}

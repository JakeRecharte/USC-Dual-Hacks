// Fakes Retell traffic against a server, signed the same way Retell signs.
//   npm run simulate                    one corroborating call
//   npm run simulate -- medical         a bypass call, flagged mid-utterance
//   npm run simulate -- surge           seven firsthand callers at once on one street
//   npm run simulate -- surge --url https://usc-dual-hacks-production.up.railway.app
import { sign } from 'retell-sdk';
import { config } from '../src/config.js';

const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const base = urlAt >= 0 ? argv[urlAt + 1].replace(/\/$/, '') : `http://localhost:${config.port}`;
const kind = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--url') || 'flood';

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
  const text = await res.text();
  console.log(res.status, path, text.slice(0, 160));
}

function fakeCall(i) {
  return {
    call_id: `sim_${Date.now()}_${i}`,
    direction: 'inbound',
    from_number: `+1310555${String(200 + i).padStart(4, '0')}`,
    to_number: config.fromNumber || '+13105550199',
    simulated: true,
  };
}

async function oneCall(call, args, midUtterance) {
  await post('/webhook/retell', { event: 'call_started', call });
  if (midUtterance) {
    await post('/webhook/retell', { event: 'transcript_updated', call: { ...call, transcript: midUtterance } });
  }
  await post('/fn/report_incident', { name: 'report_incident', call, args });
  await post('/webhook/retell', { event: 'call_ended', call: { ...call, transcript: '(simulated)' } });
}

const flood = { incident_type: 'flood', street: 'Normandie Ave', cross_street: 'W 3rd St', firsthand: true, people_affected: 2, lang: 'en-US' };

if (kind === 'surge') {
  // Distinct numbers, all firsthand, fired concurrently: the threshold is crossed by
  // several calls at nearly the same instant, which is what the latch is for.
  const langs = ['en-US', 'es-ES', 'en-US', 'ko-KR', 'en-US', 'es-ES', 'en-US'];
  await Promise.all(langs.map((lang, i) => oneCall(fakeCall(i), { ...flood, lang })));
  const state = await (await fetch(base + '/state')).json();
  const dials = state.dials;
  console.log(`\nclusters: ${state.clusters.map((c) => `${c.id} independent=${c.independent} sources=${c.sources}`).join('; ')}`);
  console.log(`dials: ${dials.length} total, ${dials.filter((d) => !d.simulated && !d.failed).length} real, ${dials.filter((d) => d.simulated).length} simulated`);
} else if (kind === 'medical') {
  await oneCall(fakeCall(0), { ...flood, incident_type: 'medical' }, 'Agent: Is anyone hurt?\nUser: my husband is bleeding and');
} else {
  await oneCall(fakeCall(0), { ...flood, incident_type: kind });
}

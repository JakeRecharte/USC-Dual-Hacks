// Fakes a Retell call against the local server, signed the same way Retell signs.
//   npm run simulate                 one corroborating call
//   npm run simulate -- medical      a bypass call
import { sign } from 'retell-sdk';
import { config } from '../src/config.js';

const base = `http://localhost:${config.port}`;
const kind = process.argv[2] || 'flood';
const call = {
  call_id: `sim_${Date.now()}`,
  direction: 'inbound',
  from_number: '+13105550100',
  to_number: config.fromNumber || '+13105550199',
  simulated: true,
};

async function post(path, body) {
  const raw = JSON.stringify(body);
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-retell-signature': await sign(raw, config.retellApiKey) },
    body: raw,
  });
  const text = await res.text();
  console.log(res.status, path, text);
}

if (!config.retellApiKey) {
  console.error('Set RETELL_API_KEY in server/.env first (needed to sign requests).');
  process.exit(1);
}

await post('/webhook/retell', { event: 'call_started', call });
await post('/fn/report_incident', {
  name: 'report_incident',
  call,
  args: { incident_type: kind, street: 'Normandie Ave', cross_street: 'W 3rd St', firsthand: true, people_affected: 2, lang: 'en-US' },
});
await post('/webhook/retell', { event: 'call_ended', call: { ...call, transcript: '(simulated)' } });

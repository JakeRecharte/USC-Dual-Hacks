// npm test. No network: alerts are disabled, so dial() never reaches Retell.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ALERTS_ENABLED = 'false';
process.env.CONSENTED_NUMBERS = '+13105550001:es-ES,+13105550002';
process.env.ALERT_THRESHOLD = '5';
process.env.SYNTHETIC_TARGETS = '40';
process.env.MAX_DIALS_PER_CLUSTER = '25';

const { config } = await import('../src/config.js');
const { dial } = await import('../src/dial.js');
const { checkBypass, callerText } = await import('../src/bypass.js');
const clusters = await import('../src/cluster-stub.js');
const { targetOutbound } = await import('../src/targets-stub.js');
const { fanOut } = await import('../src/fanout.js');

const signal = (from, extra = {}) => ({
  incident_type: 'flood', street: 'Normandie Ave', firsthand: true, from_number: from, ...extra,
});

test('allowlist: unconsented number is simulated', async () => {
  const r = await dial('+19995550000', { lang: 'en-US' });
  assert.equal(r.simulated, true);
});

test('kill switch: consented number is still simulated while ALERTS_ENABLED=false', async () => {
  const r = await dial('+13105550001', { lang: 'es-ES' });
  assert.equal(r.simulated, true);
  assert.equal(r.reason, 'alerts_disabled');
});

test('consented entries carry their language', () => {
  assert.deepEqual(config.consentedEntries, [
    { number: '+13105550001', lang: 'es-ES' },
    { number: '+13105550002', lang: 'en-US' },
  ]);
});

test('bypass fires on a partial utterance, caller side only', () => {
  assert.equal(checkBypass('my husband is bleeding and'), 'bleeding');
  assert.equal(checkBypass('mi mamá está atrapada'), 'atrapada');
  assert.equal(checkBypass('the street is flooded'), null);
  const call = { transcript: 'Agent: is anyone trapped?\nUser: no, just water' };
  assert.equal(checkBypass(callerText(call)), null);
});

test('independence: one number calling five times is one source', () => {
  let seen;
  for (let i = 0; i < 5; i++) seen = clusters.observe(signal('+12135550100', { street: 'Vermont Ave' }), i);
  assert.equal(seen.independent, 1);
  assert.equal(seen.confirmed, false);
});

test('independence: secondhand reports do not count', () => {
  let seen;
  for (let i = 0; i < 6; i++) {
    seen = clusters.observe(signal(`+1213555020${i}`, { street: 'Western Ave', firsthand: false }), i);
  }
  assert.equal(seen.independent, 0);
  assert.equal(seen.confirmed, false);
});

test('five distinct firsthand callers confirm the cluster', () => {
  let seen;
  for (let i = 0; i < 5; i++) seen = clusters.observe(signal(`+1213555030${i}`, { street: 'Hoover St' }), i);
  assert.equal(seen.independent, 5);
  assert.equal(seen.confirmed, true);
});

test('latch: three concurrent crossings fan out exactly once', async () => {
  const cluster = { id: 'flood|figueroa st', type: 'flood', street: 'Figueroa St' };
  const targets = targetOutbound(cluster);
  const results = await Promise.all([fanOut(cluster, targets, 1), fanOut(cluster, targets, 2), fanOut(cluster, targets, 3)]);
  const fired = results.filter(Boolean);
  assert.equal(fired.length, 1);
  // 2 consented + 40 synthetic = 42 targets, capped at 25, all simulated (kill switch off)
  assert.equal(fired[0].simulated, 25);
  assert.equal(fired[0].real, 0);
  assert.equal(fired[0].rationedOut, 17);
});

test('targets: consented phones rank first, synthetic numbers are 555-01XX fiction', () => {
  const t = targetOutbound({ street: 'Normandie Ave' });
  assert.equal(t[0].to, '+13105550001');
  assert.equal(t[0].lang, 'es-ES');
  for (const x of t.slice(2)) assert.match(x.to, /^\+121355501\d\d$/);
});

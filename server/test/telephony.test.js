// npm test. Pure functions only, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBypass, callerText } from '../src/bypass.js';
import { triage } from '../src/engine-stub.js';
import * as clusters from '../src/cluster-stub.js';

const signal = (from, extra = {}) => ({
  incident_type: 'flood', street: 'Normandie Ave', firsthand: true, from_number: from, ...extra,
});

test('bypass fires on a partial utterance, caller side only', () => {
  assert.equal(checkBypass('my husband is bleeding and'), 'bleeding');
  assert.equal(checkBypass('mi mamá está atrapada'), 'atrapada');
  assert.equal(checkBypass('the street is flooded'), null);
  const call = { transcript: 'Agent: is anyone trapped?\nUser: no, just water' };
  assert.equal(checkBypass(callerText(call)), null);
});

test('first report of an incident is NOVEL and never claims prior reports', () => {
  const d = triage(signal('+12135550100'), { cluster: null }, 0);
  assert.equal(d.lane, 'NOVEL');
  assert.equal(d.transferTo, 'dispatcher');
  assert.doesNotMatch(d.say, /already|reports of/i);
});

test('report on a known incident is CORROBORATING and states count and age', () => {
  const cluster = { sources: 3, created_at: 0 };
  const d = triage(signal('+12135550101'), { cluster }, 12 * 60000);
  assert.equal(d.lane, 'CORROBORATING');
  assert.match(d.say, /3 reports/);
  assert.match(d.say, /12 minutes ago/);
  assert.doesNotMatch(d.say, /safe|on the way|coming/i);
});

test('no street means NOVEL (default is escalate)', () => {
  assert.equal(triage(signal('+1', { street: '' }), { cluster: { sources: 9, created_at: 0 } }, 0).lane, 'NOVEL');
});

test('medical is BYPASS regardless of what we know', () => {
  assert.equal(triage(signal('+1', { incident_type: 'medical' }), { cluster: { sources: 9, created_at: 0 } }, 0).lane, 'BYPASS');
});

test('server path: first call NOVEL, second call on same street CORROBORATING', () => {
  const s1 = signal('+12135550200', { street: 'Sunset Blvd' });
  assert.equal(triage(s1, { cluster: clusters.lookup(s1) }, 0).lane, 'NOVEL');
  clusters.observe(s1, 0);
  const s2 = signal('+12135550201', { street: '  sunset  blvd ' });
  assert.equal(triage(s2, { cluster: clusters.lookup(s2) }, 60000).lane, 'CORROBORATING');
});

test('independence: one number calling five times is one source', () => {
  let c;
  for (let i = 0; i < 5; i++) c = clusters.observe(signal('+12135550300', { street: 'Vermont Ave' }), i);
  assert.equal(c.sources, 5);
  assert.equal(c.independent, 1);
});

test('independence: secondhand reports do not count', () => {
  let c;
  for (let i = 0; i < 4; i++) c = clusters.observe(signal(`+1213555040${i}`, { street: 'Western Ave', firsthand: false }), i);
  assert.equal(c.independent, 0);
});

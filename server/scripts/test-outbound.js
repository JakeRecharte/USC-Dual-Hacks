// Build-order step 3: one outbound call to your own phone with dynamic variables.
//   npm run test-outbound -- +13105551234
// The number must be in CONSENTED_NUMBERS and ALERTS_ENABLED=true, or this only prints
// a simulated result. That is the allowlist working, not a bug.
import { dial } from '../src/dial.js';

const to = process.argv[2];
if (!to) {
  console.error('usage: npm run test-outbound -- +1XXXXXXXXXX');
  process.exit(1);
}

const result = await dial(to, {
  lang: 'en-US',
  incident: 'power outage',
  street: 'Normandie Ave',
  message: 'This is a test of the community alert line.',
  severity: 3,
});
console.log(result);

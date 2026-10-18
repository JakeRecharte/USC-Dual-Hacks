// One house in each colour, every other house grey. Run after reset-demo:
//   npm run demo-colors
//
// Orange (an officer knocked, no answer) can't come from a phone call, so a demo needs it set
// by hand; the other three are here so the map shows the whole legend before the first call.
// These four households are deliberately not the ones in the test-call scripts, so those
// still start grey. Rows are written as officer checks, timed a few minutes ago.
import { db } from '../src/db.js';

if (!db) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in server/.env');
  process.exit(1);
}

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

const DEMO = [
  { address_id: id(5), label: '820 Chautauqua Blvd (Linda Park)', status: 'cleared', note: null, minutes: 12, want: 'green' },
  { address_id: id(6684), label: '468 Northfield St (Priscilla Fischer)', status: 'refused', note: '2 adults staying to defend the house', minutes: 18, want: 'red' },
  { address_id: id(8), label: '640 Toyopa Dr (Beatrice Lam)', status: 'no_answer', note: null, minutes: 25, want: 'orange' },
  { address_id: id(6646), label: '964 Jacon Way (Lucas Nakamura)', status: 'in_transit', note: 'loading the car, leaving now', minutes: 8, want: 'yellow' },
];

const ids = DEMO.map((d) => d.address_id);
const { error: delError } = await db.from('status_log').delete().in('address_id', ids);
if (delError) throw new Error(`clear demo houses: ${delError.message}`);

const { error } = await db.from('status_log').insert(DEMO.map((d) => ({
  address_id: d.address_id, status: d.status, source: 'officer', note: d.note, recorded_at: ago(d.minutes),
})));
if (error) throw new Error(`insert demo statuses: ${error.message}`);

const { data: houses, error: readError } = await db.from('houses').select('id, color').in('id', ids);
if (readError) throw new Error(`read colours: ${readError.message}`);
const colour = new Map(houses.map((h) => [h.id, h.color]));
let ok = true;
for (const d of DEMO) {
  const got = colour.get(d.address_id);
  if (got !== d.want) ok = false;
  console.log(`${got === d.want ? 'ok ' : 'BAD'} ${d.want.padEnd(6)} ${d.label}${got === d.want ? '' : ` (is ${got})`}`);
}
if (!ok) process.exit(1);

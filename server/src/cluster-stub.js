// Stand-in for Person B's clustering + independence counting, so the fan-out path runs
// end to end before the real engine lands. Same rule as handoff §7: count unique callers,
// firsthand only. Clusters on incident_type + street; B's version adds the 400m / 20min window.
import { config } from './config.js';

const clusters = new Map();

const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function observe(signal, now, threshold = config.alertThreshold) {
  const street = norm(signal.street);
  if (!street || !signal.incident_type) return null;

  const id = `${signal.incident_type}|${street}`;
  let c = clusters.get(id);
  if (!c) {
    c = { id, type: signal.incident_type, street: signal.street, callers: new Set(), sources: 0, created_at: now };
    clusters.set(id, c);
  }
  c.sources += 1;
  if (signal.firsthand === true && signal.from_number) c.callers.add(signal.from_number);
  c.updated_at = now;

  return { cluster: c, independent: c.callers.size, confirmed: c.callers.size >= threshold };
}

export const all = () =>
  [...clusters.values()].map(({ callers, ...c }) => ({ ...c, independent: callers.size }));

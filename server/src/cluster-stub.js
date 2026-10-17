// Stand-in for Person B's clustering + independence counting. Clusters on incident_type +
// street; B's version adds the 400m / 20min window. Independence per handoff §7: unique
// callers, firsthand only.

const clusters = new Map();

const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const keyOf = (signal) => {
  const street = norm(signal.street);
  return street && signal.incident_type ? `${signal.incident_type}|${street}` : null;
};

const view = ({ callers, ...c }) => ({ ...c, independent: callers.size });

// Read-only: what do we already know about this report? Called before triage.
export function lookup(signal) {
  const c = clusters.get(keyOf(signal));
  return c ? view(c) : null;
}

// Record the report. Called after the caller has their answer.
export function observe(signal, now) {
  const id = keyOf(signal);
  if (!id) return null;
  let c = clusters.get(id);
  if (!c) {
    c = { id, type: signal.incident_type, street: signal.street, callers: new Set(), sources: 0, created_at: now };
    clusters.set(id, c);
  }
  c.sources += 1;
  if (signal.firsthand === true && signal.from_number) c.callers.add(signal.from_number);
  c.updated_at = now;
  return view(c);
}

export const all = () => [...clusters.values()].map(view);

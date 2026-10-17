// Threshold crossed → one outbound sweep for the cluster. Latched, capped, allowlisted.
import { config } from './config.js';
import { dialBatch } from './dial.js';
import { tryLatch } from './latch.js';
import { bus } from './sessions.js';

const dials = [];

export async function fanOut(cluster, targets, now) {
  if (!(await tryLatch(cluster.id))) return null;

  bus.emit('alert', { cluster_id: cluster.id, type: cluster.type, street: cluster.street, targets: targets.length, now });

  const tasks = targets.map((t) => ({
    to: t.to,
    vars: { lang: t.lang, incident: cluster.type, street: cluster.street, message: config.alertMessage },
    reason: t.reason,
  }));

  let outcome;
  try {
    outcome = await dialBatch(tasks, { name: `alert ${cluster.type} ${cluster.street}` });
  } catch (err) {
    // Retell refused the batch. Record it; never let a failed sweep take the server down.
    outcome = {
      results: tasks.slice(0, config.maxDialsPerCluster).map((t) =>
        ({ simulated: false, failed: true, error: err.message, number: t.to, vars: t.vars, why: t.reason })),
      rationedOut: Math.max(0, tasks.length - config.maxDialsPerCluster),
    };
  }

  for (const r of outcome.results) {
    const row = {
      cluster_id: cluster.id, to_number: r.number, lang: r.vars?.lang,
      simulated: r.simulated, blocked: r.simulated ? r.reason : null, why: r.why,
      failed: Boolean(r.failed), error: r.error,
      batch_call_id: r.batch_call_id, at: now,
    };
    dials.push(row);
    bus.emit('dial', row);
  }

  const summary = {
    cluster_id: cluster.id,
    real: outcome.results.filter((r) => !r.simulated && !r.failed).length,
    simulated: outcome.results.filter((r) => r.simulated).length,
    failed: outcome.results.filter((r) => r.failed).length,
    rationedOut: outcome.rationedOut,
  };
  bus.emit('sweep', summary);
  return summary;
}

export const allDials = () => dials;

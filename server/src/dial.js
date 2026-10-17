// The only path to an outbound call. Written before any code that wants to dial.
// Anything not in CONSENTED_NUMBERS comes back { simulated: true } and is shown on the
// console as a call that would have been placed.
import Retell from 'retell-sdk';
import { config } from './config.js';

const retell = config.retellApiKey ? new Retell({ apiKey: config.retellApiKey }) : null;

// Retell dynamic variables must be strings.
const stringify = (vars) =>
  Object.fromEntries(Object.entries(vars || {}).map(([k, v]) => [k, v == null ? '' : String(v)]));

function blockedReason(number) {
  if (!config.alertsEnabled) return 'alerts_disabled';
  if (!config.consented.has(number)) return 'not_consented';
  if (!retell || !config.fromNumber) return 'retell_not_configured';
  return null;
}

export async function dial(number, vars) {
  const reason = blockedReason(number);
  if (reason) return { simulated: true, reason, number, vars };

  const call = await retell.call.createPhoneCall({
    from_number: config.fromNumber,
    to_number: number,
    ...(config.outboundAgentId && { override_agent_id: config.outboundAgentId }),
    retell_llm_dynamic_variables: stringify(vars),
  });
  return { simulated: false, number, vars, retell_call_id: call.call_id };
}

// Fan-out for one cluster: capped, consented numbers go out as one Retell batch,
// everyone else is returned as simulated.
export async function dialBatch(targets, { name = 'sweep' } = {}) {
  const capped = targets.slice(0, config.maxDialsPerCluster);
  const results = [];
  const real = [];

  for (const t of capped) {
    const reason = blockedReason(t.to);
    if (reason) results.push({ simulated: true, reason, number: t.to, vars: t.vars });
    else real.push(t);
  }

  if (real.length) {
    const batch = await retell.batchCall.createBatchCall({
      name,
      from_number: config.fromNumber,
      tasks: real.map((t) => ({
        to_number: t.to,
        ...(config.outboundAgentId && { override_agent_id: config.outboundAgentId }),
        retell_llm_dynamic_variables: stringify(t.vars),
      })),
    });
    for (const t of real) {
      results.push({ simulated: false, number: t.to, vars: t.vars, batch_call_id: batch.batch_call_id });
    }
  }

  return { results, rationedOut: targets.length - capped.length };
}

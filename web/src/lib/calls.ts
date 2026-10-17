// Merging live call events into the queue. Pure, so it's unit-tested without React.
// Value imports carry .ts because the tests load this through Node's own loader.
import { CALLER_STATE_RANK, ROUTING_RANK } from './types.ts';
import type { CallRow, CallerState, Routing } from './types';

const moreUrgent = (a: Routing, b: Routing): Routing => (ROUTING_RANK[b] < ROUTING_RANK[a] ? b : a);

/** Caller state only ever moves up, per the contract. */
export function worseState(
  a: CallerState | null | undefined,
  b: CallerState | null | undefined,
): CallerState | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return CALLER_STATE_RANK[b] > CALLER_STATE_RANK[a] ? b : a;
}

/**
 * Severity and routing only move up, except over a placeholder: the "call in progress" row a
 * lookup creates is a guess, so the first real routing replaces it. Without this every call
 * the agent answered stayed on the board as "Priority queue".
 */
export function mergeCall(existing: CallRow, row: CallRow): CallRow {
  const real = existing.provisional && !row.provisional;
  return {
    ...existing,
    ...row,
    address: row.address || existing.address,
    subject_name: row.subject_name || existing.subject_name,
    bypass: existing.bypass || row.bypass,
    severity: real ? row.severity : Math.max(existing.severity, row.severity),
    caller_state: worseState(existing.caller_state, row.caller_state),
    distress_score: Math.max(existing.distress_score ?? 0, row.distress_score ?? 0),
    routing: real ? row.routing : moreUrgent(existing.routing, row.routing),
    reason: row.reason || existing.reason,
    provisional: Boolean(existing.provisional && row.provisional),
    created_at: existing.created_at,
  };
}

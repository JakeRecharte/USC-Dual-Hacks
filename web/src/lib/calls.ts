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
  // And the reverse: a placeholder arriving late (Supabase and the server's feed race) never
  // overrides a real routing.
  if (row.provisional && !existing.provisional) {
    return {
      ...existing,
      address: existing.address || row.address,
      subject_name: existing.subject_name || row.subject_name,
      caller_state: worseState(existing.caller_state, row.caller_state),
      distress_score: Math.max(existing.distress_score ?? 0, row.distress_score ?? 0),
    };
  }
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

/**
 * A row of public.calls as the queue shows it. The server writes a row the moment a call
 * starts, before any routing: that shows as "call in progress" until the routing lands.
 */
export function callFromDb(r: Record<string, unknown>): CallRow {
  const routed = typeof r.routing === 'string' && r.routing.length > 0;
  return {
    id: String(r.call_id ?? r.id ?? ''),
    call_id: String(r.call_id ?? r.id ?? ''),
    mode: r.mode === 'routine' ? 'routine' : 'wildfire',
    address: String(r.address ?? ''),
    subject_name: String(r.subject_name ?? ''),
    address_id: (r.address_id as string | null) ?? null,
    routing: (routed ? r.routing : 'priority_queue') as CallRow['routing'],
    severity: Number(r.severity) || 0,
    reason: String(r.reason ?? (r.ended_at ? 'call ended before it was routed' : 'call in progress')),
    created_at: String(r.created_at ?? new Date().toISOString()),
    from_number: (r.from_number as string | null) ?? null,
    bypass: Boolean(r.bypass),
    provisional: !routed,
    caller_state: (r.caller_state as CallRow['caller_state']) ?? null,
    distress_score: Number(r.distress_score) || 0,
  };
}

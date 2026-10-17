// The dispatch dashboard's data: each call's reasoning steps and suggested resources (written
// by the telephony server, docs/DATA_CONTRACT.md §8) and the dispatcher's confirm/dismiss
// decisions (append-only, suggestion_decisions). Pure, so it's tested without React.

export type StepKind = 'heard' | 'record' | 'area' | 'caller' | 'score' | 'rule' | 'adjust' | 'outcome';
export interface ReasoningStep {
  kind: StepKind;
  text: string;
  rule?: string;
}

export type SuggestionPriority = 'now' | 'soon' | 'when_free' | 'none';
export interface Suggestion {
  id: string;
  resource: string;
  priority: SuggestionPriority;
  why: string[];
  requires_confirmation: boolean;
}

export type Decision = 'confirmed' | 'dismissed';
export interface DecisionRow {
  call_id: string;
  suggestion_id: string;
  decision: Decision;
  decided_by: string;
  decided_at: string;
}

export interface DecisionCall {
  call_id: string;
  created_at: string;
  status: 'in_progress' | 'ended' | null;
  address: string | null;
  subject_name: string | null;
  routing: string | null;
  severity: number | null;
  reason: string | null;
  caller_state: string | null;
  simulated: boolean;
  reasoning: ReasoningStep[] | null;
  suggestions: Suggestion[] | null;
}

export const DECISION_CALL_COLUMNS =
  'call_id, created_at, status, address, subject_name, routing, severity, reason, caller_state, simulated, reasoning, suggestions';

export const PRIORITY_LABEL: Record<SuggestionPriority, string> = {
  now: 'Now',
  soon: 'Soon',
  when_free: 'When free',
  none: 'No unit',
};

export const STEP_LABEL: Record<StepKind, string> = {
  heard: 'Heard',
  record: 'Record',
  area: 'Area',
  caller: 'Caller',
  score: 'Score',
  rule: 'Rule',
  adjust: 'Adjusted',
  outcome: 'Outcome',
};

/** The decision that stands for each suggestion of a call: the newest row wins. */
export function latestDecisions(rows: DecisionRow[], callId: string): Map<string, DecisionRow> {
  const out = new Map<string, DecisionRow>();
  for (const r of rows) {
    if (r.call_id !== callId) continue;
    const cur = out.get(r.suggestion_id);
    if (!cur || Date.parse(r.decided_at) > Date.parse(cur.decided_at)) out.set(r.suggestion_id, r);
  }
  return out;
}

/** Suggestions a dispatcher still has to act on: needs confirmation and no decision yet. */
export function pendingSuggestions(call: DecisionCall, decisions: DecisionRow[]): Suggestion[] {
  const decided = latestDecisions(decisions, call.call_id);
  return (call.suggestions ?? []).filter((s) => s.requires_confirmation && !decided.has(s.id));
}

export interface DashboardTotals {
  calls: number;
  tripsAvoided: number;
  awaitingDispatcher: number;
  confirmed: number;
}

/** Headline numbers: "trips avoided" are calls the line answered with no unit needed. */
export function dashboardTotals(calls: DecisionCall[], decisions: DecisionRow[]): DashboardTotals {
  let tripsAvoided = 0;
  let awaitingDispatcher = 0;
  let confirmed = 0;
  for (const c of calls) {
    if ((c.suggestions ?? []).some((s) => s.id === 'none')) tripsAvoided += 1;
    awaitingDispatcher += pendingSuggestions(c, decisions).length;
    for (const d of latestDecisions(decisions, c.call_id).values()) if (d.decision === 'confirmed') confirmed += 1;
  }
  return { calls: calls.length, tripsAvoided, awaitingDispatcher, confirmed };
}

const RANK: Record<string, number> = {
  callback_queue: 0, human_now: 1, priority_queue: 2, abandoned_callback: 3, scheduled_followup: 4, answered_by_agent: 5,
};

/** Calls with something to decide first, then by routing urgency, then newest. */
export function orderForDashboard(calls: DecisionCall[], decisions: DecisionRow[]): DecisionCall[] {
  return [...calls].sort((a, b) => {
    const pa = pendingSuggestions(a, decisions).length > 0 ? 0 : 1;
    const pb = pendingSuggestions(b, decisions).length > 0 ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ra = a.routing == null ? -1 : (RANK[a.routing] ?? 9);
    const rb = b.routing == null ? -1 : (RANK[b.routing] ?? 9);
    if (ra !== rb) return ra - rb;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}

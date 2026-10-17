'use client';
// The dispatch dashboard: for each call the line took, the steps behind its routing and the
// resources it suggests, each waiting on a dispatcher's confirm or dismiss. Reads calls and
// suggestion_decisions from Supabase with the board's minted token; live over Realtime.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { browserClient } from '@/lib/supabase';
import { SignOutButton } from '@/components/ui';
import {
  DECISION_CALL_COLUMNS, PRIORITY_LABEL, STEP_LABEL, dashboardTotals, latestDecisions, orderForDashboard,
  type DecisionCall, type DecisionRow, type Suggestion,
} from '@/lib/decisions';

const ROUTING_LABEL: Record<string, string> = {
  callback_queue: 'Call back: transfer failed', human_now: 'Human now', priority_queue: 'Priority queue',
  abandoned_callback: 'Call back: hung up', scheduled_followup: 'Follow-up scheduled', answered_by_agent: 'Answered by the line',
};
const ROUTING_TONE: Record<string, string> = {
  callback_queue: 'var(--critical)', human_now: 'var(--critical)', priority_queue: 'var(--high)',
  abandoned_callback: 'var(--high)', scheduled_followup: 'var(--watch)', answered_by_agent: 'var(--clear)',
};
const PRIORITY_TONE: Record<string, string> = { now: 'var(--critical)', soon: 'var(--high)', when_free: 'var(--watch)', none: 'var(--clear)' };

type Session = { mode: 'supabase' | 'memory'; token?: string };

export function DecisionFeed() {
  const [session, setSession] = useState<Session | null>(null);
  const [calls, setCalls] = useState<DecisionCall[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showSim, setShowSim] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/db-token')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`db-token ${r.status}`))))
      .then((s: Session) => setSession(s))
      .catch(() => setSession({ mode: 'memory' }));
  }, []);

  useEffect(() => {
    if (session?.mode !== 'supabase' || !session.token) return;
    let client: SupabaseClient | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    try {
      client = browserClient(session.token);
    } catch {
      setError('Could not reach the database.');
      return;
    }
    const load = async () => {
      const [c, d] = await Promise.all([
        client!.from('calls').select(DECISION_CALL_COLUMNS).order('created_at', { ascending: false }).limit(100),
        client!.from('suggestion_decisions').select('call_id, suggestion_id, decision, decided_by, decided_at').order('decided_at', { ascending: false }).limit(1000),
      ]);
      if (cancelled) return;
      if (c.error || d.error) {
        setError(`${c.error?.message ?? d.error?.message}. Has docs/sql/houses.sql been run?`);
        return;
      }
      setError(null);
      setCalls((c.data ?? []) as DecisionCall[]);
      setDecisions((d.data ?? []) as DecisionRow[]);
    };
    void load();
    const refetch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 200);
    };
    const channel = client
      .channel('decision-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suggestion_decisions' }, refetch)
      .subscribe();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      void client?.removeChannel(channel);
    };
  }, [session]);

  const visible = useMemo(() => orderForDashboard(calls.filter((c) => showSim || !c.simulated), decisions), [calls, decisions, showSim]);
  const totals = useMemo(() => dashboardTotals(visible, decisions), [visible, decisions]);
  const current = visible.find((c) => c.call_id === selected) ?? visible[0] ?? null;

  const decide = useCallback(async (call: DecisionCall, s: Suggestion, decision: 'confirmed' | 'dismissed') => {
    setBusy(`${call.call_id}:${s.id}`);
    const res = await fetch('/api/suggestion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ call_id: call.call_id, suggestion_id: s.id, decision }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? 'Could not record the decision.');
      return;
    }
    // Realtime brings the row back; add it now so the button doesn't wait on the round trip.
    const { decision: row } = await res.json();
    setDecisions((d) => [row as DecisionRow, ...d]);
  }, []);

  if (session?.mode === 'memory') {
    return (
      <main className="p-6 text-sm text-muted">
        The dispatch dashboard reads Supabase. Configure the Supabase variables (docs/SUPABASE_SETUP.md §4).
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold">Dispatch decisions</h1>
          <Link href="/dispatch" className="text-xs text-muted underline-offset-2 hover:underline">← Board</Link>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={showSim} onChange={(e) => setShowSim(e.target.checked)} /> show simulated
          </label>
          <SignOutButton />
        </div>
      </header>

      {error && (
        <p role="alert" className="mx-4 mt-4 rounded-xl border border-critical/40 bg-critical/10 px-3.5 py-2.5 text-xs text-critical">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Stat label="Calls" value={totals.calls} />
        <Stat label="Trips avoided" value={totals.tripsAvoided} tone="var(--clear)" hint="answered from the record, no unit needed" />
        <Stat label="Awaiting dispatcher" value={totals.awaitingDispatcher} tone="var(--high)" />
        <Stat label="Resources confirmed" value={totals.confirmed} />
      </div>

      <div className="grid flex-1 gap-4 px-4 pb-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-panel">
          <header className="border-b border-line px-4 py-3 text-sm font-semibold">Calls</header>
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No calls yet.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
              {visible.map((c) => {
                const pending = (c.suggestions ?? []).filter((s) => s.requires_confirmation && !latestDecisions(decisions, c.call_id).has(s.id)).length;
                const tone = c.routing ? ROUTING_TONE[c.routing] : 'var(--info)';
                return (
                  <li key={c.call_id}>
                    <button
                      type="button"
                      onClick={() => setSelected(c.call_id)}
                      className={`w-full px-4 py-3 text-left ${current?.call_id === c.call_id ? 'bg-line/40' : 'hover:bg-line/20'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ color: tone, background: `${tone}1f` }}>
                          {c.routing ? ROUTING_LABEL[c.routing] ?? c.routing : 'In progress'}
                        </span>
                        <span className="font-mono text-xs text-muted">
                          {c.simulated && 'SIM · '}{new Date(c.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-sm font-medium">{c.address || 'Address not given'}</p>
                      <p className="truncate text-xs text-muted">
                        asking about {c.subject_name || 'an unnamed resident'}
                        {pending > 0 && <span className="ml-2 font-semibold" style={{ color: 'var(--high)' }}>{pending} to decide</span>}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {current ? <CallDecision call={current} decisions={decisions} busy={busy} onDecide={decide} /> : <section />}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone?: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-3xl font-semibold" style={tone ? { color: tone } : undefined}>{value}</p>
    </div>
  );
}

function CallDecision({ call, decisions, busy, onDecide }: {
  call: DecisionCall; decisions: DecisionRow[]; busy: string | null;
  onDecide: (call: DecisionCall, s: Suggestion, d: 'confirmed' | 'dismissed') => void;
}) {
  const decided = latestDecisions(decisions, call.call_id);
  return (
    <section className="flex min-h-0 flex-col gap-4">
      <div className="rounded-2xl border border-line bg-panel p-4">
        <p className="text-xs text-muted">{call.status === 'in_progress' ? 'Live call' : 'Call'}{call.simulated ? ' · simulated' : ''}</p>
        <h2 className="mt-1 text-lg font-semibold">{call.address || 'Address not given'}</h2>
        <p className="text-sm text-muted">asking about {call.subject_name || 'an unnamed resident'}{call.caller_state ? ` · caller ${call.caller_state}` : ''}</p>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="text-sm font-semibold">How the line decided</h3>
        {call.reasoning?.length ? (
          <ol className="mt-3 space-y-2">
            {call.reasoning.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-20 shrink-0 font-mono text-xs uppercase tracking-wide text-muted">{STEP_LABEL[s.kind] ?? s.kind}</span>
                <span className={s.kind === 'outcome' ? 'font-semibold' : s.kind === 'rule' || s.kind === 'adjust' ? 'text-text' : 'text-muted'}>{s.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted">{call.status === 'in_progress' ? 'Still on the line. The decision appears once the call is routed.' : call.reason ?? 'No routing decision recorded.'}</p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="text-sm font-semibold">Suggested resources</h3>
        <p className="mt-0.5 text-xs text-muted">Suggestions only. Nothing is sent until a dispatcher confirms.</p>
        {call.suggestions?.length ? (
          <ul className="mt-3 space-y-3">
            {call.suggestions.map((s) => {
              const d = decided.get(s.id);
              const key = `${call.call_id}:${s.id}`;
              return (
                <li key={s.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ color: PRIORITY_TONE[s.priority], background: `${PRIORITY_TONE[s.priority]}1f` }}>
                        {PRIORITY_LABEL[s.priority]}
                      </span>
                      <span className="text-sm font-medium">{s.resource}</span>
                    </div>
                    {s.requires_confirmation && (d ? (
                      <span className="text-xs font-semibold" style={{ color: d.decision === 'confirmed' ? 'var(--clear)' : 'var(--muted)' }}>
                        {d.decision === 'confirmed' ? 'Confirmed' : 'Dismissed'} {new Date(d.decided_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    ) : (
                      <div className="flex gap-2">
                        <button type="button" disabled={busy === key} onClick={() => onDecide(call, s, 'confirmed')}
                          className="rounded-lg bg-clear/15 px-3 py-1 text-xs font-semibold text-clear disabled:opacity-50">Confirm</button>
                        <button type="button" disabled={busy === key} onClick={() => onDecide(call, s, 'dismissed')}
                          className="rounded-lg border border-line px-3 py-1 text-xs text-muted disabled:opacity-50">Dismiss</button>
                      </div>
                    ))}
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">
                    {s.why.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">None yet.</p>
        )}
      </div>
    </section>
  );
}

'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { ZONE_NAMES } from '@/lib/addresses';
import {
  URGENCY_COLOR,
  doorKnockList,
  isStale,
  relativeMinutes,
  ageMinutes,
  urgencyOf,
  zoneSummaries,
  type Urgency,
} from '@/lib/priority';
import { CALLER_STATE_LABEL, DISTRESS_THRESHOLD, ROUTING_LABEL, ROUTING_RANK } from '@/lib/types';
import type { AddressState, CallRow, CallerState } from '@/lib/types';
import { telephonyConfigured, useAddresses, useCalls, useNow } from '@/lib/use-live';
import { ConnectionDot, ResetButton, SignOutButton, StatusChip, StructureChip } from '@/components/ui';
import type { MapMode } from './zone-map';

// Leaflet touches `window` at import time, so the map only ever loads in the browser.
const ZoneMap = dynamic(() => import('./zone-map').then((m) => m.ZoneMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted">
      Loading map…
    </div>
  ),
});

export function DispatchBoard() {
  const { addresses, connection, mode: dataMode, gated, error } = useAddresses();
  const { calls, connection: callFeed, upsert } = useCalls();
  const now = useNow(15_000);

  const [mode, setMode] = useState<MapMode>('heat');
  const [focusId, setFocusId] = useState<string | null>(null);

  const inPerimeter = useMemo(() => addresses.filter((a) => a.inside_perimeter), [addresses]);
  const knocks = useMemo(() => doorKnockList(addresses, now), [addresses, now]);
  const zones = useMemo(() => zoneSummaries(inPerimeter, now), [inPerimeter, now]);

  const stats = useMemo(() => {
    const counts: Record<Urgency, number> = { critical: 0, high: 0, watch: 0, clear: 0 };
    for (const a of inPerimeter) counts[urgencyOf(a, now)] += 1;
    return {
      counts,
      unresolved: counts.critical + counts.high + counts.watch,
      total: inPerimeter.length,
      refused: inPerimeter.filter((a) => a.status === 'refused').length,
      neverContacted: inPerimeter.filter((a) => !a.recorded_at).length,
      stale: inPerimeter.filter((a) => isStale(a.status, a.recorded_at, now)).length,
      destroyed: inPerimeter.filter((a) => a.structure === 'destroyed').length,
    };
  }, [inPerimeter, now]);

  const queue = useMemo(
    () =>
      [...calls].sort(
        (a, b) =>
          ROUTING_RANK[a.routing] - ROUTING_RANK[b.routing] ||
          b.severity - a.severity ||
          Date.parse(b.created_at) - Date.parse(a.created_at),
      ),
    [calls],
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="h-6 w-1.5 shrink-0 rounded-full bg-critical" />
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight tracking-tight">
              Dispatch — Palisades incident
            </h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
              <ConnectionDot
                state={connection}
                label={`${dataMode === 'supabase' ? 'Database' : 'Status feed'} ${connection}`}
              />
              <ConnectionDot
                state={callFeed}
                label={telephonyConfigured ? `Call feed ${callFeed}` : 'Call feed not configured'}
              />
              {dataMode === 'memory' && (
                <span className="text-watch">in-memory — not shared across servers</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DemoCalls onInject={upsert} />
          <ResetButton />
          <SignOutButton />
        </div>
      </header>

      {error && (
        <p role="alert" className="mx-4 mt-4 rounded-xl border border-critical/40 bg-critical/10 px-3.5 py-2.5 text-xs leading-relaxed text-critical">
          {error}
        </p>
      )}
      {!gated && (
        <p className="mx-4 mt-4 rounded-xl border border-watch/40 bg-watch/10 px-3.5 py-2.5 text-xs leading-relaxed text-watch">
          Database reads are not behind the shift code: SUPABASE_JWT_SECRET is not set, so the
          anon key alone can read resident names. Set it before this is reachable publicly —
          see docs/SUPABASE_SETUP.md.
        </p>
      )}

      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Unresolved"
              value={stats.unresolved}
              of={stats.total}
              tone="high"
              hint="inside the perimeter"
            />
            <StatTile label="Refused" value={stats.refused} tone="critical" hint="people still inside" />
            <StatTile
              label="Never contacted"
              value={stats.neverContacted}
              tone="high"
              hint="no record at all"
            />
            <StatTile
              label="Stale clears"
              value={stats.stale}
              tone="watch"
              hint="older than 2 hours"
            />
          </div>

          <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-2xl border border-line bg-panel">
            <ZoneMap
              addresses={addresses}
              mode={mode}
              now={now}
              focusId={focusId}
              onSelect={setFocusId}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-wrap items-start justify-between gap-2 p-3">
              <Legend mode={mode} />
              <div className="pointer-events-auto flex rounded-lg border border-line bg-bg/90 p-0.5 backdrop-blur">
                {(['heat', 'zones'] as MapMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                      mode === m ? 'bg-info text-bg' : 'text-muted hover:text-text'
                    }`}
                  >
                    {m === 'heat' ? 'Heat' : 'Zones'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ZoneStrip zones={zones} />
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <CallQueue calls={queue} now={now} configured={telephonyConfigured} />
          <DoorKnockPanel knocks={knocks} now={now} onFocus={setFocusId} focusId={focusId} />
        </aside>
      </div>
    </div>
  );
}

const TONE_VAR: Record<'critical' | 'high' | 'watch' | 'clear', string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  watch: 'var(--watch)',
  clear: 'var(--clear)',
};

/** A hero number, not a chart: one value, its label, and what it counts. */
function StatTile({
  label,
  value,
  of,
  tone,
  hint,
}: {
  label: string;
  value: number;
  of?: number;
  tone: keyof typeof TONE_VAR;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3.5">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_VAR[tone] }} />
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      </div>
      <p className="mt-1.5 font-mono text-3xl font-semibold leading-none tabular-nums">
        {value}
        {of !== undefined && <span className="text-lg text-muted">/{of}</span>}
      </p>
      <p className="mt-1 truncate text-xs text-muted">{hint}</p>
    </div>
  );
}

const LEGEND_ITEMS: { urgency: Urgency; label: string }[] = [
  { urgency: 'critical', label: 'Refused' },
  { urgency: 'high', label: 'Unknown / no answer' },
  { urgency: 'watch', label: 'Stale or evacuating' },
  { urgency: 'clear', label: 'Cleared' },
];

function Legend({ mode }: { mode: MapMode }) {
  return (
    <div className="pointer-events-auto rounded-lg border border-line bg-bg/90 px-3 py-2.5 backdrop-blur">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        {mode === 'heat' ? 'Door-knock density' : 'Zone priority'}
      </p>
      {mode === 'heat' && (
        <div className="mb-2">
          <div
            aria-hidden
            className="h-2 w-40 rounded-full"
            style={{
              background: `linear-gradient(to right, rgb(253 224 71 / 0.15), ${URGENCY_COLOR.watch}, ${URGENCY_COLOR.high}, ${URGENCY_COLOR.critical})`,
            }}
          />
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>handled</span>
            <span>needs officers</span>
          </div>
        </div>
      )}
      <ul className="grid gap-1">
        {LEGEND_ITEMS.map((i) => (
          <li key={i.urgency} className="flex items-center gap-2 text-xs text-muted">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-bg"
              style={{ background: URGENCY_COLOR[i.urgency] }}
            />
            {i.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ZoneStrip({ zones }: { zones: ReturnType<typeof zoneSummaries> }) {
  if (zones.length === 0) return null;
  return (
    <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
      {zones.map((z) => (
        <div
          key={z.zone_id}
          className="min-w-[160px] shrink-0 rounded-xl border bg-panel p-3"
          style={{ borderColor: `${URGENCY_COLOR[z.urgency]}59` }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-semibold">{z.zone_id}</span>
            <span
              className="rounded px-1.5 py-0.5 text-xs font-semibold"
              style={{ color: URGENCY_COLOR[z.urgency], background: `${URGENCY_COLOR[z.urgency]}1f` }}
            >
              {z.unresolved}/{z.total}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">{ZONE_NAMES[z.zone_id] ?? z.zone_id}</p>
          <p className="mt-1.5 text-xs text-muted">
            {z.counts.critical > 0 && <span className="text-critical">{z.counts.critical} refused · </span>}
            {z.destroyed > 0 ? `${z.destroyed} destroyed` : 'no structure loss'}
          </p>
        </div>
      ))}
    </div>
  );
}

const ROUTING_TONE: Record<CallRow['routing'], string> = {
  callback_queue: 'var(--critical)',
  abandoned_callback: 'var(--high)',
  human_now: 'var(--critical)',
  priority_queue: 'var(--high)',
  scheduled_followup: 'var(--watch)',
  answered_by_agent: 'var(--clear)',
};

/**
 * The caller's emotional state, per docs/DATA_CONTRACT.md §3a. Worried is the normal call on
 * this line, so calm and worried stay recessive and only distressed and above take a status
 * colour. Always labelled, never colour alone.
 */
const CALLER_STATE_TONE: Record<CallerState, string> = {
  calm: 'var(--muted)',
  worried: 'var(--muted)',
  distressed: 'var(--high)',
  panicked: 'var(--critical)',
};

function EmotionGauge({ state, score }: { state?: CallerState | null; score?: number }) {
  const distress = score ?? 0;
  if (!state && distress === 0) return null;
  const tone = state ? CALLER_STATE_TONE[state] : 'var(--muted)';
  // Four segments against the handoff threshold, so "one notch from a human" is visible.
  const segments = Math.max(DISTRESS_THRESHOLD + 1, distress);

  return (
    <div className="mt-1.5 flex items-center gap-2">
      {state && (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
          style={{ color: tone }}
        >
          {(state === 'panicked' || state === 'distressed') && <span aria-hidden>▲</span>}
          {CALLER_STATE_LABEL[state]}
        </span>
      )}
      {distress > 0 && (
        <span
          className="flex items-center gap-0.5"
          title={`Distress score ${distress} of ${DISTRESS_THRESHOLD} needed for a handoff`}
        >
          <span className="sr-only">
            Distress score {distress}, handoff at {DISTRESS_THRESHOLD}
          </span>
          {Array.from({ length: segments }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="h-1.5 w-2.5 rounded-sm"
              style={{
                background:
                  i < distress
                    ? distress >= DISTRESS_THRESHOLD
                      ? 'var(--critical)'
                      : 'var(--high)'
                    : 'var(--line)',
              }}
            />
          ))}
        </span>
      )}
    </div>
  );
}

function CallQueue({
  calls,
  now,
  configured,
}: {
  calls: CallRow[];
  now: number;
  configured: boolean;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-panel">
      <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Live call queue</h2>
        <span className="font-mono text-xs text-muted">{calls.length}</span>
      </header>
      <div className="max-h-[42vh] overflow-y-auto">
        {calls.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm leading-relaxed text-muted">
            No calls yet.
            {!configured && (
              <>
                <br />
                Set NEXT_PUBLIC_TELEPHONY_URL to attach the agent&apos;s feed.
              </>
            )}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {calls.map((c) => (
              <li key={c.call_id || c.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold"
                    style={{ color: ROUTING_TONE[c.routing], background: `${ROUTING_TONE[c.routing]}1f` }}
                  >
                    {c.bypass && <span aria-hidden>⚡</span>}
                    {ROUTING_LABEL[c.routing]}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {c.severity > 0 && `S${c.severity} · `}
                    {relativeMinutes(Math.round(ageMinutes(c.created_at, now)))}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-sm font-medium">
                  {c.address || 'Address not given'}
                </p>
                <p className="truncate text-xs text-muted">
                  asking about {c.subject_name || 'an unnamed resident'}
                  {c.mode === 'routine' && ' · routine check'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{c.reason}</p>
                <EmotionGauge state={c.caller_state} score={c.distress_score} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DoorKnockPanel({
  knocks,
  now,
  onFocus,
  focusId,
}: {
  knocks: AddressState[];
  now: number;
  onFocus: (id: string) => void;
  focusId: string | null;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-line bg-panel">
      <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Door-knock list</h2>
        <span className="font-mono text-xs text-muted">{knocks.length}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {knocks.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Every address inside the perimeter is resolved.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {knocks.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onFocus(a.id)}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-panel-2 ${
                    focusId === a.id ? 'bg-panel-2' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{a.address}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{a.zone_id}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatusChip status={a.status} urgency={urgencyOf(a, now)} />
                    <StructureChip structure={a.structure} />
                    <span className="text-xs text-muted">
                      {a.recorded_at
                        ? relativeMinutes(Math.round(ageMinutes(a.recorded_at, now)))
                        : 'no record'}
                    </span>
                  </div>
                  {a.note && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{a.note}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Demo fallback for when the phone line isn't up. Each case is one row from the routing
 * table in docs/DATA_CONTRACT.md §3, so the board shows what a real call would show.
 * Rows are injected locally and never written to the backend.
 */
const DEMO_CALLS: { label: string; row: Omit<CallRow, 'id' | 'call_id' | 'created_at'> }[] = [
  {
    label: 'Worried relative, cleared address',
    row: {
      mode: 'wildfire',
      address: '1420 Sunset Mesa Dr',
      subject_name: 'Maria Lopez',
      address_id: 'a1',
      routing: 'answered_by_agent',
      severity: 1,
      reason: 'cleared 40 min ago — answered with the time',
      caller_state: 'worried',
    },
  },
  {
    label: 'Caller about the refused address',
    row: {
      mode: 'wildfire',
      address: '1515 Via de la Paz',
      subject_name: 'Harold Kim',
      address_id: 'a2',
      routing: 'priority_queue',
      severity: 4,
      reason: 'refused, note: 2 adults staying, 1 on oxygen',
    },
  },
  {
    label: 'First-hand emergency',
    row: {
      mode: 'wildfire',
      address: '16800 Bollinger Dr',
      subject_name: 'Ruth Adams',
      address_id: 'a3',
      routing: 'human_now',
      severity: 5,
      reason: 'caller distress: said "please hurry"; agent asked to repeat 2x',
      bypass: true,
      caller_state: 'panicked',
      distress_score: 4,
    },
  },
  {
    label: 'Routine check (grandma)',
    row: {
      mode: 'routine',
      address: '4512 Crenshaw Blvd',
      subject_name: 'Dorothy Hayes',
      address_id: 'a6',
      routing: 'priority_queue',
      severity: 4,
      reason: 'routine welfare check, score 4 — 5 days, lives alone, mail piling up',
    },
  },
];

function DemoCalls({ onInject }: { onInject: (row: CallRow) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-panel-2 hover:text-text"
      >
        Simulate call
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[600] mt-1.5 w-72 overflow-hidden rounded-xl border border-line bg-panel-2 shadow-2xl">
          <p className="border-b border-line px-3 py-2 text-xs text-muted">
            Injects one row locally, for when the phone line is down.
          </p>
          {DEMO_CALLS.map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => {
                const id = crypto.randomUUID();
                onInject({ ...d.row, id, call_id: id, created_at: new Date().toISOString() });
                setOpen(false);
              }}
              className="block w-full px-3 py-2.5 text-left text-xs transition-colors hover:bg-panel"
            >
              <span className="block font-medium">{d.label}</span>
              <span className="block text-muted">{ROUTING_LABEL[d.row.routing]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

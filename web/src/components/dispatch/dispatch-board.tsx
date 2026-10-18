'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
// From zones.ts, not addresses.ts: the latter re-exports this but also pulls in the
// household site list, which would ship all 8,103 centroids to the browser. addresses.ts
// says so in its own header, and this import was quietly undoing it.
import { ZONE_NAMES } from '@/lib/zones';
import {
  URGENCY_COLOR,
  doorKnockList,
  isStale,
  relativeMinutes,
  ageMinutes,
  urgencyOf,
  type Urgency,
} from '@/lib/priority';
import { CALLER_STATE_LABEL, DISTRESS_THRESHOLD, ROUTING_LABEL, ROUTING_RANK } from '@/lib/types';
import type { AddressState, CallRow, CallerState } from '@/lib/types';
import { telephonyConfigured, useAddresses, useCalls, useNow } from '@/lib/use-live';
import { ConnectionDot, ResetButton, SignOutButton, StatusChip, StructureChip } from '@/components/ui';
import type { MapMode } from './zone-map';
import { RetellAlerts } from './retell-alerts';

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

  const [mode, setMode] = useState<MapMode>('buildings');
  const [focusId, setFocusId] = useState<string | null>(null);

  const inPerimeter = useMemo(() => addresses.filter((a) => a.inside_perimeter), [addresses]);
  const knocks = useMemo(() => doorKnockList(addresses, now), [addresses, now]);

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
    <div className="paper-console flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line bg-panel px-5 pb-3 pt-4">
        <div className="min-w-0">
          <p className="eyebrow-dark">LA Community Line · Dispatch</p>
          <h1 className="display mt-1 text-[28px] leading-none">Palisades Fire</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <ConnectionDot
              state={connection}
              label={`${dataMode === 'supabase' ? 'Records' : 'Records (local)'} ${connection}`}
            />
            <ConnectionDot
              state={callFeed}
              label={telephonyConfigured ? `Phone line ${callFeed}` : 'Phone line not connected'}
            />
          </p>
          <Clock now={now} />
          <div className="flex items-center gap-1.5">
            <DemoCalls onInject={upsert} />
            <ResetButton />
            <SignOutButton />
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" className="mx-5 mt-4 border-l-2 border-critical bg-critical/10 px-3.5 py-2.5 text-xs leading-relaxed text-critical">
          {error}
        </p>
      )}
      {!gated && (
        <p className="mx-5 mt-4 border-l-2 border-watch bg-watch/10 px-3.5 py-2.5 text-xs leading-relaxed text-watch">
          Database reads are not behind the shift code: SUPABASE_JWT_SECRET is not set, so the
          anon key alone can read resident names. Set it before this is reachable publicly —
          see docs/SUPABASE_SETUP.md.
        </p>
      )}

      <RetellAlerts />

      <div className="grid flex-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex min-w-0 flex-col gap-4">
          <dl className="grid grid-cols-2 border border-line bg-panel sm:grid-cols-4">
            <Tally
              label="Still open"
              value={stats.unresolved}
              of={stats.total}
              tone="high"
              hint="households inside the perimeter"
            />
            <Tally label="Refusing to leave" value={stats.refused} tone="critical" hint="people still inside" />
            <Tally label="Never reached" value={stats.neverContacted} tone="high" hint="no knock, no call" />
            <Tally label="Clears gone stale" value={stats.stale} tone="watch" hint="last check over 2 hours ago" />
          </dl>

          <div className="relative min-h-[460px] flex-1 overflow-hidden border border-line bg-paper">
            <ZoneMap
              addresses={addresses}
              mode={mode}
              now={now}
              focusId={focusId}
              onSelect={setFocusId}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-wrap items-start justify-between gap-2 p-3">
              <Legend mode={mode} />
              <div className="pointer-events-auto flex rounded-lg border border-paper-rule bg-paper-card/95 p-0.5 shadow-[0_12px_28px_-18px_rgba(43,29,18,.6)] backdrop-blur">
                {(['buildings', 'zones'] as MapMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`rounded-md px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${
                      mode === m
                        ? 'bg-paper-ink text-paper-card'
                        : 'text-paper-ink-2 hover:text-paper-ink'
                    }`}
                  >
                    {m === 'buildings' ? 'Buildings' : 'Zones'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* On wide screens the sidebar takes its height from the map column instead of setting
            it: h-0 keeps its content out of the row's sizing and min-h-full stretches it back.
            Without this a long door-knock list makes the row (and so the map) thousands of px tall. */}
        <aside className="flex min-w-0 flex-col gap-4 lg:h-0 lg:min-h-full">
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

/** Wall-clock time: dispatchers log against it and read every age on the board from it. */
function Clock({ now }: { now: number }) {
  const t = new Date(now);
  return (
    <time dateTime={t.toISOString()} className="figure text-sm text-muted" suppressHydrationWarning>
      {t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
    </time>
  );
}

/** One count in the tally row: the number, what it counts, and the bar of colour that keys it to the map. */
function Tally({
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
    <div className="border-line px-4 py-3 [&:not(:first-child)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
      <dt className="flex items-center gap-2 text-[13px] font-semibold">
        <span aria-hidden className="h-3 w-1 shrink-0" style={{ background: TONE_VAR[tone] }} />
        {label}
      </dt>
      <dd className="figure mt-1.5 text-[34px] font-medium leading-none">
        {value.toLocaleString()}
        {of !== undefined && <span className="text-base text-muted"> of {of.toLocaleString()}</span>}
      </dd>
      <dd className="mt-1 truncate text-xs text-muted">{hint}</dd>
    </div>
  );
}

const LEGEND_ITEMS: { urgency: Urgency; label: string }[] = [
  { urgency: 'critical', label: 'Refused' },
  { urgency: 'high', label: 'Unknown / no answer' },
  { urgency: 'watch', label: 'Stale or evacuating' },
  { urgency: 'clear', label: 'Cleared' },
];

/** Key for the map. Labels every colour rather than relying on hue alone. */
function Legend({ mode }: { mode: MapMode }) {
  return (
    <div className="pointer-events-auto w-48 rounded-lg border border-paper-rule bg-paper-card/95 px-3 py-2.5 shadow-[0_12px_28px_-16px_rgba(43,29,18,.5)] backdrop-blur sm:w-56">
      <div className="eyebrow">{mode === 'buildings' ? 'Evacuation status' : 'Zone priority'}</div>

      <ul className="mt-2 grid gap-1">
        {LEGEND_ITEMS.map((i) => (
          <li key={i.urgency} className="flex items-center gap-2 text-[11px] text-paper-ink-2">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-paper"
              style={{ background: URGENCY_COLOR[i.urgency] }}
            />
            {i.label}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center gap-2 border-t border-paper-rule-soft pt-2 text-[11px] text-paper-ink-2">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
          style={{ background: '#7d8a96', opacity: 0.35 }}
        />
        Building, no record
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-paper-soft">
        Dashed outline is the active fire perimeter.
      </p>
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

/** Panel heading shared by the two sidebar lists: what it is, how it is ordered, how many. */
function PanelHead({ title, order, count }: { title: string; order: string; count: number }) {
  return (
    <header className="flex items-end justify-between gap-2 border-b border-line px-4 pb-2.5 pt-3">
      <div>
        <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
        <p className="text-xs text-muted">{order}</p>
      </div>
      <span className="figure text-xl leading-none">{count.toLocaleString()}</span>
    </header>
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
    <section className="flex min-h-0 flex-col border border-line bg-panel">
      <PanelHead title="Incoming calls" order="needs a person first, then newest" count={calls.length} />
      <div className="max-h-[42vh] overflow-y-auto">
        {calls.length === 0 ? (
          <div className="px-4 py-6 text-sm leading-relaxed text-muted">
            <p>No calls waiting. When someone calls the line, the call shows up here.</p>
            {!configured && (
              <p className="mt-2 text-xs">
                The phone line isn&apos;t connected to this board. Use{' '}
                <span className="font-medium text-text">Simulate call</span> to try it.
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {calls.map((c) => (
              <li
                key={c.call_id || c.id}
                className="border-l-[3px] px-4 py-3"
                style={{ borderLeftColor: ROUTING_TONE[c.routing] }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: ROUTING_TONE[c.routing] }}>
                    {c.bypass && <span aria-hidden>⚡ </span>}
                    {ROUTING_LABEL[c.routing]}
                  </span>
                  <span className="figure shrink-0 text-xs text-muted">
                    {c.severity > 0 && `S${c.severity} · `}
                    {relativeMinutes(Math.round(ageMinutes(c.created_at, now)))}
                  </span>
                </div>
                <p className="mt-1 truncate text-[15px] font-semibold">
                  {c.address || 'Address not given'}
                </p>
                <p className="truncate text-xs text-muted">
                  Caller asking about {c.subject_name || 'an unnamed resident'}
                  {c.mode === 'routine' && ' · routine check'}
                </p>
                <p className="mt-1 text-[13px] leading-snug">{c.reason}</p>
                <EmotionGauge state={c.caller_state} score={c.distress_score} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** How many rows the lists render. The rest are counted, not drawn. */
const LIST_LIMIT = 60;

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
  const shown = knocks.slice(0, LIST_LIMIT);
  return (
    <section className="flex min-h-0 flex-1 flex-col border border-line bg-panel">
      <PanelHead title="Doors to knock" order="worst first · tap one to find it on the map" count={knocks.length} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {knocks.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Every address inside the perimeter is resolved.
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {shown.map((a, i) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onFocus(a.id)}
                  aria-current={focusId === a.id}
                  className={`grid w-full grid-cols-[2rem_minmax(0,1fr)] gap-x-2 px-4 py-3 text-left transition-colors hover:bg-panel-2 ${
                    focusId === a.id ? 'bg-panel-2 shadow-[inset_3px_0_0_var(--text)]' : ''
                  }`}
                >
                  <span className="figure pt-0.5 text-sm text-muted">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[15px] font-semibold">{a.address}</span>
                      <span className="figure shrink-0 text-xs text-muted">
                        {a.recorded_at
                          ? relativeMinutes(Math.round(ageMinutes(a.recorded_at, now)))
                          : 'no record'}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-muted">{ZONE_NAMES[a.zone_id] ?? a.zone_id}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusChip status={a.status} urgency={urgencyOf(a, now)} />
                      <StructureChip structure={a.structure} />
                    </span>
                    {a.note && (
                      <span className="mt-1.5 block text-[13px] leading-snug">&ldquo;{a.note}&rdquo;</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            {knocks.length > shown.length && (
              <li className="px-4 py-3 text-xs text-muted">
                {(knocks.length - shown.length).toLocaleString()} more below these. Clear the top
                of the list first.
              </li>
            )}
          </ol>
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
      // Outside the incident, so it is not on this map — which is the dual-use point.
      address_id: null,
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
        className="border border-text bg-text px-3 py-1.5 text-xs font-semibold text-panel transition-opacity hover:opacity-85"
      >
        Simulate call
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[600] mt-1.5 w-72 overflow-hidden border border-line bg-panel shadow-[0_18px_40px_-20px_rgba(43,29,18,.55)]">
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
              className="block w-full border-t border-line px-3 py-2.5 text-left text-xs transition-colors hover:bg-panel-2"
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

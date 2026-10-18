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
import { CALLER_STATE_LABEL, DISTRESS_THRESHOLD, ROUTING_LABEL, ROUTING_RANK, STATUS_LABEL } from '@/lib/types';
import type { AddressState, CallRow, CallerState, Status } from '@/lib/types';
import { telephonyConfigured, useAddresses, useCalls, useNow } from '@/lib/use-live';
import { ConnectionDot, Mark, ResetButton, SignOutButton, StatusChip, StructureChip } from '@/components/ui';
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

  const needsPerson = calls.filter((c) => c.routing === 'human_now' || c.routing === 'callback_queue').length;
  const lastHour = calls.filter((c) => now - Date.parse(c.created_at) < 3_600_000).length;
  const today = new Date(now);

  return (
    <div className="ops-console flex min-h-dvh">
      <Sidebar knocks={knocks.length} calls={calls.length} needsPerson={needsPerson} onInject={upsert} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="lg:hidden"><Mark /></span>
            <p className="truncate text-[13px] text-muted">
              Dispatch <span className="text-line">/</span>{' '}
              <span className="font-medium text-text">Palisades Fire map</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <ConnectionDot
              state={connection}
              label={`${dataMode === 'supabase' ? 'Records' : 'Records (local)'} ${connection}`}
            />
            <ConnectionDot
              state={callFeed}
              label={telephonyConfigured ? `Phone line ${callFeed}` : 'Phone line not connected'}
            />
            <span className="text-muted" suppressHydrationWarning>
              {today.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
              <span className="figure text-text">
                {today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            </span>
            <span className="flex items-center gap-1.5 lg:hidden">
              <DemoCalls onInject={upsert} />
              <ResetButton />
              <SignOutButton />
            </span>
          </div>
        </header>

        {error && (
          <p role="alert" className="mx-5 mt-4 rounded-md bg-critical/10 px-3.5 py-2.5 text-xs leading-relaxed text-critical">
            {error}
          </p>
        )}
        {!gated && (
          <p className="mx-5 mt-4 rounded-md bg-high/10 px-3.5 py-2.5 text-xs leading-relaxed text-high">
            Database reads are not behind the shift code: SUPABASE_JWT_SECRET is not set, so the
            anon key alone can read resident names. Set it before this is reachable publicly —
            see docs/SUPABASE_SETUP.md.
          </p>
        )}

        <RetellAlerts />

        <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section id="map" className="flex min-w-0 flex-col gap-4">
            <div className="relative min-h-[460px] flex-1 overflow-hidden rounded-lg border border-line bg-paper">
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

            <div className="grid gap-4 md:grid-cols-[1.15fr_1.4fr_0.9fr]">
              <Widget title="Right now">
                <dl className="mt-3 grid gap-1.5 text-[13px]">
                  <Row label="Still open" value={stats.unresolved} of={stats.total} />
                  <Row label="Refusing to leave" value={stats.refused} tone="var(--critical)" />
                  <Row label="Never reached" value={stats.neverContacted} />
                  <Row label="Clears gone stale" value={stats.stale} tone="var(--high)" />
                </dl>
              </Widget>
              <Widget title="Status overview">
                <StatusBar addresses={inPerimeter} />
              </Widget>
              <Widget title="Calls on the line">
                <div className="mt-3 flex items-end gap-3">
                  <span className="figure text-[44px] font-medium leading-none">{calls.length}</span>
                  <span className="pb-1 text-xs text-clear">+{lastHour} this hour</span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {needsPerson > 0 ? (
                    <span className="text-critical">{needsPerson} need a person</span>
                  ) : (
                    'none waiting on a person'
                  )}
                </p>
              </Widget>
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
    </div>
  );
}

const NAV_ICON = {
  map: 'M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Zm6-2.5v13.5m6-11v13.5',
  calls: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z',
  knocks: 'M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z',
};

/** The console's left rail, after the reference: who is on shift, where to jump, the demo controls. */
function Sidebar({
  knocks,
  calls,
  needsPerson,
  onInject,
}: {
  knocks: number;
  calls: number;
  needsPerson: number;
  onInject: (row: CallRow) => void;
}) {
  const items: { href: string; label: string; icon: keyof typeof NAV_ICON; count?: number }[] = [
    { href: '#map', label: 'Fire map', icon: 'map' },
    { href: '#calls', label: 'Incoming calls', icon: 'calls', count: calls },
    { href: '#knocks', label: 'Doors to knock', icon: 'knocks', count: knocks },
  ];
  return (
    <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col border-r border-line bg-panel px-3 py-4 lg:flex">
      <div className="flex items-center gap-2.5 px-2">
        <Mark />
        <span className="text-[17px] font-semibold tracking-tight">Line</span>
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-lg bg-panel-2 px-3 py-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-line text-xs font-semibold">DS</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">Dispatcher</span>
          <span className="block truncate text-[11px] text-muted">Palisades shift</span>
        </span>
        <span className="relative" title={`${needsPerson} calls need a person`}>
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-none stroke-muted" strokeWidth={1.6}>
            <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4h4" />
          </svg>
          {needsPerson > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-[10px] font-semibold text-bg">
              {needsPerson}
            </span>
          )}
        </span>
      </div>

      <nav className="mt-6 grid gap-1">
        {items.map((it, i) => (
          <a
            key={it.href}
            href={it.href}
            aria-current={i === 0 ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors ${
              i === 0 ? 'bg-panel-2 text-text' : 'text-muted hover:bg-panel-2 hover:text-text'
            }`}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] shrink-0 fill-none stroke-current" strokeWidth={1.6} strokeLinejoin="round">
              <path d={NAV_ICON[it.icon]} />
            </svg>
            <span className="flex-1">{it.label}</span>
            {it.count !== undefined && <span className="figure text-[11px] text-muted">{it.count.toLocaleString()}</span>}
          </a>
        ))}
      </nav>

      <div className="mt-auto grid gap-3">
        <div className="rounded-lg bg-panel-2 p-3.5">
          <p className="text-[15px] font-semibold">Phone line quiet?</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Put a test call on the board to see how a real one lands.
          </p>
          <div className="mt-3">
            <DemoCalls onInject={onInject} up block />
          </div>
        </div>
        <div className="grid gap-2 [&>button]:w-full [&>button]:py-2">
          <ResetButton />
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

/** A dashboard card: a title and whatever it holds. */
function Widget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel px-4 py-3.5">
      <h2 className="text-[13px] font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, of, tone }: { label: string; value: number; of?: number; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}:</dt>
      <dd className="figure font-medium" style={tone ? { color: tone } : undefined}>
        {value.toLocaleString()}
        {of !== undefined && <span className="text-muted"> / {of.toLocaleString()}</span>}
      </dd>
    </div>
  );
}

const STATUS_BAR: { status: Status[]; label: string; tone: string }[] = [
  { status: ['cleared', 'self_out'], label: STATUS_LABEL.cleared, tone: 'var(--clear)' },
  { status: ['in_transit'], label: STATUS_LABEL.in_transit, tone: 'var(--high)' },
  { status: ['no_answer'], label: STATUS_LABEL.no_answer, tone: 'var(--watch)' },
  { status: ['unknown'], label: 'No record', tone: '#5d635a' },
  { status: ['refused'], label: STATUS_LABEL.refused, tone: 'var(--critical)' },
];

/** Every household inside the perimeter as one bar, split by status. */
function StatusBar({ addresses }: { addresses: AddressState[] }) {
  const parts = STATUS_BAR.map((p) => ({ ...p, n: addresses.filter((a) => p.status.includes(a.status)).length }));
  const total = Math.max(1, addresses.length);
  return (
    <>
      <div className="mt-3.5 flex h-9 gap-1" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}>
        {parts.filter((p) => p.n > 0).map((p) => (
          <span key={p.label} className="min-w-1.5 rounded-[3px]" style={{ flexGrow: p.n / total, background: p.tone }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1 text-[11px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5 whitespace-nowrap text-muted">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: p.tone }} />
            <span className="flex-1">{p.label}</span>
            <span className="figure text-text">{p.n.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </>
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

/** Panel heading shared by the two right-hand lists, after the reference's Orders card. */
function PanelHead({ title, order, count }: { title: string; order: string; count: number }) {
  return (
    <header className="flex items-start justify-between gap-2 border-b border-line px-4 pb-3 pt-3.5">
      <div>
        <h2 className="text-[13px] font-medium">{title}</h2>
        <p className="text-[11px] text-muted">
          Total: <span className="figure">{count.toLocaleString()}</span> · {order}
        </p>
      </div>
    </header>
  );
}

/** Left rule with two stops, like the reference's shipment route: who is asking, about where. */
function Trail({ top, bottom }: { top: React.ReactNode; bottom: React.ReactNode }) {
  return (
    <div className="relative mt-2 pl-5">
      <span aria-hidden className="absolute bottom-1.5 left-[5px] top-1.5 w-px bg-line" />
      <span aria-hidden className="absolute left-0.5 top-1 h-2 w-2 rotate-45 border border-muted bg-panel" />
      <span aria-hidden className="absolute bottom-1 left-0.5 h-2 w-2 rotate-45 bg-muted" />
      <div className="text-[13px]">{top}</div>
      <div className="mt-1 text-[13px]">{bottom}</div>
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
    <section id="calls" className="flex min-h-0 flex-col rounded-lg border border-line bg-panel">
      <PanelHead title="Incoming calls" order="needs a person first" count={calls.length} />
      <div className="max-h-[42vh] overflow-y-auto">
        {calls.length === 0 ? (
          <div className="px-4 py-6 text-[13px] leading-relaxed text-muted">
            <p>No calls waiting. When someone calls the line, the call shows up here.</p>
            {!configured && (
              <p className="mt-2 text-xs">
                The phone line isn&apos;t connected to this board. Use{' '}
                <span className="text-text">Simulate call</span> to try it.
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {calls.map((c) => (
              <li key={c.call_id || c.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="figure text-[13px] font-medium">#{(c.call_id || c.id).replace(/[^a-z0-9]/gi, '').slice(-6)}</span>
                    <span className="chip" style={{ '--tone': ROUTING_TONE[c.routing] } as React.CSSProperties}>
                      {c.bypass && <span aria-hidden>⚡</span>}
                      {ROUTING_LABEL[c.routing]}
                    </span>
                  </span>
                  <span className="figure shrink-0 text-[11px] text-muted">
                    {relativeMinutes(Math.round(ageMinutes(c.created_at, now)))}
                  </span>
                </div>
                <div className="flex gap-4">
                  <div className="min-w-0 flex-1">
                    <Trail
                      top={<span className="text-muted">Asking about {c.subject_name || 'an unnamed resident'}</span>}
                      bottom={<span className="block truncate font-medium">{c.address || 'Address not given'}</span>}
                    />
                  </div>
                  {c.severity > 0 && (
                    <div className="mt-2 shrink-0 text-right">
                      <p className="text-[11px] text-muted">Severity</p>
                      <p className="figure text-[13px]">{c.severity} / 5</p>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {c.reason}
                  {c.mode === 'routine' && ' · routine check'}
                </p>
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
    <section id="knocks" className="flex min-h-0 flex-1 flex-col rounded-lg border border-line bg-panel">
      <PanelHead title="Doors to knock" order="worst first, tap to find" count={knocks.length} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {knocks.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted">
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
                  className={`w-full px-4 py-3.5 text-left transition-colors hover:bg-panel-2 ${
                    focusId === a.id ? 'bg-panel-2 shadow-[inset_2px_0_0_var(--clear)]' : ''
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="figure text-[13px] font-medium">#{i + 1}</span>
                      <StatusChip status={a.status} urgency={urgencyOf(a, now)} />
                      <StructureChip structure={a.structure} />
                    </span>
                    <span className="figure shrink-0 text-[11px] text-muted">
                      {a.recorded_at ? relativeMinutes(Math.round(ageMinutes(a.recorded_at, now))) : 'no record'}
                    </span>
                  </span>
                  <span className="mt-2 flex gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{a.address}</span>
                      <span className="block truncate text-xs text-muted">{a.resident_name}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[11px] text-muted">District</span>
                      <span className="block max-w-[150px] truncate text-xs">{ZONE_NAMES[a.zone_id] ?? a.zone_id}</span>
                    </span>
                  </span>
                  {a.note && (
                    <span className="mt-2 block rounded-md bg-panel-2 px-2.5 py-1.5 text-xs leading-relaxed text-muted">
                      {a.note}
                    </span>
                  )}
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

function DemoCalls({ onInject, up = false, block = false }: { onInject: (row: CallRow) => void; up?: boolean; block?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`rounded-md bg-text px-3 py-1.5 text-xs font-semibold text-bg transition-opacity hover:opacity-85 ${block ? 'w-full py-2.5' : ''}`}
      >
        ▶ Simulate call
      </button>
      {open && (
        <div
          className={`absolute z-[600] w-72 overflow-hidden rounded-lg border border-line bg-panel-2 shadow-2xl ${
            up ? 'bottom-full left-0 mb-1.5' : 'right-0 top-full mt-1.5'
          }`}
        >
          <p className="px-3 py-2 text-[11px] text-muted">
            Puts one call on this board only, for when the phone line is down.
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
              className="block w-full border-t border-line px-3 py-2.5 text-left text-xs transition-colors hover:bg-panel"
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

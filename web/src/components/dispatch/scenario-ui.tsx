'use client';

// The dispatch board's scenario controls: the Live/Scenario switch, the banner that says this is
// not real, the clock and transport, and the panel of suggestions and timeline.
//
// The banner is not optional and cannot be closed. A console showing invented evacuations that
// looks like the real one is the one failure that matters here, so everything on this screen that
// came from the scenario says so, and the one thing that did not (a real call) says that instead.
import { useState } from 'react';
import { SCENARIO_TITLE, SIM_START_MS, type Beat } from '@/lib/scenario/palisades';
import type { ScenarioSuggestion } from '@/lib/scenario/suggest';
import { SPEEDS, type Decision } from '@/lib/scenario/use-scenario';
import type { Suggestion, SuggestionPriority } from '@/lib/types';

const CLOCK_DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' });
const CLOCK_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false });

/** Simulated wall-clock time as Pacific time, the zone every source in the research uses. */
export const simDate = (ms: number): string => CLOCK_DATE.format(ms);
export const simClock = (ms: number): string => CLOCK_TIME.format(ms);
const beatClock = (t: number): string => simClock(SIM_START_MS + t * 60_000);

const PRIORITY: Record<SuggestionPriority, { label: string; tone: string }> = {
  now: { label: 'Now', tone: 'var(--critical)' },
  soon: { label: 'Soon', tone: 'var(--high)' },
  when_free: { label: 'When free', tone: 'var(--watch)' },
  none: { label: 'Trip avoided', tone: 'var(--clear)' },
};

/** Live board or the scenario. Off the scenario, nothing about it runs. */
export function ModeSwitch({ active, disabled, onChange }: { active: boolean; disabled?: boolean; onChange: (scenario: boolean) => void }) {
  const base = 'rounded px-2.5 py-1 font-medium transition-colors disabled:opacity-40';
  return (
    <div role="group" aria-label="Which data the board shows" className="inline-flex rounded-md border border-line bg-panel-2 p-0.5 text-xs">
      <button type="button" aria-pressed={!active} onClick={() => onChange(false)} className={`${base} ${!active ? 'bg-line text-text' : 'text-muted hover:text-text'}`}>
        Live
      </button>
      <button
        type="button"
        aria-pressed={active}
        disabled={disabled}
        title={disabled ? 'Waiting for the households to load' : 'Replay the Palisades Fire on simulated data'}
        onClick={() => onChange(true)}
        className={`${base} ${active ? 'bg-high text-bg' : 'text-muted hover:text-text'}`}
      >
        Scenario
      </button>
    </div>
  );
}

interface BarProps {
  now: number;
  min: number;
  endMin: number;
  playing: boolean;
  speed: number;
  latest: Beat | undefined;
  ready: boolean;
  /** Whether a real call during the scenario updates its house, and how many have. */
  takeLive: boolean;
  onTakeLive: (on: boolean) => void;
  live: { calls: number; locked: number };
  /** Without the phone line's feed there are no real calls to take in. */
  telephonyConfigured: boolean;
  onToggle: () => void;
  onRestart: () => void;
  onSeek: (min: number) => void;
  onSpeed: (speed: number) => void;
}

export function ScenarioBar({ now, min, endMin, playing, speed, latest, ready, takeLive, onTakeLive, live, telephonyConfigured, onToggle, onRestart, onSeek, onSpeed }: BarProps) {
  const btn = 'rounded-md border border-high/40 px-3 py-1.5 text-xs font-medium text-high transition-colors hover:bg-high/15';
  return (
    <section aria-label="Simulation controls" className="mx-5 mt-4 rounded-lg border border-high/50 bg-high/10 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="chip" style={{ '--tone': 'var(--high)' } as React.CSSProperties}>SIMULATION</span>
        <p className="min-w-[220px] flex-1 text-xs leading-relaxed text-high">
          {SCENARIO_TITLE}, replayed on placeholder households. Not a live incident: the records, calls and people here are
          simulated, and nothing is sent to the field. A real call, if taken in below, is marked LIVE CALL.
        </p>
        <span className="figure text-right text-lg leading-none text-text" suppressHydrationWarning>
          <span className="block text-[11px] font-normal text-muted">{simDate(now)}</span>
          {simClock(now)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" className={btn} onClick={onToggle} disabled={!ready} aria-label={playing ? 'Pause the simulation' : 'Play the simulation'}>
          {playing ? 'Pause' : min >= endMin ? 'Replay' : 'Play'}
        </button>
        <button type="button" className={btn} onClick={onRestart} disabled={!ready}>
          Restart
        </button>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Speed
          <select
            value={speed}
            onChange={(e) => onSpeed(Number(e.target.value))}
            className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-text"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s} min/sec
              </option>
            ))}
          </select>
        </label>
        <input
          type="range"
          min={0}
          max={endMin}
          step={1}
          value={Math.round(min)}
          disabled={!ready}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Simulated time"
          className="min-w-[160px] flex-1 accent-[var(--high)]"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <label className={`flex items-center gap-1.5 ${telephonyConfigured ? 'text-text' : 'text-muted'}`}>
          <input
            type="checkbox"
            checked={takeLive && telephonyConfigured}
            disabled={!telephonyConfigured}
            onChange={(e) => onTakeLive(e.target.checked)}
            className="accent-[var(--info)]"
          />
          Real calls update the simulation
        </label>
        {telephonyConfigured ? (
          <span className="text-muted" aria-live="polite">
            {live.calls === 0
              ? 'Waiting for a call. A real call locks its house for the rest of the run.'
              : `${live.calls} real ${live.calls === 1 ? 'call' : 'calls'} taken in · ${live.locked} ${live.locked === 1 ? 'house' : 'houses'} locked`}
          </span>
        ) : (
          <span className="text-muted">The phone line is not connected to this board.</span>
        )}
      </div>

      <p className="mt-2 truncate text-xs text-muted" aria-live="polite">
        {latest ? (
          <>
            <span className="figure text-text">{beatClock(latest.t)}</span> {latest.title}
          </>
        ) : (
          'Before the first fire call'
        )}
      </p>
    </section>
  );
}

type Tab = 'suggested' | 'timeline';

/** How many suggestions to draw before counting the rest. */
const SUGGESTION_LIMIT = 12;

export function ScenarioPanel({
  suggestions,
  beats,
  decisions,
  onDecide,
}: {
  suggestions: ScenarioSuggestion[];
  beats: Beat[];
  decisions: Record<string, Decision>;
  onDecide: (key: string, decision: Decision | null) => void;
}) {
  const [tab, setTab] = useState<Tab>('suggested');
  const open = suggestions.filter((s) => decisions[s.key] !== 'dismissed');
  const waiting = open.filter((s) => !decisions[s.key]).length;
  // A confirmed suggestion stays where it was, collapsed to one line, so the click visibly lands.
  // Only the ones still waiting are capped.
  let drawn = 0;
  const shown = open.filter((s) => decisions[s.key] || drawn++ < SUGGESTION_LIMIT);
  const more = waiting - shown.filter((s) => !decisions[s.key]).length;

  const tabBtn = (id: Tab, label: string, count: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${tab === id ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'}`}
    >
      {label} <span className="figure text-[11px] text-muted">{count.toLocaleString()}</span>
    </button>
  );

  return (
    <section id="scenario" className="flex min-h-0 shrink-0 flex-col rounded-lg border border-high/40 bg-panel">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div role="tablist" aria-label="Scenario" className="flex gap-1">
          {tabBtn('suggested', 'Suggested', waiting)}
          {tabBtn('timeline', 'Timeline', beats.length)}
        </div>
        <span className="chip" style={{ '--tone': 'var(--high)' } as React.CSSProperties}>
          SIM
        </span>
      </header>

      <div className="max-h-[34vh] min-h-0 overflow-y-auto">
        {tab === 'suggested' ? (
          shown.length === 0 ? (
            <p className="px-4 py-6 text-[13px] leading-relaxed text-muted">Nothing to suggest yet. Suggestions appear as streets are ordered out and the board falls behind.</p>
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((s) =>
                decisions[s.key] === 'confirmed' ? (
                  <li key={s.key} className="flex items-center gap-2 px-4 py-2 text-xs">
                    <span aria-hidden className="text-clear">✓</span>
                    <span className="min-w-0 flex-1 truncate text-muted" title={s.resource}>
                      <span className="font-medium text-clear">Confirmed in the simulation</span> · {s.resource}
                    </span>
                    <button type="button" onClick={() => onDecide(s.key, null)} className="shrink-0 text-muted underline-offset-2 hover:text-text hover:underline">
                      Undo
                    </button>
                  </li>
                ) : (
                  <li key={s.key} className="px-4 py-3">
                    <SuggestionBody suggestion={s} onDecide={(d) => onDecide(s.key, d)} />
                  </li>
                ),
              )}
              {more > 0 && <li className="px-4 py-3 text-xs text-muted">{more.toLocaleString()} more, lower priority.</li>}
            </ul>
          )
        ) : beats.length === 0 ? (
          <p className="px-4 py-6 text-[13px] leading-relaxed text-muted">The timeline fills in as the day plays.</p>
        ) : (
          <ol className="divide-y divide-line">
            {beats.map((b) => (
              <li key={`${b.t}-${b.title}`} className="px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <span className="figure text-[13px] font-medium">{beatClock(b.t)}</span>
                  <span className="text-[13px] font-medium leading-snug">{b.title}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{b.detail}</p>
                <p className="mt-1 text-[11px] text-muted">Documented · {b.source}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="border-t border-line px-4 py-2 text-[11px] leading-snug text-muted">
        {tab === 'suggested'
          ? 'Rules a dispatcher can read: each street’s researched fire threat plus what the board shows. Confirming only marks it here; nothing is dispatched.'
          : 'Times and events are from the LAPD and LAFD after-action reports and press. What happens at any one house is simulated.'}
      </p>
    </section>
  );
}

function SuggestionBody({ suggestion, onDecide }: { suggestion: Suggestion; onDecide: (d: Decision) => void }) {
  const tone = PRIORITY[suggestion.priority];
  return (
    <>
      <div className="flex items-start gap-2">
        <span className="chip mt-0.5 shrink-0" style={{ '--tone': tone.tone } as React.CSSProperties}>
          {tone.label}
        </span>
        <p className="text-[13px] font-medium leading-snug">{suggestion.resource}</p>
      </div>
      {suggestion.why.length > 0 && (
        <ul className="mt-1.5 grid gap-0.5 pl-0.5 text-xs leading-relaxed text-muted">
          {suggestion.why.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      )}
      {suggestion.requires_confirmation && (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={() => onDecide('confirmed')} className="rounded-md bg-clear/15 px-2.5 py-1 text-xs font-medium text-clear transition-colors hover:bg-clear/25">
            Confirm
          </button>
          <button type="button" onClick={() => onDecide('dismissed')} className="rounded-md border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:bg-panel-2 hover:text-text">
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}

/** The suggestions the line attached to one call, under it in the queue. */
export function CallSuggestions({
  callId,
  suggestions,
  decisions,
  onDecide,
}: {
  callId: string;
  suggestions: Suggestion[];
  decisions: Record<string, Decision>;
  onDecide: (key: string, decision: Decision | null) => void;
}) {
  const open = suggestions.filter((s) => decisions[`call:${callId}:${s.id}`] !== 'dismissed');
  if (open.length === 0) return null;
  return (
    <ul className="mt-2.5 grid gap-1.5 rounded-md bg-panel-2 px-2.5 py-2">
      <li className="text-[11px] font-medium uppercase tracking-wide text-muted">Suggested for this call</li>
      {open.map((s) => {
        const key = `call:${callId}:${s.id}`;
        const decision = decisions[key];
        const tone = PRIORITY[s.priority];
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="chip" style={{ '--tone': tone.tone } as React.CSSProperties}>
              {tone.label}
            </span>
            <span className="min-w-0 flex-1 text-xs leading-snug" title={s.why.join('; ')}>
              {s.resource}
            </span>
            {decision === 'confirmed' ? (
              <span className="flex items-center gap-1.5 text-[11px]">
                <span className="font-medium text-clear">✓ Confirmed</span>
                <button type="button" onClick={() => onDecide(key, null)} className="text-muted underline-offset-2 hover:text-text hover:underline">
                  Undo
                </button>
              </span>
            ) : (
              s.requires_confirmation && (
                <span className="flex gap-1.5">
                  <button type="button" onClick={() => onDecide(key, 'confirmed')} className="rounded bg-clear/15 px-2 py-0.5 text-[11px] font-medium text-clear hover:bg-clear/25">
                    Confirm
                  </button>
                  <button type="button" onClick={() => onDecide(key, 'dismissed')} className="rounded border border-line px-2 py-0.5 text-[11px] text-muted hover:bg-panel hover:text-text">
                    Dismiss
                  </button>
                </span>
              )
            )}
            {s.why.length > 0 && <span className="basis-full text-[11px] leading-snug text-muted">{s.why.join(' · ')}</span>}
          </li>
        );
      })}
    </ul>
  );
}

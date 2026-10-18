'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AddressState, CallRow } from '../types';
import { createEngine, type Engine, type Snapshot } from './engine';
import { baselineOf, isNewLiveCall, liveCallInput, type LiveBaseline } from './live';
import { SIM_END_MIN } from './palisades';

export type Decision = 'confirmed' | 'dismissed';

/** Simulated minutes that pass per real second. 2 = the whole day in about seven and a half minutes. */
export const SPEEDS = [1, 2, 4, 8] as const;

/**
 * The scenario, as a layer over the live board.
 *
 * `households` is whatever the live board has loaded; the scenario takes their ids, addresses
 * and threat levels and ignores their statuses, so what plays is a separate, simulated set of
 * information. `liveCalls` is the phone line's queue: while "real calls update the simulation" is
 * on, a call that arrives after the scenario starts is taken in and changes its house. Nothing
 * here writes to the database, the phone line or the officer queue; it only reads them.
 * While the scenario is off it costs nothing: no engine is built.
 */
export function useScenario(households: AddressState[], liveCalls: CallRow[]) {
  const [active, setActiveState] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(2);
  const [min, setMin] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [takeLive, setTakeLive] = useState(true);
  // Bumped when the engine changes without the clock moving (a real call came in while paused).
  const [version, setVersion] = useState(0);
  const minRef = useRef(0);

  // Rebuild only when the set of households changes, not every time one of their statuses does.
  const householdsRef = useRef(households);
  householdsRef.current = households;
  const liveCallsRef = useRef(liveCalls);
  liveCallsRef.current = liveCalls;
  const signature = households.length === 0 ? '' : `${households.length}:${households[0].id}:${households[households.length - 1].id}`;
  const engine = useMemo(
    () => (active && signature ? createEngine(householdsRef.current) : null),
    [active, signature],
  );
  const engineRef = useRef<Engine | null>(null);
  engineRef.current = engine;

  // Calls already on the phone line's queue when the scenario started are not part of it.
  const baselineRef = useRef<LiveBaseline>({ ids: new Set(), since: Date.now() });
  // The last version of each real call that was applied, so a call that updates is applied once per change.
  const appliedRef = useRef<Map<string, string>>(new Map());

  const seek = useCallback((to: number) => {
    const next = Math.max(0, Math.min(SIM_END_MIN, to));
    minRef.current = next;
    setMin(next);
  }, []);

  const restart = useCallback(() => {
    // A new run starts from the calls on the line now, and forgets the real calls of the last one.
    engineRef.current?.clearLive();
    baselineRef.current = baselineOf(liveCallsRef.current);
    appliedRef.current = new Map();
    seek(0);
    setVersion((v) => v + 1);
    setDecisions({});
    setPlaying(true);
  }, [seek]);

  const setActive = useCallback(
    (on: boolean) => {
      setActiveState(on);
      if (on) restart();
    },
    [restart],
  );

  // One tick a second is enough: the map redraws on each, and a smoother clock would only
  // make it redraw more.
  useEffect(() => {
    if (!active || !playing || !engine) return;
    let last = performance.now();
    const id = setInterval(() => {
      const t = performance.now();
      const next = Math.min(engine.endMin, minRef.current + ((t - last) / 1000) * speed);
      last = t;
      minRef.current = next;
      setMin(next);
      if (next >= engine.endMin) setPlaying(false);
    }, 1000);
    return () => clearInterval(id);
  }, [active, playing, speed, engine]);

  const snapshot: Snapshot | null = useMemo(
    // `version` is not read inside: it is how a real call that changes the engine asks for a fresh look.
    () => (engine ? engine.at(min) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, min, version],
  );

  // Real calls: take in each new one, and each change to one, at the scenario's current minute.
  useEffect(() => {
    if (!active || !engine || !takeLive) return;
    let changed = false;
    for (const call of liveCalls) {
      if (!isNewLiveCall(call, baselineRef.current)) continue;
      const input = liveCallInput(call);
      if (!input) continue;
      const signature = JSON.stringify([input.house, input.routing, input.severity, input.urgent, input.report?.status, input.reason]);
      if (appliedRef.current.get(input.key) === signature) continue;
      appliedRef.current.set(input.key, signature);
      engine.live(input);
      changed = true;
    }
    if (changed) setVersion((v) => v + 1);
  }, [active, engine, takeLive, liveCalls]);

  /** Record a confirm or dismiss; null takes it back. */
  const decide = useCallback((key: string, decision: Decision | null) => {
    setDecisions((prev) => {
      const next = { ...prev };
      if (decision === null) delete next[key];
      else next[key] = decision;
      return next;
    });
  }, []);

  return {
    active,
    setActive,
    /** True once the engine is built and there is a snapshot to show. */
    ready: snapshot !== null,
    playing,
    togglePlay: () => {
      // Pressing play at the end of the day starts it again.
      if (!playing && minRef.current >= SIM_END_MIN) seek(0);
      setPlaying((p) => !p);
    },
    speed,
    setSpeed,
    min,
    endMin: SIM_END_MIN,
    seek,
    restart,
    snapshot,
    decisions,
    decide,
    takeLive,
    setTakeLive,
  };
}

'use client';

// Where the officer is. Two sources, and which one is live is always visible on screen.
//
//   gps        — navigator.geolocation.watchPosition, high accuracy. The default, used
//                whenever the fix is real and lands inside the perimeter.
//   simulated  — a walk along demo-walk.ts. Used when GPS is denied, broken, never arrives,
//                or reports a position nowhere near the incident, and when the demo flag is
//                set. Never silent: the portal shows a SIMULATED badge whenever this is on.
//
// Real GPS wins whenever it is valid, including after a spell of simulation: an officer who
// grants permission late, or who walks into the perimeter, gets their own position back.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_ANCHOR_ADDRESS, DEMO_WALK_SPEED_MPS, bearing, demoRoute, pointAlong } from './demo-walk';
import type { LatLng, Located } from './geo';
import { offsetMetres, pointInPolygon } from './geo';
import { PERIMETER } from './zones';

export type PositionMode = 'gps' | 'simulated';

/**
 * Why the map is showing what it is showing. Every value except `live` and `locating` means
 * the position on screen is simulated.
 */
export type GpsState =
  /** Waiting for the first fix. */
  | 'locating'
  /** A real fix inside the perimeter. */
  | 'live'
  /** The demo flag is set, so GPS was never asked for. */
  | 'demo'
  | 'denied'
  | 'timeout'
  /** The device has no geolocation, or the browser reported the position as unavailable. */
  | 'unavailable'
  /** A real fix, but not within a hundred miles of these households. */
  | 'out_of_area';

export interface OfficerPosition {
  lat: number;
  lng: number;
  /** Fix radius in metres, 68% confidence. Null when simulated: there is nothing to hedge. */
  accuracy: number | null;
  /** Degrees clockwise from north, or null when standing still or unreported. */
  heading: number | null;
}

/**
 * Forced simulation, for a demo on a stage in a different city. Set
 * `NEXT_PUBLIC_DEMO_GPS=1` in web/.env.local, or add `?demo=1` to the officer URL when
 * there is no time to redeploy.
 */
const DEMO_ENV = process.env.NEXT_PUBLIC_DEMO_GPS === '1';

function demoFlagSet(): boolean {
  if (DEMO_ENV) return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

/** How often the simulated officer takes a step. Roughly a GPS tick. */
const WALK_TICK_MS = 1_000;

/**
 * Who is moving the simulated officer.
 *
 *   auto   — the officer walks the route on their own. The default, and the only option on
 *            a phone, where there is no keyboard.
 *   manual — the arrow keys or WASD drive them. The first key press takes control, so a
 *            presenter can walk to the house they want to talk about instead of waiting.
 */
export type SimControl = 'auto' | 'manual';

/**
 * Driving speed, metres per second. A real officer walks at 1.25 m/s, which is honest and
 * useless on stage: the households here sit a median 41 m apart, so a door would be half a
 * minute of holding an arrow key. This is demo pace, not a claim about walking.
 */
const DRIVE_SPEED_MPS = 7;

/** Shift covers ground between blocks. */
const DRIVE_SPRINT = 3;

/** React state updates per second while driving. The frame loop itself runs at rAF rate. */
const DRIVE_EMIT_MS = 50;

const KEY_VECTORS: Record<string, [north: number, east: number]> = {
  arrowup: [1, 0], w: [1, 0],
  arrowdown: [-1, 0], s: [-1, 0],
  arrowleft: [0, -1], a: [0, -1],
  arrowright: [0, 1], d: [0, 1],
};

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  // Long enough for a cold fix outdoors, short enough that a dead GPS does not hold the
  // screen hostage: on timeout the walk takes over and the officer still has a map.
  timeout: 10_000,
  maximumAge: 2_000,
};

export function useOfficerPosition(households: readonly Located[]): {
  position: OfficerPosition | null;
  mode: PositionMode;
  gps: GpsState;
  /** The route the simulated officer is walking, for the map to draw. Empty unless auto. */
  route: LatLng[];
  /** Who is driving the simulated officer, and a way to hand control back and forth. */
  control: SimControl;
  setControl: (next: SimControl) => void;
} {
  const [fix, setFix] = useState<OfficerPosition | null>(null);
  const [gps, setGps] = useState<GpsState>(() => (demoFlagSet() ? 'demo' : 'locating'));

  useEffect(() => {
    if (demoFlagSet()) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGps('unavailable');
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (p) => {
        const here: LatLng = [p.coords.latitude, p.coords.longitude];
        if (!pointInPolygon(here, PERIMETER)) {
          // A real, working fix — just not here. Nothing to retry, so stop reporting it as
          // a failure and let the walk drive the map.
          setFix(null);
          setGps('out_of_area');
          return;
        }
        setFix({
          lat: here[0],
          lng: here[1],
          accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
          // `heading` is null when stationary and on most desktops.
          heading: p.coords.heading != null && Number.isFinite(p.coords.heading) ? p.coords.heading : null,
        });
        setGps('live');
      },
      (err) => {
        setFix(null);
        setGps(
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable',
        );
      },
      GEO_OPTIONS,
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const mode: PositionMode = gps === 'live' && fix ? 'gps' : 'simulated';

  // The route is built once per household set, not per render. `households` is a fresh
  // array on every status change, and rebuilding the walk from it would restart the officer
  // mid-block every time a door is marked.
  const householdsRef = useRef(households);
  householdsRef.current = households;
  const route = useMemo(() => {
    if (mode === 'gps' || households.length === 0) return [];
    const all = householdsRef.current;
    return demoRoute(all, anchorFor(all));
    // Keyed on the count, not the array: household coordinates never change, only statuses.
  }, [mode, households.length]);

  const [control, setControl] = useState<SimControl>('auto');
  const [walked, setWalked] = useState(0);
  // How far along the route the walk had got, so pausing for the keyboard does not lose it.
  const walkedRef = useRef(0);
  walkedRef.current = walked;
  const walking = mode === 'simulated' && route.length > 1;
  // The walk's clock keeps its own time so a re-render does not reset the officer's progress.
  const startRef = useRef<number | null>(null);

  // The automatic walk. Paused, not reset, while the keyboard has control, so handing
  // control back picks up from the same point on the route rather than teleporting.
  useEffect(() => {
    if (!walking || control !== 'auto') return;
    startRef.current = Date.now() - (walkedRef.current / DEMO_WALK_SPEED_MPS) * 1000;
    const step = () => {
      const start = startRef.current;
      if (start != null) setWalked(((Date.now() - start) / 1000) * DEMO_WALK_SPEED_MPS);
    };
    step();
    const timer = setInterval(step, WALK_TICK_MS);
    return () => clearInterval(timer);
  }, [walking, control]);

  const auto = useMemo(() => {
    if (!walking) return null;
    const p = pointAlong(route, walked);
    return p ? { lat: p.lat, lng: p.lng, accuracy: null, heading: p.heading } : null;
  }, [walking, route, walked]);

  // --- Keyboard driving ---

  const [driven, setDriven] = useState<OfficerPosition | null>(null);
  // The frame loop reads these rather than closing over state, so it never restarts.
  const drivenRef = useRef<OfficerPosition | null>(null);
  drivenRef.current = driven;
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const keys = useRef(new Set<string>());

  useEffect(() => {
    if (mode !== 'simulated') return;

    // Captured once: the Set identity never changes, and the lint rule cannot know that.
    const held = keys.current;

    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    const down = (e: KeyboardEvent) => {
      // Never steal a key from the note field, and never from a browser shortcut.
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      // Shift only ever modifies a movement key, so it never takes control on its own.
      if (key === 'shift') {
        held.add('shift');
        return;
      }
      if (!(key in KEY_VECTORS)) return;
      // Arrow keys would otherwise scroll the bottom sheet under the officer's thumb.
      e.preventDefault();
      held.add(key);
      // The first press takes the wheel, starting wherever the walk had got to.
      setControl((c) => {
        if (c === 'manual') return c;
        const from = drivenRef.current ?? autoRef.current;
        if (from) setDriven({ ...from });
        return 'manual';
      });
    };
    const up = (e: KeyboardEvent) => held.delete(e.key.toLowerCase());
    // A tab-away leaves keys stuck down otherwise, and the officer walks off on their own.
    const clear = () => held.clear();

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      held.clear();
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'simulated' || control !== 'manual') return;

    let frame = 0;
    let last = performance.now();
    let emitted = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1); // A backgrounded tab must not lurch.
      last = now;

      let north = 0;
      let east = 0;
      for (const key of keys.current) {
        const v = KEY_VECTORS[key];
        if (!v) continue;
        north += v[0];
        east += v[1];
      }
      if (north === 0 && east === 0) return;

      // Diagonals move at the same speed as the cardinals, not 1.41x.
      const length = Math.hypot(north, east);
      const speed = DRIVE_SPEED_MPS * (keys.current.has('shift') ? DRIVE_SPRINT : 1) * dt;
      const from = drivenRef.current;
      if (!from) return;
      const next = offsetMetres([from.lat, from.lng], (north / length) * speed, (east / length) * speed);

      // The data stops at the perimeter, so the officer does too. Walking out of it would
      // leave an empty map and no way to tell that is why.
      if (!pointInPolygon(next, PERIMETER)) return;

      const moved: OfficerPosition = {
        lat: next[0],
        lng: next[1],
        accuracy: null,
        heading: bearing([from.lat, from.lng], next),
      };
      drivenRef.current = moved;
      if (now - emitted >= DRIVE_EMIT_MS) {
        emitted = now;
        setDriven(moved);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, control]);

  const simulated = control === 'manual' ? driven : auto;

  /** Hand driving to the keyboard or back to the route, from the current position. */
  const handControl = useCallback((next: SimControl) => {
    setControl((current) => {
      if (current === next) return current;
      if (next === 'manual') {
        const from = drivenRef.current ?? autoRef.current;
        if (from) setDriven({ ...from });
      }
      return next;
    });
  }, []);

  return {
    position: mode === 'gps' ? fix : simulated,
    mode,
    gps,
    // Under manual control the dotted route is noise: the officer is not following it.
    route: mode === 'gps' || control === 'manual' ? [] : route,
    control,
    setControl: handControl,
  };
}

/**
 * Where the simulated walk begins: the household docs/DEMO_SCRIPT.md taps in beat 2, so the
 * demo opens on the house the script is about. If the board has not loaded that address, any
 * real household is better than a guessed coordinate.
 */
function anchorFor(households: readonly Located[]): LatLng {
  const named = households.find(
    (h) => (h as { address?: string }).address === DEMO_ANCHOR_ADDRESS,
  );
  const pick = named ?? households[0];
  return [pick.lat, pick.lng];
}

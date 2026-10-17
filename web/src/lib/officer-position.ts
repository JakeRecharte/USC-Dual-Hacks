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

import { useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_ANCHOR_ADDRESS, DEMO_WALK_SPEED_MPS, demoRoute, pointAlong } from './demo-walk';
import type { LatLng, Located } from './geo';
import { pointInPolygon } from './geo';
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
  /** The route the simulated officer is walking, for the map to draw. Empty under real GPS. */
  route: LatLng[];
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

  const [walked, setWalked] = useState(0);
  const walking = mode === 'simulated' && route.length > 1;
  // The walk's clock keeps its own time so a re-render does not reset the officer's progress.
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!walking) {
      startRef.current = null;
      return;
    }
    startRef.current ??= Date.now();
    const step = () => {
      const start = startRef.current;
      if (start != null) setWalked(((Date.now() - start) / 1000) * DEMO_WALK_SPEED_MPS);
    };
    step();
    const timer = setInterval(step, WALK_TICK_MS);
    return () => clearInterval(timer);
  }, [walking]);

  const simulated = useMemo(() => {
    if (!walking) return null;
    const p = pointAlong(route, walked);
    return p ? { lat: p.lat, lng: p.lng, accuracy: null, heading: p.heading } : null;
  }, [walking, route, walked]);

  return {
    position: mode === 'gps' ? fix : simulated,
    mode,
    gps,
    route: mode === 'gps' ? [] : route,
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

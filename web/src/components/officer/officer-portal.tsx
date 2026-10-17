'use client';

// The officer's screen: a map of where they are standing, with every tracked household on
// it. No zone picker and no list — an officer on a street does not want to find their block
// in a dropdown, they want the houses in front of them to be tappable.
//
// Everything a tap does still goes through the offline queue, so the colour changes under
// the officer's thumb whether or not there is a bar of signal, and `recorded_at` stays the
// moment they tapped.

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState } from 'react';
import { NEARBY_RADIUS_FT, NEARBY_RADIUS_M, distanceMetres, within } from '@/lib/geo';
import { useOfficerPosition, type GpsState, type SimControl } from '@/lib/officer-position';
import { useOfflineQueue } from '@/lib/offline-queue';
import { STATUS_COLOR, relativeMinutes, ageMinutes, urgencyOf } from '@/lib/priority';
import { useAddresses, useNow } from '@/lib/use-live';
import { STATUS_LABEL, STRUCTURE_LABEL } from '@/lib/types';
import type { AddressState, Status, Structure } from '@/lib/types';
import { ConnectionDot, SignOutButton, StatusChip } from '@/components/ui';

// MapLibre touches `window` at import time, so the map only ever loads in the browser —
// the same arrangement the dispatcher's board uses. Here it also keeps the header and the
// offline banner painting before a quarter of a megabyte of map arrives over LTE.
const OfficerMap = dynamic(() => import('./officer-map').then((m) => m.OfficerMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted">
      Loading map…
    </div>
  ),
});

/**
 * The three buttons an officer presses at a door, mapped onto the contracted statuses in
 * docs/DATA_CONTRACT.md. The labels come from STATUS_LABEL rather than being written again
 * here, so the officer's button, the dispatcher's board and the voice agent all say the same
 * word about the same household.
 */
const DOOR_BUTTONS: { status: Status; help: string; tone: string }[] = [
  { status: 'cleared', help: 'House is empty', tone: 'border-clear/60 bg-clear/20 text-clear active:bg-clear/35' },
  { status: 'in_transit', help: 'Leaving now', tone: 'border-high/60 bg-high/20 text-high active:bg-high/35' },
  { status: 'refused', help: 'Staying put', tone: 'border-critical/60 bg-critical/20 text-critical active:bg-critical/35' },
];

const STRUCTURE_BUTTONS: Structure[] = ['intact', 'damaged', 'destroyed'];

export function OfficerPortal() {
  const { addresses, connection, patchLocal, setAddresses } = useAddresses();
  const now = useNow(10_000);

  const applyRows = useCallback(
    (rows: AddressState[]) => setAddresses((prev) => prev.map((a) => rows.find((r) => r.id === a.id) ?? a)),
    [setAddresses],
  );
  const { pending, online, enqueue } = useOfflineQueue(applyRows);

  const { position, mode, gps, route, control, setControl } = useOfficerPosition(addresses);

  const [follow, setFollow] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const recenterRef = useRef<(() => void) | null>(null);
  const onRecenterReady = useCallback((fn: () => void) => {
    recenterRef.current = fn;
  }, []);

  /**
   * How many doors the officer is standing at. A count and a ring on the map — it decides
   * nothing about what gets drawn. Every tracked household is on the map at all times:
   * hiding a house because the officer took two steps away from it made the map flicker
   * and made houses unclickable for no good reason.
   */
  const inRangeCount = useMemo(
    () => (position ? within(addresses, [position.lat, position.lng], NEARBY_RADIUS_M).length : 0),
    [addresses, position],
  );

  const selected = useMemo(
    () => (selectedId ? (addresses.find((a) => a.id === selectedId) ?? null) : null),
    [addresses, selectedId],
  );

  /** How far the officer is from the house the sheet is about, for the "N ft away" line. */
  const metresToSelected = useMemo(
    () => (position && selected ? distanceMetres([position.lat, position.lng], [selected.lat, selected.lng]) : null),
    [position, selected],
  );

  function record(
    address: AddressState,
    change: { status?: Status; structure?: Structure; note?: string | null },
  ) {
    const item = enqueue({ address_id: address.id, ...change });
    // Paint now. The tap is already durable in localStorage, online or not.
    patchLocal({
      ...address,
      ...(change.status
        ? { status: change.status, source: 'officer', recorded_at: item.recorded_at, note: change.note ?? null }
        : {}),
      ...(change.structure
        ? { structure: change.structure, structure_recorded_at: item.recorded_at }
        : {}),
    });
  }

  const recenter = () => {
    setFollow(true);
    recenterRef.current?.();
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      <div className="absolute inset-0">
        <OfficerMap
          households={addresses}
          position={position}
          route={route}
          follow={follow}
          selectedId={selectedId}
          // Driving emits 20 positions a second; easing each one would lag a frame behind
          // the key. GPS and the auto walk arrive once a second and ease smoothly.
          continuous={mode === 'simulated' && control === 'manual'}
          onSelect={setSelectedId}
          onBreakFollow={() => setFollow(false)}
          onRecenterReady={onRecenterReady}
        />
      </div>

      {/* Header floats over the map: on a phone the map is the screen. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3">
        <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-2xl border border-line bg-bg px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="h-5 w-1 shrink-0 rounded-full bg-critical" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight tracking-tight">
                Door knocks
              </h1>
              <p className="truncate text-xs text-muted">
                {position
                  ? `${inRangeCount} within ${NEARBY_RADIUS_FT} ft`
                  : 'Finding your position…'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {pending.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-watch/50 bg-watch/15 px-2.5 py-1 text-xs font-semibold text-watch">
                {pending.length} to send
              </span>
            ) : (
              <ConnectionDot state={online ? connection : 'offline'} label={online ? undefined : 'No signal'} />
            )}
            <SignOutButton />
          </div>
        </div>

        <PositionNotice
          gps={gps}
          simulated={mode === 'simulated'}
          online={online}
          control={control}
          onControl={setControl}
        />
      </header>

      {/* Recenter sits above the sheet and clear of the thumb's resting place. */}
      {!follow && position && (
        <button
          type="button"
          onClick={recenter}
          className={`absolute right-3 z-20 flex items-center gap-2 rounded-full border border-info/60 bg-bg px-4 py-3 text-sm font-semibold text-info shadow-lg active:bg-info/20 ${
            selected ? 'bottom-[22rem]' : 'bottom-7'
          }`}
        >
          <span aria-hidden>◎</span>
          Recenter
        </button>
      )}

      {!position && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="rounded-xl border border-line bg-bg px-4 py-3 text-sm text-muted">
            {addresses.length === 0 ? 'Loading the household list…' : 'Waiting for a position…'}
          </p>
        </div>
      )}

      {selected && (
        <DoorSheet
          address={selected}
          metres={metresToSelected}
          now={now}
          onRecord={record}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

const SIMULATED_REASON: Record<GpsState, string | null> = {
  live: null,
  locating: 'Finding your GPS. Showing a simulated walk until it arrives.',
  demo: 'Demo mode — simulated officer walking a block in Pacific Palisades.',
  out_of_area:
    'You are outside the fire perimeter, so the map is showing a simulated walk through the households.',
  denied: 'Location permission is off. Showing a simulated walk — taps still record normally.',
  timeout: 'No GPS fix yet. Showing a simulated walk until one arrives.',
  unavailable: 'This device reports no location. Showing a simulated walk.',
};

/**
 * Why the dot is where it is. Always on screen when the position is not a real fix: an
 * officer must never be able to mistake a simulated walk for their own GPS, and a demo
 * audience should be told rather than fooled.
 */
function PositionNotice({
  gps,
  simulated,
  online,
  control,
  onControl,
}: {
  gps: GpsState;
  simulated: boolean;
  online: boolean;
  control: SimControl;
  onControl: (next: SimControl) => void;
}) {
  // One line per reason the dot is not a real fix. `live` never reaches here, and
  // `locating` does: the walk starts straight away so the officer has a usable map, which
  // means it has to be labelled straight away too.
  const notice = simulated ? SIMULATED_REASON[gps] : null;

  return (
    <div className="mt-2 space-y-2">
      {notice && (
        <div className="pointer-events-auto rounded-xl border border-info/40 bg-bg px-3 py-2">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-info">
            <span className="mt-px shrink-0 rounded bg-info/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Simulated
            </span>
            <span className="text-muted">{notice}</span>
          </p>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
            <p className="text-[11px] leading-tight text-muted">
              {control === 'manual' ? (
                <>
                  <Keys>W A S D</Keys> or <Keys>arrows</Keys> to move, <Keys>shift</Keys> to
                  go faster.
                </>
              ) : (
                <>
                  Walking the block on its own. Press <Keys>W A S D</Keys> or an{' '}
                  <Keys>arrow</Keys> to take over.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => onControl(control === 'manual' ? 'auto' : 'manual')}
              className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-muted active:bg-panel-2"
            >
              {control === 'manual' ? 'Auto walk' : 'Drive'}
            </button>
          </div>
        </div>
      )}
      {!online && (
        <p className="pointer-events-auto rounded-xl border border-watch/40 bg-bg px-3 py-2 text-xs leading-relaxed text-watch">
          No signal. Keep working — every tap is saved with the time you made it and sent
          automatically when you are back in range.
        </p>
      )}
    </div>
  );
}

/**
 * The bottom sheet. Three full-width buttons an officer can hit without looking, and
 * everything else behind one more tap:
 *
 *   * `no_answer` stays, as a secondary full-width button rather than a fourth equal one.
 *     It is the most common outcome at a door and it is a contracted status the dispatcher
 *     board and the voice agent both read, so dropping it would mean an officer who knocked
 *     and got nothing records nothing at all.
 *   * the structure buttons move in here behind "Damage and notes". They are a dispatcher-
 *     only fact, they never move a household in the evacuation queue, and they are not what
 *     the officer is doing at the door.
 */
function DoorSheet({
  address,
  metres,
  now,
  onRecord,
  onClose,
}: {
  address: AddressState;
  metres: number | null;
  now: number;
  onRecord: (
    a: AddressState,
    change: { status?: Status; structure?: Structure; note?: string | null },
  ) => void;
  onClose: () => void;
}) {
  const [extra, setExtra] = useState(false);
  const [note, setNote] = useState(address.note ?? '');
  const age = ageMinutes(address.recorded_at, now);

  return (
    <section
      aria-label={`Record a status for ${address.address}`}
      className="absolute inset-x-0 bottom-0 z-30 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-bg pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="px-4 pt-3">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight">{address.address}</h2>
            <p className="mt-0.5 truncate text-sm text-muted">
              {address.resident_name}
              {metres != null && ` · ${Math.round(metres * 3.28084)} ft away`}
            </p>
          </div>
          <span
            aria-hidden
            className="mt-1 h-4 w-4 shrink-0 rounded"
            style={{ background: STATUS_COLOR[address.status] }}
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <StatusChip status={address.status} urgency={urgencyOf(address, now)} size="md" />
          <span className="text-xs text-muted">
            {address.recorded_at
              ? `${address.source === 'resident_reply' ? 'Resident replied' : 'Recorded'} ${relativeMinutes(Math.round(age))}`
              : 'No contact recorded'}
          </span>
        </div>

        {address.note && (
          <p className="mt-2.5 rounded-lg border-l-2 border-critical/60 bg-panel-2 px-3 py-2 text-sm leading-relaxed">
            {address.note}
          </p>
        )}

        <div className="mt-3.5 space-y-2.5">
          {DOOR_BUTTONS.map((b) => (
            <button
              key={b.status}
              type="button"
              onClick={() => onRecord(address, { status: b.status, note: note.trim() || null })}
              aria-current={address.status === b.status}
              className={`flex w-full items-baseline justify-between gap-3 rounded-2xl border px-5 py-5 text-left text-lg font-semibold transition-colors ${b.tone} ${
                address.status === b.status ? 'ring-2 ring-inset ring-current' : ''
              }`}
            >
              {STATUS_LABEL[b.status]}
              <span className="text-xs font-medium uppercase tracking-wider opacity-70">{b.help}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => onRecord(address, { status: 'no_answer', note: note.trim() || null })}
            aria-current={address.status === 'no_answer'}
            className={`w-full rounded-2xl border border-line bg-panel py-4 text-base font-semibold text-muted transition-colors active:bg-panel-2 ${
              address.status === 'no_answer' ? 'ring-2 ring-inset ring-watch text-watch' : ''
            }`}
          >
            {STATUS_LABEL.no_answer}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setExtra((v) => !v)}
          aria-expanded={extra}
          className="mt-3 flex w-full items-center justify-center gap-1.5 py-3 text-sm font-medium text-muted"
        >
          {extra ? 'Hide' : 'Damage and notes'}
          <span aria-hidden className={extra ? 'rotate-180' : ''}>
            ▾
          </span>
        </button>

        {extra && (
          <div className="space-y-4 border-t border-line pt-3.5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Is the house still standing?
              </p>
              <div className="grid grid-cols-3 gap-2">
                {STRUCTURE_BUTTONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onRecord(address, { structure: s })}
                    aria-current={address.structure === s}
                    className={`rounded-xl border py-3.5 text-sm font-medium transition-colors ${
                      address.structure === s
                        ? 'border-info/70 bg-info/15 text-text'
                        : 'border-line bg-panel-2 text-muted active:bg-line'
                    }`}
                  >
                    {STRUCTURE_LABEL[s]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Dispatch only. Residents calling in are never told this over the phone.
              </p>
            </div>

            <div>
              <label
                htmlFor={`note-${address.id}`}
                className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted"
              >
                Note for dispatch
              </label>
              <textarea
                id={`note-${address.id}`}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={280}
                placeholder="2 adults staying, 1 on oxygen"
                className="w-full resize-none rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-base outline-none placeholder:text-muted/60 focus:border-info"
              />
              <p className="mt-1.5 text-xs text-muted">Sent with the next status you tap.</p>
            </div>
          </div>
        )}

        {/* Full-width, so closing the sheet needs no aim. Tapping the map also closes it. */}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-2xl border border-line bg-panel py-4 text-base font-semibold text-muted active:bg-panel-2"
        >
          Close
        </button>
      </div>
    </section>
  );
}

/** A keycap, so the hint reads as keys rather than prose. */
function Keys({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-panel-2 px-1 py-0.5 font-mono text-[10px] font-semibold text-text">
      {children}
    </kbd>
  );
}

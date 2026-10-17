'use client';

import { useCallback, useMemo, useState } from 'react';
import { ZONE_NAMES } from '@/lib/addresses';
import { URGENCY_RANK, relativeMinutes, ageMinutes, sortByUrgency, urgencyOf } from '@/lib/priority';
import { useOfflineQueue } from '@/lib/offline-queue';
import { useAddresses, useNow } from '@/lib/use-live';
import type { AddressState, Status, Structure } from '@/lib/types';
import { ConnectionDot, SignOutButton, StatusChip, StructureChip } from '@/components/ui';

/** The three buttons an officer presses at a door, in the order the plan specifies. */
const STATUS_BUTTONS: { status: Status; label: string; tone: string }[] = [
  { status: 'cleared', label: 'Cleared', tone: 'border-clear/60 bg-clear/15 text-clear active:bg-clear/30' },
  { status: 'refused', label: 'Refused', tone: 'border-critical/60 bg-critical/15 text-critical active:bg-critical/30' },
  { status: 'no_answer', label: 'No answer', tone: 'border-watch/60 bg-watch/15 text-watch active:bg-watch/30' },
];

const STRUCTURE_BUTTONS: { structure: Structure; label: string }[] = [
  { structure: 'intact', label: 'Standing' },
  { structure: 'damaged', label: 'Damaged' },
  { structure: 'destroyed', label: 'Destroyed' },
];

export function OfficerPortal() {
  const { addresses, connection, patchLocal, setAddresses } = useAddresses();
  const now = useNow(10_000);

  const applyRows = useCallback(
    (rows: AddressState[]) => setAddresses((prev) => prev.map((a) => rows.find((r) => r.id === a.id) ?? a)),
    [setAddresses],
  );
  const { pending, online, enqueue } = useOfflineQueue(applyRows);

  const [zone, setZone] = useState<string | null>(null);
  const [onlyUnresolved, setOnlyUnresolved] = useState(true);

  const zones = useMemo(() => {
    const ids = [...new Set(addresses.map((a) => a.zone_id))];
    return ids.sort((a, b) => a.localeCompare(b));
  }, [addresses]);

  // Default to whichever assigned zone has the most doors left, so the app opens on work.
  const activeZone = useMemo(() => {
    if (zone && zones.includes(zone)) return zone;
    const busiest = [...zones].sort(
      (a, b) => unresolvedIn(addresses, b, now) - unresolvedIn(addresses, a, now),
    )[0];
    return busiest ?? null;
  }, [zone, zones, addresses, now]);

  const inZone = useMemo(
    () => addresses.filter((a) => a.zone_id === activeZone),
    [addresses, activeZone],
  );

  const visible = useMemo(() => {
    const list = onlyUnresolved
      ? inZone.filter((a) => URGENCY_RANK[urgencyOf(a, now)] <= URGENCY_RANK.watch)
      : inZone;
    return [...list].sort(sortByUrgency(now));
  }, [inZone, onlyUnresolved, now]);

  const remaining = unresolvedIn(addresses, activeZone, now);

  function record(address: AddressState, change: { status?: Status; structure?: Structure; note?: string | null }) {
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

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-5 w-1 rounded-full bg-critical" />
            <h1 className="text-base font-semibold tracking-tight">Door knocks</h1>
          </div>
          <div className="flex items-center gap-2.5">
            {pending.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-watch/50 bg-watch/15 px-2.5 py-0.5 text-xs font-semibold text-watch">
                {pending.length} to send
              </span>
            ) : (
              <ConnectionDot state={online ? connection : 'offline'} label={online ? undefined : 'No signal'} />
            )}
            <SignOutButton />
          </div>
        </div>

        <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-3">
          {zones.map((z) => {
            const left = unresolvedIn(addresses, z, now);
            const selected = z === activeZone;
            return (
              <button
                key={z}
                type="button"
                onClick={() => setZone(z)}
                aria-pressed={selected}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  selected ? 'border-info/70 bg-info/15 text-text' : 'border-line bg-panel text-muted'
                }`}
              >
                {z}
                <span className={`ml-1.5 text-xs ${left > 0 ? 'text-watch' : 'text-muted'}`}>{left}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {activeZone ? (ZONE_NAMES[activeZone] ?? activeZone) : 'No zone assigned'}
          </p>
          <p className="text-xs text-muted">
            {remaining === 0
              ? `All ${inZone.length} addresses resolved`
              : `${remaining} of ${inZone.length} still need a knock`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOnlyUnresolved((v) => !v)}
          className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition-colors active:bg-panel-2"
        >
          {onlyUnresolved ? 'Show all' : 'Needs a knock'}
        </button>
      </div>

      <main className="flex-1 space-y-3 px-4 py-4">
        {!online && (
          <p className="rounded-xl border border-watch/40 bg-watch/10 px-3.5 py-2.5 text-xs leading-relaxed text-watch">
            No signal. Keep working — every tap is saved with the time you made it and sent
            automatically when you are back in range.
          </p>
        )}

        {visible.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel px-4 py-10 text-center text-sm text-muted">
            {addresses.length === 0 ? 'Loading your list…' : 'Nothing left in this zone.'}
          </p>
        ) : (
          visible.map((a) => <AddressCard key={a.id} address={a} now={now} onRecord={record} />)
        )}
      </main>
    </div>
  );
}

function AddressCard({
  address,
  now,
  onRecord,
}: {
  address: AddressState;
  now: number;
  onRecord: (a: AddressState, change: { status?: Status; structure?: Structure; note?: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(address.note ?? '');
  const urgency = urgencyOf(address, now);
  const age = ageMinutes(address.recorded_at, now);

  return (
    <article className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{address.address}</h2>
          <p className="mt-0.5 truncate text-sm text-muted">{address.resident_name}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusChip status={address.status} urgency={urgency} />
          <StructureChip structure={address.structure} />
        </div>
      </div>

      <p className="mt-2 text-xs text-muted">
        {address.recorded_at
          ? `${address.source === 'resident_reply' ? 'Resident replied' : 'Recorded'} ${relativeMinutes(Math.round(age))}`
          : 'No contact recorded'}
      </p>

      {address.note && (
        <p className="mt-2.5 rounded-lg border-l-2 border-critical/60 bg-panel-2 px-3 py-2 text-sm leading-relaxed">
          {address.note}
        </p>
      )}

      <div className="mt-3.5 grid grid-cols-3 gap-2">
        {STATUS_BUTTONS.map((b) => (
          <button
            key={b.status}
            type="button"
            onClick={() => onRecord(address, { status: b.status, note: note.trim() || null })}
            aria-current={address.status === b.status}
            className={`rounded-xl border py-3.5 text-sm font-semibold transition-colors ${b.tone} ${
              address.status === b.status ? 'ring-2 ring-inset ring-current' : ''
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 flex w-full items-center justify-center gap-1.5 py-1 text-xs font-medium text-muted"
      >
        {open ? 'Hide' : 'Structure and notes'}
        <span aria-hidden className={open ? 'rotate-180' : ''}>
          ▾
        </span>
      </button>

      {open && (
        <div className="mt-1 space-y-3.5 border-t border-line pt-3.5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Is the house still standing?
            </p>
            <div className="grid grid-cols-3 gap-2">
              {STRUCTURE_BUTTONS.map((b) => (
                <button
                  key={b.structure}
                  type="button"
                  onClick={() => onRecord(address, { structure: b.structure })}
                  aria-current={address.structure === b.structure}
                  className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                    address.structure === b.structure
                      ? 'border-info/70 bg-info/15 text-text'
                      : 'border-line bg-panel-2 text-muted active:bg-line'
                  }`}
                >
                  {b.label}
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
              className="w-full resize-none rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-sm outline-none placeholder:text-muted/60 focus:border-info"
            />
            <p className="mt-1.5 text-xs text-muted">Sent with the next status you tap.</p>
          </div>
        </div>
      )}
    </article>
  );
}

const unresolvedIn = (addresses: AddressState[], zone: string | null, now: number): number =>
  addresses.filter(
    (a) => a.zone_id === zone && URGENCY_RANK[urgencyOf(a, now)] <= URGENCY_RANK.watch,
  ).length;

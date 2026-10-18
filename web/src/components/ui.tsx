'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { URGENCY_COLOR, type Urgency } from '@/lib/priority';
import { STATUS_LABEL, STRUCTURE_LABEL } from '@/lib/types';
import type { Status, Structure } from '@/lib/types';
import type { Connection } from '@/lib/use-live';

/** The status an officer or a resident reply recorded, with its urgency colour. */
export function StatusChip({
  status,
  urgency,
  size = 'sm',
}: {
  status: Status;
  urgency: Urgency;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold ${
        size === 'md' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'
      }`}
      style={{
        color: URGENCY_COLOR[urgency],
        borderColor: `${URGENCY_COLOR[urgency]}66`,
        background: `${URGENCY_COLOR[urgency]}1a`,
      }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Structure damage. Deliberately styled differently from StatusChip: it is a different kind
 * of fact, it never drives the evacuation queue, and the voice agent never reads it out.
 */
export function StructureChip({ structure }: { structure: Structure }) {
  if (structure === 'unassessed') return null;
  const tone =
    structure === 'destroyed'
      ? 'border-critical/50 bg-critical/15 text-critical'
      : structure === 'damaged'
        ? 'border-watch/50 bg-watch/15 text-watch'
        : 'border-line bg-panel-2 text-muted';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${tone}`}>
      {structure === 'destroyed' && <span aria-hidden>⚠</span>}
      {STRUCTURE_LABEL[structure]}
    </span>
  );
}

const CONNECTION_TONE: Record<Connection, { color: string; label: string }> = {
  live: { color: 'var(--clear)', label: 'Live' },
  connecting: { color: 'var(--watch)', label: 'Connecting' },
  offline: { color: 'var(--critical)', label: 'Offline' },
};

export function ConnectionDot({ state, label }: { state: Connection; label?: string }) {
  const tone = CONNECTION_TONE[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${state === 'live' ? 'animate-pulse' : ''}`}
        style={{ background: tone.color }}
      />
      {label ?? tone.label}
    </span>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/session', { method: 'DELETE' });
        router.replace('/');
      }}
      className="border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-text hover:text-text disabled:opacity-50"
    >
      Sign out
    </button>
  );
}

/** Puts the fake data back between demo runs. */
export function ResetButton({ onReset }: { onReset?: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch('/api/reset', { method: 'POST' });
          onReset?.();
        } finally {
          setBusy(false);
        }
      }}
      className="border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-text hover:text-text disabled:opacity-50"
    >
      {busy ? 'Resetting…' : 'Reset demo data'}
    </button>
  );
}

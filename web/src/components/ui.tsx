'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Urgency } from '@/lib/priority';
import { STATUS_LABEL, STRUCTURE_LABEL } from '@/lib/types';
import type { Status, Structure } from '@/lib/types';
import type { Connection } from '@/lib/use-live';

/** CSS colour per urgency, from the surrounding theme rather than the map's paper palette. */
export const URGENCY_VAR: Record<Urgency, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  watch: 'var(--watch)',
  clear: 'var(--clear)',
};

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
      className={`chip shrink-0 ${size === 'md' ? '!px-2.5 !py-1 !text-[13px]' : ''}`}
      style={{ '--tone': URGENCY_VAR[urgency] } as React.CSSProperties}
    >
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
  const tone = structure === 'destroyed' ? 'var(--critical)' : structure === 'damaged' ? 'var(--high)' : 'var(--muted)';
  return (
    <span className="chip shrink-0 uppercase" style={{ '--tone': tone } as React.CSSProperties}>
      {structure === 'destroyed' && <span aria-hidden>⚠</span>}
      {STRUCTURE_LABEL[structure]}
    </span>
  );
}

/** The Line mark: a locator ring around a house dot. */
export function Mark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--clear)" />
      <path d="M12 5.5 6 10.5V18h4v-4h4v4h4v-7.5L12 5.5Z" fill="var(--bg)" />
    </svg>
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
      className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-panel-2 hover:text-text disabled:opacity-50"
    >
      Sign out
    </button>
  );
}

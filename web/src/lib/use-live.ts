'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ROUTING_RANK } from './types';
import type { AddressState, CallRow, Routing } from './types';

/** A ticking clock, so "40 min ago" ages on screen without a refresh. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export type Connection = 'connecting' | 'live' | 'offline';

/**
 * Status for every address, pushed from /api/events. The snapshot arrives on connect and on
 * every reconnect, so a dropped stream heals itself without a reload.
 */
export function useAddresses() {
  const [addresses, setAddresses] = useState<AddressState[]>([]);
  const [connection, setConnection] = useState<Connection>('connecting');

  useEffect(() => {
    const source = new EventSource('/api/events');

    source.addEventListener('snapshot', (e) => {
      const { addresses: rows } = JSON.parse((e as MessageEvent).data) as { addresses: AddressState[] };
      setAddresses(rows);
      setConnection('live');
    });

    source.addEventListener('status', (e) => {
      const { address } = JSON.parse((e as MessageEvent).data) as { address: AddressState };
      setAddresses((prev) => {
        const next = prev.map((a) => (a.id === address.id ? address : a));
        return next.some((a) => a.id === address.id) ? next : [...next, address];
      });
      setConnection('live');
    });

    source.onopen = () => setConnection('live');
    // EventSource retries on its own; this only reflects the gap in the UI.
    source.onerror = () => setConnection((c) => (c === 'live' ? 'offline' : c));

    return () => source.close();
  }, []);

  /** Optimistic write, so an officer's tap paints before the round trip finishes. */
  const patchLocal = useCallback((row: AddressState) => {
    setAddresses((prev) => prev.map((a) => (a.id === row.id ? row : a)));
  }, []);

  return { addresses, connection, patchLocal, setAddresses };
}

const TELEPHONY = process.env.NEXT_PUBLIC_TELEPHONY_URL?.replace(/\/$/, '') ?? '';

export const telephonyConfigured = Boolean(TELEPHONY);

/**
 * The live call queue from the telephony server's SSE feed (docs/DATA_CONTRACT.md §5).
 *
 * A call appears the moment the agent looks an address up, before it has been routed, so the
 * dispatcher sees "call in progress" rather than nothing. `call_logged` then fills in the
 * routing, and `bypass` jumps it straight to human_now.
 */
export function useCalls() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [connection, setConnection] = useState<Connection>(TELEPHONY ? 'connecting' : 'offline');
  const upsert = useUpsertCall(setCalls);

  useEffect(() => {
    if (!TELEPHONY) return;
    const source = new EventSource(`${TELEPHONY}/events`);

    source.addEventListener('snapshot', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { calls?: CallRow[] };
      if (data.calls?.length) setCalls(data.calls.map(normalise));
      setConnection('live');
    });

    source.addEventListener('lookup', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as Record<string, unknown>;
      upsert({
        id: String(d.call_id ?? ''),
        call_id: String(d.call_id ?? ''),
        mode: 'wildfire',
        address: String(d.address ?? ''),
        subject_name: String(d.subject_name ?? ''),
        address_id: (d.address_id as string) ?? null,
        // Not routed yet: park it above answered calls but below anything already escalated.
        routing: 'priority_queue',
        severity: 0,
        reason: 'call in progress — looking the address up',
        created_at: new Date().toISOString(),
      });
    });

    source.addEventListener('call_logged', (e) => {
      const row = JSON.parse((e as MessageEvent).data) as CallRow;
      upsert(normalise(row));
    });

    source.addEventListener('bypass', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as Record<string, unknown>;
      upsert({
        id: String(d.call_id ?? ''),
        call_id: String(d.call_id ?? ''),
        mode: 'wildfire',
        address: '',
        subject_name: '',
        address_id: null,
        routing: 'human_now',
        severity: 5,
        reason: `life-safety language: ${String(d.reason ?? 'unspecified')}`,
        created_at: new Date().toISOString(),
        from_number: (d.from_number as string) ?? null,
        bypass: true,
      });
    });

    source.onopen = () => setConnection('live');
    source.onerror = () => setConnection((c) => (c === 'live' ? 'offline' : c));

    return () => source.close();
  }, [upsert]);

  return { calls, connection, upsert, clear: () => setCalls([]) };
}

/**
 * Merge a call into the queue by call_id. Severity and routing may only move a call UP, per
 * the contract: "Severity can only move a call up the queue, never down."
 */
function useUpsertCall(setCalls: React.Dispatch<React.SetStateAction<CallRow[]>>) {
  const ref = useRef(setCalls);
  ref.current = setCalls;

  return useCallback((row: CallRow) => {
    ref.current((prev) => {
      const key = row.call_id || row.id;
      const existing = prev.find((c) => (c.call_id || c.id) === key);
      if (!existing) return [...prev, row];

      const merged: CallRow = {
        ...existing,
        ...row,
        address: row.address || existing.address,
        subject_name: row.subject_name || existing.subject_name,
        bypass: existing.bypass || row.bypass,
        severity: Math.max(existing.severity, row.severity),
        routing: moreUrgent(existing.routing, row.routing),
        reason: row.reason || existing.reason,
        created_at: existing.created_at,
      };
      return prev.map((c) => ((c.call_id || c.id) === key ? merged : c));
    });
  }, []);
}

const moreUrgent = (a: Routing, b: Routing): Routing => (ROUTING_RANK[b] < ROUTING_RANK[a] ? b : a);

const normalise = (row: CallRow): CallRow => ({
  ...row,
  id: row.id || row.call_id || crypto.randomUUID(),
  severity: Number(row.severity) || 0,
  created_at: row.created_at || new Date().toISOString(),
});

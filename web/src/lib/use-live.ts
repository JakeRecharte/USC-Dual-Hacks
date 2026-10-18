'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { browserClient } from './supabase';
import { fetchBoard, patchFromHouse } from './supabase-data';
import { callFromDb, mergeCall, worseState } from './calls';
import type { AddressState, CallRow, CallerState } from './types';

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

export interface BoardSession {
  mode: 'supabase' | 'memory';
  url?: string;
  anonKey?: string;
  token?: string;
  gated?: boolean;
}

/**
 * Status for every address, live.
 *
 * Two transports, chosen by what is configured (see lib/supabase.ts):
 *
 *   supabase — the browser reads Postgres and subscribes to Realtime directly, using a token
 *              minted for the signed-in role. Nothing live goes through our own server, so
 *              this works on Vercel where consecutive requests hit different instances.
 *
 *   memory   — our own SSE feed off the in-process store. One server only, but no database.
 *
 * Either way the shape handed to the portals is identical.
 */
export function useAddresses() {
  const [addresses, setAddresses] = useState<AddressState[]>([]);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [session, setSession] = useState<BoardSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Which transport to use is a server question, so ask before connecting to anything.
  useEffect(() => {
    let live = true;
    fetch('/api/db-token')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`db-token ${r.status}`))))
      .then((data: BoardSession) => {
        if (live) setSession(data);
      })
      .catch(() => {
        // Fall back to the SSE feed rather than showing an empty board.
        if (live) setSession({ mode: 'memory' });
      });
    return () => {
      live = false;
    };
  }, []);

  // --- Supabase transport ---
  useEffect(() => {
    if (session?.mode !== 'supabase' || !session.token) return;

    let client: SupabaseClient | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      client = browserClient(session.token);
    } catch {
      setConnection('offline');
      setError('Could not reach the database.');
      return;
    }

    const load = async () => {
      try {
        const rows = await fetchBoard(client!);
        if (cancelled) return;
        setAddresses(rows);
        setConnection('live');
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setConnection('offline');
        setError(e instanceof Error ? e.message : 'Could not read the board.');
      }
    };

    void load();

    // Any change refetches the board. Two small queries over ~30 rows, which is cheaper than
    // merging partial row payloads correctly and cannot drift from what the database holds.
    // The full read is the safety net now, not the fast path: wait for a quiet moment so a
    // burst of changes (a demo reset touches every house) reads the board once.
    const refetch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 2000);
    };

    // A houses row carries the colour and the newest status: apply it to that one house
    // straight away. Re-reading the whole board took seconds per change at 8,000 houses,
    // which is the lag between a caller's report and the map.
    const patchHouse = (row: Record<string, unknown>) => {
      const id = row.id as string | undefined;
      if (!id) return;
      setAddresses((prev) => prev.map((a) => (a.id !== id ? a : patchFromHouse(a, row))));
    };

    const channel = client
      .channel('line-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'status_log' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'addresses' }, refetch)
      // Retell calls recolour houses (house_colors.sql): paint the one house now, and let the
      // full read catch anything else.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'houses' }, (p) => patchHouse(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'houses' }, (p) => patchHouse(p.new))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnection('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnection('offline');
      });

    // The telephony server announces a house the moment a call changes it (a 'house' event on
    // the stream the call queue already reads). The database feed above can lag or drop an
    // update; this one is the fast path.
    const telephony = process.env.NEXT_PUBLIC_TELEPHONY_URL?.replace(/\/$/, '');
    const stream = telephony ? new EventSource(`${telephony}/events`) : null;
    stream?.addEventListener('house', (e) => {
      try {
        patchHouse(JSON.parse((e as MessageEvent).data) as Record<string, unknown>);
      } catch {
        /* a malformed event is ignored; the next full read corrects the board */
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stream?.close();
      void client?.removeChannel(channel);
    };
  }, [session]);

  // --- SSE transport ---
  useEffect(() => {
    if (session?.mode !== 'memory') return;
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
  }, [session]);

  /** Optimistic write, so an officer's tap paints before the round trip finishes. */
  const patchLocal = useCallback((row: AddressState) => {
    setAddresses((prev) => prev.map((a) => (a.id === row.id ? row : a)));
  }, []);

  return {
    addresses,
    connection,
    patchLocal,
    setAddresses,
    mode: session?.mode ?? null,
    /** False when reads are not behind the passcode gate: no SUPABASE_JWT_SECRET. */
    gated: session?.mode === 'supabase' ? session.gated !== false : true,
    error,
  };
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
/** How far back the queue reads public.calls: a shift. */
const CALL_WINDOW_MS = 12 * 60 * 60 * 1000;
const CALL_COLUMNS = 'id, call_id, mode, address, subject_name, address_id, routing, severity, reason, created_at, from_number, bypass, caller_state, distress_score, ended_at';

export function useCalls() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [connection, setConnection] = useState<Connection>(TELEPHONY ? 'connecting' : 'offline');
  const upsert = useUpsertCall(setCalls);

  // Supabase: the durable queue. The telephony server's feed below lives in its memory, so a
  // redeploy or a demo reset emptied the queue on screen; public.calls keeps every call, and
  // Realtime brings each insert and update as the server writes it.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void fetch('/api/db-token')
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { mode: string; token?: string } | null) => {
        if (cancelled || s?.mode !== 'supabase' || !s.token) return;
        const client = browserClient(s.token);
        const load = async () => {
          const since = new Date(Date.now() - CALL_WINDOW_MS).toISOString();
          const { data, error } = await client.from('calls').select(CALL_COLUMNS)
            .gte('created_at', since).order('created_at', { ascending: false }).limit(200);
          if (cancelled || error) return;
          setCalls((data ?? []).map((r) => callFromDb(r as Record<string, unknown>)));
          setConnection('live');
        };
        void load();
        const channel = client
          .channel('line-calls')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, (p) => upsert(callFromDb(p.new)))
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' }, (p) => upsert(callFromDb(p.new)))
          // A delete is a demo reset: read the queue again rather than guess which row went.
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'calls' }, () => void load())
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') setConnection('live');
          });
        cleanup = () => void client.removeChannel(channel);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [upsert]);

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
        provisional: true,
        created_at: new Date().toISOString(),
      });
    });

    source.addEventListener('call_logged', (e) => {
      const row = JSON.parse((e as MessageEvent).data) as CallRow;
      upsert(normalise(row));
    });

    // Two shapes, both live: `reason` when the agent asks for a human itself, `kind` plus a
    // `reasons` array when the server spots it in the transcript. Handle either.
    source.addEventListener('bypass', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as Record<string, unknown>;
      const reasons = Array.isArray(d.reasons) ? (d.reasons as string[]) : [];
      const detail = reasons.length > 0 ? reasons.join('; ') : String(d.reason ?? 'unspecified');
      const kind = d.kind === 'distress' ? 'caller distress' : 'life-safety language';
      upsert({
        id: String(d.call_id ?? ''),
        call_id: String(d.call_id ?? ''),
        mode: 'wildfire',
        address: '',
        subject_name: '',
        address_id: null,
        routing: 'human_now',
        severity: 5,
        reason: `${kind}: ${detail}`,
        created_at: new Date().toISOString(),
        from_number: (d.from_number as string) ?? null,
        bypass: true,
      });
    });

    // The emotion gauge. Arrives on its own, often before the call is routed, so it only
    // ever patches an existing row rather than creating a bare one.
    source.addEventListener('emotion', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as Record<string, unknown>;
      const id = String(d.call_id ?? '');
      if (!id) return;
      setCalls((prev) =>
        prev.map((c) =>
          (c.call_id || c.id) === id
            ? {
                ...c,
                caller_state: worseState(c.caller_state, d.caller_state as CallerState | null),
                distress_score: Math.max(c.distress_score ?? 0, Number(d.distress_score) || 0),
              }
            : c,
        ),
      );
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

      return prev.map((c) => ((c.call_id || c.id) === key ? mergeCall(existing, row) : c));
    });
  }, []);
}






const normalise = (row: CallRow): CallRow => ({
  ...row,
  id: row.id || row.call_id || crypto.randomUUID(),
  severity: Number(row.severity) || 0,
  created_at: row.created_at || new Date().toISOString(),
});

'use client';

// Officers knock on doors inside a fire perimeter, where signal is the first thing to go.
// Every tap is written to localStorage with the time it happened, then flushed when the
// network comes back. The officer sees the status change immediately either way, so the job
// never waits on a bar of LTE.
//
// `recorded_at` travels with the tap, not the request, so a status that was recorded at
// 10:02 and sent at 10:40 still reads 10:02 on the board. That matters: the board's whole
// promise is that the time it shows is the time the record was made.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AddressState, Status, Structure } from './types';

const KEY = 'line.pending-updates.v1';

export interface QueuedUpdate {
  queue_id: string;
  address_id: string;
  status?: Status;
  structure?: Structure;
  note?: string | null;
  recorded_at: string;
}

function read(): QueuedUpdate[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Private windows and cleared site data both land here; an empty queue is correct.
    return [];
  }
}

function write(items: QueuedUpdate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* Out of quota or blocked: the in-memory queue still works for this session. */
  }
}

export function useOfflineQueue(onApplied: (rows: AddressState[]) => void) {
  const [pending, setPending] = useState<QueuedUpdate[]>([]);
  const [online, setOnline] = useState(true);
  const flushing = useRef(false);
  const applied = useRef(onApplied);
  applied.current = onApplied;

  // localStorage is only read after mount: on the server there is no queue to read.
  useEffect(() => {
    setPending(read());
    setOnline(navigator.onLine);
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    const batch = read();
    if (batch.length === 0) return;

    flushing.current = true;
    try {
      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // queue_id is ours; the API takes only contract fields.
        body: JSON.stringify(
          batch.map((u) => ({
            address_id: u.address_id,
            status: u.status,
            structure: u.structure,
            note: u.note,
            recorded_at: u.recorded_at,
          })),
        ),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);

      const { applied: rows } = (await res.json()) as { applied: AddressState[] };
      // Only the items we just sent are cleared; a tap made during the request survives.
      const sent = new Set(batch.map((b) => b.queue_id));
      const left = read().filter((u) => !sent.has(u.queue_id));
      write(left);
      setPending(left);
      setOnline(true);
      if (rows?.length) applied.current(rows);
    } catch {
      setOnline(false);
    } finally {
      flushing.current = false;
    }
  }, []);

  const enqueue = useCallback(
    (update: Omit<QueuedUpdate, 'queue_id' | 'recorded_at'>) => {
      const item: QueuedUpdate = {
        ...update,
        queue_id: crypto.randomUUID(),
        recorded_at: new Date().toISOString(),
      };
      const next = [...read(), item];
      write(next);
      setPending(next);
      void flush();
      return item;
    },
    [flush],
  );

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void flush();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // A retry timer as well as the event: iOS Safari fires `online` unreliably.
    const retry = setInterval(() => void flush(), 10_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(retry);
    };
  }, [flush]);

  return { pending, online, enqueue, flush };
}

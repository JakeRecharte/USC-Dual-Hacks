'use client';
// "Retell registered 1515 Via de la Paz as RED." A Retell call either linked a house for the
// first time or changed its colour; Supabase writes a house_events row (house_colors.sql) and
// this shows it. Read with the board's minted token, live over Realtime. Opens empty: only
// events that arrive while the board is open become toasts.
import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase';
import { HOUSE_COLOR } from '@/lib/priority';
import { headline, type HouseEvent } from '@/lib/house-events';

const SHOW_MS = 15000;
const MAX = 5;

export function RetellAlerts() {
  const [events, setEvents] = useState<HouseEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    fetch('/api/db-token')
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { mode: string; token?: string } | null) => {
        if (cancelled || s?.mode !== 'supabase' || !s.token) return;
        const client = browserClient(s.token);
        const channel = client
          .channel('retell-alerts')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'house_events' }, (payload) => {
            const e = payload.new as HouseEvent;
            setEvents((prev) => [e, ...prev.filter((p) => p.id !== e.id)].slice(0, MAX));
            setTimeout(() => setEvents((prev) => prev.filter((p) => p.id !== e.id)), SHOW_MS);
          })
          .subscribe();
        cleanup = () => void client.removeChannel(channel);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  if (!events.length) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {events.map((e) => (
        <div key={e.id} role="status" className="pointer-events-auto rounded-xl border border-line bg-panel px-3.5 py-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: HOUSE_COLOR[e.color] }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{headline(e)}</p>
              {e.reason && <p className="mt-0.5 text-xs text-muted">{e.reason}</p>}
            </div>
            <button type="button" className="text-xs text-muted" aria-label="Dismiss"
              onClick={() => setEvents((prev) => prev.filter((p) => p.id !== e.id))}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

import { NextResponse } from 'next/server';
import { allAddresses, bus } from '@/lib/server-store';
import { dataMode } from '@/lib/supabase';
import type { AddressState } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * A stream this long cannot live in a serverless function: the platform kills it at the
 * duration limit and reports a failed invocation. So it closes itself first and lets
 * EventSource reconnect, which is a normal, silent round trip.
 */
const MAX_STREAM_MS = 50_000;

/**
 * Status changes, pushed. The dispatcher board opens one of these and never polls, so an
 * officer's tap shows up on the map in well under a second.
 */
export async function GET(req: Request) {
  // In Supabase mode the board subscribes to Realtime directly and must not use this feed.
  // Saying so plainly beats a stream that silently carries one instance's private state.
  if (dataMode === 'supabase') {
    return NextResponse.json(
      { error: 'Supabase mode: subscribe to Realtime instead of this feed.' },
      { status: 409 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false;
        }
      };

      send('snapshot', { addresses: allAddresses(), now: Date.now() });

      const onStatus = (row: AddressState) => send('status', { address: row, now: Date.now() });
      const onReset = (rows: AddressState[]) => send('snapshot', { addresses: rows, now: Date.now() });
      bus.on('status', onStatus);
      bus.on('reset', onReset);

      // Proxies drop idle streams; a comment line keeps it alive.
      const ping = setInterval(() => {
        if (open) {
          try {
            controller.enqueue(encoder.encode(': ping\n\n'));
          } catch {
            open = false;
          }
        }
      }, 15_000);

      const close = () => {
        if (!open) return;
        open = false;
        clearInterval(ping);
        clearTimeout(lifetime);
        bus.off('status', onStatus);
        bus.off('reset', onReset);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const lifetime = setTimeout(close, MAX_STREAM_MS);
      // `signal` is absent in some runtimes; without it the lifetime timer still cleans up.
      req.signal?.addEventListener?.('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}

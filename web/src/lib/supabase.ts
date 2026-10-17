// Supabase wiring. The app runs in one of two modes and says which in the UI:
//
//   "supabase"  NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
//               Officer taps are written to Postgres through a route handler holding the
//               service-role key; the dispatcher's browser subscribes to Supabase Realtime
//               directly. Nothing live passes through our own server, which is what makes
//               this work on Vercel, where each request can land on a different instance.
//
//   "memory"    Nothing configured. The in-process store and our own SSE feed are used.
//               One long-running server only, so this is for local demos, but it needs no
//               database at all and is the safe fallback if Supabase is not ready.
//
// Reads are gated: see supabase-token.ts for why the anon key alone is not enough.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True when the browser has enough configuration to talk to Supabase at all. */
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export type DataMode = 'supabase' | 'memory';

export const dataMode: DataMode = supabaseConfigured ? 'supabase' : 'memory';

/**
 * Browser client. `accessToken` is the short-lived token minted for the signed-in role; it
 * is what RLS checks, so without it the policies return nothing.
 */
export function browserClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

/**
 * Server client with the service-role key. Bypasses RLS, so it is only ever created inside a
 * route handler that has already checked the role cookie, and the key is never exported to
 * the browser (no NEXT_PUBLIC_ prefix).
 */
export function serviceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  // A URL pasted without its scheme is the usual configuration mistake, and createClient
  // throws on it. Returning null turns that into a readable error instead of a 500.
  if (!/^https?:\/\//.test(SUPABASE_URL)) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Why the Supabase configuration is unusable, or null when it is fine. */
export function configProblem(): string | null {
  if (!supabaseConfigured) return null;
  if (!/^https?:\/\//.test(SUPABASE_URL)) {
    return 'NEXT_PUBLIC_SUPABASE_URL must start with https:// — paste the full Project URL.';
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return 'SUPABASE_SERVICE_ROLE_KEY is not set, so officer taps cannot be written.';
  }
  return null;
}

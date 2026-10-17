import { NextResponse } from 'next/server';
import { roleFromRequest } from '@/lib/auth';
import { SUPABASE_ANON_KEY, SUPABASE_URL, dataMode } from '@/lib/supabase';
import { mintSupabaseToken } from '@/lib/supabase-token';

export const dynamic = 'force-dynamic';

/**
 * Hands the signed-in portal a short-lived Supabase token, so the browser can read the board
 * and subscribe to Realtime directly. No shift code, no token, no data.
 */
export async function GET(req: Request) {
  const role = await roleFromRequest(req);
  if (!role) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  if (dataMode === 'memory') {
    return NextResponse.json({ mode: 'memory' as const });
  }

  const { token, expiresAt, gated } = await mintSupabaseToken(role);
  return NextResponse.json(
    { mode: 'supabase' as const, url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, token, expiresAt, gated },
    // Never cached: it is a credential, and a shared cache would hand it to the next viewer.
    { headers: { 'cache-control': 'no-store, private' } },
  );
}

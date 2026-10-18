import { NextResponse } from 'next/server';
import { SUPABASE_URL, dataMode, serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Diagnostics for a deployment that will not start. Reports which variables are present and
 * whether the database actually answers, never any value — booleans and lengths only, so it
 * is safe to open on a deployed URL while sign-in itself is broken.
 *
 * `/api/health?probe=1` also runs a real query against Supabase with the service-role key,
 * which is the fastest way to tell a misconfigured key from a missing table.
 */
export async function GET(req: Request) {
  const present = (name: string) => {
    const v = process.env[name];
    return v ? { set: true, length: v.length } : { set: false };
  };

  let supabaseUrlParses: boolean | null = null;
  let supabaseHost: string | null = null;
  if (SUPABASE_URL) {
    try {
      supabaseHost = new URL(SUPABASE_URL).host;
      supabaseUrlParses = true;
    } catch {
      // A URL without a scheme is the usual mistake and makes createClient throw.
      supabaseUrlParses = false;
    }
  }

  const body: Record<string, unknown> = {
    ok: true,
    mode: dataMode,
    runtime: { node: process.version, vercel: process.env.VERCEL === '1', region: process.env.VERCEL_REGION ?? null },
    env: {
      NEXT_PUBLIC_SUPABASE_URL: present('NEXT_PUBLIC_SUPABASE_URL'),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: present('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: present('SUPABASE_SERVICE_ROLE_KEY'),
      SUPABASE_JWT_SECRET: present('SUPABASE_JWT_SECRET'),
      AUTH_SECRET: present('AUTH_SECRET'),
      OFFICER_PASSCODE: present('OFFICER_PASSCODE'),
      DISPATCH_PASSCODE: present('DISPATCH_PASSCODE'),
      NEXT_PUBLIC_TELEPHONY_URL: present('NEXT_PUBLIC_TELEPHONY_URL'),
    },
    supabase: { urlParses: supabaseUrlParses, host: supabaseHost },
  };

  if (new URL(req.url).searchParams.get('probe')) {
    body.probe = await probeDatabase();
  }

  return NextResponse.json(body, { headers: { 'cache-control': 'no-store' } });
}

async function probeDatabase(): Promise<Record<string, unknown>> {
  if (dataMode !== 'supabase') return { skipped: 'not in supabase mode' };
  let client;
  try {
    client = serviceClient();
  } catch (e) {
    return { ok: false, stage: 'createClient', error: message(e) };
  }
  if (!client) return { ok: false, stage: 'createClient', error: 'SUPABASE_SERVICE_ROLE_KEY not set' };

  const out: Record<string, unknown> = {};
  const addresses = await client.from('addresses').select('id', { count: 'exact', head: true });
  out.addresses = addresses.error
    ? { ok: false, error: addresses.error.message, code: addresses.error.code }
    : { ok: true, rows: addresses.count };

  const statuses = await client.from('status_log').select('id', { count: 'exact', head: true });
  out.status_log = statuses.error
    ? { ok: false, error: statuses.error.message, code: statuses.error.code }
    : { ok: true, rows: statuses.count };

  // The column the officer page needs for "is the house still standing".
  const structure = await client.from('addresses').select('structure').limit(1);
  out.structure_column = structure.error
    ? { ok: false, error: structure.error.message }
    : { ok: true };

  // The per-house colour Retell and the officers both drive (docs/sql/house_colors.sql). Missing
  // before that SQL runs, and the board then silently keeps its own status colours.
  const colors = await client.from('houses').select('id, color', { count: 'exact', head: true });
  out.houses_color = colors.error
    ? { ok: false, error: colors.error.message, fix: 'run docs/sql/houses.sql then docs/sql/house_colors.sql' }
    : { ok: true, rows: colors.count };

  const events = await client.from('house_events').select('id', { count: 'exact', head: true });
  out.house_events = events.error
    ? { ok: false, error: events.error.message, fix: 'run docs/sql/house_colors.sql' }
    : { ok: true, rows: events.count };

  // Rows the phone line has written. Zero after a real call means the telephony server is
  // pointed at a different Supabase project than this one.
  const calls = await client.from('calls').select('id', { count: 'exact', head: true });
  out.calls = calls.error
    ? { ok: false, error: calls.error.message }
    : { ok: true, rows: calls.count };

  return out;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

import { NextResponse } from 'next/server';
import { resetStore } from '@/lib/server-store';

/** Puts the fake data back, so the demo can be run again without restarting the server. */
export async function POST() {
  return NextResponse.json({ addresses: resetStore(), now: Date.now() });
}

import { NextResponse } from 'next/server';
import { allAddresses } from '@/lib/server-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ addresses: allAddresses(), now: Date.now() });
}

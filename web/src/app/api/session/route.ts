import { NextResponse } from 'next/server';
import { HOME_FOR, ROLE_COOKIE, checkPasscode, isRole, signRole } from '@/lib/auth';

export async function POST(req: Request) {
  const { role, passcode } = (await req.json().catch(() => ({}))) as {
    role?: unknown;
    passcode?: unknown;
  };

  if (!isRole(role)) return NextResponse.json({ error: 'pick a portal' }, { status: 400 });
  if (!checkPasscode(role, String(passcode ?? ''))) {
    return NextResponse.json({ error: 'That code does not match.' }, { status: 401 });
  }

  const res = NextResponse.json({ role, redirect: HOME_FOR[role] });
  res.cookies.set(ROLE_COOKIE, await signRole(role), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 12, // one shift
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ROLE_COOKIE);
  return res;
}

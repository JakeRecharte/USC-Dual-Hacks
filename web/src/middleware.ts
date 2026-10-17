// Route guard. /officer and /dispatch are unreachable without a valid signed role cookie,
// and each role can only reach its own portal.
import { NextResponse, type NextRequest } from 'next/server';
import { HOME_FOR, ROLE_COOKIE, roleFromCookie } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const role = await roleFromCookie(req.cookies.get(ROLE_COOKIE)?.value);
  const { pathname, search } = req.nextUrl;

  if (!role) {
    const signIn = new URL('/', req.url);
    signIn.searchParams.set('next', pathname + search);
    const res = NextResponse.redirect(signIn);
    // Clear a cookie that failed to verify so the next attempt starts clean.
    if (req.cookies.has(ROLE_COOKIE)) res.cookies.delete(ROLE_COOKIE);
    return res;
  }

  const home = HOME_FOR[role];
  if (!pathname.startsWith(home)) return NextResponse.redirect(new URL(home, req.url));

  return NextResponse.next();
}

export const config = { matcher: ['/officer/:path*', '/dispatch/:path*'] };

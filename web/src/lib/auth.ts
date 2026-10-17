// Passcode sign-in: one shared code per role, as agencies actually hand out shift codes.
//
// The role cookie is HMAC-signed so it can't be forged by typing a cookie into devtools.
// This is not user-level identity and does not pretend to be: a real deployment swaps this
// for the agency's SSO. What it does give the demo is a real server-side route guard.
//
// Web Crypto only, so the same code runs in middleware (edge) and in route handlers (node).

export type Role = 'officer' | 'dispatch';

export const ROLE_COOKIE = 'line_role';
export const ROLES: Role[] = ['officer', 'dispatch'];

export const HOME_FOR: Record<Role, string> = {
  officer: '/officer',
  dispatch: '/dispatch',
};

/** Dev defaults so a fresh clone runs with no .env. Override both in deployment. */
const PASSCODES: Record<Role, string> = {
  officer: process.env.OFFICER_PASSCODE || '1420',
  dispatch: process.env.DISPATCH_PASSCODE || '5150',
};

const SECRET = process.env.AUTH_SECRET || 'line-dev-secret-not-for-deployment';

export const isRole = (v: unknown): v is Role => ROLES.includes(v as Role);

/** Constant-time compare, so a wrong code leaks nothing through timing. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkPasscode(role: Role, passcode: string): boolean {
  const expected = PASSCODES[role];
  return Boolean(expected) && sameString(expected, (passcode || '').trim());
}

const base64url = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function signRole(role: Role): Promise<string> {
  return `${role}.${await hmac(role)}`;
}

export async function roleFromCookie(value: string | undefined): Promise<Role | null> {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const role = value.slice(0, dot);
  if (!isRole(role)) return null;
  return sameString(value.slice(dot + 1), await hmac(role)) ? role : null;
}

/** The signed-in role for a route handler, or null. */
export async function roleFromRequest(req: Request): Promise<Role | null> {
  const raw = req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ROLE_COOKIE}=`))
    ?.slice(ROLE_COOKIE.length + 1);
  return roleFromCookie(raw);
}

// Short-lived Supabase access tokens, minted only after the passcode gate.
//
// Why this exists: the board reads resident names and whether each household evacuated.
// That is precisely the list this project promises not to hand out — see the responsible-use
// note on the Devpost page. The anon key ships inside the browser bundle, so if RLS trusted
// `anon`, publishing the site would publish the list.
//
// Instead RLS grants nothing to `anon`. A viewer who has passed the passcode gate gets a
// signed token carrying `role: authenticated` plus a `line_role` claim, and the policies key
// off that. Without a shift code there is no token, and without a token there is no data.
//
// HS256 by hand on Web Crypto, the same approach as the role cookie, so this runs in a route
// handler without pulling in a JWT dependency.

import type { Role } from './auth';

const SECRET = process.env.SUPABASE_JWT_SECRET ?? '';

/** Matches the role cookie's lifetime: one shift. */
const TTL_SECONDS = 60 * 60 * 12;

export const tokenMintingAvailable = Boolean(SECRET);

const base64url = (input: ArrayBuffer | string): string => {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export interface MintedToken {
  token: string;
  expiresAt: number;
  /** False when no JWT secret is configured and the anon key is being used bare. */
  gated: boolean;
}

/**
 * Mint a token for a signed-in role. Returns `gated: false` with the anon key when
 * SUPABASE_JWT_SECRET is missing, so the app still works against a permissively configured
 * project — but the board surfaces that state rather than hiding it.
 */
export async function mintSupabaseToken(role: Role): Promise<MintedToken> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TTL_SECONDS;

  if (!SECRET) {
    return {
      token: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      expiresAt: expiresAt * 1000,
      gated: false,
    };
  }

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      // Supabase reads `role` for auth.role(); `line_role` is ours, for per-portal policies.
      role: 'authenticated',
      line_role: role,
      aud: 'authenticated',
      sub: `line-${role}`,
      iat: issuedAt,
      exp: expiresAt,
    }),
  );

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );

  return {
    token: `${header}.${payload}.${base64url(signature)}`,
    expiresAt: expiresAt * 1000,
    gated: true,
  };
}

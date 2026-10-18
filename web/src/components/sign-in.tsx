'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Role } from '@/lib/auth';

const PORTALS: { role: Role; title: string; blurb: string }[] = [
  {
    role: 'officer',
    title: 'Field officer',
    blurb: 'Your assigned addresses, one tap per door.',
  },
  {
    role: 'dispatch',
    title: 'Dispatch',
    blurb: 'The map, incoming calls and the door-knock list.',
  },
];

export function SignIn({ next, showHints }: { next?: string; showHints: boolean }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>('officer');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role, passcode }),
      });
      const data = (await res.json()) as { redirect?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Sign-in failed.');
        setPasscode('');
        return;
      }
      // `next` is only honoured when it points back into this app.
      const target = next?.startsWith('/') && !next.startsWith('//') ? next : data.redirect!;
      router.replace(target);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="paper-console min-h-dvh">
      <main className="mx-auto grid min-h-dvh w-full max-w-5xl content-center gap-10 px-5 py-10 md:grid-cols-[1.1fr_1fr] md:gap-16">
        <header className="self-center">
          <p className="eyebrow-dark">LA Community Line</p>
          <h1 className="display mt-3 text-5xl leading-[1.02] md:text-6xl">
            Was the house checked?
          </h1>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted">
            Families call the line to ask about a home inside the fire perimeter. Officers mark
            each door they knock; dispatch sees every answer and every call in one place.
          </p>
          <p className="figure mt-6 border-t border-line pt-3 text-xs text-muted">
            Active incident · Palisades Fire
          </p>
        </header>

        <form onSubmit={submit} className="border border-line bg-panel p-6 sm:p-7">
          <h2 className="text-lg font-semibold">Start your shift</h2>

          <fieldset className="mt-5">
            <legend className="mb-2 text-[13px] font-semibold">I&apos;m working as</legend>
            <div className="divide-y divide-line border border-line">
              {PORTALS.map((p) => {
                const selected = role === p.role;
                return (
                  <label
                    key={p.role}
                    className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors ${
                      selected ? 'bg-panel-2 shadow-[inset_3px_0_0_var(--text)]' : 'hover:bg-panel-2'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={p.role}
                      checked={selected}
                      onChange={() => {
                        setRole(p.role);
                        setError(null);
                      }}
                      className="h-4 w-4 shrink-0 accent-[var(--text)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{p.title}</span>
                      <span className="block text-xs text-muted">{p.blurb}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5">
            <label htmlFor="passcode" className="mb-2 block text-[13px] font-semibold">
              Shift code
            </label>
            <input
              id="passcode"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                setError(null);
              }}
              placeholder="from your supervisor"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'passcode-error' : undefined}
              className="figure w-full border border-line bg-bg/40 px-4 py-3 text-xl tracking-[0.3em] text-text outline-none placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-muted focus:border-text"
            />
            {error && (
              <p id="passcode-error" role="alert" className="mt-2 text-sm text-critical">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={busy || passcode.length === 0}
            className="mt-6 w-full bg-text px-4 py-3.5 text-[15px] font-semibold text-panel transition-opacity hover:opacity-90 disabled:opacity-35"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          {showHints && (
            <p className="figure mt-5 border-t border-dashed border-line pt-3 text-xs leading-relaxed text-muted">
              dev codes: officer <span className="text-text">1420</span> · dispatch{' '}
              <span className="text-text">5150</span>
              <br />
              set OFFICER_PASSCODE / DISPATCH_PASSCODE to change
            </p>
          )}
        </form>
      </main>
    </div>
  );
}

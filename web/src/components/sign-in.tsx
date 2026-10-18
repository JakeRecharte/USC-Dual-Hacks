'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Role } from '@/lib/auth';
import { Mark } from '@/components/ui';

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
    <div className="ops-console flex min-h-dvh items-center justify-center p-4 sm:p-8">
      <main className="grid w-full max-w-4xl overflow-hidden rounded-xl border border-line bg-panel md:grid-cols-[1fr_1.05fr]">
        <header className="flex flex-col justify-between gap-10 border-b border-line p-7 md:border-b-0 md:border-r">
          <div className="flex items-center gap-2.5">
            <Mark />
            <span className="text-[17px] font-semibold tracking-tight">Line</span>
          </div>
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Was the house checked?</h1>
            <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-muted">
              Families call the line about a home inside the fire perimeter. Officers mark each door
              they knock, and dispatch sees every answer and every call on one map.
            </p>
          </div>
          <dl className="grid gap-1.5 rounded-lg bg-panel-2 px-4 py-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Incident:</dt>
              <dd>Palisades Fire</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Status:</dt>
              <dd className="flex items-center gap-1.5 text-clear">
                <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-clear" />
                Active
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Line:</dt>
              <dd className="figure">(213) 752-2494</dd>
            </div>
          </dl>
        </header>

        <form onSubmit={submit} className="p-7">
          <h2 className="text-[15px] font-semibold">Start your shift</h2>
          <p className="mt-1 text-xs text-muted">Pick your role and enter the code for this shift.</p>

          <fieldset className="mt-6 grid gap-2">
            <legend className="mb-2 text-xs text-muted">Role</legend>
            {PORTALS.map((p) => {
              const selected = role === p.role;
              return (
                <label
                  key={p.role}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    selected ? 'border-clear/60 bg-clear/10' : 'border-line hover:bg-panel-2'
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
                    className="h-4 w-4 shrink-0 accent-[var(--clear)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{p.title}</span>
                    <span className="block text-[11px] text-muted">{p.blurb}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="mt-5">
            <label htmlFor="passcode" className="mb-2 block text-xs text-muted">
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
              className="w-full rounded-lg border border-line bg-panel-2 px-4 py-3 text-lg tracking-[0.3em] text-text outline-none placeholder:text-[13px] placeholder:tracking-normal placeholder:text-muted focus:border-clear"
            />
            {error && (
              <p id="passcode-error" role="alert" className="mt-2 text-xs text-critical">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={busy || passcode.length === 0}
            className="mt-6 w-full rounded-lg bg-text px-4 py-3 text-[13px] font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            {busy ? 'Signing in…' : 'Sign in →'}
          </button>

          {showHints && (
            <p className="mt-5 border-t border-dashed border-line pt-3 text-[11px] leading-relaxed text-muted">
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

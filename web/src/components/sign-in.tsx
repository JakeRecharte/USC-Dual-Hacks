'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Role } from '@/lib/auth';

const PORTALS: { role: Role; title: string; blurb: string; icon: string }[] = [
  {
    role: 'officer',
    title: 'Field officer',
    blurb: 'Your assigned addresses, one tap per door.',
    icon: 'M12 2 3 6v6c0 5 3.8 9.3 9 10 5.2-.7 9-5 9-10V6l-9-4Z',
  },
  {
    role: 'dispatch',
    title: 'Dispatch',
    blurb: 'Zone priority map and the live call queue.',
    icon: 'M12 3a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h2v-7H5v-1a7 7 0 0 1 14 0v1h-3v7h2a3 3 0 0 0 3-3v-5a9 9 0 0 0-9-9Z',
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-7 w-1.5 rounded-full bg-critical" />
          <h1 className="text-3xl font-semibold tracking-tight">Line</h1>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Evacuation welfare checks. Sign in with the code for your shift.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-5">
        <fieldset className="space-y-2.5">
          <legend className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
            Portal
          </legend>
          {PORTALS.map((p) => {
            const selected = role === p.role;
            return (
              <label
                key={p.role}
                className={`flex cursor-pointer items-center gap-3.5 rounded-xl border p-4 transition-colors ${
                  selected
                    ? 'border-info/70 bg-info/10'
                    : 'border-line bg-panel hover:border-line/80 hover:bg-panel-2'
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
                  className="sr-only"
                />
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className={`h-6 w-6 shrink-0 ${selected ? 'fill-info' : 'fill-muted'}`}
                >
                  <path d={p.icon} />
                </svg>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{p.title}</span>
                  <span className="block text-xs text-muted">{p.blurb}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="passcode" className="block text-xs font-semibold uppercase tracking-wider text-muted">
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
            placeholder="••••"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'passcode-error' : undefined}
            className="w-full rounded-xl border border-line bg-panel px-4 py-3.5 text-center text-2xl tracking-[0.5em] text-text outline-none placeholder:tracking-[0.3em] placeholder:text-muted/50 focus:border-info"
          />
          {error && (
            <p id="passcode-error" role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={busy || passcode.length === 0}
          className="w-full rounded-xl bg-info px-4 py-3.5 text-base font-semibold text-bg transition-opacity disabled:opacity-40"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {showHints && (
        <p className="rounded-lg border border-dashed border-line px-3.5 py-2.5 font-mono text-xs leading-relaxed text-muted">
          dev codes — officer <span className="text-text">1420</span> · dispatch{' '}
          <span className="text-text">5150</span>
          <br />
          set OFFICER_PASSCODE / DISPATCH_PASSCODE to change
        </p>
      )}
    </main>
  );
}

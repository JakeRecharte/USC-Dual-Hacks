'use client';

/**
 * Render failures show something readable here instead of the platform's generic 500. The
 * message is included on purpose: during a demo, "which environment variable is missing" is
 * worth more than a tidy apology.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="h-7 w-1.5 rounded-full bg-critical" />
        <h1 className="text-xl font-semibold tracking-tight">Line could not load</h1>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        Something failed while rendering this page. If this is a fresh deployment, the usual
        cause is a missing environment variable.
      </p>
      <pre className="overflow-x-auto rounded-lg border border-line bg-panel px-3.5 py-3 font-mono text-xs leading-relaxed text-text">
        {error.message || 'No message'}
        {error.digest && `\n\ndigest: ${error.digest}`}
      </pre>
      <p className="text-xs leading-relaxed text-muted">
        Open <code className="font-mono text-text">/api/health?probe=1</code> to see which
        variables are set and whether the database answers.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-xl bg-info px-4 py-3 text-sm font-semibold text-bg"
      >
        Try again
      </button>
    </main>
  );
}

'use client';

/** Catches failures in the root layout itself, which `error.tsx` cannot reach. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          background: '#0b0f14',
          color: '#e8eef5',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          display: 'flex',
          minHeight: '100dvh',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <div style={{ maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Line failed to start</h1>
          <pre
            style={{
              marginTop: '1rem',
              padding: '0.75rem 0.9rem',
              background: '#121820',
              border: '1px solid #243040',
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error.message || 'No message'}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
          <p style={{ fontSize: '0.75rem', color: '#8b9bb0' }}>
            Open /api/health?probe=1 for the configuration and database check.
          </p>
        </div>
      </body>
    </html>
  );
}

'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to console so it's visible during development
    console.error('[UMEED error boundary]', error)
  }, [error])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        fontFamily: 'Arial, sans-serif',
        background: '#f7f6f1',
        color: '#17231d',
        textAlign: 'center',
        gap: '16px',
      }}
    >
      <h1 style={{ fontSize: '28px', margin: 0, color: '#0b3c28' }}>
        Something went wrong
      </h1>
      <p style={{ color: '#68766e', maxWidth: '480px', margin: 0 }}>
        An unexpected error occurred. You can try again or return to the homepage.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={reset}
          style={{
            background: '#135b3a',
            color: '#fff',
            border: 0,
            padding: '12px 20px',
            borderRadius: '7px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            background: 'transparent',
            color: '#135b3a',
            border: '1px solid #a9c1b1',
            padding: '12px 20px',
            borderRadius: '7px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Go to homepage
        </a>
      </div>
    </main>
  )
}

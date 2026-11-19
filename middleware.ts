import { NextResponse, type NextRequest } from 'next/server'

function contentSecurityPolicy(nonce: string): string {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    'https://va.vercel-scripts.com',
  ]
  if (process.env.NODE_ENV !== 'production') scriptSources.push("'unsafe-eval'")
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' https://vitals.vercel-insights.com${process.env.NODE_ENV !== 'production' ? ' ws://127.0.0.1:* ws://localhost:*' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  if (process.env.NODE_ENV === 'production') directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

export function middleware(request: NextRequest) {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16))
  const nonce = btoa(String.fromCharCode(...nonceBytes))
  const policy = contentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', policy)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', policy)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)',
    },
  ],
}

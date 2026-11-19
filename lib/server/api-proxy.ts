import { NextRequest, NextResponse } from 'next/server'
import { proxyResponseBody } from './proxy-response'

const SESSION_COOKIE_NAME = 'umeed_session'
const PRIVATE_COOKIE_NAMES = ['umeed_chat_session', 'umeed_emergency'] as const

function getApiBaseUrl(): URL | null {
  const configuredUrl = process.env.API_INTERNAL_URL
  if (!configuredUrl) return null

  try {
    const url = new URL(configuredUrl)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null
    }
    return url
  } catch {
    return null
  }
}

function forwardedCookieHeader(request: NextRequest, path: string): string | null {
  const allowedNames = new Set<string>([SESSION_COOKIE_NAME])
  if (path === '/api/v1/chat') allowedNames.add(PRIVATE_COOKIE_NAMES[0])
  if (path.startsWith('/api/v1/emergency')) allowedNames.add(PRIVATE_COOKIE_NAMES[1])

  const forwardedCookies = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((cookie) => cookie.trim())
    .map((cookie) => {
      const separatorIndex = cookie.indexOf('=')
      if (separatorIndex <= 0) return null
      return {
        name: cookie.slice(0, separatorIndex),
        value: cookie.slice(separatorIndex + 1),
      }
    })
    .filter(
      (cookie): cookie is { name: string; value: string } =>
        !!cookie && allowedNames.has(cookie.name),
    )
    .map(({ name, value }) => `${name}=${value}`)

  const cookieNames = forwardedCookies.map((cookie) => cookie.slice(0, cookie.indexOf('=')))
  return new Set(cookieNames).size === cookieNames.length && forwardedCookies.length > 0
    ? forwardedCookies.join('; ')
    : null
}

export async function proxyApiRequest(
  request: NextRequest,
  path: string,
): Promise<NextResponse> {
  const baseUrl = getApiBaseUrl()
  if (!baseUrl) {
    return NextResponse.json(
      { error: 'API service is not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (!/^\/api\/v1\/[a-zA-Z0-9/_-]+$/.test(path)) {
    return NextResponse.json(
      { error: 'Invalid API route' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const target = new URL(path, baseUrl)
  target.search = request.nextUrl.search
  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  const origin = request.headers.get('origin')
  const cookie = forwardedCookieHeader(request, path)
  const csrfToken = request.headers.get('x-csrf-token')

  if (contentType) headers.set('content-type', contentType)
  if (origin) headers.set('origin', origin)
  if (cookie) headers.set('cookie', cookie)
  if (csrfToken) headers.set('x-csrf-token', csrfToken)

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
      redirect: 'manual',
    })
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' })
    const responseType = upstream.headers.get('content-type')
    const setCookie = upstream.headers.get('set-cookie')
    if (responseType) responseHeaders.set('content-type', responseType)
    if (setCookie) responseHeaders.append('set-cookie', setCookie)
    const body = proxyResponseBody(upstream.status, await upstream.arrayBuffer())

    return new NextResponse(body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error(
      'API proxy failed',
      error instanceof Error ? error.name : 'UnknownError',
    )
    return NextResponse.json(
      { error: 'API service is unavailable' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

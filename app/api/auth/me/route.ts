import { NextRequest } from 'next/server'
import { proxyAuthRequest } from '@/lib/server/auth-api-proxy'

export function GET(request: NextRequest) {
  return proxyAuthRequest(request, 'me')
}

export function PUT(request: NextRequest) {
  return proxyAuthRequest(request, 'me')
}

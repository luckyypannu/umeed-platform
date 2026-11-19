import { NextRequest } from 'next/server'
import { proxyAuthRequest } from '@/lib/server/auth-api-proxy'

export function POST(request: NextRequest) {
  return proxyAuthRequest(request, 'register')
}

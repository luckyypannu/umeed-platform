import { NextRequest } from 'next/server'
import { proxyApiRequest } from '@/lib/server/api-proxy'

export function GET(request: NextRequest) {
  const query = request.nextUrl.search || ''
  return proxyApiRequest(request, `/api/v1/analytics/ngo${query}`)
}

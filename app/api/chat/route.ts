import { NextRequest } from 'next/server'
import { proxyApiRequest } from '@/lib/server/api-proxy'

export function GET(request: NextRequest) {
  return proxyApiRequest(request, '/api/v1/chat')
}

export function POST(request: NextRequest) {
  return proxyApiRequest(request, '/api/v1/chat')
}

export function DELETE(request: NextRequest) {
  return proxyApiRequest(request, '/api/v1/chat')
}

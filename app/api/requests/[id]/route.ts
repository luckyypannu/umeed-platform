import { NextRequest } from 'next/server'
import { proxyApiRequest } from '@/lib/server/api-proxy'

type RouteContext = { params: Promise<{ id: string }> }

async function targetPath(context: RouteContext): Promise<string> {
  const { id } = await context.params
  return `/api/v1/requests/${encodeURIComponent(id)}`
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyApiRequest(request, await targetPath(context))
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyApiRequest(request, await targetPath(context))
}

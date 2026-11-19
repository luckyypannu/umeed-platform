import { NextRequest } from 'next/server'
import { proxyApiRequest } from '@/lib/server/api-proxy'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return Response.json({ error: 'Emergency record not found' }, { status: 404 })
  }
  return proxyApiRequest(request, `/api/v1/emergency/${id}`)
}

import { NextRequest } from 'next/server'
import { proxyApiRequest } from '@/lib/server/api-proxy'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return proxyApiRequest(
    request,
    `/api/v1/volunteers/${encodeURIComponent(id)}/verify`,
  )
}

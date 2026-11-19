'use client'

import { useRouter } from 'next/navigation'
import { InfoPage } from '../../components/PublicShell'
import { routePath } from '../../lib/routes'

export default function NgosPage() {
  const router = useRouter()
  return (
    <InfoPage navigate={(route) => router.push(routePath(route))} page="ngos" />
  )
}

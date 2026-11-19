'use client'

import { useRouter } from 'next/navigation'
import PublicShell from '../../components/PublicShell'
import EmergencyAssistance from '../../components/EmergencyAssistance'
import { routePath } from '../../lib/routes'

export default function EmergencyPage() {
  const router = useRouter()
  return (
    <PublicShell navigate={(route) => router.push(routePath(route))}>
      <main className="info-page">
        <EmergencyAssistance />
      </main>
    </PublicShell>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import PublicShell from '../../components/PublicShell'
import VolunteerApplicationPage from '../../components/VolunteerApplicationPage'
import { routePath } from '../../lib/routes'

export default function VolunteerPage() {
  const router = useRouter()
  return (
    <PublicShell navigate={(route) => router.push(routePath(route))}>
      <main className="info-page">
        <VolunteerApplicationPage />
      </main>
    </PublicShell>
  )
}

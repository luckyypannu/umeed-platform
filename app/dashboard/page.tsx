'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
import Dashboard from '../../components/Dashboard'
import DashboardShell from '../../components/DashboardShell'
import type { Role } from '../../lib/types'
import { routePath } from '../../lib/routes'
import { useAuth } from '../../lib/auth-context'

function DashboardInner() {
  const router = useRouter()
  const { user, isLoading } = useAuth()
  const role: Role = user?.role ?? 'seeker'
  const go = (route: string) => router.push(routePath(route))

  useEffect(() => {
    if (!isLoading && !user) router.replace('/')
  }, [isLoading, router, user])

  if (isLoading) return <p role="status">Loading your secure session…</p>
  if (!user) return null

  return (
    <DashboardShell role={role} navigate={go}>
      <Dashboard role={role} navigate={go} />
    </DashboardShell>
  )
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { HomePage } from '../components/PublicShell'
import { routePath } from '../lib/routes'

export default function Page() {
  const router = useRouter()
  return (
    <HomePage
      navigate={(route) => router.push(routePath(route))}
      onSelect={(category) =>
        router.push(
          `/dashboard?tab=request-support&category=${encodeURIComponent(category)}`,
        )
      }
    />
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { HelpPage } from '../../components/PublicShell'
import { routePath } from '../../lib/routes'

export default function GetHelpClient() {
  const router = useRouter()
  return (
    <HelpPage
      navigate={(route) => router.push(routePath(route))}
      onSelect={(category) =>
        router.push(
          `/dashboard?tab=request-support&category=${encodeURIComponent(category)}`,
        )
      }
    />
  )
}

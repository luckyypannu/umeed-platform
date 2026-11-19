'use client'

import { useRouter } from 'next/navigation'
import PublicShell from '../../components/PublicShell'
import ChatPage from '../../components/ChatPage'
import { routePath } from '../../lib/routes'

export default function ChatRoute() {
  const router = useRouter()
  return (
    <PublicShell navigate={(route) => router.push(routePath(route))}>
      <ChatPage onClose={() => router.push('/')} />
    </PublicShell>
  )
}

import type { Metadata } from 'next'
import ChatClient from './chat-client'

export const metadata: Metadata = {
  title: 'Community Chat',
  description: 'Get basic guidance on UMEED requests, volunteering, organizations, and emergency information.',
}

export default function ChatRoute() {
  return <ChatClient />
}

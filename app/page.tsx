import type { Metadata } from 'next'
import HomeClient from './home-client'

export const metadata: Metadata = {
  title: 'Home',
  description: 'Find community support, connect with verified organizations, and volunteer with UMEED.',
}

export default function Page() {
  return <HomeClient />
}

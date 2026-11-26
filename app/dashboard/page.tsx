import type { Metadata } from 'next'
import DashboardClient from './dashboard-client'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Manage your UMEED support requests, profile, and community activity.',
}

export default function DashboardPage() {
  return <DashboardClient />
}

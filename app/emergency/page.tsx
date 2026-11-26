import type { Metadata } from 'next'
import EmergencyClient from './emergency-client'

export const metadata: Metadata = {
  title: 'Emergency Assistance',
  description: 'Read UMEED emergency guidance and manage private location-based alerts. UMEED does not dispatch emergency services.',
}

export default function EmergencyPage() {
  return <EmergencyClient />
}

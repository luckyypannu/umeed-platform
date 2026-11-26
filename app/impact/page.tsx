import type { Metadata } from 'next'
import ImpactClient from './impact-client'

export const metadata: Metadata = {
  title: 'Community Impact',
  description: 'See UMEED community support activity and coverage statistics.',
}

export default function ImpactPage() {
  return <ImpactClient />
}

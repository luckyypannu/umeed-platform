import type { Metadata } from 'next'
import NgosClient from './ngos-client'

export const metadata: Metadata = {
  title: 'NGO Partners',
  description: 'Explore UMEED partner organizations and learn how NGOs can join the community.',
}

export default function NgosPage() {
  return <NgosClient />
}

import type { Metadata } from 'next'
import AboutClient from './about-client'

export const metadata: Metadata = {
  title: 'About UMEED',
  description: 'Learn how UMEED connects people seeking support with community organizations and volunteers.',
}

export default function AboutPage() {
  return <AboutClient />
}

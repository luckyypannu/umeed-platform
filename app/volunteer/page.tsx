import type { Metadata } from 'next'
import VolunteerClient from './volunteer-client'

export const metadata: Metadata = {
  title: 'Volunteer with UMEED',
  description: 'Update your volunteer profile, skills, availability, and preferred support categories.',
}

export default function VolunteerPage() {
  return <VolunteerClient />
}

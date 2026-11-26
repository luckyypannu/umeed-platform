import type { Metadata } from 'next'
import RegisterRoleClient from './register-role-client'

const roleTitles: Record<string, string> = {
  seeker: 'Seeker',
  ngo: 'NGO',
  volunteer: 'Volunteer',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: string }>
}): Promise<Metadata> {
  const { role } = await params
  const roleTitle = roleTitles[role] ?? 'Account'
  return {
    title: `${roleTitle} registration`,
    description: `Create a UMEED ${roleTitle.toLowerCase()} account.`,
  }
}

export default function RegisterRolePage() {
  return <RegisterRoleClient />
}

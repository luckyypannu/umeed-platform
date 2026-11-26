import type { Metadata } from 'next'
import RegisterClient from './register-client'

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Choose a UMEED account type to request support, volunteer, or register an organization.',
}

export default function RegisterPage() {
  return <RegisterClient />
}

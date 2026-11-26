import type { Metadata } from 'next'
import LoginClient from './login-client'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your UMEED account to manage requests and community support.',
}

export default function LoginPage() {
  return <LoginClient />
}

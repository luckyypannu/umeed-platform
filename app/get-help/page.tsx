import type { Metadata } from 'next'
import GetHelpClient from './get-help-client'

export const metadata: Metadata = {
  title: 'Get Help',
  description: 'Explore UMEED support categories and submit a request through your secure account.',
}

export default function GetHelpPage() {
  return <GetHelpClient />
}

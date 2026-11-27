import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Noto_Sans_Devanagari, Noto_Sans_Telugu, Noto_Sans_Gurmukhi } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '../lib/theme-context'

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '700'],
  variable: '--font-devanagari',
  display: 'swap',
})

const notoTelugu = Noto_Sans_Telugu({
  subsets: ['telugu'],
  weight: ['400', '700'],
  variable: '--font-telugu',
  display: 'swap',
})

const notoGurmukhi = Noto_Sans_Gurmukhi({
  subsets: ['gurmukhi'],
  weight: ['400', '700'],
  variable: '--font-gurmukhi',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Together, We Can Make a Difference',
    template: '%s — UMEED',
  },
  description: 'UMEED connects people seeking support with community organizations and volunteers who can help.',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

import { AuthProvider } from '../lib/auth-context'
export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: '#135b3a',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${notoDevanagari.variable} ${notoTelugu.variable} ${notoGurmukhi.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('umeed-theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

import type { Metadata } from 'next'
import './globals.css'
import './rich-text-content.css'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import AuthErrorHandler from '@/components/AuthErrorHandler'
import { ORG_NAME, ORG_SHORT_NAME, ORG_TAGLINE, ORG_SPORT, FAVICONS } from '@/lib/siteConfig'

export const metadata: Metadata = {
  title: ORG_NAME,
  description: `Official website of ${ORG_NAME} (${ORG_SHORT_NAME}) - ${ORG_TAGLINE}`,
  keywords: [ORG_SPORT, 'referee', 'officials', 'officiating', 'sports', ORG_SHORT_NAME].join(', '),
  icons: {
    icon: [
      {
        url: FAVICONS.png16,
        sizes: '16x16',
        type: 'image/png',
      },
      {
        url: FAVICONS.png32,
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: FAVICONS.ico,
        sizes: '48x48',
        type: 'image/x-icon',
      }
    ],
    apple: {
      url: FAVICONS.appleTouch,
      sizes: '180x180',
      type: 'image/png',
    },
    other: [
      {
        rel: 'android-chrome',
        url: FAVICONS.android192,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        rel: 'android-chrome',
        url: FAVICONS.android512,
        sizes: '512x512',
        type: 'image/png',
      }
    ]
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" sizes="180x180" href={FAVICONS.appleTouch} />
        <link rel="icon" type="image/png" sizes="32x32" href={FAVICONS.png32} />
        <link rel="icon" type="image/png" sizes="16x16" href={FAVICONS.png16} />
        <link rel="manifest" href={FAVICONS.manifest} />
        <link rel="shortcut icon" href={FAVICONS.ico} />
      </head>
      <body className="min-h-screen flex flex-col">
        <AuthErrorHandler />
        <Header />
        <main className="flex-grow">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
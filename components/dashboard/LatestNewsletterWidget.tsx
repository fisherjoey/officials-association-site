'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { IconNotebook, IconChevronRight, IconEye, IconDownload } from '@tabler/icons-react'
import { newslettersAPI } from '@/lib/api'
import { NEWSLETTER_NAME, MODULES } from '@/lib/siteConfig'

// Dynamically import PDFViewer to avoid SSR issues
const PDFViewer = dynamic(() => import('@/app/portal/newsletter/PDFViewer'), {
  ssr: false,
  loading: () => <div className="text-center py-8">Loading PDF viewer...</div>
})

interface Newsletter {
  id: string
  title: string
  date: string
  description?: string
  file_url: string
}

export default function LatestNewsletterWidget() {
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showViewer, setShowViewer] = useState(false)

  useEffect(() => {
    loadLatestNewsletter()
  }, [])

  const loadLatestNewsletter = async () => {
    try {
      const data = await newslettersAPI.getAll()
      if (data.length > 0) {
        // Sort by date and get the latest
        const sorted = data.sort((a: Newsletter, b: Newsletter) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        setNewsletter(sorted[0])
      }
    } catch (error) {
      console.error('Failed to load newsletters:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // The widget's own footer links into the module's route, so it goes when the
  // module does. After the hooks, not before: MODULES is a build-time constant,
  // but rules-of-hooks reads an early return as a conditional hook call.
  if (!MODULES.newsletter) return null

  if (isLoading) {
    return (
      <div className="bg-gradient-to-r from-orange-50 to-orange-100 dark:from-portal-surface dark:to-portal-surface/80 rounded-lg border border-gray-200 dark:border-portal-border p-6 border-l-4 border-l-orange-500">
        <h2 className="font-heading text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <IconNotebook className="h-5 w-5 text-orange-600 dark:text-portal-accent" />
          Latest Newsletter
        </h2>
        <div className="animate-pulse">
          <div className="h-4 bg-orange-200 dark:bg-portal-hover rounded w-3/4 mb-2"></div>
          <div className="h-16 bg-orange-200 dark:bg-portal-hover rounded"></div>
        </div>
      </div>
    )
  }

  if (!newsletter) {
    return (
      <div className="bg-gradient-to-r from-orange-50 to-orange-100 dark:from-portal-surface dark:to-portal-surface/80 rounded-lg border border-gray-200 dark:border-portal-border p-3 sm:p-4 border-l-4 border-l-orange-500">
        <h2 className="font-heading text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <IconNotebook className="h-5 w-5 text-orange-600 dark:text-portal-accent" />
          Latest Newsletter
        </h2>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <IconNotebook className="h-12 w-12 mx-auto mb-2 text-orange-300 dark:text-orange-600" />
          <p className="text-sm">No newsletters yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-portal-surface rounded-lg border border-gray-200 dark:border-portal-border border-l-4 border-l-orange-500 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-heading text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <IconNotebook className="h-4 w-4 text-orange-500" />
          {NEWSLETTER_NAME}
        </h2>
        <Link
          href="/portal/newsletter"
          className="text-xs text-orange-600 dark:text-portal-accent hover:text-orange-700 font-medium flex items-center gap-0.5"
        >
          All Issues
          <IconChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm text-gray-900 dark:text-white leading-snug">{newsletter.title}</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {new Date(newsletter.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setShowViewer(true)}
            className="p-2 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded"
            title="Read"
          >
            <IconEye className="h-4 w-4" />
          </button>
          {newsletter.file_url && (
            <a
              href={newsletter.file_url}
              download
              className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
              title="Download"
            >
              <IconDownload className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      {/* PDF Viewer Modal */}
      {showViewer && newsletter && (
        <PDFViewer
          pdfUrl={newsletter.file_url}
          title={newsletter.title}
          onClose={() => setShowViewer(false)}
        />
      )}
    </div>
  )
}

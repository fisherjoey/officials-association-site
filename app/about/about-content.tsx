'use client'

import { useState, useEffect } from 'react'
import { publicPagesAPI } from '@/lib/api'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { ORG_NAME, ORG_SHORT_NAME, ORG_CITY, ORG_SPORT, ORG_FOUNDED_YEAR, ORG_MEMBER_COUNT } from '@/lib/siteConfig'

export default function AboutContent() {
  const [htmlContent, setHtmlContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchContent() {
      try {
        setLoading(true)
        const aboutPage = await publicPagesAPI.getByName('about')
        // Ensure content is a string, not an object
        const content = aboutPage?.content
        if (typeof content === 'string') {
          setHtmlContent(sanitizeHtml(content))
        } else {
          setHtmlContent(null)
        }
      } catch (error) {
        console.error('Failed to load about page content:', error)
        setHtmlContent(null)
      } finally {
        setLoading(false)
      }
    }

    fetchContent()
  }, [])

  if (loading) {
    return (
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-gray-500 text-lg">Loading content...</p>
          </div>
        </div>
      </section>
    )
  }

  // CMS Content Section
  if (htmlContent) {
    return (
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="rich-text-content">
              <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
            </div>
          </div>
        </div>
      </section>
    )
  }

  // History Section - Fallback if no CMS content
  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-brand-secondary mb-8 text-center">Our History</h2>
          <div className="prose prose-lg mx-auto">
            <p className="text-gray-700 mb-4">
              {ORG_NAME} was founded in {ORG_FOUNDED_YEAR} by a group of people who saw that
              {' '}{ORG_CITY} needed organised, professional officiating to keep pace with a growing
              {' '}{ORG_SPORT} community.
            </p>
            <p className="text-gray-700 mb-4">
              {ORG_SHORT_NAME} now has around {ORG_MEMBER_COUNT} active officials, working games
              that run from youth recreational leagues through to high-level provincial competition.
            </p>
            <p className="text-gray-700">
              Along the way the association has built the officiating standards, training programs
              and mentorship it runs today, and its members have gone on to officiate well beyond
              the local game.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

'use client'

import { useState, useEffect } from 'react'
import NewsCard from '@/components/content/NewsCard'
import TrainingCard from '@/components/content/TrainingCard'
import Button from '@/components/ui/Button'
import { publicNewsTable, publicTrainingTable } from '@/lib/supabase'
import { ORG_SHORT_NAME, SOCIAL_LINKS, SOCIAL_HANDLE } from '@/lib/siteConfig'

export default function HomeContent() {
  const [latestNews, setLatestNews] = useState<any[]>([])
  const [upcomingTraining, setUpcomingTraining] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)

        // Fetch latest news
        const { data: allNews, error: newsError } = await publicNewsTable()
          .select('*')
          .eq('active', true)
          .order('priority', { ascending: false })
          .order('published_date', { ascending: false })

        if (newsError) throw newsError

        const news = (allNews || [])
          .sort((a: any, b: any) => {
            if (a.priority !== b.priority) return b.priority - a.priority
            return new Date(b.published_date).getTime() - new Date(a.published_date).getTime()
          })
          .slice(0, 3)
          .map((news: any) => ({
            title: news.title,
            date: news.published_date,
            excerpt: news.excerpt,
            author: news.author,
            slug: news.slug,
            image: news.image_url
          }))

        // Fetch upcoming training
        const now = new Date().toISOString().split('T')[0]
        const { data: events, error: trainingError } = await publicTrainingTable()
          .select('*')
          .eq('active', true)
          .gte('event_date', now)
          .order('event_date', { ascending: true })
          .limit(2)

        if (trainingError) throw trainingError

        const training = (events || [])
          .map((training: any) => ({
            title: training.title,
            date: training.event_date,
            time: training.event_time ? `${training.event_time} - ${
              new Date(new Date(`2000-01-01 ${training.event_time}`).getTime() + 2 * 60 * 60 * 1000)
                .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            }` : 'TBD',
            location: training.location || 'TBD',
            type: 'workshop' as const,
            description: training.description,
            registrationLink: training.registration_url || '/training',
            spotsAvailable: training.capacity || undefined
          }))

        setLatestNews(news)
        setUpcomingTraining(training)
      } catch (error) {
        console.error('Failed to load home page content:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-500 text-lg">Loading content...</p>
      </div>
    )
  }

  return (
    <>
      {/* Social CTA -- only shown when an Instagram profile is configured */}
      {SOCIAL_LINKS.instagram && (
        <section className="py-8 sm:py-12 lg:py-16 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-xl mx-auto">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-brand-secondary mb-2">Follow Us on Instagram</h2>
              <p className="text-gray-600 mb-6">Stay up to date with the latest from {ORG_SHORT_NAME}</p>
              <a
                href={SOCIAL_LINKS.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-opacity"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                {SOCIAL_HANDLE || 'Instagram'}
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Latest News - Commented out for public site
      <section className="py-8 sm:py-12 lg:py-16">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-brand-secondary">Latest News</h2>
            <Button href="/news" variant="primary" size="sm">
              <span className="hidden sm:inline">View All News</span>
              <span className="sm:hidden">View All</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {latestNews.map((news) => (
              <NewsCard key={news.slug} {...news} />
            ))}
          </div>
        </div>
      </section>
      */}

      {/* Upcoming Training - Commented out for public site
      <section className="py-8 sm:py-12 lg:py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-brand-secondary">Upcoming Training</h2>
            <Button href="/training" variant="primary" size="sm">
              <span className="hidden sm:inline">View All Training</span>
              <span className="sm:hidden">View All</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {upcomingTraining.map((training, index) => (
              <TrainingCard key={index} {...training} />
            ))}
          </div>
        </div>
      </section>
      */}
    </>
  )
}

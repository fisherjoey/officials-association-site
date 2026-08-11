'use client'

import { useState, useEffect } from 'react'
import Hero from '@/components/content/Hero'
import NewsCard from '@/components/content/NewsCard'
import { ContentItem } from '@/lib/content'
import { publicNewsAPI } from '@/lib/api'
import { ORG_SHORT_NAME } from '@/lib/siteConfig'

interface NewsClientProps {
  articles?: ContentItem[]
  tags?: string[]
}

export default function NewsClient({ articles: initialArticles, tags: initialTags }: NewsClientProps) {
  const [articles, setArticles] = useState<ContentItem[]>(initialArticles || [])
  const [tags, setTags] = useState<string[]>(initialTags || [])
  const [loading, setLoading] = useState(!initialArticles)
  const [selectedTag, setSelectedTag] = useState('all')

  useEffect(() => {
    // If we already have initial data, don't fetch
    if (initialArticles && initialArticles.length > 0) return

    async function fetchArticles() {
      try {
        setLoading(true)
        const dbArticles = await publicNewsAPI.getActive()

        // Sort by priority (desc) then published date (desc)
        const sorted = dbArticles.sort((a, b) => {
          if (a.priority !== b.priority) {
            return b.priority - a.priority
          }
          return new Date(b.published_date).getTime() - new Date(a.published_date).getTime()
        })

        // Extract unique tags
        const allTags = sorted.reduce((acc: string[], article) => {
          if (article.tags) {
            article.tags.forEach(tag => {
              if (!acc.includes(tag)) {
                acc.push(tag)
              }
            })
          }
          return acc
        }, [])

        // Format articles
        const formatted = sorted.map(article => ({
          title: article.title,
          slug: article.slug,
          date: article.published_date,
          excerpt: article.excerpt,
          author: article.author,
          tags: article.tags || [],
          featured: article.featured,
          image: article.image_url
        }))

        setArticles(formatted)
        setTags(allTags)
      } catch (error) {
        console.error('Failed to load news articles:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchArticles()
  }, [initialArticles])
  
  const filteredArticles = selectedTag === 'all'
    ? articles
    : articles.filter(article => article.tags?.includes(selectedTag))

  const featuredArticle = filteredArticles.find(a => a.featured)
  const regularArticles = filteredArticles.filter(a => !a.featured)

  return (
    <>
      <Hero
        title="News & Updates"
        subtitle={`Stay informed with the latest ${ORG_SHORT_NAME} news`}
      />

      <section className="py-16">
        <div className="container mx-auto px-4">
          {loading && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Loading news articles...</p>
            </div>
          )}

          {!loading && (
            <>
              {/* Tags Filter */}
              <div className="mb-8">
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => setSelectedTag('all')}
                className={`px-4 py-2 rounded-full font-medium transition-all ${
                  selectedTag === 'all'
                    ? 'bg-brand-primary text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                All
              </button>
              {tags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-4 py-2 rounded-full font-medium transition-all ${
                    selectedTag === tag
                      ? 'bg-brand-primary text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Featured Article */}
          {featuredArticle && (
            <div className="mb-12">
              <NewsCard 
                title={featuredArticle.title || ''}
                date={featuredArticle.date || ''}
                excerpt={featuredArticle.excerpt || ''}
                author={featuredArticle.author}
                slug={featuredArticle.slug || ''}
                featured 
              />
            </div>
          )}

          {/* Regular Articles Grid */}
          {regularArticles.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regularArticles.map((article) => (
                <NewsCard 
                  key={article.slug} 
                  title={article.title || ''}
                  date={article.date || ''}
                  excerpt={article.excerpt || ''}
                  author={article.author}
                  slug={article.slug || ''}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">
                {articles.length === 0
                  ? 'No news articles have been published yet. Use the CMS to add articles.'
                  : 'No articles found for the selected tag.'}
              </p>
            </div>
          )}
          </>
        )}
        </div>
      </section>
    </>
  )
}
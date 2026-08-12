'use client'

import { useState } from 'react'
import Hero from '@/components/content/Hero'
import NewsCard from '@/components/content/NewsCard'
import { NewsSummary } from '@/lib/content'
import { ORG_SHORT_NAME } from '@/lib/siteConfig'

interface NewsClientProps {
  articles: NewsSummary[]
  tags: string[]
}

/**
 * The tag filter, and only the tag filter.
 *
 * Articles arrive as props from `app/news/page.tsx`, already read off disk and
 * sorted at build time. There is deliberately no fetch here: anything this list
 * can show has to be something the export can serve, and the export is fixed
 * when the build ends.
 */
export default function NewsClient({ articles, tags }: NewsClientProps) {
  const [selectedTag, setSelectedTag] = useState('all')

  const filteredArticles = selectedTag === 'all'
    ? articles
    : articles.filter(article => article.tags.includes(selectedTag))

  const featuredArticle = filteredArticles.find(a => a.featured)
  const regularArticles = filteredArticles.filter(a => a !== featuredArticle)

  return (
    <>
      <Hero
        title="News & Updates"
        subtitle={`Stay informed with the latest ${ORG_SHORT_NAME} news`}
      />

      <section className="py-16">
        <div className="container mx-auto px-4">
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
                title={featuredArticle.title}
                date={featuredArticle.date}
                excerpt={featuredArticle.excerpt}
                author={featuredArticle.author}
                image={featuredArticle.image}
                slug={featuredArticle.slug}
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
                  title={article.title}
                  date={article.date}
                  excerpt={article.excerpt}
                  author={article.author}
                  image={article.image}
                  slug={article.slug}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">
                {articles.length === 0
                  ? 'No news articles have been published yet. Add a markdown file under content/news/ and redeploy.'
                  : 'No articles found for the selected tag.'}
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

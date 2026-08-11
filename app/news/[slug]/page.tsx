import { getContentBySlug, getAllContent } from '@/lib/content'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import '../news.css'

export async function generateStaticParams() {
  const articles = getAllContent('news')
  return articles.map((article) => ({
    slug: article.slug,
  }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getContentBySlug('news', slug)
  
  if (!article) {
    return {
      title: 'Article Not Found',
    }
  }

  return {
    title: article.title,
    description: article.excerpt,
    openGraph: {
      title: article.title,
      description: article.excerpt,
      images: article.image ? [article.image] : [],
    },
  }
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getContentBySlug('news', slug)
  
  if (!article) {
    notFound()
  }

  // This page is public and prerendered by the static export, so the sanitiser
  // runs in Node here - see the DOM-free path in lib/sanitizeHtml.
  const htmlContent = sanitizeHtml(article.content || article.body || '')

  const formattedDate = new Date(article.date).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <article className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-brand-secondary text-white py-16">
        <div className="container mx-auto px-4">
          <Link 
            href="/news" 
            className="inline-flex items-center text-white/80 hover:text-white mb-6 transition-colors"
          >
            ← Back to News
          </Link>
          
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {article.title}
          </h1>
          
          <div className="flex items-center gap-4 text-white/80">
            <time dateTime={article.date}>{formattedDate}</time>
            {article.author && (
              <>
                <span>•</span>
                <span>By {article.author}</span>
              </>
            )}
          </div>
          
          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {article.tags.map((tag: string) => (
                <span 
                  key={tag}
                  className="bg-white/20 px-3 py-1 rounded-full text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Featured Image */}
      {article.image && (
        <div className="relative h-96 md:h-[500px] -mt-8">
          <div className="container mx-auto px-4 h-full">
            <div className="relative h-full rounded-lg overflow-hidden shadow-xl">
              <Image
                src={article.image}
                alt={article.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          </div>
        </div>
      )}

      {/* Article Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm p-8 md:p-12">
            {article.excerpt && (
              <div className="text-xl text-gray-600 font-medium mb-8 pb-8 border-b">
                {article.excerpt}
              </div>
            )}
            
            <div className="rich-text-content">
              <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
            </div>
          </div>

          {/* Related Articles Section */}
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-brand-secondary mb-6">More News</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {getAllContent('news')
                .filter(a => a.slug !== article.slug)
                .slice(0, 2)
                .map((relatedArticle) => (
                  <Link
                    key={relatedArticle.slug}
                    href={`/news/${relatedArticle.slug}`}
                    className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
                  >
                    <time className="text-sm text-gray-500">
                      {new Date(relatedArticle.date).toLocaleDateString('en-CA', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </time>
                    <h3 className="text-xl font-bold text-brand-secondary mt-2 mb-2">
                      {relatedArticle.title}
                    </h3>
                    <p className="text-gray-600 line-clamp-2">
                      {relatedArticle.excerpt}
                    </p>
                  </Link>
                ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
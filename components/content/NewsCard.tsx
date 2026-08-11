import Image from 'next/image'
import Link from 'next/link'
import Card from '../ui/Card'

interface NewsCardProps {
  title: string
  date: string
  excerpt: string
  author?: string
  image?: string
  slug: string
  featured?: boolean
}

export default function NewsCard({
  title,
  date,
  excerpt,
  author,
  image,
  slug,
  featured = false,
}: NewsCardProps) {
  const formattedDate = new Date(date).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  
  return (
    <Card padding="none" hover>
      <Link href={`/news/${slug}`}>
        <div className={featured ? 'md:flex' : ''}>
          {image && (
            <div className={`relative ${featured ? 'md:w-1/2' : 'h-48'}`}>
              <Image
                src={image}
                alt={title}
                fill
                className="object-cover rounded-t-lg md:rounded-l-lg md:rounded-t-none"
              />
              {featured && (
                <div className="absolute top-4 left-4 bg-brand-primary text-white px-3 py-1 rounded-full text-sm font-semibold">
                  Featured
                </div>
              )}
            </div>
          )}
          
          <div className={`p-6 ${featured ? 'md:w-1/2' : ''}`}>
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
              <span>{formattedDate}</span>
              {author && (
                <>
                  <span>•</span>
                  <span>{author}</span>
                </>
              )}
            </div>
            
            <h3 className={`font-bold text-brand-secondary mb-3 ${featured ? 'text-2xl' : 'text-xl'}`}>
              {title}
            </h3>
            
            <p className="text-gray-700 mb-4 line-clamp-3">
              {excerpt}
            </p>
            
            <span className="text-brand-primary font-semibold hover:text-brand-secondary transition-colors">
              Read More →
            </span>
          </div>
        </div>
      </Link>
    </Card>
  )
}